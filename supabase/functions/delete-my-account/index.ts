/**
 * Edge Function: delete-my-account
 * Self-service account deletion for GDPR Article 17 (Right to Erasure).
 * User can only delete their own account. Activity logs are anonymised, not deleted.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    const { auth, errorResponse: authError } = await requireAuth(req)
    if (authError) return authError

    const supabaseAdmin = auth.supabaseAdmin!
    const userId = auth.user!.id

    // Verify the request body matches the authenticated user (defence in depth)
    const { userId: requestedUserId } = await req.json()
    if (requestedUserId !== userId) {
      return errorResponse(req, 'You can only delete your own account', 403)
    }

    // Guard: prevent sole admin/org_admin from deleting themselves
    const { data: orgAdmins } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('organization_id', auth.user!.organization_id)
      .in('role', ['admin', 'org_admin'])

    const isOnlyAdmin = orgAdmins && orgAdmins.length <= 1 &&
      orgAdmins.some((a: { id: string }) => a.id === userId)

    if (isOnlyAdmin) {
      return errorResponse(
        req,
        'You are the only administrator for your organisation. Transfer admin rights to another user before deleting your account.',
        400
      )
    }

    // Phase A: Anonymise activity logs (preserve audit trail, remove PII)
    const anonId = `[deleted-user-${userId.substring(0, 8)}]`
    try {
      await supabaseAdmin
        .from('activity_log')
        .update({
          user_id: null,
          user_email: anonId,
          user_name: anonId,
        })
        .eq('user_id', userId)
    } catch (e) {
      console.warn('Activity log anonymisation warning:', e)
    }

    // Delete owned records (same tables as admin delete, minus activity_log which is anonymised)
    const deleteFromTables = [
      { table: 'competency_comments', column: 'created_by' },
      { table: 'password_reset_codes', column: 'user_id' },
      { table: 'employee_competencies', column: 'user_id' },
      { table: 'competency_history', column: 'user_id' },
      { table: 'user_asset_access', column: 'user_id' },
      { table: 'asset_access_requests', column: 'user_id' },
      { table: 'shared_assets', column: 'shared_by' },
      { table: 'email_reminder_log', column: 'user_id' },
      { table: 'notification_emails', column: 'sent_by' },
      { table: 'permission_requests', column: 'user_id' },
    ]

    for (const { table, column } of deleteFromTables) {
      try {
        await supabaseAdmin.from(table).delete().eq(column, userId)
      } catch (e) {
        console.warn(`Delete from ${table} warning:`, e)
      }
    }

    // Nullify references (same as admin delete)
    const nullifyTables = [
      { table: 'personnel', column: 'witnessed_by' },
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
      { table: 'notification_emails', column: 'recipient_id' },
      { table: 'email_reminder_settings', column: 'updated_by' },
      { table: 'system_announcements', column: 'created_by' },
      { table: 'system_announcements', column: 'updated_by' },
    ]

    for (const { table, column } of nullifyTables) {
      try {
        await supabaseAdmin.from(table).update({ [column]: null }).eq(column, userId)
      } catch (e) {
        console.warn(`Nullify ${table}.${column} warning:`, e)
      }
    }

    // Delete profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      console.warn('Profile deletion warning:', profileError)
    }

    // Phase B: Delete auth user via admin API
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      return errorResponse(req, 'Failed to delete account. Please try again.', 500, deleteError)
    }

    return jsonResponse(req, { success: true, message: 'Account deleted successfully' })

  } catch (error) {
    return errorResponse(req, 'An unexpected error occurred. Please try again.', 500, error)
  }
})
