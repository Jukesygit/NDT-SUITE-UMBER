-- ============================================
-- Matrix Portal - Vessel Annotations Storage Setup
-- ============================================
-- This script creates the storage bucket and RLS policies
-- for annotation image attachments on vessel models.

-- ============================================
-- CREATE STORAGE BUCKET
-- ============================================

-- Create the vessel-annotations bucket for annotation image attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('vessel-annotations', 'vessel-annotations', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STORAGE POLICIES - VESSEL ANNOTATIONS
-- ============================================

-- Allow authenticated users to upload annotation images
CREATE POLICY "Authenticated users can upload annotation images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vessel-annotations');

-- Allow authenticated users to read annotation images
CREATE POLICY "Authenticated users can read annotation images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'vessel-annotations');

-- Allow authenticated users to delete annotation images
CREATE POLICY "Authenticated users can delete annotation images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vessel-annotations');
