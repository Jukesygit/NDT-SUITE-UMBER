// Edge Function to send password reset codes
// Bypasses corporate email link scanners by using 6-digit codes instead of links

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { maskEmail } from '../_shared/audit.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

// SECURITY (audit M9): user-enumeration oracle.
// Every request that passes shape validation resolves to this exact body with
// HTTP 200 — account found, account missing, throttled, or internal failure.
// The previous version returned 200 for unknown emails and 429 for known ones,
// so two requests distinguished registered accounts. Any divergence in status
// code, body, or headers re-opens the oracle.
const GENERIC_RESET_MESSAGE = 'If an account exists with this email, a reset code has been sent.'

// SECURITY: Generate a cryptographically secure 6-digit code
function generateCode(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return (100000 + (array[0] % 900000)).toString()
}

// Email template for reset code
function getEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Code - Matrix Portal</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #e2e8f0;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background: linear-gradient(135deg, rgba(23, 23, 23, 0.98) 0%, rgba(15, 15, 15, 0.98) 100%); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden;">

                    <!-- Header with Logo -->
                    <tr>
                        <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%);">
                            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">Matrix Portal</h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #f8fafc;">Password Reset Code</h2>

                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3;">
                                You requested to reset your password. Enter this code on the password reset page:
                            </p>

                            <!-- Code Display -->
                            <div style="margin: 32px 0; text-align: center;">
                                <div style="display: inline-block; padding: 20px 40px; font-size: 36px; font-weight: 700; font-family: monospace; letter-spacing: 8px; color: #ffffff; background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%); border: 2px solid rgba(59, 130, 246, 0.4); border-radius: 12px;">
                                    ${code}
                                </div>
                            </div>

                            <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.6; color: #737373;">
                                This code will expire in <strong style="color: #a3a3a3;">15 minutes</strong>.
                            </p>

                            <!-- Security Notice -->
                            <div style="margin-top: 32px; padding: 16px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 8px;">
                                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #fbbf24;">
                                    <strong>Security Notice:</strong> If you didn't request this code, please ignore this email. Your password will remain unchanged.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                            <p style="margin: 0 0 8px; font-size: 13px; color: #525252;">
                                Need help? Contact support at
                                <a href="mailto:jonas@matrixinspectionservices.com" style="color: #60a5fa; text-decoration: none;">jonas@matrixinspectionservices.com</a>
                            </p>
                            <p style="margin: 8px 0 0; font-size: 12px; color: #404040;">
                                &copy; Matrix Inspection Services. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `
}

// Plain-text alternative for the reset code email (multipart/alternative).
// Security mail: no List-Unsubscribe header.
function getEmailText(code: string): string {
  return [
    'Matrix Portal - Password Reset Code',
    '',
    'You requested to reset your password. Enter this code on the password reset page:',
    '',
    `    ${code}`,
    '',
    'This code will expire in 15 minutes.',
    '',
    "If you didn't request this code, please ignore this email. Your password will remain unchanged.",
    '',
    'Need help? Contact support at jonas@matrixinspectionservices.com',
  ].join('\n')
}

/**
 * Account-dependent half of the reset flow.
 *
 * SECURITY (audit M9): this function never produces a Response. Every outcome —
 * unknown email, throttled, storage failure, mail-provider failure — exits via
 * a plain `return` (or throws to the caller's catch) so the handler can emit a
 * single, identical 200 for all of them. Do not add a Response return here.
 */
async function processResetRequest(normalizedEmail: string): Promise<void> {
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

  // Check if user exists using targeted lookup (not listUsers which has pagination issues)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  const userExists = !!profile

  // Rate limiting: check for recent codes sent to this email.
  // SECURITY (audit M9): this query runs on EVERY request, including unknown
  // emails, so both cases perform the same two DB round-trips before they
  // diverge. Residual timing risk remains: a known + unthrottled address still
  // does the extra invalidate/insert plus an outbound Resend call, so the
  // "send" path is measurably slower than the others. Closing that fully needs
  // IP-scoped limiting or a fixed-duration response budget.
  const { data: recentCodes } = await supabaseAdmin
    .from('password_reset_codes')
    .select('created_at')
    .eq('email', normalizedEmail)
    .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last 1 minute
    .order('created_at', { ascending: false })
    .limit(1)

  const throttled = !!recentCodes && recentCodes.length > 0

  if (throttled) {
    // Internal-only signal: the caller still receives the generic 200.
    console.log('Reset code request throttled (1 min window):', maskEmail(normalizedEmail))
    return
  }

  if (!userExists) {
    console.log('Reset code requested for unknown address:', maskEmail(normalizedEmail))
    return
  }

  // Generate code and expiration (15 minutes)
  const code = generateCode()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  // Invalidate any existing unused codes for this email
  await supabaseAdmin
    .from('password_reset_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('email', normalizedEmail)
    .is('used_at', null)

  // Store the new code
  const { error: insertError } = await supabaseAdmin
    .from('password_reset_codes')
    .insert({
      email: normalizedEmail,
      code,
      expires_at: expiresAt
    })

  if (insertError) {
    console.error('Failed to store reset code:', insertError)
    return
  }

  // Send email via Resend
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured')
    return
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Matrix Portal <noreply@updates.matrixportal.io>',
      to: [normalizedEmail],
      subject: 'Your Password Reset Code - Matrix Portal',
      html: getEmailHtml(code),
      text: getEmailText(code),
    }),
  })

  // Drain the provider body so the connection is released. It is deliberately
  // not logged: Resend echoes the recipient address back in its payload.
  await resendResponse.body?.cancel()

  if (!resendResponse.ok) {
    // Clean up the code since email failed
    await supabaseAdmin
      .from('password_reset_codes')
      .delete()
      .eq('email', normalizedEmail)
      .eq('code', code)

    // Log status only — the Resend payload echoes the recipient address.
    console.error('Failed to send reset code email. Provider status:', resendResponse.status)
    return
  }

  console.log('Reset code sent successfully')
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  // Request-shape validation happens before any account lookup, so these 400s
  // carry no information about whether an account exists.
  let email: unknown
  try {
    const body = await req.json()
    email = body?.email
  } catch {
    return errorResponse(req, 'Invalid request body', 400)
  }

  if (!email || typeof email !== 'string') {
    return errorResponse(req, 'Email is required', 400)
  }

  const normalizedEmail = email.toLowerCase().trim()

  try {
    await processResetRequest(normalizedEmail)
  } catch (error) {
    // SECURITY (audit M9): swallow the failure into the generic response.
    // Surfacing a 500 here would only be reachable on the account-exists path
    // and would therefore re-open the enumeration oracle.
    console.error('send-reset-code failed:', error)
  }

  // SECURITY (audit M9): the single exit for every post-validation outcome.
  return jsonResponse(req, {
    success: true,
    message: GENERIC_RESET_MESSAGE
  })
})
