// Edge Function to send certification expiration reminder emails
// Scheduled to run daily via pg_cron

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://ndtsuite.com'

interface Competency {
  competency_id: string
  name: string
  expiry_date: string
  days_until_expiry: number
}

interface UserWithExpiring {
  user_id: string
  username: string
  email: string
  competencies: Competency[]
}

interface ReminderSettings {
  is_enabled: boolean
  thresholds_months: number[]
  manager_emails: string[]
  sender_email: string
  sender_name: string
}

/**
 * Generate HTML email for consolidated expiration reminders
 */
function generateConsolidatedEmail(
  recipientName: string,
  competencies: Competency[],
  appUrl: string
): string {
  // Group competencies by urgency
  const expired = competencies.filter(c => c.days_until_expiry <= 0)
  const critical = competencies.filter(c => c.days_until_expiry > 0 && c.days_until_expiry <= 30)
  const warning = competencies.filter(c => c.days_until_expiry > 30 && c.days_until_expiry <= 90)
  const upcoming = competencies.filter(c => c.days_until_expiry > 90)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const renderCompetencyRow = (comp: Competency, urgencyColor: string) => {
    const statusText = comp.days_until_expiry <= 0
      ? 'EXPIRED'
      : `${comp.days_until_expiry} days`

    return `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
          <span style="font-size: 14px; color: #f8fafc;">${escapeHtml(comp.name)}</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid rgba(148, 163, 184, 0.1); text-align: center;">
          <span style="font-size: 14px; color: #cbd5e1;">${formatDate(comp.expiry_date)}</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid rgba(148, 163, 184, 0.1); text-align: right;">
          <span style="display: inline-block; padding: 4px 12px; font-size: 13px; font-weight: 600; color: ${urgencyColor}; background: ${urgencyColor}20; border-radius: 20px;">
            ${statusText}
          </span>
        </td>
      </tr>
    `
  }

  const renderSection = (title: string, comps: Competency[], urgencyColor: string) => {
    if (comps.length === 0) return ''

    return `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: ${urgencyColor}; text-transform: uppercase; letter-spacing: 0.5px;">
          ${title} (${comps.length})
        </h3>
        <table style="width: 100%; border-collapse: collapse; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: rgba(255, 255, 255, 0.03);">
              <th style="padding: 10px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Certification</th>
              <th style="padding: 10px 16px; text-align: center; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Expiry Date</th>
              <th style="padding: 10px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${comps.map(c => renderCompetencyRow(c, urgencyColor)).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Certification Expiration Reminder - NDT Suite</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #e2e8f0;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0f172a;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="width: 100%; max-width: 700px; border-collapse: collapse; background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 16px; overflow: hidden;">

                    <!-- Header with Logo -->
                    <tr>
                        <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%);">
                            <div style="width: 64px; height: 64px; margin: 0 auto 20px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" style="display: block; margin: 16px auto;">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                </svg>
                            </div>
                            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">NDT Suite</h1>
                            <p style="margin: 8px 0 0; font-size: 14px; color: #94a3b8;">Certification Expiration Reminder</p>
                        </td>
                    </tr>

                    <!-- Alert Banner -->
                    <tr>
                        <td style="padding: 0 40px;">
                            <div style="padding: 16px 20px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 8px; text-align: center;">
                                <span style="font-size: 15px; font-weight: 600; color: #fbbf24;">
                                    ${competencies.length} certification${competencies.length > 1 ? 's' : ''} require${competencies.length === 1 ? 's' : ''} attention
                                </span>
                            </div>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 30px 40px 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #f8fafc;">
                                Hi ${escapeHtml(recipientName)},
                            </h2>

                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                                The following certifications are expiring soon or have recently expired. Please ensure you renew them to maintain compliance.
                            </p>

                            <!-- Competency Lists by Urgency -->
                            ${renderSection('Expired', expired, '#ef4444')}
                            ${renderSection('Expiring Soon (< 30 days)', critical, '#f97316')}
                            ${renderSection('Expiring (< 90 days)', warning, '#fbbf24')}
                            ${renderSection('Upcoming', upcoming, '#3b82f6')}

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="${appUrl}/profile" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); border-radius: 10px; text-decoration: none; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);">
                                            View & Update My Certifications
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Info Notice -->
                            <div style="margin-top: 24px; padding: 16px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px;">
                                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #60a5fa;">
                                    <strong>Need to renew?</strong> Upload your updated certification documents through your profile page. Your manager will be notified once submitted.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; text-align: center; border-top: 1px solid rgba(148, 163, 184, 0.1);">
                            <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
                                Need help? Contact support at
                                <a href="mailto:support@matrixinspectionservices.com" style="color: #60a5fa; text-decoration: none;">support@matrixinspectionservices.com</a>
                            </p>
                            <p style="margin: 8px 0 0; font-size: 12px; color: #475569;">
                                &copy; ${new Date().getFullYear()} Matrix Inspection Services. All rights reserved.
                            </p>
                            <p style="margin: 12px 0 0; font-size: 11px; color: #475569;">
                                You received this email because you have certifications tracked in NDT Suite.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
}

/**
 * HTML-escape a string to prevent XSS
 */
function escapeHtml(str: string): string {
  if (typeof str !== 'string') return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * Send email via Resend API
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  from: string,
  cc?: string[]
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html,
  }

  if (cc && cc.length > 0) {
    payload.cc = cc
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('Resend API error:', data)
    return { success: false, error: data.message || 'Failed to send email' }
  }

  return { success: true, id: data.id }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // This function should be called with service role key (from pg_cron or admin)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role for full access
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch reminder settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('email_reminder_settings')
      .select('*')
      .single()

    if (settingsError) {
      console.error('Error fetching settings:', settingsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch reminder settings', details: settingsError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const settings: ReminderSettings = settingsData

    // Check if reminders are enabled
    if (!settings.is_enabled) {
      return new Response(
        JSON.stringify({ message: 'Email reminders are disabled', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results: Array<{
      threshold: number
      user: string
      email: string
      status: 'sent' | 'failed'
      error?: string
    }> = []

    // Process each threshold
    for (const threshold of settings.thresholds_months) {
      console.log(`Processing threshold: ${threshold} months`)

      // Get users who need reminders for this threshold
      const { data: usersData, error: usersError } = await supabase
        .rpc('get_users_for_expiration_reminder', {
          threshold_months: threshold,
          check_timezone: 'Europe/London'
        })

      if (usersError) {
        console.error(`Error fetching users for threshold ${threshold}:`, usersError)
        continue
      }

      const users: UserWithExpiring[] = usersData || []
      console.log(`Found ${users.length} users for threshold ${threshold}`)

      // Send emails to each user
      for (const user of users) {
        const senderFrom = `${settings.sender_name} <${settings.sender_email}>`

        // Generate subject line
        const urgentCount = user.competencies.filter(c => c.days_until_expiry <= 30).length
        const subject = urgentCount > 0
          ? `Action Required: ${user.competencies.length} certification(s) expiring soon`
          : `Reminder: ${user.competencies.length} certification(s) expiring within ${threshold} months`

        // Generate email HTML
        const html = generateConsolidatedEmail(
          user.username || user.email.split('@')[0],
          user.competencies,
          APP_URL
        )

        // Send the email
        const emailResult = await sendEmail(
          user.email,
          subject,
          html,
          senderFrom,
          settings.manager_emails.length > 0 ? settings.manager_emails : undefined
        )

        // Log the result
        const competencyIds = user.competencies.map(c => c.competency_id)

        const { error: logError } = await supabase
          .from('email_reminder_log')
          .insert({
            user_id: user.user_id,
            threshold_months: threshold,
            competency_ids: competencyIds,
            email_sent_to: user.email,
            managers_cc: settings.manager_emails,
            status: emailResult.success ? 'sent' : 'failed',
            error_message: emailResult.error || null
          })

        if (logError) {
          console.error('Error logging reminder:', logError)
        }

        results.push({
          threshold,
          user: user.username,
          email: user.email,
          status: emailResult.success ? 'sent' : 'failed',
          error: emailResult.error
        })

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    const sentCount = results.filter(r => r.status === 'sent').length
    const failedCount = results.filter(r => r.status === 'failed').length

    console.log(`Completed: ${sentCount} sent, ${failedCount} failed`)

    return new Response(
      JSON.stringify({
        message: 'Reminder job completed',
        sent: sentCount,
        failed: failedCount,
        details: results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-expiration-reminders:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
