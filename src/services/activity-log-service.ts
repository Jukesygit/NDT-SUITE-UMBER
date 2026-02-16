/**
 * Activity Log Service
 * Handles logging and querying user activity across the system
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client.js';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;

// ============================================================================
// Type Definitions
// ============================================================================

// Action categories
export type ActionCategory =
    | 'auth'
    | 'profile'
    | 'competency'
    | 'admin'
    | 'asset'
    | 'config';

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
    // Sharing
    | 'share_created'
    | 'share_deleted';

export interface ActivityLogEntry {
    id: string;
    user_id: string | null;
    user_email: string | null;
    user_name: string | null;
    action_type: ActionType;
    action_category: ActionCategory;
    description: string;
    details: Record<string, unknown> | null;
    entity_type: string | null;
    entity_id: string | null;
    entity_name: string | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
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

        // Fire and forget - don't await the result
        supabase.rpc('log_activity', {
            p_user_id: userId || null,
            p_action_type: params.actionType,
            p_action_category: params.actionCategory,
            p_description: params.description,
            p_details: params.details || null,
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
        .select('*', { count: 'exact' });

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
                `description.ilike.%${sanitizedQuery}%,user_name.ilike.%${sanitizedQuery}%,entity_name.ilike.%${sanitizedQuery}%`
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
        .select('user_id, user_name, user_email')
        .not('user_id', 'is', null)
        .order('user_name');

    if (error) throw error;

    // Deduplicate by user_id
    const uniqueUsers = new Map<string, { id: string; name: string; email: string }>();
    data?.forEach((row: { user_id: string; user_name: string | null; user_email: string | null }) => {
        if (row.user_id && !uniqueUsers.has(row.user_id)) {
            uniqueUsers.set(row.user_id, {
                id: row.user_id,
                name: row.user_name || 'Unknown',
                email: row.user_email || '',
            });
        }
    });

    return Array.from(uniqueUsers.values());
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
        profile: 0,
        competency: 0,
        admin: 0,
        asset: 0,
        config: 0,
    };

    data?.forEach((row: { action_category: string }) => {
        const category = row.action_category as ActionCategory;
        if (category in stats) {
            stats[category]++;
        }
    });

    return stats;
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
    getActivityLogs,
    getActivityUsers,
    getActivityStats,
};
