-- ============================================================================
-- SECURITY (audit 2026-08-12, finding H2): lock down the vessel-annotations bucket
-- ============================================================================
-- Symptom / risk:
--   database/annotation-storage-setup.sql created 'vessel-annotations' with
--   public = true, no file_size_limit and no allowed_mime_types, and its three
--   storage.objects policies checked ONLY bucket_id. Consequences:
--     1. Every object had a permanent, unauthenticated public URL
--        (getPublicUrl) - inspection photographs leaked to anyone with the link.
--     2. Any authenticated user of ANY organization could write or delete any
--        object in the bucket (no folder/tenant check at all).
--     3. Any MIME type was accepted and served inline from the storage origin,
--        so text/html or image/svg+xml uploads were stored XSS / malware hosting.
--
-- Fix:
--   * Bucket becomes private, capped at 10 MB, restricted to raster image types.
--     Reads now go through short-lived signed URLs
--     (src/services/annotation-attachment-service.ts -> resolveAnnotationAttachmentUrl).
--   * Write policies are scoped to the caller's own organization folder. Upload
--     paths are <organization_id>/<vesselModelId>/<annotationId>/<uuid>.<ext>, so
--     (storage.foldername(name))[1] is the owning organization id.
--
-- Accepted residual risks (deliberate, see audit notes):
--   * SELECT stays bucket-wide for authenticated users: annotations are shared
--     within a vessel model and legacy objects (any pre-org path) must remain
--     readable. Anonymous access is gone; cross-organization READ by an
--     authenticated user is still possible and is a candidate for later
--     tightening to the caller's org folder.
--   * Legacy objects stored under a pre-org path (folder[1] not an organization
--     id) become immutable - they can no longer be updated or deleted by any
--     end user, only via the service role.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Bucket configuration (idempotent: creates the bucket if a fresh environment
-- never ran database/annotation-storage-setup.sql, otherwise hardens it)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'vessel-annotations',
    'vessel-annotations',
    false,
    10485760, -- 10 MB
    ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

-- ---------------------------------------------------------------------------
-- Drop the bucket_id-only policies created by
-- database/annotation-storage-setup.sql (no UPDATE policy ever existed)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can upload annotation images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read annotation images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete annotation images" ON storage.objects;

-- Re-runnable: drop the replacements before re-creating them
DROP POLICY IF EXISTS "Org members can read annotation images" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload annotation images" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update annotation images" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete annotation images" ON storage.objects;

-- ---------------------------------------------------------------------------
-- SELECT: authenticated users may read (and therefore sign) annotation images.
-- Kept bucket-wide so legacy objects and shared vessel models keep working.
-- ---------------------------------------------------------------------------
CREATE POLICY "Org members can read annotation images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'vessel-annotations');

-- ---------------------------------------------------------------------------
-- Write policies: caller's own organization folder, plus a super_admin escape
-- ---------------------------------------------------------------------------
-- [review 7.1] The org-folder test alone locks out platform super_admins, whose
-- profiles.organization_id is legitimately NULL — the subquery then returns NULL,
-- `foldername[1] = NULL` is NULL, and they cannot write or clean up ANY object.
-- get_my_role() is the non-recursive definer helper created by 20260812120000,
-- which runs before this migration.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- INSERT: only into the caller's own organization folder (or super_admin)
-- ---------------------------------------------------------------------------
CREATE POLICY "Org members can upload annotation images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'vessel-annotations'
    AND (
        get_my_role() = 'super_admin'
        OR (storage.foldername(name))[1] = (
            SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
        )
    )
);

-- ---------------------------------------------------------------------------
-- UPDATE (overwrite / upsert): only within the caller's own organization folder,
-- and the result must stay inside it (or super_admin)
-- ---------------------------------------------------------------------------
CREATE POLICY "Org members can update annotation images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'vessel-annotations'
    AND (
        get_my_role() = 'super_admin'
        OR (storage.foldername(name))[1] = (
            SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
        )
    )
)
WITH CHECK (
    bucket_id = 'vessel-annotations'
    AND (
        get_my_role() = 'super_admin'
        OR (storage.foldername(name))[1] = (
            SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
        )
    )
);

-- ---------------------------------------------------------------------------
-- DELETE: only within the caller's own organization folder (or super_admin)
-- ---------------------------------------------------------------------------
CREATE POLICY "Org members can delete annotation images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'vessel-annotations'
    AND (
        get_my_role() = 'super_admin'
        OR (storage.foldername(name))[1] = (
            SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
        )
    )
);

-- ============================================================================
-- Verify: bucket is private/limited and only the four scoped policies remain
-- ============================================================================
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'vessel-annotations';

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects'
AND policyname LIKE '%annotation images%'
ORDER BY policyname;
