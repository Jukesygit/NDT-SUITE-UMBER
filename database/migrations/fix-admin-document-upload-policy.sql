-- Fix storage policy to allow admins to upload competency documents for other users
-- The current policy only allows users to upload to their own folder
-- This update allows admins and org_admins to upload for users in their scope

-- Drop the existing insert policy
DROP POLICY IF EXISTS "Users can upload their own competency documents" ON storage.objects;

-- Create new insert policy that allows:
-- 1. Users to upload their own documents
-- 2. Admins to upload for any user
-- 3. Org admins to upload for users in their organization
CREATE POLICY "Users can upload their own competency documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'competency-documents'
    AND (
        -- User can upload their own documents
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        -- Admins can upload for any user
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        OR
        -- Org admins can upload for users in their organization
        EXISTS (
            SELECT 1 FROM public.profiles admin_profile
            JOIN public.profiles target_profile
                ON admin_profile.organization_id = target_profile.organization_id
            WHERE admin_profile.id = auth.uid()
            AND admin_profile.role = 'org_admin'
            AND target_profile.id::text = (storage.foldername(name))[2]
        )
    )
);

-- Verify the policy was created
SELECT policyname, cmd, with_check
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects'
AND policyname = 'Users can upload their own competency documents';
