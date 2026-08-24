// Edge Function to delete a user from both auth and profiles
// This ensures complete user deletion using admin API
// SECURITY: Requires admin authentication, and the caller may only delete a user
// whose role ranks strictly below their own (so an admin cannot delete a super_admin).
//
// Erasure covers Storage as well as the database: the target's competency
// certificates (`documents` bucket, `competency-documents/<userId>/…`) and avatar
// (`avatars` bucket, `<userId>/…`) are removed before the account is destroyed.
//
// The run is fail-loud and retryable: every step records its outcome, and the auth
// user is deleted ONLY when every step succeeded. A partial run returns 500 with the
// failed step names and leaves the account intact (all steps are idempotent).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/auth.ts'
import { canActOn, isKnownRole } from '../_shared/role-rank.ts'
import { logAuditEvent, maskEmail } from '../_shared/audit.ts'

/** Private bucket holding competency certificates and controlled documents. */
const DOCUMENTS_BUCKET = 'documents'
/** Bucket holding profile avatars. */
const AVATARS_BUCKET = 'avatars'
/** Folder prefix competency uploads use inside the documents bucket. */
const COMPETENCY_DOCUMENT_PREFIX = 'competency-documents'

const STORAGE_LIST_PAGE = 100
const STORAGE_REMOVE_BATCH = 100

interface StepFailure {
  step: string
  error: string
}

/**
 * Error codes that mean "this relation/column is not present in this database".
 *
 * The erasure lists below cover the union of every schema this app has shipped,
 * so a given deployment legitimately lacks some of them (legacy asset/inspection
 * tables, tables added by a migration that has not been applied yet). Under the
 * fail-loud policy an absent table would abort EVERY deletion after data had
 * already been destroyed, so a missing relation is skipped with a warning while
 * every other error still fails the run.
 *
 * PGRST202/PGRST204/PGRST205 are PostgREST schema-cache misses (function, column,
 * table); 42P01/42703 are the Postgres SQLSTATEs for undefined_table and
 * undefined_column.
 */
const MISSING_RELATION_CODES = new Set([
  'PGRST202',
  'PGRST204',
  'PGRST205',
  '42P01',
  '42703',
])

/** True when `error` reports an absent table/column rather than a real failure. */
function isMissingRelation(error: { code?: string | null } | null | undefined): boolean {
  const code = error?.code
  return typeof code === 'string' && MISSING_RELATION_CODES.has(code)
}

/**
 * Record a step failure unless it is a missing relation/column, which is logged
 * and skipped. Returns true when the step was skipped.
 */
function recordStepError(
  error: { code?: string | null; message?: string } | null | undefined,
  step: string,
  failures: StepFailure[]
): boolean {
  if (!error) return false
  if (isMissingRelation(error)) {
    console.warn(`User erasure: skipping ${step} — relation/column not present in this database`)
    return true
  }
  failures.push({ step, error: error.message ?? String(error) })
  return false
}

interface StorageEntry {
  name: string
  id: string | null
}

/**
 * Recursively enumerate every object under `prefix`. Storage returns folders as
 * rows with a null id, so those are descended into rather than removed.
 */
async function listStorageObjects(
  supabaseAdmin: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<{ paths: string[]; error: string | null }> {
  const paths: string[] = []
  const pending: string[] = [prefix]

  while (pending.length > 0) {
    const folder = pending.shift()!
    let offset = 0

    for (;;) {
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .list(folder, { limit: STORAGE_LIST_PAGE, offset })

      if (error) return { paths, error: error.message }

      const entries = (data ?? []) as StorageEntry[]
      if (entries.length === 0) break

      for (const entry of entries) {
        const path = `${folder}/${entry.name}`
        if (entry.id === null) pending.push(path)
        else paths.push(path)
      }

      if (entries.length < STORAGE_LIST_PAGE) break
      offset += entries.length
    }
  }

  return { paths, error: null }
}

/** Remove objects in batches, recording one failure per failed batch. */
async function removeStorageObjects(
  supabaseAdmin: SupabaseClient,
  bucket: string,
  paths: string[],
  step: string,
  failures: StepFailure[]
): Promise<void> {
  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH) {
    const batch = paths.slice(i, i + STORAGE_REMOVE_BATCH)
    const { error } = await supabaseAdmin.storage.from(bucket).remove(batch)
    if (error) failures.push({ step, error: error.message })
  }
}

/**
 * Resolve a stored document reference to a bucket-relative storage path.
 * Current uploads store the path directly; legacy rows may hold a public or
 * signed URL, so the bucket segment is stripped off those.
 */
function storagePathFromReference(
  value: string | null | undefined,
  bucket: string
): string | null {
  if (!value) return null
  if (!value.startsWith('http')) return value

  const marker = `/${bucket}/`
  const index = value.indexOf(marker)
  if (index === -1) return null

  const raw = value.slice(index + marker.length).split('?')[0]
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * SECURITY: only objects inside the target's own folder may be erased.
 * `document_url` and `avatar_url` are user-writable, so an unconstrained path
 * would let one account's deletion destroy another account's objects.
 */
function isUnderPrefix(path: string, prefix: string): boolean {
  return path.startsWith(`${prefix}/`) && !path.includes('..')
}

/**
 * Fail loudly: report every step that did not complete and leave the auth user
 * in place. Every step above this point is idempotent, so the call can be retried.
 */
function erasureFailure(req: Request, failures: StepFailure[]): Response {
  console.error('User erasure incomplete:', failures)
  return jsonResponse(
    req,
    {
      success: false,
      error: `User deletion did not complete — ${failures.length} step(s) failed. The account has NOT been deleted; please retry.`,
      failures,
    },
    500
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    // SECURITY: Require admin authentication
    const { auth, errorResponse: authError } = await requireAdmin(req)
    if (authError) return authError

    const supabaseAdmin = auth.supabaseAdmin!

    const { userId } = await req.json()

    if (!userId) {
      return errorResponse(req, 'User ID is required', 400)
    }

    // SECURITY: Prevent admin from deleting themselves
    if (userId === auth.user!.id) {
      return errorResponse(req, 'Cannot delete your own account', 400)
    }

    // AUDIT: Capture the target user's identity BEFORE any deletion/purge,
    // since the cleanup below destroys their activity_log rows and the profile.
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('username, email, role, avatar_url')
      .eq('id', userId)
      .single()

    // SECURITY: Enforce the shared role hierarchy (_shared/role-rank.ts). An
    // unknown role on either side is treated as out-of-range (blocked); a missing
    // profile is an orphaned auth user with no privileges, so any admin whose own
    // role is recognised may clean it up.
    const mayDelete = targetProfile
      ? canActOn(auth.user!.role, targetProfile.role)
      : isKnownRole(auth.user!.role)

    if (!mayDelete) {
      return errorResponse(
        req,
        'You cannot delete a user whose role is equal to or higher than your own',
        403
      )
    }

    const failures: StepFailure[] = []

    // Guard: controlled-document attribution. documents.owner_id,
    // documents.created_by and document_revisions.created_by are NOT NULL FKs to
    // profiles, so the linkage cannot be anonymised and the business record must
    // not be deleted. Detect it BEFORE anything is destroyed — otherwise the
    // profile/auth delete fails later with an opaque FK violation.
    const attributionChecks = [
      { table: 'documents', column: 'owner_id' },
      { table: 'documents', column: 'created_by' },
      { table: 'document_revisions', column: 'created_by' },
    ]

    for (const { table, column } of attributionChecks) {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq(column, userId)

      if (error) {
        recordStepError(error, `check ${table}.${column}`, failures)
      } else if ((count ?? 0) > 0) {
        failures.push({
          step: `check ${table}.${column}`,
          error: `${count} controlled-document record(s) are still attributed to this user and must be reassigned before deletion.`,
        })
      }
    }

    if (failures.length > 0) {
      console.error('User erasure blocked:', failures)
      return jsonResponse(
        req,
        {
          success: false,
          error: 'This user still owns or authored controlled documents. Reassign those documents to another user before deleting the account.',
          failures,
        },
        409
      )
    }

    // Phase 1: enumerate the storage objects to erase (read-only, so a failure
    // here aborts while the account and its files are still intact).
    const documentPrefix = `${COMPETENCY_DOCUMENT_PREFIX}/${userId}`
    const documentPaths = new Set<string>()

    const { data: competencyRows, error: competencyReadError } = await supabaseAdmin
      .from('employee_competencies')
      .select('id, document_url')
      .eq('user_id', userId)

    recordStepError(competencyReadError, 'read employee_competencies', failures)

    const competencyIds: string[] = []
    for (const row of (competencyRows ?? []) as { id: string; document_url: string | null }[]) {
      competencyIds.push(row.id)
      const path = storagePathFromReference(row.document_url, DOCUMENTS_BUCKET)
      if (path && isUnderPrefix(path, documentPrefix)) documentPaths.add(path)
    }

    if (competencyIds.length > 0) {
      const { data: documentRows, error: documentReadError } = await supabaseAdmin
        .from('competency_documents')
        .select('document_url')
        .in('employee_competency_id', competencyIds)

      recordStepError(documentReadError, 'read competency_documents', failures)

      for (const row of (documentRows ?? []) as { document_url: string | null }[]) {
        const path = storagePathFromReference(row.document_url, DOCUMENTS_BUCKET)
        if (path && isUnderPrefix(path, documentPrefix)) documentPaths.add(path)
      }
    }

    // Folder sweep catches objects whose rows were already deleted (the per-row
    // storage cleanup elsewhere is best-effort and can leave orphans behind).
    const documentListing = await listStorageObjects(supabaseAdmin, DOCUMENTS_BUCKET, documentPrefix)
    if (documentListing.error) {
      failures.push({ step: 'list documents storage', error: documentListing.error })
    }
    for (const path of documentListing.paths) documentPaths.add(path)

    const avatarPaths = new Set<string>()

    const avatarPath = storagePathFromReference(
      (targetProfile as { avatar_url?: string | null } | null)?.avatar_url,
      AVATARS_BUCKET
    )
    if (avatarPath && isUnderPrefix(avatarPath, userId)) avatarPaths.add(avatarPath)

    const avatarListing = await listStorageObjects(supabaseAdmin, AVATARS_BUCKET, userId)
    if (avatarListing.error) {
      failures.push({ step: 'list avatars storage', error: avatarListing.error })
    }
    for (const path of avatarListing.paths) avatarPaths.add(path)

    if (failures.length > 0) {
      return erasureFailure(req, failures)
    }

    // Phase 2: remove the storage objects.
    if (documentPaths.size > 0) {
      await removeStorageObjects(
        supabaseAdmin, DOCUMENTS_BUCKET, [...documentPaths], 'remove documents storage', failures
      )
    }
    if (avatarPaths.size > 0) {
      await removeStorageObjects(
        supabaseAdmin, AVATARS_BUCKET, [...avatarPaths], 'remove avatars storage', failures
      )
    }

    if (failures.length > 0) {
      return erasureFailure(req, failures)
    }

    // Phase 3: clean up related data that might have foreign key constraints.
    // Delete records where user is the owner. competency_documents children are
    // removed by the employee_competencies cascade.
    const deleteFromTables = [
      { table: 'activity_log', column: 'user_id' },
      { table: 'competency_comments', column: 'created_by' },
      { table: 'password_reset_codes', column: 'user_id' },
      { table: 'employee_competencies', column: 'user_id' },
      { table: 'competency_history', column: 'user_id' },
      { table: 'user_asset_access', column: 'user_id' },
      { table: 'asset_access_requests', column: 'user_id' },
      { table: 'shared_assets', column: 'shared_by' },
      { table: 'email_reminder_log', column: 'user_id' },
      // notification_email_log.sent_by is NOT NULL, so the log row cannot be
      // anonymised — it is deleted (its notification_email_recipients children
      // go with it via ON DELETE CASCADE).
      { table: 'notification_email_log', column: 'sent_by' },
    ]

    for (const { table, column } of deleteFromTables) {
      const { error } = await supabaseAdmin.from(table).delete().eq(column, userId)
      recordStepError(error, `delete ${table}.${column}`, failures)
    }

    // Nullify references in tables where user is a reference (not owner). The
    // competency_documents and document_* entries anonymise the user's linkage to
    // records that belong to other people or to the organisation.
    const nullifyTables = [
      { table: 'competency_documents', column: 'uploaded_by' },
      { table: 'document_revisions', column: 'submitted_by' },
      { table: 'document_revisions', column: 'reviewed_by' },
      { table: 'document_review_schedule', column: 'completed_by' },
      // Witness checks live on employee_competencies. The target's OWN competency
      // rows are deleted above; this anonymises the checks they performed on
      // OTHER people's competencies, which must survive the erasure.
      { table: 'employee_competencies', column: 'witnessed_by' },
      { table: 'employee_competencies', column: 'verified_by' },
      { table: 'competency_history', column: 'changed_by' },
      { table: 'assets', column: 'created_by' },
      { table: 'user_asset_access', column: 'granted_by' },
      { table: 'asset_access_requests', column: 'approved_by' },
      { table: 'asset_access_requests', column: 'rejected_by' },
      { table: 'account_requests', column: 'approved_by' },
      { table: 'account_requests', column: 'rejected_by' },
      { table: 'permission_requests', column: 'approved_by' },
      { table: 'permission_requests', column: 'rejected_by' },
      { table: 'inspections', column: 'inspector_id' },
      { table: 'notification_email_recipients', column: 'recipient_id' },
      { table: 'email_reminder_settings', column: 'updated_by' },
      { table: 'system_announcements', column: 'created_by' },
      { table: 'system_announcements', column: 'updated_by' },
    ]

    for (const { table, column } of nullifyTables) {
      const { error } = await supabaseAdmin.from(table).update({ [column]: null }).eq(column, userId)
      recordStepError(error, `nullify ${table}.${column}`, failures)
    }

    // Delete the profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      failures.push({ step: 'delete profile', error: profileError.message })
    }

    if (failures.length > 0) {
      return erasureFailure(req, failures)
    }

    // Phase 4: delete the auth user — last, so any earlier failure leaves a
    // retryable account rather than an orphaned half-erased one.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      // SECURITY: detailed error is logged server-side by erasureFailure
      failures.push({ step: 'delete auth user', error: deleteError.message })
      return erasureFailure(req, failures)
    }

    // AUDIT: Record the deletion with the JWT-verified admin as actor. The actor's
    // own activity_log rows are not purged, so logging here is safe.
    await logAuditEvent(supabaseAdmin, {
      actorId: auth.user!.id,
      actorRole: auth.user!.role,
      actionType: 'user_deleted',
      category: 'admin',
      description: `Admin deleted user ${targetProfile?.username ?? userId}`,
      entityType: 'user',
      entityId: userId,
      entityName: targetProfile?.username ?? null,
      details: {
        role: targetProfile?.role ?? null,
        email_masked: maskEmail(targetProfile?.email),
      },
    })

    return jsonResponse(req, { success: true, message: 'User deleted successfully' })

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
