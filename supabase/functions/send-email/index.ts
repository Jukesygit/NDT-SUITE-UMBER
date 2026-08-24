// Edge Function to send emails via Resend
// Keeps API key secure server-side
//
// SECURITY (audit M5): this function sends from the verified brand domain, so it
// must never behave as an open relay. Every recipient is resolved against
// `profiles.email` before anything is handed to Resend:
//   - admin / super_admin callers may target any profile,
//   - every other permitted caller (org_admin) may only target profiles in their
//     own organization.
// Free-text recipients, arbitrary custom headers, unbounded recipient lists and
// unbounded bodies are all rejected. Recipient addresses never appear in logs
// (audit L8) — see `maskEmail` / `maskEmailsInText`.
//
// NOTE: there is no per-caller rate limiting here. This function has no reusable
// throttling primitive available (`send-reset-code` rate-limits via its own code
// table) and inventing a new table is out of scope for this fix, so per-caller /
// per-IP rate limiting must be applied at the infrastructure layer.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireOrgAdmin, isAdmin } from '../_shared/auth.ts'
import { htmlToText, SUPPORT_EMAIL, REMINDER_EMAIL_HEADERS } from '../_shared/email.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

/** Hard cap on combined to + cc recipients for a single call. */
const MAX_RECIPIENTS = 50
/** Hard cap on the message body (html + text) in bytes. */
const MAX_BODY_BYTES = 200 * 1024
/** Hard cap on a single address, per RFC 5321. */
const MAX_ADDRESS_LENGTH = 254
/** Hard cap on the subject line, per the RFC 5322 line-length limit. */
const MAX_SUBJECT_LENGTH = 998

/**
 * The only custom header any caller is allowed to request. The caller's value is
 * ignored — the canonical server-side value from `_shared/email.ts` is used — so
 * no attacker-controlled text can reach the MIME headers.
 */
const LIST_UNSUBSCRIBE_HEADER = 'List-Unsubscribe'

/** Strict single-address form. Deliberately rejects display names, commas, quotes and CR/LF. */
const ADDRESS_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/
/** Loose match used only to find addresses inside free text that is about to be logged. */
const ADDRESS_IN_TEXT_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

interface EmailRequest {
  to: string | string[]
  subject: string
  html: string
  text?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
  headers?: Record<string, string>
}

/** Mask an address for logging: first character + *** + @domain. */
function maskEmail(address: string): string {
  const trimmed = String(address).trim()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0) return '***'
  return `${trimmed[0]}***${trimmed.slice(at)}`
}

/** Mask every address inside an arbitrary value before it reaches the logs. */
function maskEmailsInText(value: unknown): string {
  let text: string
  if (value instanceof Error) {
    text = `${value.name}: ${value.message}`
  } else if (typeof value === 'string') {
    text = value
  } else {
    try {
      text = JSON.stringify(value) ?? String(value)
    } catch {
      text = String(value)
    }
  }
  return text.replace(ADDRESS_IN_TEXT_RE, (match) => maskEmail(match))
}

/** Normalise a string | string[] recipient field into a trimmed, lowercased list. */
function toAddressList(field: string | string[] | undefined): string[] {
  if (field === undefined || field === null) return []
  const raw = Array.isArray(field) ? field : [field]
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
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
    const { to, subject, html, text, cc, bcc, replyTo, headers }: EmailRequest = await req.json()

    // Validate required fields
    if (!to || !subject || !html) {
      return errorResponse(req, 'Missing required fields: to, subject, html', 400)
    }

    if (typeof subject !== 'string' || typeof html !== 'string') {
      return errorResponse(req, 'Invalid field types: subject and html must be strings', 400)
    }

    if (text !== undefined && typeof text !== 'string') {
      return errorResponse(req, 'Invalid field type: text must be a string', 400)
    }

    // SECURITY: no blind-copy path — bcc is neither validated against profiles
    // nor forwarded, so refuse it outright rather than silently dropping it.
    if (bcc !== undefined && toAddressList(bcc).length > 0) {
      return errorResponse(req, 'bcc is not supported', 400)
    }

    // SECURITY: a CR/LF or over-long subject is a header-injection vector.
    if (subject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(subject)) {
      return errorResponse(req, 'Invalid subject', 400)
    }

    // Validate Resend API key is configured
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured')
      return errorResponse(req, 'Email service not configured', 500)
    }

    // SECURITY: cap the body so this function cannot be used to push bulk payloads.
    const encoder = new TextEncoder()
    const bodyBytes = encoder.encode(html).length + (text ? encoder.encode(text).length : 0)
    if (bodyBytes > MAX_BODY_BYTES) {
      return errorResponse(req, 'Email body exceeds the maximum size of 200KB', 413)
    }

    // ------------------------------------------------------------------
    // Recipient authorisation (audit M5)
    // ------------------------------------------------------------------
    const toAddresses = toAddressList(to)
    const ccAddresses = toAddressList(cc)
    const requested = [...toAddresses, ...ccAddresses]

    if (toAddresses.length === 0) {
      return errorResponse(req, 'Missing required fields: to, subject, html', 400)
    }

    if (requested.length > MAX_RECIPIENTS) {
      return errorResponse(req, `Too many recipients (maximum ${MAX_RECIPIENTS} per email)`, 400)
    }

    for (const address of requested) {
      if (address.length > MAX_ADDRESS_LENGTH || !ADDRESS_RE.test(address)) {
        // SECURITY: never echo the offending address back to the caller.
        return errorResponse(req, 'Invalid recipient address', 400)
      }
    }

    // Reply-to must also be a single well-formed address; it is caller-supplied
    // and ends up in a header.
    if (replyTo !== undefined && replyTo !== null && String(replyTo).trim().length > 0) {
      const candidate = String(replyTo).trim()
      if (typeof replyTo !== 'string' || candidate.length > MAX_ADDRESS_LENGTH || !ADDRESS_RE.test(candidate)) {
        return errorResponse(req, 'Invalid replyTo address', 400)
      }
    }

    const supabaseAdmin = auth.supabaseAdmin
    const caller = auth.user
    if (!supabaseAdmin || !caller) {
      return errorResponse(req, 'Authentication required', 401)
    }

    const callerIsAdmin = isAdmin(caller.role)
    if (!callerIsAdmin && !caller.organization_id) {
      console.warn('send-email: caller has no organization, refusing send', { callerId: caller.id })
      return errorResponse(req, 'One or more recipients are not permitted', 403)
    }

    // Look up both the caller-supplied form and its lowercased form so a
    // case-mismatch cannot be used to slip an unverified address through.
    const requestedKeys = new Set(requested.map((address) => address.toLowerCase()))
    const lookupValues = new Set<string>()
    for (const address of requested) {
      lookupValues.add(address)
      lookupValues.add(address.toLowerCase())
    }

    // Non-admin callers are confined to their own organization.
    const scopedProfileQuery = () => {
      const query = supabaseAdmin.from('profiles').select('email, organization_id')
      return callerIsAdmin ? query : query.eq('organization_id', caller.organization_id)
    }

    const { data: allowedProfiles, error: profileError } = await scopedProfileQuery()
      .in('email', [...lookupValues])

    if (profileError) {
      console.error('send-email: recipient lookup failed', maskEmailsInText(profileError))
      return errorResponse(req, 'Failed to send email. Please try again.', 500)
    }

    // Map lowercased address -> the address exactly as stored, so the mail is
    // addressed to the verified value rather than the caller's string.
    const allowedByKey = new Map<string, string>()
    const registerProfile = (profile: { email?: unknown } | null) => {
      const email = typeof profile?.email === 'string' ? profile.email.trim() : ''
      if (email) allowedByKey.set(email.toLowerCase(), email)
    }
    for (const profile of allowedProfiles ?? []) registerProfile(profile)

    // A legacy `profiles.email` can be stored mixed-case, which the equality
    // lookup above misses in both the raw and the lowercased form — that would
    // 403 a legitimate recipient (e.g. a reminder to an old account). Re-check
    // only the addresses still unmatched, case-insensitively, in one query.
    //
    // SECURITY: this cannot widen authorisation. The map stays keyed by the
    // address exactly as STORED, and an address is accepted only when its own
    // lowercased form is a key — so an address absent from `profiles` can never
    // become permitted, and the mail is still addressed to the stored value.
    // (ilike treats `%`/`_` as wildcards, so they are escaped; if the escape is
    // not honoured the query simply matches nothing, which fails closed.)
    const unmatchedKeys = [...requestedKeys].filter((key) => !allowedByKey.has(key))
    if (unmatchedKeys.length > 0) {
      const orFilter = unmatchedKeys
        .map((key) => `email.ilike.${key.replace(/[\\%_]/g, (char) => `\\${char}`)}`)
        .join(',')

      const { data: caseInsensitiveProfiles, error: caseInsensitiveError } =
        await scopedProfileQuery().or(orFilter)

      if (caseInsensitiveError) {
        console.error(
          'send-email: case-insensitive recipient lookup failed',
          maskEmailsInText(caseInsensitiveError)
        )
        return errorResponse(req, 'Failed to send email. Please try again.', 500)
      }

      for (const profile of caseInsensitiveProfiles ?? []) registerProfile(profile)
    }

    const rejected = [...requestedKeys].filter((key) => !allowedByKey.has(key))
    if (rejected.length > 0) {
      // SECURITY: log masked addresses only, and return a message naming none.
      console.warn('send-email: rejected recipients outside the permitted set', {
        callerId: caller.id,
        callerRole: caller.role,
        rejected: rejected.map(maskEmail),
      })
      return errorResponse(req, 'One or more recipients are not permitted', 403)
    }

    const resolvedTo = [...new Set(toAddresses.map((address) => address.toLowerCase()))]
      .map((key) => allowedByKey.get(key)!)
    const resolvedCc = [...new Set(ccAddresses.map((address) => address.toLowerCase()))]
      .map((key) => allowedByKey.get(key)!)
      .filter((address) => !resolvedTo.includes(address))

    // Build email payload — SECURITY: from is always hardcoded server-side
    const emailPayload: Record<string, unknown> = {
      from: 'Matrix Portal <noreply@updates.matrixportal.io>',
      to: resolvedTo,
      subject,
      html,
      // DELIVERABILITY: always send a plain-text alternative (multipart/alternative).
      // HTML-only mail is a spam signal at Microsoft 365 / Outlook. Caller may
      // supply its own text; otherwise derive a readable fallback from the HTML.
      text: text && text.trim() ? text : htmlToText(html),
    }

    // Add optional CC recipients (already authorised above)
    if (resolvedCc.length > 0) {
      emailPayload.cc = resolvedCc
    }

    // Reply-to address — default to the monitored support mailbox so replies do
    // not vanish into the unattended notifications@ sender.
    emailPayload.reply_to = replyTo && replyTo.trim() ? replyTo.trim() : SUPPORT_EMAIL

    // SECURITY: no arbitrary header passthrough (audit M5 header injection).
    // The single supported header is List-Unsubscribe on bulk/notification mail,
    // and its value is the server-side constant, not the caller's.
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      const wantsListUnsubscribe = Object.keys(headers).some(
        (name) => name.trim().toLowerCase() === LIST_UNSUBSCRIBE_HEADER.toLowerCase(),
      )
      if (wantsListUnsubscribe) {
        emailPayload.headers = {
          [LIST_UNSUBSCRIBE_HEADER]: REMINDER_EMAIL_HEADERS[LIST_UNSUBSCRIBE_HEADER],
        }
      }
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
      // SECURITY: log the provider error with recipient addresses masked (audit L8),
      // and return a generic message.
      console.error('send-email: Resend rejected the request', {
        status: resendResponse.status,
        detail: maskEmailsInText(resendData),
      })
      return errorResponse(req, 'Failed to send email. Please try again.', 500)
    }

    return jsonResponse(req, { success: true, id: resendData.id })

  } catch (error) {
    // SECURITY: Generic error message; log details server-side with emails masked.
    console.error('send-email: unexpected error', maskEmailsInText(error))
    return errorResponse(
      req,
      'An unexpected error occurred. Please try again.',
      500
    )
  }
})
