/**
 * useUpdateProfile - Mutation hook for updating user profile
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

// ES module import
// @ts-ignore - JS module without types
import supabaseImport from '../../supabase-client.js';
// @ts-ignore - typing JS module import
const supabase: SupabaseClient = supabaseImport;

interface ProfileUpdateData {
    username?: string;
    mobile_number?: string;
    email_address?: string;
    home_address?: string;
    nearest_uk_train_station?: string;
    next_of_kin?: string;
    next_of_kin_emergency_contact_number?: string;
    date_of_birth?: string;
    avatar_url?: string;
}

async function updateProfile(userId: string, data: ProfileUpdateData): Promise<void> {
    const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', userId);

    if (error) throw error;
}

/**
 * Hook for updating user profile
 *
 * @example
 * const updateProfile = useUpdateProfile();
 *
 * const handleSave = () => {
 *     updateProfile.mutate(
 *         { userId, data: formData },
 *         { onSuccess: () => toast.success('Profile updated') }
 *     );
 * };
 */
export function useUpdateProfile() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ userId, data }: { userId: string; data: ProfileUpdateData }) =>
            updateProfile(userId, data),
        onSuccess: (_, variables) => {
            // Invalidate profile query to refetch
            queryClient.invalidateQueries({ queryKey: ['profile', variables.userId] });
        },
    });
}

export default useUpdateProfile;
