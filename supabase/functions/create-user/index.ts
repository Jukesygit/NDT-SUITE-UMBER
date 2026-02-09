// Edge Function to create a single user with admin API
// This ensures email is pre-confirmed and profile trigger fires correctly
// SECURITY: Requires admin authentication

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { validatePassword } from '../_shared/password-validation.ts'
import { requireAdmin } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // SECURITY: Require admin authentication
    const { auth, errorResponse: authError } = await requireAdmin(req)
    if (authError) return authError

    const supabaseAdmin = auth.supabaseAdmin!

    const { email, username, password, role, organization_id } = await req.json()

    // Validate required fields
    if (!email || !username || !password) {
      return errorResponse(req, 'Missing required fields: email, username, password', 400)
    }

    // SECURITY: Validate password against policy (12 chars + complexity)
    const passwordValidation = validatePassword(password, { email, username })
    if (!passwordValidation.valid) {
      return errorResponse(req, passwordValidation.error || 'Invalid password', 400)
    }

    // Check if user already exists using targeted lookup (not listUsers which has pagination issues)
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existingProfile) {
      return errorResponse(req, 'A user with this email already exists', 400)
    }

    // SECURITY: Validate role against allowlist at runtime (TypeScript types are not enforced at runtime)
    const VALID_ROLES = ['admin', 'org_admin', 'editor', 'viewer']
    const validatedRole = VALID_ROLES.includes(role) ? role : 'viewer'

    // Create auth user with admin API - this pre-confirms email and triggers profile creation
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        role: validatedRole,
        organization_id: organization_id || null
      }
    })

    if (createError) {
      // SECURITY: Log detailed error but return generic message
      return errorResponse(
        req,
        'Failed to create user. Please try again.',
        500,
        createError
      )
    }

    if (!authData?.user) {
      return errorResponse(req, 'User creation failed. Please try again.', 500)
    }

    // SECURITY: The handle_new_user trigger always sets role='viewer'.
    // Set the actual requested role via a direct profile update using service_role.
    if (validatedRole !== 'viewer') {
      const { error: roleError } = await supabaseAdmin
        .from('profiles')
        .update({ role: validatedRole })
        .eq('id', authData.user.id)

      if (roleError) {
        console.error('Failed to set user role:', roleError.message)
      }
    }

    return jsonResponse(req, {
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        username,
        role: validatedRole,
        organization_id: organization_id || null
      }
    })

  } catch (error) {
    // SECURITY: Generic error message, log details server-side
    return errorResponse(
      req,
      'An unexpected error occurred. Please try again.',
      500,
      error
    )
  }
})
