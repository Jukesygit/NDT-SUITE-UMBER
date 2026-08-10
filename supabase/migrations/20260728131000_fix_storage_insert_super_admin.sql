-- ============================================================================
-- Storage INSERT policy — add super_admin to competency-document uploads
-- Design: docs/plans/2026-07-28-competency-attribution-and-session-hardening-design.md (A3)
-- ============================================================================
-- The 2026-07-28 RLS audit found the storage.objects INSERT policy
-- "Users can upload their own competency documents" (live definition in
-- database/migrations/fix-admin-document-upload-policy.sql) checks only
-- role = 'admin' in its privileged branch — super_admin is MISSING.
--
-- This UNDER-permits: a super_admin uploading a competency document on behalf of
-- another user falls through the self-folder and org_admin branches and is denied
-- with a 403. The policy was never OVER-permitted, so widening it to include
-- super_admin carries no privilege regression — it simply restores the access
-- super_admin already has on the employee_competencies table policy and on the
-- storage SELECT/UPDATE/DELETE policies (which already list super_admin).
--
-- Fix: recreate the INSERT policy with role IN ('admin', 'super_admin'). The
-- self-check branch and the org_admin same-org branch are reproduced verbatim.
-- manager is deliberately NOT added: managers are SELECT-only (review, not write),
-- matching the employee_competencies INSERT policy and competency_documents INSERT.
--
-- Mirrored by hand into database/storage-policies.sql (reference set).
-- ============================================================================

DROP POLICY IF EXISTS "Users can upload their own competency documents" ON storage.objects;

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
