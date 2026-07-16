// Edge Function to send bulk profile update reminder emails
// Sends the HTML email template to all active users

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { htmlToText, REMINDER_EMAIL_HEADERS, SUPPORT_EMAIL } from '../_shared/email.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const EMAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Update your profile - Matrix Portal</title>
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
                            <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #f8fafc;">Update your Matrix Portal profile</h2>

                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3;">
                                We're reaching out to ensure your Matrix Portal profile is complete and up to date. Keeping your information current helps us maintain accurate records and ensures you receive important notifications about your certifications.
                            </p>

                            <!-- What to Update Section -->
                            <div style="margin: 24px 0; padding: 20px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 12px;">
                                <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #60a5fa;">Please review and update:</h3>
                                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; font-size: 14px; color: #d1d5db;">
                                            <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; background: rgba(16, 185, 129, 0.2); border-radius: 50%; margin-right: 12px; color: #10b981; font-size: 12px;">1</span>
                                            <strong>Personal Details</strong> - Contact info, emergency contacts, address
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-size: 14px; color: #d1d5db;">
                                            <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; background: rgba(16, 185, 129, 0.2); border-radius: 50%; margin-right: 12px; color: #10b981; font-size: 12px;">2</span>
                                            <strong>Certifications</strong> - NDT qualifications, expiry dates, certificates
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-size: 14px; color: #d1d5db;">
                                            <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; background: rgba(16, 185, 129, 0.2); border-radius: 50%; margin-right: 12px; color: #10b981; font-size: 12px;">3</span>
                                            <strong>Training Records</strong> - Completed courses and training history
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-size: 14px; color: #d1d5db;">
                                            <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; background: rgba(16, 185, 129, 0.2); border-radius: 50%; margin-right: 12px; color: #10b981; font-size: 12px;">4</span>
                                            <strong>Documents</strong> - Upload any missing certificate copies
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="https://matrixportal.io" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); border-radius: 10px; text-decoration: none; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);">
                                            Log In to Matrix Portal
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Why This Matters -->
                            <div style="margin-top: 24px; padding: 16px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 8px;">
                                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #fbbf24;">
                                    <strong>Why is this important?</strong> Accurate records ensure you receive timely reminders before certifications expire and help maintain compliance with industry standards.
                                </p>
                            </div>

                            <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.6; color: #737373;">
                                If you have any questions or need assistance updating your profile, please don't hesitate to reach out to your manager or the admin team.
                            </p>

                            <p style="margin: 16px 0 0; font-size: 13px; line-height: 1.5; color: #525252;">
                                Thank you for keeping your records up to date.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                            <p style="margin: 0 0 8px; font-size: 13px; color: #525252;">
                                Need help? Contact support at
                                <a href="mailto:support@matrixinspectionservices.com" style="color: #60a5fa; text-decoration: none;">support@matrixinspectionservices.com</a>
                            </p>
                            <p style="margin: 8px 0 0; font-size: 12px; color: #404040;">
                                &copy; Matrix Advanced Inspection Services. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`

// Plain-text alternative for the bulk reminder (multipart/alternative).
// HTML-only mail is a spam signal at Microsoft 365 / Outlook.
const EMAIL_TEXT = htmlToText(EMAIL_HTML)

interface SendResult {
  email: string
  success: boolean
  error?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // Verify the user is authenticated and is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse(req, 'Missing authorization header', 401)
    }

    // Create Supabase client with service role for querying all users
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Create client to verify the requesting user
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get the user to verify they're authenticated
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return errorResponse(req, 'Unauthorized', 401)
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return errorResponse(req, 'Only admins can send bulk emails', 403)
    }

    // Parse optional request body for filtering
    let body: { dryRun?: boolean; userIds?: string[] } = {}
    try {
      body = await req.json()
    } catch {
      // No body is fine, will send to all users
    }

    // Validate Resend API key
    if (!RESEND_API_KEY) {
      return errorResponse(req, 'Email service not configured', 500)
    }

    // Get all active users with emails
    let query = supabaseAdmin
      .from('profiles')
      .select('id, email, username')
      .eq('is_active', true)
      .not('email', 'is', null)

    // If specific userIds provided, filter to those
    if (body.userIds && body.userIds.length > 0) {
      query = query.in('id', body.userIds)
    }

    const { data: users, error: usersError } = await query

    if (usersError) {
      return errorResponse(req, 'Failed to fetch users', 500, usersError)
    }

    if (!users || users.length === 0) {
      return errorResponse(req, 'No users found to send to', 404)
    }

    // Dry run - just return who would receive emails
    if (body.dryRun) {
      return jsonResponse(req, {
        dryRun: true,
        totalRecipients: users.length,
        recipients: users.map(u => ({ email: u.email, username: u.username }))
      })
    }

    // Send emails to all users
    const results: SendResult[] = []
    const BATCH_SIZE = 10
    const DELAY_MS = 100 // Small delay between batches to avoid rate limits

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE)

      const batchPromises = batch.map(async (recipient) => {
        try {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Matrix Portal <notifications@updates.matrixportal.io>',
              to: [recipient.email],
              subject: 'Please review your Matrix Portal profile',
              html: EMAIL_HTML,
              text: EMAIL_TEXT,
              reply_to: SUPPORT_EMAIL,
              headers: REMINDER_EMAIL_HEADERS,
            }),
          })

          const data = await response.json()

          if (!response.ok) {
            return { email: recipient.email, success: false, error: data.message || 'Failed to send' }
          }

          return { email: recipient.email, success: true }
        } catch (error) {
          return { email: recipient.email, success: false, error: error.message }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      // Small delay between batches
      if (i + BATCH_SIZE < users.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS))
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success)

    return jsonResponse(req, {
      success: true,
      totalRecipients: users.length,
      successful,
      failed: failed.length,
      failedDetails: failed.length > 0 ? failed : undefined
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
