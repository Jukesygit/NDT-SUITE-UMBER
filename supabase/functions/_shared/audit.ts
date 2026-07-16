/**
 * Shared audit-logging helper for Supabase Edge Functions.
 *
 * Writes a forgery-proof activity_log row using the service-role client. The
 * actor is the JWT-verified caller (auth.user.id from requireAdmin/requireAuth),
 * never a client-supplied value — so server-side admin actions are audited with
 * the real actor that client-side trigger logging (auth.uid()) cannot see.
 *
 * Fire-and-forget: this never throws into the caller. A logging failure must not
 * break the privileged operation it is recording.
 *
 * PII policy (mirrors the DB layer):
 *   - Actor email/name are never cached (user_email/user_name = null).
 *   - `details` is run through stripPiiFromObject. Put already-masked values
 *     (e.g. maskEmail()) under non-PII keys like `old_email`/`new_email` so they
 *     survive sanitization while raw PII is dropped.
 *   - `entityName` should be a handle (username) or masked value, not raw PII.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { stripPiiFromObject } from './pii-sanitizer.ts'

export type AuditCategory =
  | 'auth'
  | 'security'
  | 'profile'
  | 'competency'
  | 'admin'
  | 'asset'
  | 'inspection'
  | 'document'
  | 'config'
  | 'data'

export interface AuditEvent {
  /** JWT-verified actor id (auth.user.id). null only for unauthenticated flows. */
  actorId: string | null
  actorRole?: string | null
  organizationId?: string | null
  actionType: string
  category: AuditCategory
  description: string
  details?: Record<string, unknown> | null
  entityType?: string | null
  entityId?: string | null
  entityName?: string | null
}

/** Mask an email for audit details: "alice@example.com" -> "a***@example.com". */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  return `${email[0]}***${email.slice(at)}`
}

/**
 * Insert a single audit row. Service-role client bypasses RLS via the
 * "Service role full access" policy on activity_log.
 */
export async function logAuditEvent(
  supabaseAdmin: SupabaseClient,
  event: AuditEvent,
): Promise<void> {
  try {
    const details =
      event.details && typeof event.details === 'object'
        ? stripPiiFromObject(event.details as Record<string, unknown>)
        : (event.details ?? null)

    await supabaseAdmin.from('activity_log').insert({
      user_id: event.actorId,
      user_email: null,
      user_name: null,
      action_type: event.actionType,
      action_category: event.category,
      description: event.description,
      details,
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      entity_name: event.entityName ?? null,
      organization_id: event.organizationId ?? null,
      actor_role: event.actorRole ?? null,
      ip_address: null,
      user_agent: null,
    })
  } catch (_err) {
    // Audit logging must never break the parent operation.
  }
}
