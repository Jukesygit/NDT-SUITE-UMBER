// Edge Function to create a single user with admin API
// This ensures email is pre-confirmed and profile trigger fires correctly

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { validatePassword } from '../_shared/password-validation.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
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

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existingUser) {
      return errorResponse(req, 'A user with this email already exists', 400)
    }

    // Create auth user with admin API - this pre-confirms email and triggers profile creation
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        role: role || 'viewer',
        organization_id: organization_id || null
      }
    })

    if (authError) {
      // SECURITY: Log detailed error but return generic message
      return errorResponse(
        req,
        'Failed to create user. Please try again.',
        500,
        authError
      )
    }

    if (!authData?.user) {
      return errorResponse(req, 'User creation failed. Please try again.', 500)
    }

    console.log('User created successfully:', email)

    return jsonResponse(req, {
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        username,
        role: role || 'viewer',
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
