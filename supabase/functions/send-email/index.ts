// Edge Function to send emails via Resend
// Keeps API key secure server-side

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireOrgAdmin } from '../_shared/auth.ts'
import { htmlToText, SUPPORT_EMAIL } from '../_shared/email.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

interface EmailRequest {
  to: string | string[]
  subject: string
  html: string
  text?: string
  cc?: string | string[]
  replyTo?: string
  headers?: Record<string, string>
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // SECURITY: Require org_admin or admin role to send emails
    const { auth, errorResponse: authError } = await requireOrgAdmin(req)
    if (authError) return authError

    // Parse request body
    const { to, subject, html, text, cc, replyTo, headers }: EmailRequest = await req.json()

    // Validate required fields
    if (!to || !subject || !html) {
      return errorResponse(req, 'Missing required fields: to, subject, html', 400)
    }

    // Validate Resend API key is configured
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured')
      return errorResponse(req, 'Email service not configured', 500)
    }

    // Build email payload — SECURITY: from is always hardcoded server-side
    const emailPayload: Record<string, unknown> = {
      from: 'Matrix Portal <notifications@updates.matrixportal.io>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      // DELIVERABILITY: always send a plain-text alternative (multipart/alternative).
      // HTML-only mail is a spam signal at Microsoft 365 / Outlook. Caller may
      // supply its own text; otherwise derive a readable fallback from the HTML.
      text: text && text.trim() ? text : htmlToText(html),
    }

    // Add optional CC recipients
    if (cc) {
      emailPayload.cc = Array.isArray(cc) ? cc : [cc]
    }

    // Reply-to address — default to the monitored support mailbox so replies do
    // not vanish into the unattended notifications@ sender.
    emailPayload.reply_to = replyTo && replyTo.trim() ? replyTo : SUPPORT_EMAIL

    // Add optional custom headers (e.g. List-Unsubscribe for notification mail)
    if (headers && typeof headers === 'object') {
      emailPayload.headers = headers
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
