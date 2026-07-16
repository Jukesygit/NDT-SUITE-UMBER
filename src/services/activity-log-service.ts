/**
 * Activity Log Service
 * Handles logging and querying user activity across the system
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { stripPiiFromObject } from '../utils/pii-sanitizer';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;

// ============================================================================
// Type Definitions
// ============================================================================

// Action categories (single source of truth; mirrors the DB check constraint in
// migration 20260626140000_activity_log_v2_schema.sql)
export type ActionCategory =
    | 'auth'
    | 'security'
    | 'profile'
    | 'competency'
    | 'admin'
    | 'asset'
    | 'inspection'
    | 'document'
    | 'config'
    | 'data';

// Specific action types
export type ActionType =
    // Auth
    | 'login_success'
    | 'login_failed'
    | 'logout'
    // Profile
    | 'profile_updated'
    | 'avatar_changed'
    // Competency
    | 'competency_created'
    | 'competency_updated'
    | 'competency_deleted'
    | 'competency_approved'
    | 'competency_rejected'
    | 'document_uploaded'
    // Admin - Users
    | 'user_created'
    | 'user_updated'
    | 'user_deleted'
    // Admin - Organizations
    | 'organization_created'
    | 'organization_updated'
    | 'organization_deleted'
    // Admin - Requests
    | 'permission_approved'
    | 'permission_rejected'
    | 'account_approved'
    | 'account_rejected'
    // Assets
    | 'asset_created'
    | 'asset_updated'
    | 'asset_deleted'
    | 'asset_transferred'
    | 'vessel_created'
    | 'vessel_updated'
    | 'vessel_deleted'
    | 'scan_created'
    | 'scan_updated'
    | 'scan_deleted'
    // Config
    | 'config_updated'
    | 'announcement_created'
    | 'announcement_updated'
    // GDPR / Privacy
    | 'pii_revealed'
    | 'data_exported'
    | 'account_deleted'
    | 'report_generated'
    // Sharing
    | 'share_created'
    | 'share_deleted'
    // Document Control
    | 'controlled_document_created'
    | 'controlled_document_updated'
    | 'controlled_document_withdrawn'
    | 'document_revision_created'
    | 'document_submitted_for_review'
    | 'document_revision_approved'
    | 'document_revision_rejected'
    | 'document_review_completed'
    // Admin - Competency Definitions & Categories
    | 'category_created'
    | 'category_updated'
    | 'category_deleted'
    | 'definition_created'
    | 'definition_updated'
    | 'definition_deleted';

export interface ActivityLogEntry {
    id: string;
    user_id: string | null;
    user_email: string | null;
    user_name: string | null;
    // Free-form: DB triggers and edge functions emit dynamic action types
    // (e.g. 'vessel_created', 'user_email_changed') beyond the client ActionType union.
    action_type: string;
    action_category: ActionCategory;
    description: string;
    details: Record<string, unknown> | null;
    entity_type: string | null;
    entity_id: string | null;
    entity_name: string | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
    organization_id: string | null;
    actor_role: string | null;
    /** Joined actor profile, resolved at read time (actor PII is never cached). */
    actor?: { username: string | null; email: string | null } | null;
}

export interface ActivityLogFilters {
    userId?: string;
    actionType?: ActionType;
    actionCategory?: ActionCategory;
    entityType?: string;
    startDate?: string;
    endDate?: string;
    searchQuery?: string;
}

export interface PaginatedActivityLogs {
    data: ActivityLogEntry[];
    count: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface LogActivityParams {
    userId?: string;
    actionType: ActionType;
    actionCategory: ActionCategory;
    description: string;
    details?: Record<string, unknown>;
    entityType?: string;
    entityId?: string;
    entityName?: string;
}

// ============================================================================
// Activity Logging (Fire and Forget)
// ============================================================================

/**
 * Log an activity - fire and forget (non-blocking)
 * This function will never throw or block the main operation
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
    try {
        if (!supabase) {
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        const userId = params.userId || user?.id;

        // Strip PII from details before logging
        const sanitizedDetails = params.details && typeof params.details === 'object'
            ? stripPiiFromObject(params.details)
            : params.details || null;

        // Fire and forget - don't await the result
        supabase.rpc('log_activity', {
            p_user_id: userId || null,
            p_action_type: params.actionType,
            p_action_category: params.actionCategory,
            p_description: params.description,
            p_details: sanitizedDetails,
            p_entity_type: params.entityType || null,
            p_entity_id: params.entityId || null,
            p_entity_name: params.entityName || null,
            p_ip_address: null,
            p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }).then(({ error }: { error: { message: string } | null }) => {
            if (error) {
                // intentionally empty - activity logging errors are non-critical
            }
        });
    } catch (error) {
        // Silently fail - activity logging should never break the app
    }
}

/**
 * Helper function for easy activity logging with pre-set category
 */
export function createActivityLogger(category: ActionCategory) {
    return (
        actionType: ActionType,
        description: string,
        options?: {
            userId?: string;
            details?: Record<string, unknown>;
            entityType?: string;
            entityId?: string;
            entityName?: string;
        }
    ) => {
        logActivity({
            actionType,
            actionCategory: category,
            description,
            ...options,
        });
    };
}

// Pre-configured loggers for each category
export const authLogger = createActivityLogger('auth');
export const profileLogger = createActivityLogger('profile');
export const competencyLogger = createActivityLogger('competency');
export const adminLogger = createActivityLogger('admin');
export const assetLogger = createActivityLogger('asset');
export const configLogger = createActivityLogger('config');
export const documentLogger = createActivityLogger('document');

// ============================================================================
// Activity Querying
// ============================================================================

/**
 * Fetch activity logs with pagination and filters
 */
export async function getActivityLogs(
    filters: ActivityLogFilters = {},
    page = 1,
    pageSize = 25
): Promise<PaginatedActivityLogs> {
    if (!supabase) {
        throw new Error('Supabase not configured');
    }

    let query = supabase
        .from('activity_log')
        // Resolve actor identity by join (actor email/name are not cached on the row).
        .select('*, actor:profiles!activity_log_user_id_fkey(username, email)', { count: 'exact' });

    // Apply filters
    if (filters.userId) {
        query = query.eq('user_id', filters.userId);
    }
    if (filters.actionType) {
        query = query.eq('action_type', filters.actionType);
    }
    if (filters.actionCategory) {
        query = query.eq('action_category', filters.actionCategory);
    }
    if (filters.entityType) {
        query = query.eq('entity_type', filters.entityType);
    }
    if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
    }
    if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
    }
    if (filters.searchQuery) {
        // SECURITY: Sanitize search query to prevent SQL injection via Supabase filter operators
        // Only allow alphanumeric characters, spaces, and basic punctuation
        const sanitizedQuery = filters.searchQuery
            .replace(/[^a-zA-Z0-9\s\-_.,@]/g, '')
            .trim();

        if (sanitizedQuery.length > 0) {
            query = query.or(
                `description.ilike.%${sanitizedQuery}%,action_type.ilike.%${sanitizedQuery}%,entity_name.ilike.%${sanitizedQuery}%`
            );
        }
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query
        .order('created_at', { ascending: false })
        .range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
        data: (data as ActivityLogEntry[]) || [],
        count: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
    };
}

/**
 * Get unique users who have activity (for filter dropdown)
 */
export async function getActivityUsers(): Promise<Array<{ id: string; name: string; email: string }>> {
    if (!supabase) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
        .from('activity_log')
        .select('user_id, actor:profiles!activity_log_user_id_fkey(username, email)')
        .not('user_id', 'is', null);

    if (error) throw error;

    // Deduplicate by user_id (actor identity resolved via join; PII not cached on the row).
    // PostgREST may type the embedded actor as an object or a single-element array.
    type ActorEmbed = { username: string | null; email: string | null };
    const uniqueUsers = new Map<string, { id: string; name: string; email: string }>();
    (data as Array<{ user_id: string; actor: ActorEmbed | ActorEmbed[] | null }> | null)?.forEach((row) => {
        const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
        if (row.user_id && !uniqueUsers.has(row.user_id)) {
            uniqueUsers.set(row.user_id, {
                id: row.user_id,
                name: actor?.username || 'Deleted user',
                email: actor?.email || '',
            });
        }
    });

    return Array.from(uniqueUsers.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get activity count by category (for dashboard stats)
 */
export async function getActivityStats(since?: Date): Promise<Record<ActionCategory, number>> {
    if (!supabase) {
        throw new Error('Supabase not configured');
    }

    let query = supabase
        .from('activity_log')
        .select('action_category');

    if (since) {
        query = query.gte('created_at', since.toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    const stats: Record<ActionCategory, number> = {
        auth: 0,
        security: 0,
        profile: 0,
        competency: 0,
        admin: 0,
        asset: 0,
        inspection: 0,
        document: 0,
        config: 0,
        data: 0,
    };

    data?.forEach((row: { action_category: string }) => {
        const category = row.action_category as ActionCategory;
        if (category in stats) {
            stats[category]++;
        }
    });

    return stats;
}

/**
 * Fetch up to `max` matching rows (no pagination) for CSV export of the current
 * filtered view. Capped to bound payload size on large logs.
 */
export async function getActivityLogsForExport(
    filters: ActivityLogFilters = {},
    max = 5000
): Promise<ActivityLogEntry[]> {
    const result = await getActivityLogs(filters, 1, max);
    return result.data;
}

// ============================================================================
// Export default object for backwards compatibility
// ============================================================================

export default {
    logActivity,
    createActivityLogger,
    authLogger,
    profileLogger,
    competencyLogger,
    adminLogger,
    assetLogger,
    configLogger,
    documentLogger,
    getActivityLogs,
    getActivityUsers,
    getActivityStats,
    getActivityLogsForExport,
};
