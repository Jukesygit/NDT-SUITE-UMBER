-- Storage Bucket Configuration and RLS Policies for Competency Documents
-- This ensures that personal competency documents are PRIVATE and secure

-- ============================================================================
-- STEP 1: Create the Storage Bucket via Supabase UI
-- ============================================================================
-- 1. Go to Storage in Supabase Dashboard
-- 2. Click "Create bucket"
-- 3. Name: 'documents'
-- 4. Visibility: PRIVATE (not public!)
-- 5. Click "Create bucket"
-- 6. Then run this SQL below

-- ============================================================================
-- STEP 2: Run this SQL to create RLS policies
-- ============================================================================

-- Drop existing policies if they exist (to allow re-running this script)
DROP POLICY IF EXISTS "Users can upload their own competency documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own competency documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own competency documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own competency documents" ON storage.objects;

-- Policy 1: Users can upload their own documents (super_admins/admins upload for
-- anyone; org_admins upload within their org). manager is SELECT-only by design.
-- NOTE: role list MUST stay in sync with the employee_competencies INSERT policy
-- and the storage INSERT migration
-- (supabase/migrations/20260728131000_fix_storage_insert_super_admin.sql).
-- Omitting super_admin here 403s super_admin uploads on behalf of other users.
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
        -- Super admins and admins can upload for any user
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
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

-- Policy 2: Users can view their own documents (super_admins/admins/managers see all)
-- NOTE: role list MUST stay in sync with the employee_competencies table policies
-- (supabase/migrations/20260618120000_fix_super_admin_competency_access.sql).
-- Omitting super_admin/manager here makes createSignedUrl 400 for those reviewers.
CREATE POLICY "Users can view their own competency documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'competency-documents'
    AND (
        -- User can see their own documents
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        -- Super admins and admins can see all documents
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
        )
        OR
        -- Managers can review all competency documents
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'manager'
        )
        OR
        -- Org admins can see documents from users in their org
        EXISTS (
            SELECT 1 FROM public.profiles p1
            JOIN public.profiles p2 ON p1.organization_id = p2.organization_id
            WHERE p1.id = auth.uid()
            AND p1.role = 'org_admin'
            AND p1.organization_id IS NOT NULL
            AND p2.id::text = (storage.foldername(name))[2]
        )
    )
);

-- Policy 3: Users can update their own documents (admins can update any)
CREATE POLICY "Users can update their own competency documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'competency-documents'
    AND (
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
        )
        OR
        EXISTS (
            SELECT 1 FROM public.profiles p1
            JOIN public.profiles p2 ON p1.organization_id = p2.organization_id
            WHERE p1.id = auth.uid()
            AND p1.role = 'org_admin'
            AND p1.organization_id IS NOT NULL
            AND p2.id::text = (storage.foldername(name))[2]
        )
    )
);

-- Policy 4: Users can delete their own documents (super_admins/admins/org_admins delete any)
CREATE POLICY "Users can delete their own competency documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'competency-documents'
    AND (
        -- User can delete their own documents
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        -- Super admins and admins can delete any documents
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
        )
        OR
        -- Org admins can delete documents from users in their org
        EXISTS (
            SELECT 1 FROM public.profiles p1
            JOIN public.profiles p2 ON p1.organization_id = p2.organization_id
            WHERE p1.id = auth.uid()
            AND p1.role = 'org_admin'
            AND p1.organization_id IS NOT NULL
            AND p2.id::text = (storage.foldername(name))[2]
        )
    )
);

-- ============================================================================
-- Verify policies were created successfully
-- ============================================================================
SELECT
    policyname,
    cmd as operation,
    CASE
        WHEN cmd = 'INSERT' THEN with_check
        ELSE qual
    END as policy_expression
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects'
AND policyname LIKE '%competency documents%'
ORDER BY policyname;

-- You should see 4 policies listed with their expressions:
-- 1. Users can upload their own competency documents (INSERT) - shows WITH CHECK clause
-- 2. Users can view their own competency documents (SELECT) - shows USING clause
-- 3. Users can update their own competency documents (UPDATE) - shows USING clause
-- 4. Users can delete their own competency documents (DELETE) - shows USING clause
--
-- Note: INSERT policies use WITH CHECK (not USING), which is why they show in a different column
