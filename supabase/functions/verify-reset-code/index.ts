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

    // SECURITY FIX: Look up the most recent unused, unexpired code for this EMAIL only
    // (do NOT filter by code value — we must increment attempts on every wrong guess)
    const { data: resetCode, error: fetchError } = await supabaseAdmin
      .from('password_reset_codes')
      .select('*')
      .eq('email', normalizedEmail)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (fetchError || !resetCode) {
      return errorResponse(req, 'Invalid or expired reset code. Please request a new one.', 400)
    }

    // Check max attempts BEFORE comparing the code
    if (resetCode.attempts >= resetCode.max_attempts) {
      // Mark as used to prevent further attempts
      await supabaseAdmin
        .from('password_reset_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', resetCode.id)

      return errorResponse(req, 'Too many failed attempts. Please request a new code.', 400)
    }

    // SECURITY FIX: Compare the submitted code against the stored code
    // Increment attempt counter on EVERY failed comparison
    if (resetCode.code !== normalizedCode) {
      await supabaseAdmin
        .from('password_reset_codes')
        .update({ attempts: resetCode.attempts + 1 })
        .eq('id', resetCode.id)

      return errorResponse(req, 'Invalid or expired reset code. Please request a new one.', 400)
    }

    // Code matches — find the user using targeted lookup instead of listing all users
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .single()

    if (profileError || !profile) {
      return errorResponse(req, 'Invalid reset code. Please try again.', 400)
    }

    // Update the user's password AND confirm their email (since receiving the code proves ownership)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      profile.id,
      {
        password: newPassword,
        email_confirm: true  // Auto-confirm email since they received the reset code
      }
    )

    if (updateError) {
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

    return jsonResponse(req, {
      success: true,
      message: 'Password updated successfully. You can now sign in with your new password.'
    })

  } catch (error) {
    return errorResponse(
      req,
      'An unexpected error occurred. Please try again.',
      500,
      error
    )
  }
})
