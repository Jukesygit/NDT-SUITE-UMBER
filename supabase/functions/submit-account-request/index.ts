// Edge Function to handle account request submissions
// This bypasses RLS by using the service role and allows anonymous submissions

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
    const { username, email, organization_id, requested_role, message } = await req.json()

    // Validate required fields
    if (!username || !email || !organization_id || !requested_role) {
      return errorResponse(req, 'Missing required fields', 400)
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return errorResponse(req, 'Invalid email format', 400)
    }

    // SECURITY: Only allow non-privileged roles for self-registration
    const allowedSelfServiceRoles = ['editor', 'viewer']
    if (!allowedSelfServiceRoles.includes(requested_role)) {
      return errorResponse(req, 'Invalid role for account request', 400)
    }

    // Validate username length
    if (username.length < 3 || username.length > 50) {
      return errorResponse(req, 'Username must be between 3 and 50 characters', 400)
    }

    // Validate message length (if provided)
    if (message && message.length > 500) {
      return errorResponse(req, 'Message too long (max 500 characters)', 400)
    }

    // Create Supabase client with service role (bypasses RLS)
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

    // Insert account request
    const { data, error } = await supabaseAdmin
      .from('account_requests')
      .insert({
        username,
        email,
        requested_role,
        organization_id,
        message: message || ''
      })
      .select()
      .single()

    if (error) {
      // SECURITY: Log detailed error but return generic message
      return errorResponse(
        req,
        'Failed to submit account request. Please try again.',
        500,
        error
      )
    }

    return jsonResponse(req, { success: true, request: data })

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
