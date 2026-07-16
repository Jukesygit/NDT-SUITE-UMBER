-- ============================================================================
-- FIX: "Failed to load document" (HTTP 400) when reviewing competency documents
-- ============================================================================
-- Symptom:
--   In the personnel document-review modal, the competency DETAILS render
--   correctly but the document preview shows "Failed to load document".
--   Console shows:
--     Failed to load resource: the server responded with a status of 400 ()
--     .../storage/v1/object/sign/documents/competency-documents/<uid>/<name>_<ts>.pdf
--
-- Root cause:
--   competencyService.getDocumentUrl() calls
--     supabase.storage.from('documents').createSignedUrl(path, 3600)
--   on a file stored at  competency-documents/<uploaderUserId>/<name>_<ts>.<ext>.
--   The sign request is evaluated against the storage.objects SELECT policy.
--
--   The competency-document storage policies (database/storage-policies.sql) were
--   written BEFORE the 'super_admin' role existed and were never updated when the
--   role was added. The SELECT policy only grants access to:
--       - the file owner            (foldername[2] = auth.uid())
--       - role = 'admin'            (exact match — excludes super_admin)
--       - org_admin in the same org
--   It omits 'super_admin' AND 'manager'.
--
--   Migration 20260618120000_fix_super_admin_competency_access.sql fixed exactly
--   this omission for the employee_competencies / competency_history /
--   competency_comments TABLE policies, but did NOT touch storage.objects. So a
--   super_admin or manager can read the competency ROW (details render) but the
--   storage object is invisible to them under RLS, so createSignedUrl returns
--   "Object not found" (HTTP 400) and the preview fails.
--
--   Because details render but the document 400s, the failing reviewer is provably
--   a super_admin or manager (an org_admin who can see the details is necessarily
--   same-org, so the storage org_admin branch would already pass).
--
-- Fix:
--   Re-create the competency-document storage.objects policies so their role model
--   matches the (already-fixed) employee_competencies table policies:
--     SELECT : owner OR super_admin/admin OR manager OR same-org org_admin
--     UPDATE : owner OR super_admin/admin OR same-org org_admin
--     DELETE : owner OR super_admin/admin OR same-org org_admin
--   (INSERT was already fixed by database/migrations/fix-admin-document-upload-policy.sql
--    and is left unchanged here.)
--
--   Path shape:  competency-documents/<userId>/<file>
--     (storage.foldername(name))[1] = 'competency-documents'
--     (storage.foldername(name))[2] = <userId>   (the file owner)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SELECT: who can view / sign a competency document
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own competency documents" ON storage.objects;

CREATE POLICY "Users can view their own competency documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'competency-documents'
    AND (
        -- Owner: the file lives under their own user folder
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        -- Super admins and admins can see all competency documents
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
        -- Org admins can see documents from users in their organization
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

-- ---------------------------------------------------------------------------
-- UPDATE: owner + admins (matches employee_competencies UPDATE policy)
-- (Re-uploads use unique timestamped paths, so this rarely fires, but keep the
--  role model consistent so an admin acting for a user is never blocked.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own competency documents" ON storage.objects;

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

-- ---------------------------------------------------------------------------
-- DELETE: owner + admins (matches employee_competencies DELETE policy)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their own competency documents" ON storage.objects;

CREATE POLICY "Users can delete their own competency documents"
ON storage.objects FOR DELETE
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

-- ============================================================================
-- Verify: should list view/update/delete policies for competency documents
-- ============================================================================
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects'
AND policyname LIKE '%competency documents%'
ORDER BY policyname;
