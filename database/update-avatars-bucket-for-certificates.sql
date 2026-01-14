-- ========================================
-- UPDATE AVATARS BUCKET FOR CERTIFICATE DOCUMENTS
-- Run this in your Supabase SQL Editor
-- ========================================
-- This updates the avatars bucket to:
-- 1. Allow PDF files for certificate uploads
-- 2. Increase file size limit to 10MB

-- Update the avatars bucket to allow PDFs and larger files
UPDATE storage.buckets
SET
  file_size_limit = 10485760, -- 10MB limit (was 2MB)
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ]
WHERE id = 'avatars';

-- Verify the update
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'avatars';
