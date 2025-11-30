import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

// ES module imports
// @ts-ignore - JS module without types
import supabaseImport, { isSupabaseConfigured } from '../../supabase-client.js';
// @ts-ignore - typing JS module import
const supabase: SupabaseClient = supabaseImport;

// Types
export interface Organization {
    id: string;
    name: string;
}

export interface Profile {
    id: string;
    username: string | null;
    email: string | null;
    email_address: string | null;
    mobile_number: string | null;
    home_address: string | null;
    nearest_uk_train_station: string | null;
    next_of_kin: string | null;
    next_of_kin_emergency_contact_number: string | null;
    date_of_birth: string | null;
    avatar_url: string | null;
    role: string;
    organization_id: string | null;
    organization: Organization | null;
    created_at: string;
    updated_at: string;
}

/**
 * Fetch profile data for a specific user
 */
async function fetchProfile(userId: string): Promise<Profile> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
        .from('profiles')
        .select(`
            *,
            organization:organizations(id, name)
        `)
        .eq('id', userId)
        .single();

    if (error) throw error;
    return data;
}

/**
 * React Query hook for fetching user profile
 *
 * @example
 * const { data: profile, isLoading, error } = useProfile(userId);
 * if (isLoading) return <LoadingSpinner />;
 * if (error) return <ErrorDisplay error={error} />;
 */
export function useProfile(userId: string | undefined) {
    return useQuery({
        queryKey: ['profile', userId],
        queryFn: () => fetchProfile(userId!),
        enabled: !!userId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Fetch current user's profile using auth session
 */
async function fetchCurrentProfile(): Promise<Profile> {
    if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session?.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('profiles')
        .select(`
            *,
            organization:organizations(id, name)
        `)
        .eq('id', session.user.id)
        .single();

    if (error) throw error;
    return data;
}

/**
 * React Query hook for fetching current user's profile
 * Uses the authenticated session to determine the user
 * @returns {UseQueryResult} React Query result object
 *
 * @example
 * const { data: profile, isLoading, error } = useCurrentProfile();
 */
export function useCurrentProfile() {
    return useQuery({
        queryKey: ['profile', 'current'],
        queryFn: fetchCurrentProfile,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
