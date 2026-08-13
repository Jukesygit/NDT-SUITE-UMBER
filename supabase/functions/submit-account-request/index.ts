// Edge Function to handle account request submissions
// This bypasses RLS by using the service role and allows anonymous submissions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { maskEmail } from '../_shared/audit.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// SECURITY (audit L7): one fixed success body for both the "inserted" and the
// "already pending" path. Echoing the stored row back on the dedupe path would
// disclose another submitter's username/message/organisation to anyone who
// guesses their email, and would make the two paths distinguishable.
const SUBMIT_SUCCESS_BODY = {
  success: true,
  message: 'Your account request has been submitted for review.',
}

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
    if (typeof email !== 'string' || !emailRegex.test(email)) {
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

    // SECURITY (audit L7): organization_id was previously accepted unvalidated.
    // Reject anything that is not a UUID before it reaches Postgres, so a
    // malformed value cannot surface a driver error to an anonymous caller.
    if (typeof organization_id !== 'string' || !UUID_PATTERN.test(organization_id)) {
      return errorResponse(req, 'Invalid organization', 400)
    }

    // Store one canonical form so the dedupe check below and the downstream
    // profile lookup in approve-account-request agree on casing.
    const normalizedEmail = email.toLowerCase().trim()

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

    // SECURITY (audit L7): the submitted organization must actually exist.
    // Generic message — do not confirm/deny a specific organisation id to an
    // unauthenticated caller.
    const { data: organization, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('id', organization_id)
      .maybeSingle()

    if (orgError) {
      return errorResponse(
        req,
        'Failed to submit account request. Please try again.',
        500,
        orgError
      )
    }

    if (!organization) {
      return errorResponse(req, 'Invalid organization', 400)
    }

    // SECURITY (audit L7): dedupe-as-throttle. Repeated submissions for an
    // email that already has an unprocessed request do not insert a second
    // row; the caller gets the same success body either way, so the endpoint
    // cannot be used to flood the admin queue for one address and the response
    // does not reveal that a request already exists.
    const { data: pendingRequest, error: pendingError } = await supabaseAdmin
      .from('account_requests')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (pendingError) {
      return errorResponse(
        req,
        'Failed to submit account request. Please try again.',
        500,
        pendingError
      )
    }

    if (pendingRequest) {
      console.log('Duplicate account request suppressed for:', maskEmail(normalizedEmail))
      return jsonResponse(req, SUBMIT_SUCCESS_BODY)
    }

    // Insert account request
    const { error } = await supabaseAdmin
      .from('account_requests')
      .insert({
        username,
        email: normalizedEmail,
        requested_role,
        organization_id,
        message: message || ''
      })

    if (error) {
      // SECURITY: Log detailed error but return generic message
      return errorResponse(
        req,
        'Failed to submit account request. Please try again.',
        500,
        error
      )
    }

    return jsonResponse(req, SUBMIT_SUCCESS_BODY)

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
