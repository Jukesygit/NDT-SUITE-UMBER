-- ============================================
-- Document Control System Schema
-- Company-wide document management with version control,
-- approval workflows, and timed review cycles
-- ============================================

-- ============================================
-- CLEAN SLATE: Drop existing tables/functions if re-running
-- (safe for dev — tables have no production data yet)
-- ============================================
DROP TABLE IF EXISTS document_review_schedule CASCADE;
DROP TABLE IF EXISTS document_revisions CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS document_categories CASCADE;
DROP FUNCTION IF EXISTS get_documents_due_for_review(INTEGER);

-- Drop storage policies if they already exist (no IF NOT EXISTS for policies)
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view controlled documents" ON storage.objects;
    DROP POLICY IF EXISTS "Admins can upload controlled documents" ON storage.objects;
    DROP POLICY IF EXISTS "Admins can delete controlled documents" ON storage.objects;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- TABLE: document_categories
-- Global categories for organizing controlled documents
-- ============================================
CREATE TABLE IF NOT EXISTS document_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: documents
-- Master document register
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Document identity
    doc_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    category_id UUID NOT NULL REFERENCES document_categories(id),

    -- Ownership
    owner_id UUID NOT NULL REFERENCES profiles(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    -- Current state
    current_revision_id UUID,   -- FK added after document_revisions table created
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',
        'under_review',
        'approved',
        'superseded',
        'withdrawn'
    )),

    -- Review cycle
    review_period_months INTEGER NOT NULL DEFAULT 12,
    next_review_date DATE,

    -- Metadata
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: document_revisions
-- Version history for each document
-- ============================================
CREATE TABLE IF NOT EXISTS document_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    -- Revision identity
    revision_number INTEGER NOT NULL,
    change_summary TEXT,

    -- File reference
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    file_type TEXT,

    -- Approval workflow
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',
        'under_review',
        'approved',
        'rejected',
        'superseded'
    )),

    -- Approval tracking
    submitted_by UUID REFERENCES profiles(id),
    submitted_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    review_comments TEXT,

    -- Review-only revision (no file changes, just confirms doc is still current)
    is_review_only BOOLEAN DEFAULT false,

    -- Audit
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(document_id, revision_number)
);

-- Add FK from documents to document_revisions now that both tables exist
ALTER TABLE documents
    ADD CONSTRAINT fk_documents_current_revision
    FOREIGN KEY (current_revision_id)
    REFERENCES document_revisions(id);

-- ============================================
-- TABLE: document_review_schedule
-- Tracks review events for each document
-- ============================================
CREATE TABLE IF NOT EXISTS document_review_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    -- Schedule
    due_date DATE NOT NULL,

    -- Tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'due',
        'overdue',
        'in_progress',
        'completed',
        'skipped'
    )),

    -- Completion
    completed_by UUID REFERENCES profiles(id),
    completed_at TIMESTAMPTZ,
    resulting_revision_id UUID REFERENCES document_revisions(id),
    no_changes_needed BOOLEAN DEFAULT false,
    review_notes TEXT,

    -- Notification tracking
    reminder_sent_at TIMESTAMPTZ,
    overdue_reminder_sent_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_document_categories_active ON document_categories(is_active);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_next_review ON documents(next_review_date);
CREATE INDEX IF NOT EXISTS idx_documents_active ON documents(is_active, status);
CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);

CREATE INDEX IF NOT EXISTS idx_document_revisions_doc ON document_revisions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_revisions_status ON document_revisions(status);
CREATE INDEX IF NOT EXISTS idx_document_revisions_created ON document_revisions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doc_review_schedule_doc ON document_review_schedule(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_review_schedule_status ON document_review_schedule(status);
CREATE INDEX IF NOT EXISTS idx_doc_review_schedule_due ON document_review_schedule(due_date);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_review_schedule ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS: document_categories
-- All authenticated users can view; admin/org_admin can manage
-- ============================================
CREATE POLICY "Authenticated users can view document categories"
    ON document_categories FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins can manage document categories"
    ON document_categories FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- ============================================
-- RLS: documents
-- All authenticated users see approved docs; admin/org_admin see all
-- ============================================
CREATE POLICY "Users can view approved documents in their org"
    ON documents FOR SELECT
    TO authenticated
    USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (
            status = 'approved'
            OR EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
            )
        )
    );

CREATE POLICY "Admins can create documents in their org"
    ON documents FOR INSERT
    TO authenticated
    WITH CHECK (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

CREATE POLICY "Admins can update documents in their org"
    ON documents FOR UPDATE
    TO authenticated
    USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

CREATE POLICY "Admins can delete documents in their org"
    ON documents FOR DELETE
    TO authenticated
    USING (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- ============================================
-- RLS: document_revisions
-- All authenticated see approved revisions; admin/org_admin see all
-- ============================================
CREATE POLICY "Users can view approved revisions in their org"
    ON document_revisions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_revisions.document_id
            AND d.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        )
        AND (
            status = 'approved'
            OR EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
            )
        )
    );

CREATE POLICY "Admins can create revisions in their org"
    ON document_revisions FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM documents d
            JOIN profiles p ON p.id = auth.uid()
            WHERE d.id = document_revisions.document_id
            AND d.organization_id = p.organization_id
            AND p.role IN ('admin', 'org_admin')
        )
    );

CREATE POLICY "Admins can update revisions in their org"
    ON document_revisions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM documents d
            JOIN profiles p ON p.id = auth.uid()
            WHERE d.id = document_revisions.document_id
            AND d.organization_id = p.organization_id
            AND p.role IN ('admin', 'org_admin')
        )
    );

-- ============================================
-- RLS: document_review_schedule
-- Admin/org_admin only
-- ============================================
CREATE POLICY "Admins can view review schedules in their org"
    ON document_review_schedule FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM documents d
            JOIN profiles p ON p.id = auth.uid()
            WHERE d.id = document_review_schedule.document_id
            AND d.organization_id = p.organization_id
            AND p.role IN ('admin', 'org_admin')
        )
    );

CREATE POLICY "Admins can manage review schedules in their org"
    ON document_review_schedule FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM documents d
            JOIN profiles p ON p.id = auth.uid()
            WHERE d.id = document_review_schedule.document_id
            AND d.organization_id = p.organization_id
            AND p.role IN ('admin', 'org_admin')
        )
    );

-- ============================================
-- STORAGE POLICIES
-- Using existing 'documents' bucket with 'controlled-documents/' prefix
-- ============================================

-- All authenticated users can view controlled documents
CREATE POLICY "Users can view controlled documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'controlled-documents'
);

-- Admin/org_admin can upload controlled documents
CREATE POLICY "Admins can upload controlled documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'controlled-documents'
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
    )
);

-- Admin/org_admin can delete controlled documents
CREATE POLICY "Admins can delete controlled documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'controlled-documents'
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
    )
);

-- ============================================
-- TRIGGERS: auto-update updated_at
-- ============================================
CREATE TRIGGER update_document_categories_updated_at
    BEFORE UPDATE ON document_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_revisions_updated_at
    BEFORE UPDATE ON document_revisions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_review_schedule_updated_at
    BEFORE UPDATE ON document_review_schedule
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER FUNCTION: Get documents due for review
-- ============================================
CREATE OR REPLACE FUNCTION get_documents_due_for_review(
    p_days_ahead INTEGER DEFAULT 30
)
RETURNS TABLE (
    document_id UUID,
    doc_number TEXT,
    title TEXT,
    category_name TEXT,
    owner_username TEXT,
    owner_email TEXT,
    next_review_date DATE,
    days_until_review INTEGER,
    is_overdue BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id AS document_id,
        d.doc_number,
        d.title,
        dc.name AS category_name,
        p.username AS owner_username,
        p.email AS owner_email,
        d.next_review_date,
        (d.next_review_date - CURRENT_DATE)::INTEGER AS days_until_review,
        d.next_review_date < CURRENT_DATE AS is_overdue
    FROM documents d
    JOIN document_categories dc ON d.category_id = dc.id
    JOIN profiles p ON d.owner_id = p.id
    WHERE d.is_active = true
        AND d.status = 'approved'
        AND d.next_review_date IS NOT NULL
        AND d.next_review_date <= CURRENT_DATE + p_days_ahead
        AND d.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ORDER BY d.next_review_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION get_documents_due_for_review TO authenticated;

-- ============================================
-- SEED: Default document categories
-- ============================================
INSERT INTO document_categories (name, description, display_order) VALUES
    ('Procedures', 'Technical procedures for inspection and testing methods', 1),
    ('Work Instructions', 'Step-by-step instructions for specific tasks', 2),
    ('Forms & Templates', 'Blank forms and report templates for field use', 3),
    ('Policies', 'Company policies including H&S, data protection, and ethics', 4),
    ('External Documents', 'Client specifications, codes of practice, and referenced standards', 5)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE document_categories IS 'Categories for organizing controlled company documents';
COMMENT ON TABLE documents IS 'Master register of controlled documents with review cycle tracking';
COMMENT ON TABLE document_revisions IS 'Version history for each controlled document with approval workflow';
COMMENT ON TABLE document_review_schedule IS 'Scheduled and completed review events for document control';
COMMENT ON FUNCTION get_documents_due_for_review IS 'Returns documents approaching or past their review date';
