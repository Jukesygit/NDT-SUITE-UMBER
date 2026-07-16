/**
 * Shared email helpers for Supabase Edge Functions.
 *
 * Deliverability hardening: Microsoft 365 / Outlook (Exchange Online Protection)
 * filters far more aggressively than Gmail, so mail that Gmail accepts can be
 * silently junked/quarantined by Outlook. Two cheap, standards-based things help
 * and are applied across every sender:
 *
 *   1. A plain-text alternative alongside the HTML (proper multipart/alternative).
 *      `htmlToText()` derives a readable fallback from an HTML body. HTML-only
 *      mail is a measurable spam signal at Microsoft.
 *   2. `List-Unsubscribe` on bulk / notification mail (`REMINDER_EMAIL_HEADERS`).
 *      Do NOT attach these to security mail (e.g. password reset codes).
 *
 * Pure module — no Deno globals or remote imports — so it is unit-testable under
 * the project's Vitest suite.
 */

/** Support mailbox (already advertised in the email footers). */
export const SUPPORT_EMAIL = 'jonas@matrixinspectionservices.com'

/**
 * `List-Unsubscribe` header for bulk / notification email. mailto-based because
 * there is no one-click HTTP unsubscribe endpoint to honour a POST; Gmail and
 * Outlook both accept the mailto form, and its presence improves bulk-sender
 * reputation. (No `List-Unsubscribe-Post` is advertised, since that would
 * promise a one-click endpoint we do not have.)
 */
export const REMINDER_EMAIL_HEADERS: Record<string, string> = {
  'List-Unsubscribe': `<mailto:${SUPPORT_EMAIL}?subject=unsubscribe>`,
}

/**
 * Convert an HTML email body into a readable plain-text alternative.
 *
 * This is intentionally not a full HTML renderer — just enough to produce a
 * sensible `text/plain` part: it drops non-visible regions (head/style/script)
 * and SVG, turns links into "label (url)", maps block-level tags to line
 * breaks, strips remaining tags, and decodes the handful of entities these
 * templates use.
 */
export function htmlToText(html: string): string {
  if (typeof html !== 'string') return ''

  return (
    html
      // Remove non-visible / non-text regions entirely.
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      // Preserve link targets as "label (https://...)"; keep just the label for
      // mailto/relative anchors.
      .replace(
        /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
        (_match, href: string, inner: string) => {
          const label = inner.replace(/<[^>]+>/g, '').trim()
          if (href && /^https?:/i.test(href)) return label ? `${label} (${href})` : href
          return label
        },
      )
      // Block-level boundaries become newlines.
      .replace(/<\/?(?:p|div|tr|table|thead|tbody|h1|h2|h3|h4|h5|li|ul|ol|br)\b[^>]*>/gi, '\n')
      // Drop any remaining tags.
      .replace(/<[^>]+>/g, '')
      // Decode the entities these templates actually use.
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#x27;/gi, "'")
      .replace(/&#39;/gi, "'")
      .replace(/&copy;/gi, '(c)')
      // Tidy whitespace.
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
