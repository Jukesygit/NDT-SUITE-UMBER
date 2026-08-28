// Edge Function for 2FA backup codes: generate, regenerate, redeem.
//
// WHAT REDEEMING A CODE ACTUALLY DOES
// Redemption is a SELF-SERVICE 2FA RESET, not a login step. It cannot be
// anything else: the app derives "this session cleared 2FA" from the JWT `aal`
// claim, and only Supabase's own MFA verify mints an aal2 token — an edge
// function cannot. An earlier design that merely marked a code used therefore
// burned the code and left the user exactly as locked out as before. So a
// matching code now REMOVES the caller's TOTP factors outright, which is the
// thing a locked-out user actually needs, and is the same outcome
// `admin-reset-2fa` produces for them. They sign in with a password and enrol
// again.
//
// Because of that, the whole code set is consumed by one successful redemption:
// every remaining code is deleted alongside the factors. A surviving code would
// point at an enrolment that no longer exists. Deletion IS consumption here, so
// the `used_at` CAS stamp is not used on this path; the column is retained by
// the already-applied migration and is now vestigial.
//
// SECURITY
//   * The subject is ALWAYS the JWT-verified caller. `userId` is never read from
//     the request body, so this function cannot be pointed at another account.
//   * Codes are stored hashed (see backup-codes.ts).
//   * ORDERING, redemption: factors are removed BEFORE any code is destroyed. No
//     path may burn a code while leaving factors alive, so a failed factor
//     deletion consumes nothing and the attempt stays retryable.
//   * `generate` and `regenerate` require an **aal2** session. A backup code is a
//     standing 2FA bypass, so minting one from a password-only (aal1) session
//     would hand anyone with the password a permanent way past 2FA. `regenerate`
//     additionally re-proves possession of the authenticator by verifying a live
//     TOTP code against the caller's own factor.
//   * `verify` is the one action reachable at aal1 — that is its entire purpose,
//     recovering a session that cannot clear the TOTP challenge.
//   * Wrong, malformed, already-used and no-codes-enrolled all return the SAME
//     message, so nothing here is an oracle for which of those was true.
//
// CONCURRENCY, and the invariant that governs it
//   INVARIANT: no mid-flight failure may ever leave the user holding FEWER live
//   codes than they started with. Two live batches is a benign degraded state —
//   both belong to the same caller, and findMatchingCode already groups by
//   (iterations, salt) so codes from either batch verify. Zero live codes is a
//   lockout. Every write here is ordered to trade toward the benign state.
//   * Minting inserts the new batch FIRST and only then deletes the rows that
//     are not in it (see issueBatch). A worker death mid-flight leaves either
//     the old set or both sets, never neither.
//   * Two concurrent `generate` calls can both pass the "no existing codes" gate
//     — a count is a read, not a lock. The interleaved outcome is an extra live
//     batch: both callers' displayed codes work. It is never the reverse, where
//     a caller is shown a batch that a racing call then deletes.
//   * Concurrent redemption: the second winner finds the factors already gone
//     and treats that as success, so both callers are told they are recovered.
//   FOLLOW-UP (not required to ship): folding the insert+delete into one
//   SECURITY DEFINER RPC would make minting atomic rather than merely
//   fail-safe. That needs its own migration, so it is deliberately deferred.
//
// CLIENT CONTRACT (src/services/two-factor-service.ts) — do not drift:
//   { action: 'verify', code }        -> 200 { success: true, remaining: 0, recovered: true }
//                                     -> 200 { success: false, error } on a bad code
//   { action: 'generate' }            -> 200 { success: true, codes: string[] }
//   { action: 'regenerate', totpCode }-> 200 { success: true, codes: string[] }
// `remaining` is retained because `verifyBackupCode` destructures it; it is now
// always 0, since a successful redemption consumes the whole set. `recovered`
// is additive, so the current client is unaffected and a future one can say
// "your two-factor authentication has been reset" instead of counting codes.
// `verify` reports a bad code as HTTP 200 with success:false BECAUSE supabase-js
// surfaces any non-2xx as `error` with a generic message and throws `data` away —
// the caller checks `data.success` and needs the reason to survive. The other two
// actions have no such check and read `data.codes` directly, so their failures
// MUST be non-2xx or the caller would silently resolve `undefined`.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { logAuditEvent } from '../_shared/audit.ts'
import { hasAal2, bearerToken } from '../_shared/jwt-claims.ts'
import {
  BACKUP_CODE_COUNT,
  findMatchingCode,
  formatBackupCode,
  generateBackupCodes,
  hashBackupCodes,
  normalizeBackupCode,
  type StoredBackupCode,
} from './backup-codes.ts'
import { consume, REDEEM_RULE, MINT_RULE } from './rate-limit.ts'
import { isFactorAlreadyGone } from './factor-errors.ts'

const TABLE = 'two_factor_backup_codes'

/**
 * One message for every redemption failure. Wrong code, malformed code, already
 * redeemed, none enrolled — a caller cannot tell these apart.
 */
const REDEEM_FAILURE = 'Invalid or used backup code'

/** 200 + success:false, the shape `verifyBackupCode` needs to surface a reason. */
function redeemFailure(req: Request, error: string = REDEEM_FAILURE): Response {
  return jsonResponse(req, { success: false, error }, 200)
}

/**
 * Count a user's unredeemed codes, or null if the read failed.
 *
 * The null matters: this count is the gate that stops `generate` from silently
 * rotating a live set, so a caller deciding on it must refuse on null rather
 * than read a failed query as "none exist". The gate is best-effort by nature —
 * a count is a read, not a lock — and the header explains why losing that race
 * is benign.
 *
 * The `used_at IS NULL` filter is now always true: redemption deletes rows
 * rather than stamping them. It is kept because the column still exists in the
 * applied migration, and a row that ever does get stamped is not a live code.
 */
async function countUnused(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('used_at', null)

  if (error) {
    console.error('Backup codes: count failed:', error.message)
    return null
  }
  return count ?? 0
}

/**
 * Replace a user's whole code set with a fresh batch.
 *
 * INSERT FIRST, then delete everything that is not the new batch. The ordering
 * is the safety property, not a detail:
 *
 * Deleting first opens a window in which the user holds NO live codes, and
 * minting is the most expensive thing this function does (ten PBKDF2
 * derivations, ~0.8s, against a low-single-seconds edge CPU budget), so a worker
 * death inside that window is a real risk rather than a theoretical one — and it
 * would strand the user with nothing. Inserting first means the only states a
 * failure can leave behind are "the old set" or "both sets", both of which the
 * user can still log in with. findMatchingCode groups by (iterations, salt), so
 * codes from two batches verify side by side; that is test-pinned precisely so
 * this ordering is safe to rely on.
 *
 * The delete is keyed on the new rows' UUIDs rather than on the old ones'
 * digests: a UUID cannot contain the `$`, `(` or `,` that PostgREST's `in` list
 * would have to quote, so the filter is unambiguous by construction.
 */
async function issueBatch(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<{ codes: string[] } | { error: string }> {
  const canonical = generateBackupCodes(BACKUP_CODE_COUNT)
  if (canonical.length !== BACKUP_CODE_COUNT) {
    return { error: 'Could not generate backup codes' }
  }

  const hashes = await hashBackupCodes(canonical)

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from(TABLE)
    .insert(hashes.map((code_hash) => ({ user_id: userId, code_hash })))
    .select('id')

  if (insertError || !inserted || inserted.length === 0) {
    if (insertError) console.error('Backup codes: failed to store new batch:', insertError.message)
    // Nothing was destroyed, so the caller's existing codes still work.
    return { error: 'Could not store backup codes' }
  }

  const newIds = (inserted as Array<{ id: string }>).map((row) => row.id)

  const { error: clearError } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .not('id', 'in', `(${newIds.join(',')})`)

  if (clearError) {
    // The new batch is live and is what gets returned, so the user is not
    // locked out — they are just also still holding the previous set. Log it
    // and succeed rather than fail a request that achieved its purpose.
    console.error(
      'Backup codes: new batch stored but previous codes could not be cleared:',
      clearError.message
    )
  }

  // Display form only — the canonical value is what was hashed.
  return { codes: canonical.map(formatBackupCode) }
}

/**
 * Remove every TOTP factor on the caller's account — the actual recovery.
 *
 * Reports failure only for errors that left a factor standing, so the caller can
 * hold the ordering guarantee: nothing is consumed unless the factors are gone.
 */
async function removeTotpFactors(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<{ ok: true; removed: number } | { ok: false }> {
  const { data: factorData, error: listError } = await supabaseAdmin.auth.admin.mfa.listFactors({
    userId,
  })

  if (listError) {
    console.error('Backup codes: could not list factors for recovery:', listError.message)
    return { ok: false }
  }

  let removed = 0

  for (const factor of factorData?.factors ?? []) {
    const { error: deleteError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    })

    if (deleteError && !isFactorAlreadyGone(deleteError)) {
      // Log the id only — never the factor secret.
      console.error(`Backup codes: failed to delete factor ${factor.id}:`, deleteError.message)
      return { ok: false }
    }

    if (!deleteError) removed++
  }

  return { ok: true, removed }
}

/**
 * Re-prove possession of the authenticator by running a real TOTP
 * challenge/verify as the caller.
 *
 * Uses an anon-key client carrying the caller's own JWT, because the admin API
 * has no "check this TOTP code" endpoint and the factor secret is deliberately
 * not readable. Session persistence is off, so the tokens this returns are
 * discarded and the caller's existing session is untouched.
 */
async function verifyTotp(req: Request, code: string): Promise<boolean> {
  const token = bearerToken(req)
  if (!token) return false

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    )

    const { data: factors, error: factorsError } = await userClient.auth.mfa.listFactors()
    if (factorsError || !factors) return false

    const verified = factors.totp?.find((factor) => factor.status === 'verified')
    if (!verified) return false

    const { data: challenge, error: challengeError } = await userClient.auth.mfa.challenge({
      factorId: verified.id,
    })
    if (challengeError || !challenge) return false

    const { error: verifyError } = await userClient.auth.mfa.verify({
      factorId: verified.id,
      challengeId: challenge.id,
      code,
    })

    return !verifyError
  } catch (error) {
    console.error('Backup codes: TOTP verification failed:', error instanceof Error ? error.message : 'unknown')
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // SECURITY: any authenticated session. aal1 is allowed through here because
    // `verify` must work for a user who cannot clear the TOTP challenge; the
    // minting actions re-check for aal2 below.
    const { auth, errorResponse: authError } = await requireAuth(req)
    if (authError) return authError

    const supabaseAdmin = auth.supabaseAdmin!
    // SECURITY: the subject is the token's own user, never a body field.
    const userId = auth.user!.id
    const actorRole = auth.user!.role
    const organizationId = auth.user!.organization_id

    let body: Record<string, unknown> | null = null
    try {
      body = await req.json()
    } catch {
      return errorResponse(req, 'Invalid request body', 400)
    }

    const action = body?.action
    if (action !== 'verify' && action !== 'generate' && action !== 'regenerate') {
      return errorResponse(req, 'Unsupported action', 400)
    }

    // ── verify ───────────────────────────────────────────────────────────────
    if (action === 'verify') {
      const limit = consume(`redeem:${userId}`, REDEEM_RULE)
      if (!limit.allowed) {
        return redeemFailure(req, 'Too many attempts. Please wait and try again.')
      }

      const candidate = typeof body?.code === 'string' ? body.code : ''
      // Shape-check first so a malformed code costs no database round trip, and
      // answer it with the same message a wrong code gets.
      if (!normalizeBackupCode(candidate)) return redeemFailure(req)

      const { data: rows, error: readError } = await supabaseAdmin
        .from(TABLE)
        .select('id, code_hash')
        .eq('user_id', userId)
        .is('used_at', null)

      if (readError) {
        console.error('Backup codes: read failed:', readError.message)
        return redeemFailure(req)
      }

      const match = await findMatchingCode(candidate, (rows ?? []) as StoredBackupCode[])

      if (!match) {
        await logAuditEvent(supabaseAdmin, {
          actorId: userId,
          actorRole,
          organizationId,
          actionType: 'two_factor_backup_code_failed',
          category: 'security',
          description: 'Failed backup code redemption attempt',
          entityType: 'user',
          entityId: userId,
        })
        return redeemFailure(req)
      }

      // The code is good. Recovery is removing the factors — see the header:
      // this function cannot mint an aal2 session, so merely marking the code
      // used would burn it and leave the user just as locked out.
      //
      // ORDERING: factors first, codes second. A failure here must not consume
      // anything, so the user can retry with the same code.
      const removal = await removeTotpFactors(supabaseAdmin, userId)

      if (!removal.ok) {
        // Uniform failure shape — this reveals nothing about whether the code
        // was right, and nothing has been destroyed.
        return redeemFailure(
          req,
          'Could not complete two-factor recovery. Please try again.'
        )
      }

      // Consumption is deletion: the whole set goes, because every remaining
      // code would now point at an enrolment that no longer exists. The user is
      // already recovered at this point, so a failure here is logged rather than
      // reported — it would only prompt a needless retry.
      const { error: purgeError } = await supabaseAdmin.from(TABLE).delete().eq('user_id', userId)
      if (purgeError) {
        console.error(
          'Backup codes: factors removed but codes could not be cleared:',
          purgeError.message
        )
      }

      await logAuditEvent(supabaseAdmin, {
        actorId: userId,
        actorRole,
        organizationId,
        actionType: 'two_factor_recovered',
        category: 'security',
        description:
          'Backup code redeemed — two-factor factors were removed and all remaining backup codes were consumed',
        entityType: 'user',
        entityId: userId,
        details: { factors_removed: removal.removed },
      })

      // `remaining` stays in the shape because the client destructures it, and
      // is 0 because the set was consumed. `recovered` is the additive field a
      // future client can use to say "your 2FA has been reset".
      return jsonResponse(req, { success: true, remaining: 0, recovered: true })
    }

    // ── generate / regenerate ────────────────────────────────────────────────
    // SECURITY: both mint a standing 2FA bypass, so both require a session that
    // has already cleared a TOTP challenge. Fails closed on an unreadable claim.
    if (!hasAal2(req)) {
      return errorResponse(
        req,
        'Two-factor verification is required before managing backup codes',
        403
      )
    }

    const mintLimit = consume(`mint:${userId}`, MINT_RULE)
    if (!mintLimit.allowed) {
      return errorResponse(req, 'Too many attempts. Please wait and try again.', 429)
    }

    if (action === 'generate') {
      // `generate` is first-issue only. Silently rotating a live set would strand
      // a user who had already written the old one down; rotation is what
      // `regenerate` is for, and it demands a fresh TOTP code.
      const existing = await countUnused(supabaseAdmin, userId)
      if (existing === null) {
        // Refuse rather than let a failed read look like "no codes yet" and
        // silently replace a set the user is still relying on.
        return errorResponse(req, 'Could not check existing backup codes. Please try again.', 500)
      }
      if (existing > 0) {
        return errorResponse(
          req,
          'Backup codes already exist for this account. Regenerate them instead.',
          409
        )
      }

      const result = await issueBatch(supabaseAdmin, userId)
      if ('error' in result) return errorResponse(req, result.error, 500)

      await logAuditEvent(supabaseAdmin, {
        actorId: userId,
        actorRole,
        organizationId,
        actionType: 'two_factor_backup_codes_generated',
        category: 'security',
        description: 'Two-factor backup codes generated',
        entityType: 'user',
        entityId: userId,
        details: { count: result.codes.length },
      })

      return jsonResponse(req, { success: true, codes: result.codes })
    }

    // action === 'regenerate'
    const totpCode = typeof body?.totpCode === 'string' ? body.totpCode.trim() : ''
    if (!/^\d{6}$/.test(totpCode)) {
      return errorResponse(req, 'A valid 6-digit authentication code is required', 400)
    }

    if (!(await verifyTotp(req, totpCode))) {
      await logAuditEvent(supabaseAdmin, {
        actorId: userId,
        actorRole,
        organizationId,
        actionType: 'two_factor_backup_codes_regenerate_denied',
        category: 'security',
        description: 'Backup code regeneration denied — authenticator code was not valid',
        entityType: 'user',
        entityId: userId,
      })
      return errorResponse(req, 'That authentication code is not valid', 403)
    }

    const result = await issueBatch(supabaseAdmin, userId)
    if ('error' in result) return errorResponse(req, result.error, 500)

    await logAuditEvent(supabaseAdmin, {
      actorId: userId,
      actorRole,
      organizationId,
      actionType: 'two_factor_backup_codes_regenerated',
      category: 'security',
      description: 'Two-factor backup codes regenerated — any previous codes were invalidated',
      entityType: 'user',
      entityId: userId,
      details: { count: result.codes.length },
    })

    return jsonResponse(req, { success: true, codes: result.codes })
  } catch (error) {
    // SECURITY: generic message out, detail to the server log only.
    return errorResponse(req, 'An unexpected error occurred. Please try again.', 500, error)
  }
})
