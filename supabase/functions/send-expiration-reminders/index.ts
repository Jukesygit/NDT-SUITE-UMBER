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
const APP_URL = Deno.env.get('APP_URL') ?? 'https://matrixportal.io'

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
        <td style="padding: 12px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
          <span style="font-size: 14px; color: #f8fafc;">${escapeHtml(comp.name)}</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-align: center;">
          <span style="font-size: 14px; color: #a3a3a3;">${formatDate(comp.expiry_date)}</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-align: right;">
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
        <table style="width: 100%; border-collapse: collapse; background: rgba(23, 23, 23, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: rgba(255, 255, 255, 0.03);">
              <th style="padding: 10px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #525252; text-transform: uppercase; letter-spacing: 0.5px;">Certification</th>
              <th style="padding: 10px 16px; text-align: center; font-size: 12px; font-weight: 600; color: #525252; text-transform: uppercase; letter-spacing: 0.5px;">Expiry Date</th>
              <th style="padding: 10px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #525252; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
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
    <title>Certification Expiration Reminder - Matrix Portal</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #e2e8f0;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="width: 100%; max-width: 700px; border-collapse: collapse; background: linear-gradient(135deg, rgba(23, 23, 23, 0.98) 0%, rgba(15, 15, 15, 0.98) 100%); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden;">

                    <!-- Header with Logo -->
                    <tr>
                        <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%);">
                            <!-- Matrix Logo with Gradient -->
                            <div style="margin: 0 auto 20px;">
                                <svg width="120" height="64" viewBox="0 0 2256 1202" fill="none" style="display: block; margin: 0 auto;">
                                    <defs>
                                        <linearGradient id="logoGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stop-color="#10b981" />
                                            <stop offset="50%" stop-color="#3b82f6" />
                                            <stop offset="100%" stop-color="#8b5cf6" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M36 1199.2 c-17.1 -4.5 -30.8 -18.8 -34 -35.7 -0.8 -4.4 -1 -75 -0.8 -266 l0.3 -260 3.3 -9.5 c4 -11.5 10.6 -22.3 18.1 -29.9 5.6 -5.6 778.3 -585.2 787.1 -590.3 7 -4.1 16.1 -6.1 25 -5.5 19 1.3 34.9 13.6 41.1 31.7 l2.2 6.5 0.8 239.5 c0.5 140.3 1.3 241.8 1.8 245.2 2.3 13.5 12.2 26.1 25.7 32.5 7.8 3.7 8.1 3.8 19.9 3.8 11.4 0 12.3 -0.2 18.5 -3.1 3.8 -1.8 30.2 -20.7 64.5 -46.1 31.9 -23.6 197.5 -146.4 368 -272.9 181 -134.2 312.7 -231.2 316.5 -233.1 14.7 -7.4 31.1 -6.1 45.8 3.5 7 4.6 11.7 10.2 16.1 19.2 l3.6 7.5 0.6 56 c0.4 30.8 1 146 1.3 256 0.5 129.9 1.1 201.9 1.8 205.5 2.4 12.9 12.6 27.8 23.9 35.1 2.8 1.7 8 4.4 11.7 5.8 l6.7 2.6 193 0.5 c182.3 0.5 193.3 0.7 199 2.4 27.8 8.4 47.4 28.1 55.2 55.7 1.7 6.1 1.8 16.8 1.8 241.9 0 264.2 0.7 239.6 -7.4 256.5 -9.3 19.4 -24.4 32.7 -45.6 40.2 l-8 2.8 -186 0 -186 0 -8.8 -3.1 c-28.6 -10.3 -48 -34.1 -51.7 -63.8 -1.6 -12.8 -1.4 -382.3 0.3 -382.9 0.9 -0.4 0.9 -0.6 0 -0.6 -1 -0.1 -1.3 -6.6 -1.3 -28.9 0 -31.8 -0.5 -35.7 -6.2 -46.6 -4.1 -7.7 -14.5 -18.2 -22.3 -22.3 -17 -8.9 -37 -9.1 -53 -0.4 -2.7 1.5 -166.1 124.2 -363 272.6 -196.9 148.5 -360.4 271.4 -363.4 273.2 -7.8 4.7 -18.6 6.9 -27.8 5.6 -20 -2.9 -36.8 -18.3 -40.3 -37.2 -0.7 -3.5 -1 -90 -1 -249 0 -266.9 0.4 -249.6 -5.7 -260.1 -12.5 -21.4 -39.4 -29.9 -60.8 -19.3 -10.9 5.5 -98.7 71.1 -414.5 309.8 -181.2 136.9 -332 250.2 -335 251.7 -9.8 4.9 -19.9 5.9 -31 3z" fill="url(#logoGrad2)" />
                                    <path d="M1515.5 1196.4 c-30.2 -4.3 -51 -11.8 -73.2 -26.6 -13.6 -9 -33.2 -28.3 -42 -41.3 -33.3 -49.4 -37.2 -110.3 -10.2 -162.5 14.9 -28.8 39.1 -53 67.9 -67.9 45.1 -23.3 97.8 -23.8 142.7 -1.3 16.6 8.4 27.6 16.4 41.4 30.1 23.6 23.7 37.6 49.8 44.1 82.6 2.9 14.3 3.1 42.2 0.5 56 -6.3 33.6 -21 61.6 -44.6 85 -23.8 23.6 -51.3 38 -84.3 44.1 -8 1.5 -36.2 2.7 -42.3 1.8z" fill="url(#logoGrad2)" />
                                    <path d="M1983.5 515.5 c-45.6 -7.3 -86.1 -34.1 -110.3 -73 -36.1 -58.2 -30.8 -132.3 13.2 -185 22.7 -27.2 53.8 -45.8 90 -53.7 8.7 -2 13.1 -2.3 31.6 -2.2 18.4 0 22.9 0.3 31.3 2.2 21.9 4.9 42.6 13.9 59.7 26 11.9 8.4 29.6 26 37.7 37.5 12.7 18.1 22.8 42.1 26.9 64.2 2.8 14.9 2.6 42.1 -0.4 57.2 -13 65.1 -64.2 115.3 -128.7 126.3 -13.7 2.3 -38.1 2.6 -51 0.5z" fill="url(#logoGrad2)" />
                                </svg>
                            </div>
                            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">Matrix Portal</h1>
                            <p style="margin: 8px 0 0; font-size: 14px; color: #a3a3a3;">Certification Expiration Reminder</p>
                        </td>
                    </tr>

                    <!-- Alert Banner -->
                    <tr>
                        <td style="padding: 0 40px;">
                            <div style="padding: 16px 20px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 8px; text-align: center;">
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

                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3;">
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
                        <td style="padding: 30px 40px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                            <p style="margin: 0 0 8px; font-size: 13px; color: #525252;">
                                Need help? Contact support at
                                <a href="mailto:jonas@matrixinspectionservices.com" style="color: #60a5fa; text-decoration: none;">jonas@matrixinspectionservices.com</a>
                            </p>
                            <p style="margin: 8px 0 0; font-size: 12px; color: #404040;">
                                &copy; ${new Date().getFullYear()} Matrix Inspection Services. All rights reserved.
                            </p>
                            <p style="margin: 12px 0 0; font-size: 11px; color: #404040;">
                                You received this email because you have certifications tracked in Matrix Portal.
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

    // Parse request body for optional targetUserId (single-user mode)
    let targetUserId: string | null = null
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        targetUserId = body?.targetUserId || null
      } catch {
        // No body or invalid JSON - continue with normal mode
      }
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

    // Check if reminders are enabled (skip for single-user mode)
    if (!settings.is_enabled && !targetUserId) {
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

    // Single-user mode: send to specific user regardless of threshold
    if (targetUserId) {
      console.log(`Single-user mode: sending to user ${targetUserId}`)

      // Fetch user profile
      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, email')
        .eq('id', targetUserId)
        .single()

      if (profileError || !userProfile) {
        return new Response(
          JSON.stringify({ error: 'User not found', details: profileError }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Fetch user's expiring competencies (within 6 months)
      const { data: competenciesData, error: compError } = await supabase
        .from('employee_competencies')
        .select(`
          id,
          expiry_date,
          competency_definitions!inner (
            name
          )
        `)
        .eq('user_id', targetUserId)
        .eq('status', 'active')
        .not('expiry_date', 'is', null)
        .lte('expiry_date', new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

      if (compError) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch competencies', details: compError }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!competenciesData || competenciesData.length === 0) {
        return new Response(
          JSON.stringify({
            message: 'No expiring competencies found for this user',
            sent: 0,
            failed: 0
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Transform competencies to expected format
      const competencies: Competency[] = competenciesData.map(c => {
        const expiryDate = new Date(c.expiry_date)
        const now = new Date()
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return {
          competency_id: c.id,
          name: (c.competency_definitions as { name: string }).name,
          expiry_date: c.expiry_date,
          days_until_expiry: daysUntilExpiry
        }
      }).sort((a, b) => a.days_until_expiry - b.days_until_expiry)

      // Use hardcoded verified domain - updates.matrixportal.io is verified in Resend
      const senderFrom = 'Matrix Portal <notifications@updates.matrixportal.io>'

      // Generate subject line
      const urgentCount = competencies.filter(c => c.days_until_expiry <= 30).length
      const subject = urgentCount > 0
        ? `Action Required: ${competencies.length} certification(s) expiring soon`
        : `Reminder: ${competencies.length} certification(s) require attention`

      // Generate email HTML
      const html = generateConsolidatedEmail(
        userProfile.username || userProfile.email.split('@')[0],
        competencies,
        APP_URL
      )

      // Send the email
      const emailResult = await sendEmail(
        userProfile.email,
        subject,
        html,
        senderFrom,
        settings.manager_emails.length > 0 ? settings.manager_emails : undefined
      )

      // Log the result with threshold=-1 to indicate manual single send
      const competencyIds = competencies.map(c => c.competency_id)

      const { error: logError } = await supabase
        .from('email_reminder_log')
        .insert({
          user_id: targetUserId,
          threshold_months: -1, // -1 indicates manual single-user send
          competency_ids: competencyIds,
          email_sent_to: userProfile.email,
          managers_cc: settings.manager_emails,
          status: emailResult.success ? 'sent' : 'failed',
          error_message: emailResult.error || null
        })

      if (logError) {
        console.error('Error logging reminder:', logError)
      }

      results.push({
        threshold: -1,
        user: userProfile.username,
        email: userProfile.email,
        status: emailResult.success ? 'sent' : 'failed',
        error: emailResult.error
      })

      return new Response(
        JSON.stringify({
          message: emailResult.success ? 'Reminder sent successfully' : 'Failed to send reminder',
          sent: emailResult.success ? 1 : 0,
          failed: emailResult.success ? 0 : 1,
          details: results
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Normal mode: process each threshold
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
        // Use hardcoded verified domain - updates.matrixportal.io is verified in Resend
      const senderFrom = 'Matrix Portal <notifications@updates.matrixportal.io>'

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

        // Delay to avoid Resend rate limiting (1 second between emails)
        await new Promise(resolve => setTimeout(resolve, 1000))
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
