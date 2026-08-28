// Edge Function to reset (unenroll) a user's two-factor authentication.
//
// This exists for the locked-out case: a user enrolled TOTP and lost the
// authenticator. Removing their factors lets them sign in with a password alone
// and enrol again.
//
// SECURITY: a 2FA reset is an account-takeover-shaped action — it strips a
// login control off somebody else's account — so it is gated harder than a
// plain admin check.
//
//   * Admin or above (requireAdmin), AND
//   * strictly outranking the target (_shared/role-rank.ts). An admin cannot
//     reset another admin's or a super_admin's 2FA; only a super_admin can reach
//     an admin. Peers cannot disarm each other.
//   * NEVER the caller themselves. `requireAdmin` does not inspect assurance
//     level, so an admin session holding only a password (aal1) would otherwise
//     be able to strip its own 2FA and complete the bypass it could not clear.
//     Self-service removal belongs to the MFA SDK's unenroll, which requires the
//     factor to be satisfied first.
//   * Outstanding backup codes are destroyed with the factors. They are recovery
//     credentials for the factor being removed, and a surviving code would be a
//     live 2FA bypass pointing at an enrolment that no longer exists.
//
// CLIENT CONTRACT (src/auth/auth-manager.ts adminReset2FA):
//   { userId } -> 200 { success: true, message }
// Failures return a non-2xx with { error }, matching delete-user and every other
// remediated admin function in this directory.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/auth.ts'
import { canActOn } from '../_shared/role-rank.ts'
import { logAuditEvent } from '../_shared/audit.ts'

const BACKUP_CODES_TABLE = 'two_factor_backup_codes'

/**
 * PostgREST/Postgres codes meaning "this relation is not in this database".
 * The backup-codes table arrives in its own migration, so a deployment that has
 * the function but not the migration must still be able to reset a factor.
 */
const MISSING_RELATION_CODES = new Set(['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703'])

function isMissingRelation(error: { code?: string | null } | null | undefined): boolean {
  const code = error?.code
  return typeof code === 'string' && MISSING_RELATION_CODES.has(code)
}

/** Loose UUID shape check — the id is a path/filter input, not free text. */
function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // SECURITY: admin or above.
    const { auth, errorResponse: authError } = await requireAdmin(req)
    if (authError) return authError

    const supabaseAdmin = auth.supabaseAdmin!

    let body: Record<string, unknown> | null = null
    try {
      body = await req.json()
    } catch {
      return errorResponse(req, 'Invalid request body', 400)
    }

    const userId = body?.userId
    if (!isUuid(userId)) {
      return errorResponse(req, 'A valid user ID is required', 400)
    }

    // SECURITY: no self-reset. See the header note — this is the aal1 self-bypass.
    if (userId === auth.user!.id) {
      return errorResponse(
        req,
        'You cannot reset your own two-factor authentication. Ask another administrator, or unenrol it from your profile after signing in with your authenticator.',
        403
      )
    }

    // maybeSingle: a missing row is a normal outcome here, not an error, so the
    // "no such user" and "the query broke" cases stay distinguishable.
    const { data: targetProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('username, role')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      return errorResponse(req, 'Could not look up that user', 500, profileError)
    }

    if (!targetProfile) {
      return errorResponse(req, 'User not found', 404)
    }

    // SECURITY: shared role hierarchy. An unknown role on either side is
    // out-of-range and blocked (callers rank -1, subjects +Infinity), so a
    // profile carrying a role this code does not recognise can never be reset.
    if (!canActOn(auth.user!.role, targetProfile.role)) {
      return errorResponse(
        req,
        'You cannot reset two-factor authentication for a user whose role is equal to or higher than your own',
        403
      )
    }

    // ── Remove every enrolled factor ─────────────────────────────────────────
    const { data: factorData, error: listError } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId,
    })

    if (listError) {
      return errorResponse(req, 'Could not read the user\'s authentication factors', 500, listError)
    }

    const factors = factorData?.factors ?? []
    const failed: string[] = []
    let removed = 0

    for (const factor of factors) {
      const { error: deleteError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId,
      })
      if (deleteError) {
        // Log the id only — never the factor secret or the user's email.
        console.error(`admin-reset-2fa: failed to delete factor ${factor.id}:`, deleteError.message)
        failed.push(factor.id)
      } else {
        removed++
      }
    }

    if (failed.length > 0) {
      return errorResponse(
        req,
        `Two-factor reset did not complete — ${failed.length} factor(s) could not be removed. Please retry.`,
        500
      )
    }

    // ── Destroy outstanding backup codes ─────────────────────────────────────
    // These are recovery credentials for the factor just removed; leaving them
    // alive would leave a usable bypass behind.
    const { error: codesError } = await supabaseAdmin
      .from(BACKUP_CODES_TABLE)
      .delete()
      .eq('user_id', userId)

    if (codesError && !isMissingRelation(codesError)) {
      return errorResponse(
        req,
        'Two-factor factors were removed but backup codes could not be cleared. Please retry.',
        500,
        codesError
      )
    }
    if (codesError) {
      console.warn('admin-reset-2fa: backup codes table not present in this database — skipped')
    }

    // AUDIT: actor is the JWT-verified admin, never a client-supplied value.
    await logAuditEvent(supabaseAdmin, {
      actorId: auth.user!.id,
      actorRole: auth.user!.role,
      organizationId: auth.user!.organization_id,
      actionType: 'two_factor_reset',
      category: 'security',
      description: `Admin reset two-factor authentication for ${targetProfile.username ?? userId}`,
      entityType: 'user',
      entityId: userId,
      entityName: targetProfile.username ?? null,
      details: {
        factors_removed: removed,
        target_role: targetProfile.role ?? null,
      },
    })

    return jsonResponse(req, {
      success: true,
      message:
        removed > 0
          ? 'Two-factor authentication has been reset. The user can sign in without a code and enrol again.'
          : 'This user had no two-factor factors enrolled. Any backup codes have been cleared.',
    })
  } catch (error) {
    // SECURITY: generic message out, detail to the server log only.
    return errorResponse(req, 'An unexpected error occurred. Please try again.', 500, error)
  }
})
