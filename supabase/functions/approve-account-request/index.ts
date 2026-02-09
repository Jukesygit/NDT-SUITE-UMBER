// Edge Function to handle account request approvals
// Uses admin auth to create user accounts
// SECURITY: Requires admin authentication

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/auth.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // SECURITY: Require admin authentication
    const { auth, errorResponse: authError } = await requireAdmin(req)
    if (authError) return authError

    const supabaseAdmin = auth.supabaseAdmin!

    // Parse request body
    const { request_id } = await req.json()

    // Use authenticated user's ID as approver (not from request body - prevents spoofing)
    const approved_by_user_id = auth.user!.id

    console.log('Received approval request:', { request_id, approved_by_user_id })

    // Validate required fields
    if (!request_id) {
      console.error('Missing required fields')
      return errorResponse(req, 'Missing required field: request_id', 400)
    }

    // Fetch the account request
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('account_requests')
      .select('*')
      .eq('id', request_id)
      .single()

    console.log('Fetched request:', { request: !!request, fetchError: !!fetchError })

    if (fetchError || !request) {
      return errorResponse(req, 'Request not found', 404, fetchError)
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return errorResponse(req, `Request has already been ${request.status}`, 400)
    }

    // SECURITY: Validate role against allowlist at runtime
    const VALID_ROLES = ['admin', 'org_admin', 'editor', 'viewer']
    const validatedRole = VALID_ROLES.includes(request.requested_role) ? request.requested_role : 'viewer'

    // Check if user already exists using targeted lookup (not listUsers which has pagination issues)
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', request.email.toLowerCase())
      .single()
    const existingUser = !!existingProfile

    let userId: string

    if (existingUser) {
      userId = existingProfile!.id

      // Update profile directly with validated role
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          username: request.username,
          role: validatedRole,
          organization_id: request.organization_id
        })
        .eq('id', userId)

      if (updateError) {
        return errorResponse(
          req,
          'Failed to update existing user. Please try again.',
          400,
          updateError
        )
      }
    } else {
      // SECURITY: Generate cryptographically secure temporary password
      const tempPassword = crypto.randomUUID()

      // Create user account using admin auth
      const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: request.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          username: request.username,
          role: validatedRole,
          organization_id: request.organization_id
        }
      })

      if (createError) {
        return errorResponse(
          req,
          'Failed to create user. Please try again.',
          400,
          createError
        )
      }

      if (!authData?.user) {
        console.error('No user data returned from auth.admin.createUser')
        return errorResponse(req, 'Failed to create user. Please try again.', 500)
      }

      userId = authData.user.id

      // SECURITY: The handle_new_user trigger always sets role='viewer'.
      // Set the actual requested role via a direct profile update using service_role.
      if (validatedRole !== 'viewer') {
        await supabaseAdmin
          .from('profiles')
          .update({ role: validatedRole })
          .eq('id', userId)
      }
    }

    // Update request status
    const { error: updateError } = await supabaseAdmin
      .from('account_requests')
      .update({
        status: 'approved',
        approved_by: approved_by_user_id,
        approved_at: new Date().toISOString()
      })
      .eq('id', request_id)

    if (updateError) {
      console.error('Error updating request status:', updateError)
    }

    console.log('Account approval completed successfully')

    return jsonResponse(req, {
      success: true,
      message: existingUser
        ? 'Account approved successfully. User profile has been updated.'
        : 'Account created successfully. You can now send the user a password reset link via the Supabase dashboard or have them use "Forgot Password" on the login page.',
      user_id: userId
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
