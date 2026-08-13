/**
 * GDPR Service
 * Handles data export (Article 15/20) and account deletion (Article 17).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractFunctionErrorMessage } from '../utils/edge-function-error';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;

export interface UserDataExport {
  exportedAt: string;
  profile: Record<string, unknown> | null;
  competencies: Record<string, unknown>[];
  competencyDocuments: Record<string, unknown>[];
  competencyHistory: Record<string, unknown>[];
  activityLogs: Record<string, unknown>[];
  permissionRequests: Record<string, unknown>[];
  controlledDocuments: Record<string, unknown>[];
}

/**
 * Export all personal data for the current user.
 * Uses RLS — user can only access their own data (SECURITY INVOKER pattern).
 *
 * The export must stay a superset of what account deletion erases, so it also
 * covers the certification document set (competency_documents) and the
 * controlled documents the user owns or authored.
 */
export async function exportUserData(userId: string): Promise<UserDataExport> {
  if (!supabase) throw new Error('Supabase not configured');

  // Fetch all user data in parallel — RLS ensures only own data is returned
  const [
    profileRes,
    competenciesRes,
    historyRes,
    activityRes,
    permissionsRes,
    ownedDocsRes,
    authoredDocsRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, username, email, role, organization_id, mobile_number, email_address, home_address, nearest_uk_train_station, date_of_birth, next_of_kin, next_of_kin_emergency_contact_number, vantage_number, avatar_url, created_at, updated_at'
      )
      .eq('id', userId)
      .single(),
    supabase
      .from('employee_competencies')
      .select(
        'id, competency_id, value, expiry_date, document_url, document_name, status, verified_by, verified_at, notes, issuing_body, certification_id, created_at, updated_at'
      )
      .eq('user_id', userId),
    supabase
      .from('competency_history')
      .select('id, competency_id, field_name, old_value, new_value, change_reason, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('activity_log')
      .select(
        'id, action_type, action_category, description, details, entity_type, entity_id, entity_name, created_at'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('permission_requests')
      .select('id, requested_role, user_current_role, message, status, created_at')
      .eq('user_id', userId),
    // Controlled documents are linked to the user by two separate columns, so
    // they are queried separately rather than through a filter string.
    supabase
      .from('documents')
      .select(
        'id, doc_number, title, description, category_id, owner_id, organization_id, status, review_period_months, next_review_date, is_active, created_by, created_at, updated_at'
      )
      .eq('owner_id', userId),
    supabase
      .from('documents')
      .select(
        'id, doc_number, title, description, category_id, owner_id, organization_id, status, review_period_months, next_review_date, is_active, created_by, created_at, updated_at'
      )
      .eq('created_by', userId),
  ]);

  const competencies = competenciesRes.data || [];

  // The certification document set hangs off the competency rows, so it can only
  // be fetched once their ids are known.
  const competencyIds = competencies.map((row: { id: string }) => row.id);
  let competencyDocuments: Record<string, unknown>[] = [];
  if (competencyIds.length > 0) {
    const { data } = await supabase
      .from('competency_documents')
      .select(
        'id, employee_competency_id, document_url, document_name, position, uploaded_by, created_at'
      )
      .in('employee_competency_id', competencyIds)
      .order('position', { ascending: true });
    competencyDocuments = data || [];
  }

  const controlledDocumentsById = new Map<string, Record<string, unknown>>();
  for (const row of [...(ownedDocsRes.data || []), ...(authoredDocsRes.data || [])]) {
    controlledDocumentsById.set((row as { id: string }).id, row);
  }

  return {
    exportedAt: new Date().toISOString(),
    profile: profileRes.data,
    competencies,
    competencyDocuments,
    competencyHistory: historyRes.data || [],
    activityLogs: activityRes.data || [],
    permissionRequests: permissionsRes.data || [],
    controlledDocuments: [...controlledDocumentsById.values()],
  };
}

/**
 * Delete the current user's account via the Edge Function.
 * Two-phase: SQL cleans up data tables, Edge Function deletes auth.users entry.
 *
 * The function is fail-loud: a partial erasure returns a non-2xx response whose
 * body carries the reason, so the real message is read off the raw Response that
 * supabase-js hangs on FunctionsHttpError.context.
 */
export async function deleteMyAccount(): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.functions.invoke('delete-my-account', {
    body: { userId: user.id },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error, 'Failed to delete account'));
  }

  // Sign out after deletion
  await supabase.auth.signOut();
}
