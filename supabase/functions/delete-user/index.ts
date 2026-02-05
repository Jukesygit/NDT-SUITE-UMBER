// Edge Function to delete a user from both auth and profiles
// This ensures complete user deletion using admin API
// SECURITY: Requires admin authentication

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/auth.ts'

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

    // Clean up related data that might have foreign key constraints
    // Delete records where user is the owner
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
      { table: 'notification_emails', column: 'sent_by' },
    ]

    for (const { table, column } of deleteFromTables) {
      try {
        const { error } = await supabaseAdmin.from(table).delete().eq(column, userId)
        if (error) console.warn(`Delete from ${table} warning:`, error.message)
      } catch (e) {
        console.warn(`Could not clean up ${table}:`, e)
      }
    }

    // Nullify references in tables where user is a reference (not owner)
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
        const { error } = await supabaseAdmin.from(table).update({ [column]: null }).eq(column, userId)
        if (error) console.warn(`Nullify ${table}.${column} warning:`, error.message)
      } catch (e) {
        console.warn(`Could not nullify ${table}.${column}:`, e)
      }
    }

    // Delete the profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      console.warn('Profile deletion warning:', profileError)
    }

    // Then delete the auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      // SECURITY: Log detailed error but return generic message
      return errorResponse(
        req,
        'Failed to delete user. Please try again.',
        500,
        deleteError
      )
    }

    console.log('User deleted successfully:', userId)

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
