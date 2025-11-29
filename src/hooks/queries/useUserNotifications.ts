/**
 * useUserNotifications - Hook to fetch user's competencies needing attention
 *
 * Returns competencies with 'changes_requested' status for the current user
 */

import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without types
import supabaseImport, { isSupabaseConfigured } from '../../supabase-client.js';
// @ts-ignore - typing JS module import
const supabase: SupabaseClient = supabaseImport;
import { useAuth } from '../../contexts/AuthContext';

export interface UserNotification {
    id: string;
    competency_id: string;
    status: string;
    notes: string | null;
    document_url: string | null;
    document_name: string | null;
    created_at: string;
    updated_at: string;
    verified_at: string | null;
    competency: {
        id: string;
        name: string;
        description: string | null;
        category: {
            id: string;
            name: string;
        } | null;
    } | null;
}

async function fetchUserNotifications(userId: string): Promise<UserNotification[]> {
    if (!isSupabaseConfigured() || !userId) {
        return [];
    }

    const { data, error } = await supabase
        .from('employee_competencies')
        .select(`
            id,
            competency_id,
            status,
            notes,
            document_url,
            document_name,
            created_at,
            updated_at,
            verified_at,
            competency:competency_definitions(
                id,
                name,
                description,
                category:competency_categories(id, name)
            )
        `)
        .eq('user_id', userId)
        .eq('status', 'changes_requested')
        .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data || []) as unknown as UserNotification[];
}

/**
 * Hook to get current user's competencies needing attention
 */
export function useUserNotifications() {
    const { user } = useAuth();

    return useQuery<UserNotification[]>({
        queryKey: ['userNotifications', user?.id],
        queryFn: () => fetchUserNotifications(user?.id || ''),
        enabled: !!user?.id,
        staleTime: 60 * 1000, // 1 minute
        refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    });
}

export default useUserNotifications;
