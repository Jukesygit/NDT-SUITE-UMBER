/**
 * Annotation Attachment Service
 * Upload, delete, and get URLs for annotation image attachments via Supabase Storage.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client.js';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient = supabaseModule.supabase;

const BUCKET = 'vessel-annotations';

export async function uploadAnnotationImage(
  organizationId: string,
  vesselModelId: string,
  annotationId: number,
  file: File | Blob,
  _type: 'upload' | 'viewport-capture',
): Promise<{ storagePath: string; id: string }> {
  const id = crypto.randomUUID();
  const ext = file instanceof File ? (file.name.split('.').pop() ?? 'png') : 'png';
  const path = `${organizationId}/${vesselModelId}/${annotationId}/${id}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/png',
  });
  if (error) throw error;

  return { storagePath: path, id };
}

export async function deleteAnnotationImage(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw error;
}

export function getAnnotationImageUrl(storagePath: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}
