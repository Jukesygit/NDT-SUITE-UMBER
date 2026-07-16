// Edge Function to send certification expiration reminder emails
// Scheduled to run daily via pg_cron

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { isAdmin } from '../_shared/auth.ts'
// DELIVERABILITY: no REMINDER_EMAIL_HEADERS here — List-Unsubscribe marks the
// mail as bulk, which routes it to junk/quarantine at strict M365 tenants.
import { SUPPORT_EMAIL } from '../_shared/email.ts'

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

  // DELIVERABILITY: keep this template transactional in shape — plain light
  // layout, no colored banners/badges, no CTA button, minimal links. Marketing
  // shape is what pushes reminder mail into Exchange Online's bulk bucket.
  const renderCompetencyRow = (comp: Competency) => {
    const statusText = comp.days_until_expiry <= 0
      ? 'Expired'
      : `${comp.days_until_expiry} days remaining`

    return `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e5e3de; font-size: 14px; color: #1c1b18;">${escapeHtml(comp.name)}</td>
        <td style="padding: 10px 0 10px 16px; border-bottom: 1px solid #e5e3de; font-size: 14px; color: #4a4845; white-space: nowrap;">${formatDate(comp.expiry_date)}</td>
        <td style="padding: 10px 0 10px 16px; border-bottom: 1px solid #e5e3de; font-size: 14px; color: ${comp.days_until_expiry <= 0 ? '#8e2a1e' : '#4a4845'}; text-align: right; white-space: nowrap;">${statusText}</td>
      </tr>
    `
  }

  const renderSection = (title: string, comps: Competency[]) => {
    if (comps.length === 0) return ''

    return `
      <p style="margin: 24px 0 4px; font-size: 14px; font-weight: 600; color: #1c1b18;">${title}</p>
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tbody>
          ${comps.map(c => renderCompetencyRow(c)).join('')}
        </tbody>
      </table>
    `
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Certification renewal reminder - Matrix Portal</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f4f0; color: #1c1b18;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f4f0;">
        <tr>
            <td align="center" style="padding: 32px 16px;">
                <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background: #ffffff; border: 1px solid #e5e3de; border-radius: 10px;">
                    <tr>
                        <td style="padding: 32px 36px;">
                            <h1 style="margin: 0 0 24px; font-size: 18px; font-weight: 600; color: #1c1b18;">Matrix Portal</h1>

                            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #1c1b18;">Hi ${escapeHtml(recipientName)},</p>

                            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4a4845;">
                                The following certification${competencies.length > 1 ? 's are' : ' is'} due for renewal. Please renew ${competencies.length > 1 ? 'them' : 'it'} to stay compliant.
                            </p>

                            ${renderSection('Expired', expired)}
                            ${renderSection('Expiring within 30 days', critical)}
                            ${renderSection('Expiring within 90 days', warning)}
                            ${renderSection('Upcoming', upcoming)}

                            <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.6; color: #4a4845;">
                                You can view and update your certifications at
                                <a href="${appUrl}/profile" style="color: #2d8a4e;">${appUrl.replace(/^https?:\/\//, '')}/profile</a>.
                                Upload renewed documents through your profile page and your manager will be notified.
                            </p>

                            <p style="margin: 24px 0 0; padding-top: 16px; border-top: 1px solid #e5e3de; font-size: 13px; line-height: 1.6; color: #7a7672;">
                                Need help? Contact <a href="mailto:jonas@matrixinspectionservices.com" style="color: #2d8a4e;">jonas@matrixinspectionservices.com</a>.<br>
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
 * Plain-text alternative for the consolidated reminder email.
 * Sent alongside the HTML (multipart/alternative) — HTML-only mail is a spam
 * signal at Microsoft 365 / Outlook.
 */
function generateConsolidatedText(
  recipientName: string,
  competencies: Competency[],
  appUrl: string
): string {
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const line = (c: Competency) => {
    const status = c.days_until_expiry <= 0 ? 'EXPIRED' : `${c.days_until_expiry} days`
    return `- ${c.name} — expires ${formatDate(c.expiry_date)} (${status})`
  }

  const section = (title: string, comps: Competency[]): string[] =>
    comps.length === 0 ? [] : [`${title} (${comps.length}):`, ...comps.map(line), '']

  const expired = competencies.filter(c => c.days_until_expiry <= 0)
  const critical = competencies.filter(c => c.days_until_expiry > 0 && c.days_until_expiry <= 30)
  const warning = competencies.filter(c => c.days_until_expiry > 30 && c.days_until_expiry <= 90)
  const upcoming = competencies.filter(c => c.days_until_expiry > 90)

  return [
    'Matrix Portal - Certification Expiration Reminder',
    '',
    `Hi ${recipientName},`,
    '',
    'The following certifications are expiring soon or have recently expired. Please ensure you renew them to maintain compliance.',
    '',
    ...section('Expired', expired),
    ...section('Expiring soon (< 30 days)', critical),
    ...section('Expiring (< 90 days)', warning),
    ...section('Upcoming', upcoming),
    `View and update your certifications: ${appUrl}/profile`,
    '',
    'Need help? Contact support at jonas@matrixinspectionservices.com',
    '',
    'You received this email because you have certifications tracked in Matrix Portal.',
  ].join('\n')
}

/**
 * Send email via Resend API
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  from: string,
  cc?: string[],
  text?: string,
  headers?: Record<string, string>
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html,
    reply_to: SUPPORT_EMAIL,
  }

  if (text) {
    payload.text = text
  }

  if (cc && cc.length > 0) {
    payload.cc = cc
  }

  if (headers) {
    payload.headers = headers
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
    return handleCorsPreflightRequest(req)
  }

  try {
    // SECURITY: Verify caller is authorized
    // Option 1: Cron secret header (for scheduled jobs)
    const cronSecret = Deno.env.get('CRON_SECRET')
    const providedCronSecret = req.headers.get('x-cron-secret')
    const isCronJob = cronSecret && providedCronSecret === cronSecret

    // Option 2: Admin user authentication
    const authHeader = req.headers.get('Authorization')
    let isAdminUser = false

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const { data: { user } } = await supabaseAuth.auth.getUser(token)

      if (user) {
        const { data: profile } = await supabaseAuth
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        isAdminUser = profile ? isAdmin(profile.role) : false
      }
    }

    // Reject if neither cron secret nor admin auth
    if (!isCronJob && !isAdminUser) {
      return errorResponse(req, 'Unauthorized - admin access or cron secret required', 401)
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
      return errorResponse(req, 'Failed to fetch reminder settings', 500, settingsError)
    }

    const settings: ReminderSettings = settingsData

    // Check if reminders are enabled (skip for single-user mode)
    if (!settings.is_enabled && !targetUserId) {
      return jsonResponse(req, { message: 'Email reminders are disabled', sent: 0 })
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
        return errorResponse(req, 'User not found', 404, profileError)
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
        return errorResponse(req, 'Failed to fetch competencies', 500, compError)
      }

      if (!competenciesData || competenciesData.length === 0) {
        return jsonResponse(req, {
          message: 'No expiring competencies found for this user',
          sent: 0,
          failed: 0
        })
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
      const senderFrom = 'Matrix Portal <noreply@updates.matrixportal.io>'

      // Generate subject line
      const urgentCount = competencies.filter(c => c.days_until_expiry <= 30).length
      const subject = urgentCount > 0
        ? `${competencies.length} certification(s) expiring soon`
        : `${competencies.length} certification(s) due for renewal`

      // Generate email HTML + plain-text alternative
      const html = generateConsolidatedEmail(
        userProfile.username || userProfile.email.split('@')[0],
        competencies,
        APP_URL
      )
      const text = generateConsolidatedText(
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
        settings.manager_emails.length > 0 ? settings.manager_emails : undefined,
        text
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

      return jsonResponse(req, {
        message: emailResult.success ? 'Reminder sent successfully' : 'Failed to send reminder',
        sent: emailResult.success ? 1 : 0,
        failed: emailResult.success ? 0 : 1,
        details: results
      })
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
      const senderFrom = 'Matrix Portal <noreply@updates.matrixportal.io>'

        // Generate subject line
        const urgentCount = user.competencies.filter(c => c.days_until_expiry <= 30).length
        const subject = urgentCount > 0
          ? `${user.competencies.length} certification(s) expiring soon`
          : `Reminder: ${user.competencies.length} certification(s) expiring within ${threshold} months`

        // Generate email HTML + plain-text alternative
        const html = generateConsolidatedEmail(
          user.username || user.email.split('@')[0],
          user.competencies,
          APP_URL
        )
        const text = generateConsolidatedText(
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
          settings.manager_emails.length > 0 ? settings.manager_emails : undefined,
          text
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

    return jsonResponse(req, {
      message: 'Reminder job completed',
      sent: sentCount,
      failed: failedCount,
      details: results
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
