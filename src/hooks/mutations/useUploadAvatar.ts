/**
 * useUploadAvatar - Mutation hook for uploading user avatar
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

// ES module import
// @ts-ignore - JS module without types
import supabaseImport from '../../supabase-client.js';
// @ts-ignore - typing JS module import
const supabase: SupabaseClient = supabaseImport;

interface UploadAvatarResult {
    url: string;
}

async function uploadAvatar(userId: string, file: File): Promise<UploadAvatarResult> {
    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/avatar-${Date.now()}.${fileExt}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true,
        });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

    const avatarUrl = urlData.publicUrl;

    // Update profile with new avatar URL
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', userId);

    if (updateError) throw updateError;

    return { url: avatarUrl };
}

/**
 * Hook for uploading user avatar
 *
 * @example
 * const uploadAvatar = useUploadAvatar();
 *
 * const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0];
 *     if (file) {
 *         uploadAvatar.mutate({ userId, file });
 *     }
 * };
 */
export function useUploadAvatar() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ userId, file }: { userId: string; file: File }) =>
            uploadAvatar(userId, file),
        onSuccess: (_, variables) => {
            // Invalidate profile query to refetch with new avatar
            queryClient.invalidateQueries({ queryKey: ['profile', variables.userId] });
        },
    });
}

export default useUploadAvatar;
