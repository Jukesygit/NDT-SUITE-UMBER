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

-- Policy 1: Users can upload their own documents
CREATE POLICY "Users can upload their own competency documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'competency-documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy 2: Users can view their own documents (admins can see all)
CREATE POLICY "Users can view their own competency documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents'
    AND (
        -- User can see their own documents
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        -- Admins can see all documents
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        OR
        -- Org admins can see documents from users in their org
        EXISTS (
            SELECT 1 FROM public.profiles p1
            JOIN public.profiles p2 ON p1.organization_id = p2.organization_id
            WHERE p1.id = auth.uid()
            AND p1.role = 'org_admin'
            AND p2.id::text = (storage.foldername(name))[2]
        )
    )
);

-- Policy 3: Users can update their own documents
CREATE POLICY "Users can update their own competency documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy 4: Users can delete their own documents (admins can delete any)
CREATE POLICY "Users can delete their own competency documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'documents'
    AND (
        -- User can delete their own documents
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        -- Admins can delete any documents
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
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
