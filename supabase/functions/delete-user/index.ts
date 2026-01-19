// Edge Function to delete a user from both auth and profiles
// This ensures complete user deletion using admin API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId } = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Clean up related data that might have foreign key constraints
    // Delete records where user is the owner
    const deleteFromTables = [
      { table: 'activity_log', column: 'user_id' },
      { table: 'competency_comments', column: 'created_by' },
      { table: 'password_reset_codes', column: 'user_id' },
      { table: 'user_competencies', column: 'user_id' },
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
      { table: 'user_competencies', column: 'verified_by' },
      { table: 'competency_history', column: 'changed_by' },
      { table: 'assets', column: 'created_by' },
      { table: 'user_asset_access', column: 'granted_by' },
      { table: 'asset_access_requests', column: 'approved_by' },
      { table: 'asset_access_requests', column: 'rejected_by' },
      { table: 'account_requests', column: 'approved_by' },
      { table: 'account_requests', column: 'rejected_by' },
      { table: 'inspections', column: 'inspector_id' },
      { table: 'notification_emails', column: 'recipient_id' },
      { table: 'email_reminder_settings', column: 'updated_by' },
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
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authError) {
      console.error('Error deleting auth user:', authError)
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User deleted successfully:', userId)

    return new Response(
      JSON.stringify({ success: true, message: 'User deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error in delete-user:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
