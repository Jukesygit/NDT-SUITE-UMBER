import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/auth.ts'

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

    // Prevent admin from changing their own email through this endpoint
    if (userId === auth.user!.id) {
      return errorResponse(req, 'Cannot change your own email through admin tools', 400)
    }

    // Check the new email isn't already in use
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', newEmail.toLowerCase())
      .single()

    if (existingProfile && existingProfile.id !== userId) {
      return errorResponse(req, 'A user with this email already exists', 400)
    }

    // Update auth.users email (login credential)
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    })

    if (authUpdateError) {
      return errorResponse(req, 'Failed to update login email. Please try again.', 500, authUpdateError)
    }

    // Update profiles table to match
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ email: newEmail })
      .eq('id', userId)

    if (profileError) {
      return errorResponse(req, 'Login email updated but profile sync failed. Please update the profile manually.', 500, profileError)
    }

    return jsonResponse(req, {
      success: true,
      userId,
      email: newEmail,
    })

  } catch (error) {
    return errorResponse(req, 'An unexpected error occurred. Please try again.', 500, error)
  }
})
