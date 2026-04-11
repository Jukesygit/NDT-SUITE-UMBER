-- ============================================================================
-- Inspection Projects Schema
-- ============================================================================
-- Project Hub tables for managing inspection campaigns/trips.
-- A project groups multiple vessel inspections at a site.
-- ============================================================================

-- ============================================================================
-- Table: inspection_projects
-- Top-level entity: one project = one trip/campaign to a site
-- ============================================================================
CREATE TABLE IF NOT EXISTS inspection_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES profiles(id),

    -- Identity
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'mobilizing', 'in_progress', 'review', 'completed', 'archived')),

    -- Client & location
    client_name TEXT,
    site_name TEXT,
    location_description TEXT,

    -- Schedule
    start_date DATE,
    end_date DATE,

    -- Shared equipment config (used by all vessels in this project)
    equipment JSONB DEFAULT '{}'::jsonb,
    -- Expected shape: { model, probe, wedge, calibration_blocks, procedure_ref, beamset_config }

    -- Companion app config
    companion_config JSONB DEFAULT '{}'::jsonb,
    -- Expected shape: { watch_folder, auto_upload_enabled }

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_projects_org ON inspection_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_inspection_projects_status ON inspection_projects(status);
CREATE INDEX IF NOT EXISTS idx_inspection_projects_created ON inspection_projects(created_at DESC);

-- ============================================================================
-- Table: project_vessels
-- Each vessel being inspected within a project
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_vessels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES inspection_projects(id) ON DELETE CASCADE,

    -- Vessel identity
    vessel_name TEXT NOT NULL,
    vessel_tag TEXT,
    vessel_type TEXT,

    -- Linked 3D model (nullable — created when tech opens modeler)
    vessel_model_id UUID REFERENCES vessel_models(id) ON DELETE SET NULL,

    -- Coverage tracking
    coverage_target_pct NUMERIC(5,2),
    coverage_actual_pct NUMERIC(5,2) DEFAULT 0,

    -- Reference drawings (Supabase Storage URLs + optional annotations)
    ga_drawing JSONB,
    -- Expected shape: { url, filename, size_bytes, annotations[], comment }
    location_drawing JSONB,
    -- Expected shape: { url, filename, size_bytes, annotations[], comment }

    -- Status
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'setup', 'scanning', 'annotating', 'report_ready', 'completed')),
    notes TEXT,

    -- Inspector assignment
    inspector_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_vessels_project ON project_vessels(project_id);
CREATE INDEX IF NOT EXISTS idx_project_vessels_model ON project_vessels(vessel_model_id);
CREATE INDEX IF NOT EXISTS idx_project_vessels_inspector ON project_vessels(inspector_id);

-- ============================================================================
-- Table: project_files
-- General-purpose file registry for project assets
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES inspection_projects(id) ON DELETE CASCADE,
    project_vessel_id UUID REFERENCES project_vessels(id) ON DELETE SET NULL,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),

    -- File details
    name TEXT NOT NULL,
    file_type TEXT NOT NULL
        CHECK (file_type IN ('ga_drawing', 'location_drawing', 'photo', 'reference', 'report', 'nde_file', 'other')),
    storage_path TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'project-files',
    filename TEXT NOT NULL,
    size_bytes INTEGER,
    mime_type TEXT,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_vessel ON project_files(project_vessel_id);
CREATE INDEX IF NOT EXISTS idx_project_files_type ON project_files(file_type);

-- ============================================================================
-- FK extensions on existing tables
-- ============================================================================

-- Link scan composites to project vessels (optional)
ALTER TABLE scan_composites
    ADD COLUMN IF NOT EXISTS project_vessel_id UUID REFERENCES project_vessels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_scan_composites_project_vessel ON scan_composites(project_vessel_id);

-- Link vessel models to project vessels (optional)
ALTER TABLE vessel_models
    ADD COLUMN IF NOT EXISTS project_vessel_id UUID REFERENCES project_vessels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vessel_models_project_vessel ON vessel_models(project_vessel_id);

-- ============================================================================
-- Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS update_inspection_projects_updated_at ON inspection_projects;
CREATE TRIGGER update_inspection_projects_updated_at
    BEFORE UPDATE ON inspection_projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_vessels_updated_at ON project_vessels;
CREATE TRIGGER update_project_vessels_updated_at
    BEFORE UPDATE ON project_vessels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE inspection_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- inspection_projects policies
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can view org inspection projects"
    ON inspection_projects FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = inspection_projects.organization_id
        )
    );

CREATE POLICY "Users can create inspection projects"
    ON inspection_projects FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = inspection_projects.organization_id
        )
    );

CREATE POLICY "Owner or editors can update inspection projects"
    ON inspection_projects FOR UPDATE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = inspection_projects.organization_id
              AND profiles.role IN ('editor', 'org_admin', 'admin')
        )
    );

CREATE POLICY "Owner or editors can delete inspection projects"
    ON inspection_projects FOR DELETE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = inspection_projects.organization_id
              AND profiles.role IN ('editor', 'org_admin', 'admin')
        )
    );

-- ----------------------------------------------------------------------------
-- project_vessels policies (inherit from parent project)
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can view org project vessels"
    ON project_vessels FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = project_vessels.project_id
              AND p.id = auth.uid()
        )
    );

CREATE POLICY "Users can create project vessels"
    ON project_vessels FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = project_vessels.project_id
              AND p.id = auth.uid()
        )
    );

CREATE POLICY "Users can update project vessels"
    ON project_vessels FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = project_vessels.project_id
              AND p.id = auth.uid()
              AND (ip.created_by = auth.uid() OR p.role IN ('editor', 'org_admin', 'admin'))
        )
    );

CREATE POLICY "Users can delete project vessels"
    ON project_vessels FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = project_vessels.project_id
              AND p.id = auth.uid()
              AND (ip.created_by = auth.uid() OR p.role IN ('editor', 'org_admin', 'admin'))
        )
    );

-- ----------------------------------------------------------------------------
-- project_files policies (inherit from parent project)
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can view org project files"
    ON project_files FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = project_files.project_id
              AND p.id = auth.uid()
        )
    );

CREATE POLICY "Users can upload project files"
    ON project_files FOR INSERT
    TO authenticated
    WITH CHECK (
        uploaded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = project_files.project_id
              AND p.id = auth.uid()
        )
    );

CREATE POLICY "Users can delete project files"
    ON project_files FOR DELETE
    TO authenticated
    USING (
        uploaded_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = project_files.project_id
              AND p.id = auth.uid()
              AND p.role IN ('editor', 'org_admin', 'admin')
        )
    );

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE inspection_projects IS 'Inspection campaigns/trips grouping multiple vessel inspections at a site';
COMMENT ON TABLE project_vessels IS 'Individual vessel inspections within a project, linked to 3D models and scan composites';
COMMENT ON TABLE project_files IS 'General-purpose file registry for project assets (drawings, photos, reports, NDE files)';
COMMENT ON COLUMN inspection_projects.equipment IS 'Shared equipment config JSON: { model, probe, wedge, calibration_blocks, procedure_ref }';
COMMENT ON COLUMN project_vessels.coverage_target_pct IS 'Required coverage percentage (e.g., 40.00 for 40%)';
COMMENT ON COLUMN project_vessels.coverage_actual_pct IS 'Computed coverage percentage based on scan composites';
