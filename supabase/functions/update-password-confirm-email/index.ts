// Edge Function to update password and confirm email for authenticated users
// Used by the password reset link flow to ensure email is marked as confirmed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { validatePassword } from '../_shared/password-validation.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    const { newPassword, accessToken } = await req.json()

    if (!newPassword || typeof newPassword !== 'string') {
      return errorResponse(req, 'New password is required', 400)
    }

    // SECURITY: Validate password against policy (12 chars + complexity)
    const passwordValidation = validatePassword(newPassword)
    if (!passwordValidation.valid) {
      return errorResponse(req, passwordValidation.error || 'Invalid password', 400)
    }

    if (!accessToken || typeof accessToken !== 'string') {
      return errorResponse(req, 'Access token is required', 400)
    }

    // Create Supabase client with user's access token to verify identity
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: `Bearer ${accessToken}` }
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      // SECURITY: Log detailed error but return generic message
      return errorResponse(
        req,
        'Invalid or expired session. Please request a new password reset.',
        401,
        userError
      )
    }

    // Use admin client to update password AND confirm email
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

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        password: newPassword,
        email_confirm: true
      }
    )

    if (updateError) {
      // SECURITY: Log detailed error but return generic message
      return errorResponse(
        req,
        'Failed to update password. Please try again.',
        500,
        updateError
      )
    }

    console.log('Password updated and email confirmed for user')

    return jsonResponse(req, {
      success: true,
      message: 'Password updated successfully. You can now sign in.'
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
