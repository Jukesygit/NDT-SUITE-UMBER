// Edge Function to send emails via Resend
// Keeps API key secure server-side

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

interface EmailRequest {
  to: string | string[]
  subject: string
  html: string
  from?: string
  cc?: string | string[]
  replyTo?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse(req, 'Missing authorization header', 401)
    }

    // Create Supabase client to verify the user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get the user to verify they're authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse(req, 'Unauthorized', 401)
    }

    // Parse request body
    const { to, subject, html, from, cc, replyTo }: EmailRequest = await req.json()

    // Validate required fields
    if (!to || !subject || !html) {
      return errorResponse(req, 'Missing required fields: to, subject, html', 400)
    }

    // Validate Resend API key is configured
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured')
      return errorResponse(req, 'Email service not configured', 500)
    }

    // Build email payload
    const emailPayload: Record<string, unknown> = {
      from: from || 'NDT Suite <notifications@updates.matrixportal.io>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }

    // Add optional CC recipients
    if (cc) {
      emailPayload.cc = Array.isArray(cc) ? cc : [cc]
    }

    // Add optional reply-to address
    if (replyTo) {
      emailPayload.reply_to = replyTo
    }

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    })

    const resendData = await resendResponse.json()

    if (!resendResponse.ok) {
      // SECURITY: Log detailed error but return generic message
      return errorResponse(
        req,
        'Failed to send email. Please try again.',
        500,
        resendData
      )
    }

    return jsonResponse(req, { success: true, id: resendData.id })

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
