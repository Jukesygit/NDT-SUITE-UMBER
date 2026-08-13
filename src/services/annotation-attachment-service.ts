/**
 * Annotation Attachment Service
 * Upload, delete, and resolve short-lived signed URLs for annotation image
 * attachments in the PRIVATE `vessel-annotations` bucket.
 *
 * Security (audit 2026-08-12, H2): the bucket is private
 * (supabase/migrations/20260812124000_vessel_annotations_private.sql), so nothing
 * here may hand out a permanent public URL. Objects are written under the
 * caller's own organization folder and read back through signed URLs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client.js';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient = supabaseModule.supabase;

const BUCKET = 'vessel-annotations';

/** Path marker used to recover the object path from a legacy public URL. */
const BUCKET_PATH_MARKER = `/${BUCKET}/`;

/** Signed-URL lifetime in seconds (mirrors the competency/document precedent). */
const SIGNED_URL_TTL_SECONDS = 3600;

/** Accepted upload types — must stay in sync with the bucket's allowed_mime_types. */
const ALLOWED_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

/** Upload size cap in bytes — must stay in sync with the bucket's file_size_limit. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** File extension per accepted type: never derive the extension from user input. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Resolve the caller's organization from their own profile row. The upload path
 * prefix must match the storage RLS check, and a client-supplied organization id
 * is not trusted for that.
 */
async function getCallerOrganizationId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  if (!profile?.organization_id) throw new Error('User has no organization');

  return String(profile.organization_id);
}

/**
 * Normalise a persisted attachment reference to a bucket object path.
 * Accepts a bare path or a legacy `.../object/public/vessel-annotations/<path>`
 * URL. Returns null for anything that is not a plain in-bucket path.
 */
function toBucketPath(stored: string): string | null {
  const value = stored.trim();
  if (!value) return null;

  const markerIndex = value.indexOf(BUCKET_PATH_MARKER);
  const raw = markerIndex >= 0 ? value.slice(markerIndex + BUCKET_PATH_MARKER.length) : value;
  const path = raw.replace(/^\/+/, '').split('?')[0];

  // Reject traversal and anything still carrying a scheme (e.g. an external URL)
  if (!path || path.includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  return path;
}

/**
 * Upload an annotation image into the caller's organization folder.
 *
 * `_organizationId` is retained for call-site compatibility but is NOT used:
 * the folder prefix always comes from the caller's own profile so it can never
 * disagree with the storage RLS policy.
 */
export async function uploadAnnotationImage(
  _organizationId: string,
  vesselModelId: string,
  annotationId: number,
  file: File | Blob,
  _type: 'upload' | 'viewport-capture' | 'scan-capture'
): Promise<{ storagePath: string; id: string }> {
  const contentType = file.type;
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    throw new Error(
      `Unsupported image type${contentType ? ` "${contentType}"` : ''}. Allowed: PNG, JPEG, WebP, GIF.`
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image is too large. The maximum attachment size is 10 MB.');
  }

  const organizationId = await getCallerOrganizationId();
  const id = crypto.randomUUID();
  const ext = EXTENSION_BY_MIME[contentType];
  const path = `${organizationId}/${vesselModelId}/${annotationId}/${id}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;

  return { storagePath: path, id };
}

export async function deleteAnnotationImage(storagePath: string): Promise<void> {
  const path = toBucketPath(storagePath);
  if (!path) return;

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

/**
 * Resolve a persisted attachment reference (bare storage path, or a legacy full
 * public URL from when the bucket was public) to a short-lived signed URL.
 * Returns null when the reference is unusable or the object cannot be signed.
 */
export async function resolveAnnotationAttachmentUrl(stored: string): Promise<string | null> {
  const path = toBucketPath(stored);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;

  return data.signedUrl;
}
