/**
 * useUploadAvatar - Mutation hook for uploading user avatar
 *
 * Security (audit 2026-08-12, M11 — step 1 of the plan in
 * supabase/migrations/20260812122000_bucket_privacy_hardening.sql:67-71):
 * this stores the object PATH in `profiles.avatar_url`, never a public URL.
 * Reads resolve the path to a short-lived signed URL through
 * `services/avatar-service.ts`, which is what lets the `avatars` bucket be
 * flipped private (database/parked-migrations/avatars_private.sql).
 *
 * Do not reintroduce `getPublicUrl` here: a permanent world-readable URL for a
 * staff photo is the finding, and one written after the flip would 404 anyway.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { avatarKeys } from '../queries/useAvatarUrls';

// ES module import
// @ts-ignore - JS module without types
import supabaseImport from '../../supabase-client';
// @ts-ignore - typing JS module import
const supabase: SupabaseClient = supabaseImport;

interface UploadAvatarResult {
  /** Bucket object path as persisted to `profiles.avatar_url`. */
  path: string;
}

// Images only — the file input accepts `image/*`, so this is the real gate.
// Both extension and MIME type are checked so a renamed file cannot slip past either.
const ALLOWED_AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

// One sentence, one source of truth for the cap. Both the client-side size
// check and the storage-side "size" rejection quote the SAME number, so the
// message can never drift from `MAX_AVATAR_BYTES` again (it read "2MB" while
// the real cap was 5MB).
const MAX_AVATAR_SIZE_MESSAGE = `File is too large. Maximum size is ${MAX_AVATAR_BYTES / (1024 * 1024)}MB.`;

async function uploadAvatar(userId: string, file: File): Promise<UploadAvatarResult> {
  // Generate unique filename
  const fileExt = file.name.split('.').pop()?.toLowerCase();
  const fileName = `${userId}/avatar-${Date.now()}.${fileExt}`;

  // Validate file type and size before upload
  if (!fileExt || !ALLOWED_AVATAR_EXTENSIONS.includes(fileExt)) {
    throw new Error(
      `Invalid file type. Allowed types: ${ALLOWED_AVATAR_EXTENSIONS.map((ext) => `.${ext}`).join(', ')}`
    );
  }

  if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type)) {
    throw new Error(`Invalid file type. Allowed types: ${ALLOWED_AVATAR_MIME_TYPES.join(', ')}`);
  }

  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error(`File is too large. Maximum size is ${MAX_AVATAR_BYTES / (1024 * 1024)}MB.`);
  }

  // Upload to storage
  const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, {
    cacheControl: '3600',
    upsert: true,
  });

  if (uploadError) {
    // Provide more helpful error messages
    if (uploadError.message?.includes('Bucket not found')) {
      throw new Error('Avatar storage is not configured. Please contact support.');
    }
    if (
      uploadError.message?.includes('row-level security') ||
      uploadError.message?.includes('policy')
    ) {
      throw new Error('You do not have permission to upload avatars. Please contact support.');
    }
    if (uploadError.message?.includes('mime type') || uploadError.message?.includes('file type')) {
      throw new Error('This file type is not allowed. Please use JPEG, PNG, or WebP.');
    }
    if (uploadError.message?.includes('size')) {
      throw new Error(MAX_AVATAR_SIZE_MESSAGE);
    }
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  // Persist the object PATH, not a URL. Readers sign it on demand.
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: fileName })
    .eq('id', userId);

  if (updateError) {
    throw new Error(`Failed to save avatar to profile: ${updateError.message}`);
  }

  return { path: fileName };
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
    mutationFn: ({ userId, file }: { userId: string; file: File }) => uploadAvatar(userId, file),
    onSuccess: (_, variables) => {
      // Invalidate profile query to refetch with new avatar
      queryClient.invalidateQueries({ queryKey: ['profile', variables.userId] });
      // …and every resolved signed URL, so the new path is signed rather than
      // the previous one being served from cache.
      queryClient.invalidateQueries({ queryKey: avatarKeys.all });
    },
  });
}

export default useUploadAvatar;
