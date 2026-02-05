// Edge Function to verify password reset codes and update passwords
// Bypasses corporate email link scanners by using 6-digit codes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { validatePassword } from '../_shared/password-validation.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    const { email, code, newPassword } = await req.json()

    // Validate inputs
    if (!email || typeof email !== 'string') {
      return errorResponse(req, 'Email is required', 400)
    }

    if (!code || typeof code !== 'string') {
      return errorResponse(req, 'Reset code is required', 400)
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return errorResponse(req, 'New password is required', 400)
    }

    // SECURITY: Validate password against policy (12 chars + complexity)
    const passwordValidation = validatePassword(newPassword, { email })
    if (!passwordValidation.valid) {
      return errorResponse(req, passwordValidation.error || 'Invalid password', 400)
    }

    const normalizedEmail = email.toLowerCase().trim()
    const normalizedCode = code.trim()

    // Create Supabase client with service role for admin operations
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

    // Find the reset code
    const { data: resetCode, error: fetchError } = await supabaseAdmin
      .from('password_reset_codes')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('code', normalizedCode)
      .is('used_at', null)
      .single()

    if (fetchError || !resetCode) {
      // SECURITY: Don't log email in production to prevent PII exposure
      console.log('Reset code not found or already used')
      return errorResponse(req, 'Invalid or expired reset code. Please request a new one.', 400)
    }

    // Check if code has expired
    if (new Date(resetCode.expires_at) < new Date()) {
      console.log('Reset code expired')
      return errorResponse(req, 'Reset code has expired. Please request a new one.', 400)
    }

    // Check max attempts
    if (resetCode.attempts >= resetCode.max_attempts) {
      // Mark as used to prevent further attempts
      await supabaseAdmin
        .from('password_reset_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', resetCode.id)

      return errorResponse(req, 'Too many failed attempts. Please request a new code.', 400)
    }

    // Find the user
    const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers()

    if (userError) {
      // SECURITY: Log detailed error but return generic message
      return errorResponse(
        req,
        'Failed to verify user. Please try again.',
        500,
        userError
      )
    }

    const user = users?.users?.find(u => u.email?.toLowerCase() === normalizedEmail)

    if (!user) {
      console.error('User not found for reset code')
      // Increment attempts
      await supabaseAdmin
        .from('password_reset_codes')
        .update({ attempts: resetCode.attempts + 1 })
        .eq('id', resetCode.id)

      // SECURITY: Generic error to prevent user enumeration
      return errorResponse(req, 'Invalid reset code. Please try again.', 400)
    }

    // Update the user's password AND confirm their email (since receiving the code proves ownership)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        password: newPassword,
        email_confirm: true  // Auto-confirm email since they received the reset code
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

    // Mark the code as used
    await supabaseAdmin
      .from('password_reset_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', resetCode.id)

    console.log('Password updated successfully')

    return jsonResponse(req, {
      success: true,
      message: 'Password updated successfully. You can now sign in with your new password.'
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
