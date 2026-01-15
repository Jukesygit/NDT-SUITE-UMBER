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
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const fileName = `${userId}/avatar-${Date.now()}.${fileExt}`;

    // Validate file type before upload
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Upload to storage
    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true,
        });

    if (uploadError) {
        // Provide more helpful error messages
        if (uploadError.message?.includes('Bucket not found')) {
            throw new Error('Avatar storage is not configured. Please contact support.');
        }
        if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('policy')) {
            throw new Error('You do not have permission to upload avatars. Please contact support.');
        }
        if (uploadError.message?.includes('mime type') || uploadError.message?.includes('file type')) {
            throw new Error('This file type is not allowed. Please use JPEG, PNG, GIF, or WebP.');
        }
        if (uploadError.message?.includes('size')) {
            throw new Error('File is too large. Maximum size is 2MB.');
        }
        throw new Error(`Upload failed: ${uploadError.message}`);
    }

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

    if (updateError) {
        throw new Error(`Failed to save avatar to profile: ${updateError.message}`);
    }

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
