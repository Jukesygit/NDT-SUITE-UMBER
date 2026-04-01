/**
 * Competency Comment Operations
 * All query and mutation operations for competency comments.
 */
// @ts-ignore - JS module without type declarations
import supabase, { isSupabaseConfigured } from '../supabase-client';
// @ts-ignore - JS module without type declarations
import authManager from '../auth-manager.js';

import type { CompetencyComment } from '../types/database.types';

/** Supabase select fragment for comment queries with author join */
const COMMENT_SELECT = `
    id, employee_competency_id, comment_text, comment_type,
    is_pinned, created_by, created_at, updated_at, mentioned_users,
    author:profiles!competency_comments_created_by_fkey(
        id, username, email, avatar_url
    )
`;

// ============================================================
// Comment Queries
// ============================================================

/**
 * Get comments for a competency
 */
export async function getCompetencyComments(employeeCompetencyId: string): Promise<any[]> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
        .from('competency_comments')
        .select(COMMENT_SELECT)
        .eq('employee_competency_id', employeeCompetencyId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Get competencies with recent comments
 */
export async function getCompetenciesWithComments(
    userId: string | null = null,
    daysBack: number = 7
): Promise<any[]> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
        .rpc('get_competencies_with_comments', {
            p_user_id: userId,
            p_days_back: daysBack
        });

    if (error) throw error;
    return data || [];
}

// ============================================================
// Comment Mutations
// ============================================================

/**
 * Add a comment to a competency
 */
export async function addCompetencyComment(
    employeeCompetencyId: string,
    commentText: string,
    commentType: CompetencyComment['comment_type'] = 'general',
    isPinned: boolean = false,
    mentionedUsers: string[] | null = null
): Promise<any> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const currentUser = authManager.getCurrentUser();
    if (!currentUser) {
        throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
        .from('competency_comments')
        .insert({
            employee_competency_id: employeeCompetencyId,
            comment_text: commentText,
            comment_type: commentType,
            is_pinned: isPinned,
            created_by: currentUser.id,
            mentioned_users: mentionedUsers
        })
        .select(COMMENT_SELECT)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update a comment
 */
export async function updateCompetencyComment(
    commentId: string,
    updates: Record<string, any>
): Promise<any> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
        .from('competency_comments')
        .update(updates)
        .eq('id', commentId)
        .select(COMMENT_SELECT)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete a comment
 */
export async function deleteCompetencyComment(commentId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { error } = await supabase
        .from('competency_comments')
        .delete()
        .eq('id', commentId);

    if (error) throw error;
    return true;
}

/**
 * Pin/unpin a comment
 */
export async function pinCompetencyComment(commentId: string, isPinned: boolean): Promise<any> {
    return updateCompetencyComment(commentId, { is_pinned: isPinned });
}
