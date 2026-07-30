-- ============================================================================
-- Migration: Multi-document support for competencies (certifications)
-- ============================================================================
-- A certification frequently spans multiple files (front/back of a card,
-- multi-page certificate, cert + supporting evidence). Until now
-- employee_competencies stored exactly one document via the scalar columns
-- document_url / document_name.
--
-- This migration introduces the child table competency_documents as the
-- source of truth for a certification's document set. The legacy scalar
-- columns on employee_competencies remain MIRRORED to the position-first
-- document (maintained in the service layer), so unmigrated consumers and
-- "has a document" gating keep working and rollback stays trivial.
--
-- RLS: policies delegate to the parent employee_competencies row and mirror
-- its per-command predicate EXACTLY, as fixed in
-- 20260618120000_fix_super_admin_competency_access.sql:
--   SELECT : super_admin/admin OR manager OR self OR same-org org_admin
--   INSERT : self OR super_admin/admin OR same-org org_admin   (no manager)
--   UPDATE : self OR super_admin/admin OR same-org org_admin   (no manager)
--   DELETE : self OR super_admin/admin OR same-org org_admin   (no manager)
-- (Per the storage-RLS-role-omission lesson: role lists must match the parent
--  everywhere — these were copied from the parent policies, not reconstructed.)
--
-- Storage paths are unchanged (competency-documents/<userId>/… in the private
-- 'documents' bucket) → no storage.objects policy changes needed here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table + index
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competency_documents (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_competency_id uuid NOT NULL
        REFERENCES employee_competencies(id) ON DELETE CASCADE,
    document_url           text NOT NULL,  -- storage path in 'documents' bucket
    document_name          text NOT NULL,
    position               int  NOT NULL DEFAULT 0,
    uploaded_by            uuid REFERENCES auth.users(id),
    created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS competency_documents_employee_competency_id_idx
    ON competency_documents(employee_competency_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE competency_documents ENABLE ROW LEVEL SECURITY;

-- SELECT: mirror employee_competencies SELECT (super_admin/admin OR manager OR
--         self OR same-org org_admin)
DROP POLICY IF EXISTS "Users can view competency documents" ON competency_documents;

CREATE POLICY "Users can view competency documents"
ON competency_documents FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM employee_competencies ec
        WHERE ec.id = competency_documents.employee_competency_id
        AND (
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
            )
            OR
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid() AND p.role = 'manager'
            )
            OR
            ec.user_id = auth.uid()
            OR
            EXISTS (
                SELECT 1 FROM profiles p
                JOIN profiles target ON target.id = ec.user_id
                WHERE p.id = auth.uid()
                AND p.role = 'org_admin'
                AND p.organization_id IS NOT NULL
                AND p.organization_id = target.organization_id
            )
        )
    )
);

-- INSERT: mirror employee_competencies INSERT (self OR super_admin/admin OR
--         same-org org_admin)
DROP POLICY IF EXISTS "Users can create competency documents" ON competency_documents;

CREATE POLICY "Users can create competency documents"
ON competency_documents FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM employee_competencies ec
        WHERE ec.id = competency_documents.employee_competency_id
        AND (
            ec.user_id = auth.uid()
            OR
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                AND (
                    p.role IN ('super_admin', 'admin')
                    OR (p.role = 'org_admin' AND p.organization_id IN (
                        SELECT organization_id FROM profiles WHERE id = ec.user_id
                    ))
                )
            )
        )
    )
);

-- UPDATE: mirror employee_competencies UPDATE (self OR super_admin/admin OR
--         same-org org_admin)
DROP POLICY IF EXISTS "Users can update competency documents" ON competency_documents;

CREATE POLICY "Users can update competency documents"
ON competency_documents FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM employee_competencies ec
        WHERE ec.id = competency_documents.employee_competency_id
        AND (
            ec.user_id = auth.uid()
            OR
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                AND (
                    p.role IN ('super_admin', 'admin')
                    OR (p.role = 'org_admin' AND p.organization_id IN (
                        SELECT organization_id FROM profiles WHERE id = ec.user_id
                    ))
                )
            )
        )
    )
);

-- DELETE: mirror employee_competencies DELETE (self OR super_admin/admin OR
--         same-org org_admin)
DROP POLICY IF EXISTS "Users can delete competency documents" ON competency_documents;

CREATE POLICY "Users can delete competency documents"
ON competency_documents FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM employee_competencies ec
        WHERE ec.id = competency_documents.employee_competency_id
        AND (
            ec.user_id = auth.uid()
            OR
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
            )
            OR
            EXISTS (
                SELECT 1 FROM profiles p
                JOIN profiles target ON target.id = ec.user_id
                WHERE p.id = auth.uid()
                AND p.role = 'org_admin'
                AND p.organization_id = target.organization_id
            )
        )
    )
);

-- ---------------------------------------------------------------------------
-- Backfill: one position-0 document per existing competency that has a
-- document_url. Idempotent — skips competencies that already have child rows,
-- so re-running the migration is safe. document_name is NOT NULL on the child,
-- so fall back to the URL when the legacy name is missing.
-- ---------------------------------------------------------------------------
INSERT INTO competency_documents (employee_competency_id, document_url, document_name, position)
SELECT ec.id, ec.document_url, COALESCE(ec.document_name, ec.document_url), 0
FROM employee_competencies ec
WHERE ec.document_url IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM competency_documents cd
    WHERE cd.employee_competency_id = ec.id
);
