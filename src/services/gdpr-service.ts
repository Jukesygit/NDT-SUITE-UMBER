/**
 * GDPR Service
 * Handles data export (Article 15/20) and account deletion (Article 17).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client.js';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;

export interface UserDataExport {
    exportedAt: string;
    profile: Record<string, unknown> | null;
    competencies: Record<string, unknown>[];
    competencyHistory: Record<string, unknown>[];
    activityLogs: Record<string, unknown>[];
    permissionRequests: Record<string, unknown>[];
}

/**
 * Export all personal data for the current user.
 * Uses RLS — user can only access their own data (SECURITY INVOKER pattern).
 */
export async function exportUserData(userId: string): Promise<UserDataExport> {
    if (!supabase) throw new Error('Supabase not configured');

    // Fetch all user data in parallel — RLS ensures only own data is returned
    const [profileRes, competenciesRes, historyRes, activityRes, permissionsRes] = await Promise.all([
        supabase
            .from('profiles')
            .select('id, username, email, role, organization_id, mobile_number, email_address, home_address, nearest_uk_train_station, date_of_birth, next_of_kin, next_of_kin_emergency_contact_number, vantage_number, avatar_url, created_at, updated_at')
            .eq('id', userId)
            .single(),
        supabase
            .from('employee_competencies')
            .select('id, competency_id, value, expiry_date, document_url, document_name, status, verified_by, verified_at, notes, issuing_body, certification_id, created_at, updated_at')
            .eq('user_id', userId),
        supabase
            .from('competency_history')
            .select('id, competency_id, field_name, old_value, new_value, change_reason, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
        supabase
            .from('activity_log')
            .select('id, action_type, action_category, description, details, entity_type, entity_id, entity_name, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1000),
        supabase
            .from('permission_requests')
            .select('id, requested_role, user_current_role, message, status, created_at')
            .eq('user_id', userId),
    ]);

    return {
        exportedAt: new Date().toISOString(),
        profile: profileRes.data,
        competencies: competenciesRes.data || [],
        competencyHistory: historyRes.data || [],
        activityLogs: activityRes.data || [],
        permissionRequests: permissionsRes.data || [],
    };
}

/**
 * Delete the current user's account via the Edge Function.
 * Two-phase: SQL cleans up data tables, Edge Function deletes auth.users entry.
 */
export async function deleteMyAccount(): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.functions.invoke('delete-my-account', {
        body: { userId: user.id },
    });

    if (error) throw new Error(error.message || 'Failed to delete account');

    // Sign out after deletion
    await supabase.auth.signOut();
}
