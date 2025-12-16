/**
 * useUserPermissionRequests - React Query hook for fetching current user's permission requests
 */

import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

// ES module import
// @ts-ignore - JS module without types
import supabaseImport, { isSupabaseConfigured } from '../../supabase-client.js';
// @ts-ignore - typing JS module import
const supabase: SupabaseClient = supabaseImport;

export interface PermissionRequest {
    id: string;
    user_id: string;
    requested_role: string;
    user_current_role: string;
    message: string;
    status: 'pending' | 'approved' | 'rejected';
    rejection_reason?: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Fetch current user's permission requests
 */
async function fetchUserPermissionRequests(userId: string): Promise<PermissionRequest[]> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
        .from('permission_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * React Query hook for fetching current user's permission requests
 *
 * @example
 * const { data: requests, isLoading } = useUserPermissionRequests(userId);
 */
export function useUserPermissionRequests(userId: string | undefined) {
    return useQuery({
        queryKey: ['userPermissionRequests', userId],
        queryFn: () => fetchUserPermissionRequests(userId!),
        enabled: !!userId && isSupabaseConfigured(),
        staleTime: 30 * 1000, // 30 seconds - requests are time-sensitive
    });
}
