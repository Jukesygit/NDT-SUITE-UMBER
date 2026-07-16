import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/auth.ts'
import { logAuditEvent, maskEmail } from '../_shared/audit.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    const { auth, errorResponse: authError } = await requireAdmin(req)
    if (authError) return authError

    const supabaseAdmin = auth.supabaseAdmin!

    const { userId, newEmail } = await req.json()

    if (!userId || !newEmail) {
      return errorResponse(req, 'Missing required fields: userId, newEmail', 400)
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      return errorResponse(req, 'Invalid email format', 400)
    }

    // Note: admins (including super_admins) may change their own login email
    // through this endpoint. email_confirm is set below, so the new address is
    // trusted without a verification round-trip.

    // Check the new email isn't already in use
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', newEmail.toLowerCase())
      .single()

    if (existingProfile && existingProfile.id !== userId) {
      return errorResponse(req, 'A user with this email already exists', 400)
    }

    // Capture the target's CURRENT email before any mutation, for audit logging.
    // Prefer profiles.email; fall back to the auth user's email if absent.
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single()

    let oldEmail: string | null = targetProfile?.email ?? null
    if (!oldEmail) {
      const { data: targetAuthUser } = await supabaseAdmin.auth.admin.getUserById(userId)
      oldEmail = targetAuthUser?.user?.email ?? null
    }

    // Update auth.users email (login credential).
    // GoTrue enforces email uniqueness on auth.users independently of the
    // profiles check above (the two can diverge), so surface its actual
    // message/status — this is admin-only, so the reason isn't sensitive and a
    // generic "try again" hides actionable info (e.g. "email already registered").
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    })

    if (authUpdateError) {
      const gotrueStatus = (authUpdateError as { status?: number }).status
      const status = gotrueStatus && gotrueStatus >= 400 && gotrueStatus < 600 ? gotrueStatus : 500
      return errorResponse(
        req,
        `Failed to update login email: ${authUpdateError.message || 'unknown error'}`,
        status,
        authUpdateError
      )
    }

    // Update profiles table to match
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ email: newEmail })
      .eq('id', userId)

    if (profileError) {
      return errorResponse(req, 'Login email updated but profile sync failed. Please update the profile manually.', 500, profileError)
    }

    // Audit: record the email change with the JWT-verified admin as actor.
    await logAuditEvent(supabaseAdmin, {
      actorId: auth.user!.id,
      actorRole: auth.user!.role,
      organizationId: auth.user!.organization_id,
      actionType: 'user_email_changed',
      category: 'security',
      description: 'Admin changed a user login email',
      entityType: 'user',
      entityId: userId,
      details: {
        old_email: maskEmail(oldEmail),
        new_email: maskEmail(newEmail),
      },
    })

    return jsonResponse(req, {
      success: true,
      userId,
      email: newEmail,
    })

  } catch (error) {
    return errorResponse(req, 'An unexpected error occurred. Please try again.', 500, error)
  }
})
