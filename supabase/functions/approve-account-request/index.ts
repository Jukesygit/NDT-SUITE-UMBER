// Edge Function to handle account request approvals
// Uses admin auth to create user accounts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // Parse request body
    const { request_id, approved_by_user_id } = await req.json()

    console.log('Received approval request:', { request_id, approved_by_user_id })

    // Validate required fields
    if (!request_id || !approved_by_user_id) {
      console.error('Missing required fields')
      return errorResponse(req, 'Missing required fields', 400)
    }

    // Create Supabase client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

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

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === request.email)

    let userId: string

    if (existingUser) {
      console.log('User already exists, updating metadata')
      userId = existingUser.id

      // Update user metadata
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          user_metadata: {
            username: request.username,
            role: request.requested_role,
            organization_id: request.organization_id
          }
        }
      )

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

      console.log('Creating user with data:', {
        email: request.email,
        username: request.username,
        role: request.requested_role
      })

      // Create user account using admin auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: request.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          username: request.username,
          role: request.requested_role,
          organization_id: request.organization_id
        }
      })

      console.log('User creation result:', { success: !!authData?.user?.id, error: !!authError })

      if (authError) {
        return errorResponse(
          req,
          'Failed to create user. Please try again.',
          400,
          authError
        )
      }

      if (!authData?.user) {
        console.error('No user data returned from auth.admin.createUser')
        return errorResponse(req, 'Failed to create user. Please try again.', 500)
      }

      userId = authData.user.id
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
