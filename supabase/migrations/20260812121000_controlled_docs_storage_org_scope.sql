-- ============================================================================
-- H1 — Controlled documents readable across tenants (storage layer)
-- Security audit 2026-08-12 (docs/security-audit-2026-08-12.md, finding H1)
-- ============================================================================
-- The live storage.objects SELECT policy "Users can view controlled documents"
-- (defined in database/migrations/document-control-schema.sql:346-352, repeated
-- verbatim in the two restore scripts, never overridden by a later migration)
-- checks ONLY:
--     bucket_id = 'documents'
--     AND (storage.foldername(name))[1] = 'controlled-documents'
-- No organisation predicate, no role predicate. The upload path is
--     controlled-documents/<documentId>/<revision>_<ts>.<ext>
-- (src/services/document-control-service.ts:474), so any authenticated user in
-- ANY organisation who learns a document UUID can mint a signed URL for that
-- object (src/services/document-control-service.ts:495 createSignedUrl).
-- The `documents` TABLE is org-scoped, so foreign ids are not listable in-app —
-- that is the only thing keeping this out of Critical — but it is a genuine
-- cross-tenant IDOR over procedures, signed reports and quality records.
--
-- Fix: mirror the `documents` TABLE visibility at the storage layer by joining
-- the object's second path segment back to documents.organization_id.
--
-- Design notes (read before "simplifying" this):
--   * The org lookup goes through the SECURITY DEFINER helper
--     public.controlled_document_org() and NOT through an inline
--     `EXISTS (SELECT 1 FROM public.documents ...)` subquery. This is the fix
--     for adversarial-review finding 3.2: an inline subquery inside an RLS
--     policy is evaluated under the CALLER's own RLS, so the `documents` table
--     policy (org scope AND `status = 'approved' OR admin role`) would be
--     re-imposed on top of this one — silently regressing downloads of an
--     approved revision whose parent document is currently draft/superseded,
--     for exactly the non-admin users this policy is meant to serve. The
--     definer helper reads documents.organization_id with RLS bypassed, so the
--     ONLY predicate this policy applies is the tenant boundary.
--   * `d.id::text = doc_key` inside the helper — TEXT comparison on purpose.
--     Casting the path segment to uuid would make the lookup ERROR on any
--     stray/legacy object whose second segment is not a UUID, which fails the
--     bucket open in a different way (500s on unrelated objects). A path with
--     no matching document row yields NULL → predicate false → no access.
--   * The document-level `status = 'approved'` gate from the table policy is
--     deliberately NOT mirrored (see above). Revision visibility is per-REVISION
--     status (document_revisions policy "Users can view approved revisions in
--     their org"), and every revision file lives under the same <documentId>
--     folder, so gating storage on the parent document's current status would
--     hide approved revisions of a document that is currently back in draft.
--     Org scope is the tenant boundary this finding is about.
--   * `super_admin` gets a global branch: it is the platform-owner role and the
--     sibling competency-documents policies in this same bucket already grant it
--     unscoped read (20260629120000). Repo scar: role-list changes must land on
--     BOTH the table and storage policies or review flows 400.
--   * `admin` deliberately gets NO cross-org branch here — the documents TABLE
--     policy scopes admin to their own organisation, so a global storage branch
--     for admin would leave a narrower version of H1 open.
--
-- ALSO IN THIS FILE (adversarial-review finding 2.1): the competency-documents
-- SELECT policy in the SAME bucket still has an UNSCOPED manager branch, so C2
-- ("manager reads every organisation's personnel PII") remained open at the
-- storage layer even after 20260812120000 org-scoped the three TABLE policies.
-- It is fixed below; the other competency-documents policies (INSERT/UPDATE/
-- DELETE, fixed deliberately in 20260629120000 / 20260728131000) are untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Owning organisation of a controlled document, looked up WITHOUT the caller's
-- RLS (adversarial-review finding 3.2 — see the design notes above).
-- ----------------------------------------------------------------------------
-- Takes the raw second path segment as TEXT so a non-UUID legacy path cannot
-- raise; returns NULL when no document matches, which makes the calling policy
-- predicate false rather than erroring.
CREATE OR REPLACE FUNCTION public.controlled_document_org(doc_key TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT d.organization_id
    FROM public.documents d
    WHERE d.id::text = doc_key;
$$;

-- Not callable with the anon key; the policy that uses it runs as the caller,
-- so `authenticated` is the only grantee an end user needs.
REVOKE EXECUTE ON FUNCTION public.controlled_document_org(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.controlled_document_org(TEXT) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can view controlled documents" ON storage.objects;

CREATE POLICY "Users can view controlled documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'controlled-documents'
    AND (
        -- Platform owner: unscoped read (matches competency-documents policies)
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
        )
        OR
        -- Everyone else: only objects belonging to a document in the caller's
        -- org. Both sides are definer lookups, so neither the documents-table
        -- RLS (status gate) nor the profiles RLS re-filters this test.
        -- get_my_org_id() is created by 20260812120000, which runs first.
        public.controlled_document_org((storage.foldername(name))[2]) = get_my_org_id()
    )
);

-- ============================================================================
-- [C2 / review 2.1] competency-documents storage SELECT — org-scope `manager`
-- ============================================================================
-- Current definition: 20260629120000_fix_competency_document_storage_policies.sql
-- :55-87. Its manager branch is a bare role test with NO organisation predicate:
--     EXISTS (SELECT 1 FROM public.profiles
--             WHERE id = auth.uid() AND role = 'manager')
-- so a tenant-A manager can createSignedUrl any tenant-B certificate file — the
-- storage half of C2, still open after 20260812120000 scoped the TABLE policies.
--
-- Fix: the manager branch is org-scoped EXACTLY like the sibling org_admin
-- branch already in this policy (same p1/p2 join through the owning user id in
-- (storage.foldername(name))[2]); only the role literal differs. Every other
-- branch — owner, super_admin/admin, org_admin — is reproduced verbatim.
--
-- Repo scar (20260629120000 / storage-RLS role omission): role-list changes must
-- land on BOTH the table and storage policies or the document-review modal 400s.
-- super_admin keeps unscoped review access, and manager keeps review access —
-- now WITHIN their own organisation, which is where they can see the parent
-- competency row anyway after 20260812120000.
-- ============================================================================
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
        -- [C2] Managers can review competency documents IN THEIR OWN ORG.
        -- was: EXISTS (SELECT 1 FROM public.profiles
        --              WHERE id = auth.uid() AND role = 'manager')  -- unscoped
        EXISTS (
            SELECT 1 FROM public.profiles p1
            JOIN public.profiles p2 ON p1.organization_id = p2.organization_id
            WHERE p1.id = auth.uid()
            AND p1.role = 'manager'
            AND p1.organization_id IS NOT NULL
            AND p2.id::text = (storage.foldername(name))[2]
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

-- ----------------------------------------------------------------------------
-- Anti-OR-widening sweep (audit finding M12; hardened per review 3.3 / 3.4)
-- ----------------------------------------------------------------------------
-- RLS policies OR together. Recreating the policies above only helps if no
-- OTHER, differently-named policy still grants unscoped read into the
-- `documents` bucket (the repo's migration chain drops by exact name, so stale
-- duplicates survive).
--
-- Two ways the original sweep missed the widest class:
--   * [3.3] it matched only `qual LIKE '%controlled-documents%'`. A BUCKET-WIDE
--     policy with no foldername predicate at all — which is precisely the
--     pre-20260629 live shape of "Users can view their own competency
--     documents" (`bucket_id = 'documents'` and a role test, nothing else) —
--     grants read over BOTH folders and matches neither folder string.
--   * [3.4] `qual` is NULL for INSERT-only policies, and `NULL LIKE ...` is NULL,
--     so those rows never matched anything. The expression to test is
--     COALESCE(qual,'') || COALESCE(with_check,'').
--
-- Behaviour:
--   * stale controlled-documents SELECT duplicates are still auto-dropped
--     (unchanged, this is the H1 remediation);
--   * any other policy touching the `documents` bucket WITHOUT a foldername
--     predicate is WARNED about and left alone — auto-dropping an unknown
--     bucket-wide policy could silently remove upload/review ability, so this
--     stays a report that a human resolves.
--
-- Scope guards on the auto-drop arm:
--   * cmd = 'SELECT' only — a FOR ALL policy is left alone; if the sweep
--     reports one, review it by hand.
--   * policies whose text also mentions 'competency-documents' are skipped, so a
--     combined multi-folder policy is never collateral damage.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    pol RECORD;
    pol_text TEXT;
BEGIN
    FOR pol IN
        SELECT policyname, cmd,
               COALESCE(qual, '') || COALESCE(with_check, '') AS policy_text
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          -- known-good named policies for the `documents` bucket: the two SELECT
          -- policies are recreated above; the rest are already folder-scoped and
          -- role-gated (20260629120000 / 20260728131000 / document-control-schema)
          AND policyname NOT IN (
              'Users can view controlled documents',
              'Admins can upload controlled documents',
              'Admins can delete controlled documents',
              'Users can view their own competency documents',
              'Users can upload their own competency documents',
              'Users can update their own competency documents',
              'Users can delete their own competency documents'
          )
    LOOP
        pol_text := pol.policy_text;

        -- (a) stale duplicate that explicitly targets the controlled-documents
        --     folder → drop it if it is a plain SELECT policy
        IF pol_text LIKE '%controlled-documents%'
           AND pol_text NOT LIKE '%competency-documents%' THEN
            IF pol.cmd = 'SELECT' THEN
                RAISE WARNING 'H1: dropping stale controlled-documents SELECT policy "%"', pol.policyname;
                EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
            ELSE
                RAISE WARNING 'H1: storage policy "%" (cmd=%) also matches controlled-documents — review by hand, not dropped', pol.policyname, pol.cmd;
            END IF;

        -- (b) [3.3] bucket-wide policy: mentions the `documents` bucket but has
        --     NO folder predicate → widest possible OR-widening. Report only.
        ELSIF pol_text LIKE '%''documents''%'
              AND pol_text NOT LIKE '%foldername%' THEN
            RAISE WARNING 'M12: storage policy "%" (cmd=%) covers the WHOLE documents bucket with no foldername predicate — it OR-widens both controlled-documents and competency-documents. Review and drop by hand.', pol.policyname, pol.cmd;
        END IF;
    END LOOP;
END $$;
