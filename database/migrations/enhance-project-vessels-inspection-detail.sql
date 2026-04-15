-- ============================================================================
-- Migration: Enhanced Inspection Detail
-- ============================================================================
-- Adds inspection detail fields to project_vessels, new tables for procedures,
-- scan log entries, and calibration log entries. Extends project_files file
-- types and adds report header fields to inspection_projects.
-- ============================================================================

-- ============================================================================
-- 1. inspection_procedures table (CREATED FIRST — referenced by FK below)
-- ============================================================================
-- Separate table because procedures are shared across vessels in a project.

CREATE TABLE IF NOT EXISTS inspection_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES inspection_projects(id) ON DELETE CASCADE,
    procedure_number TEXT,
    technique_numbers TEXT,
    acceptance_criteria TEXT,
    applicable_standard TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_procedures_project ON inspection_procedures(project_id);
ALTER TABLE inspection_procedures ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_inspection_procedures_updated_at ON inspection_procedures;
CREATE TRIGGER update_inspection_procedures_updated_at
    BEFORE UPDATE ON inspection_procedures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Users can view org procedures" ON inspection_procedures FOR SELECT
    TO authenticated USING (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = inspection_procedures.project_id AND p.id = auth.uid()
        )
    );

CREATE POLICY "Users can manage procedures" ON inspection_procedures FOR ALL
    TO authenticated USING (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = inspection_procedures.project_id AND p.id = auth.uid()
              AND (ip.created_by = auth.uid() OR p.role IN ('editor', 'org_admin', 'admin'))
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM inspection_projects ip
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE ip.id = inspection_procedures.project_id AND p.id = auth.uid()
              AND (ip.created_by = auth.uid() OR p.role IN ('editor', 'org_admin', 'admin'))
        )
    );

-- ============================================================================
-- 2. New columns on project_vessels
-- ============================================================================

-- Vessel engineering details
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS drawing_number TEXT;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS nominal_thickness TEXT;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS shell_thickness TEXT;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS operating_temperature TEXT;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS line_tag_number TEXT;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS corrosion_allowance TEXT;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS coating_type TEXT;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS stress_relief TEXT;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS is_insulated BOOLEAN DEFAULT FALSE;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS shell_area_sqm NUMERIC(10,2);
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS coating_correction TEXT;

-- Per-vessel equipment config
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS equipment_config JSONB DEFAULT '{}';
-- Shape: { model, serial_no, probe, wedge, calibration_blocks, scanner_frame,
--          ref_blocks, couplant, equipment_checks_ref }

-- Beamset configuration rows
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS beamset_config JSONB DEFAULT '[]';
-- Shape: [{ group, type, active_elements, aperture, focal_depth, angle, skew, index_offset }]

-- Inspection results summary (plain text)
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS results_summary TEXT;

-- Sign-off / personnel details
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS signoff_details JSONB DEFAULT '{}';
-- Shape: { technician: { name, qualification, date },
--          reviewer: { name, qualification, date },
--          client: { name, position, date } }

-- Link to shared procedure
ALTER TABLE project_vessels ADD COLUMN IF NOT EXISTS procedure_id UUID
    REFERENCES inspection_procedures(id) ON DELETE SET NULL;

-- ============================================================================
-- 3. New columns on inspection_projects (report header fields)
-- ============================================================================

ALTER TABLE inspection_projects ADD COLUMN IF NOT EXISTS report_number TEXT;
ALTER TABLE inspection_projects ADD COLUMN IF NOT EXISTS contract_number TEXT;
ALTER TABLE inspection_projects ADD COLUMN IF NOT EXISTS work_order_number TEXT;

-- ============================================================================
-- 4. scan_log_entries table
-- ============================================================================

CREATE TABLE IF NOT EXISTS scan_log_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_vessel_id UUID NOT NULL REFERENCES project_vessels(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    date_inspected DATE,
    setup_file_name TEXT,
    scan_start_x NUMERIC(10,2),
    scan_end_x NUMERIC(10,2),
    index_start_y NUMERIC(10,2),
    index_end_y NUMERIC(10,2),
    scan_index_datum TEXT,
    coating_correction TEXT,
    min_wt NUMERIC(8,3),
    comments TEXT,
    scan_composite_id UUID REFERENCES scan_composites(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_log_entries_vessel ON scan_log_entries(project_vessel_id);
ALTER TABLE scan_log_entries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_scan_log_entries_updated_at ON scan_log_entries;
CREATE TRIGGER update_scan_log_entries_updated_at
    BEFORE UPDATE ON scan_log_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Users can view org scan log entries" ON scan_log_entries FOR SELECT
    TO authenticated USING (
        EXISTS (
            SELECT 1 FROM project_vessels pv
            JOIN inspection_projects ip ON ip.id = pv.project_id
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE pv.id = scan_log_entries.project_vessel_id AND p.id = auth.uid()
        )
    );

CREATE POLICY "Users can manage scan log entries" ON scan_log_entries FOR ALL
    TO authenticated USING (
        EXISTS (
            SELECT 1 FROM project_vessels pv
            JOIN inspection_projects ip ON ip.id = pv.project_id
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE pv.id = scan_log_entries.project_vessel_id AND p.id = auth.uid()
              AND (ip.created_by = auth.uid() OR p.role IN ('editor', 'org_admin', 'admin'))
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM project_vessels pv
            JOIN inspection_projects ip ON ip.id = pv.project_id
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE pv.id = scan_log_entries.project_vessel_id AND p.id = auth.uid()
              AND (ip.created_by = auth.uid() OR p.role IN ('editor', 'org_admin', 'admin'))
        )
    );

-- ============================================================================
-- 5. calibration_log_entries table
-- ============================================================================

CREATE TABLE IF NOT EXISTS calibration_log_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_vessel_id UUID NOT NULL REFERENCES project_vessels(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    setup_file TEXT,
    cal_date DATE,
    scan_start TEXT,
    scan_end TEXT,
    ref_a_wt NUMERIC(8,3),
    meas_a_wt NUMERIC(8,3),
    velocity NUMERIC(10,2),
    comments TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calibration_log_entries_vessel ON calibration_log_entries(project_vessel_id);
ALTER TABLE calibration_log_entries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_calibration_log_entries_updated_at ON calibration_log_entries;
CREATE TRIGGER update_calibration_log_entries_updated_at
    BEFORE UPDATE ON calibration_log_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Users can view org calibration log entries" ON calibration_log_entries FOR SELECT
    TO authenticated USING (
        EXISTS (
            SELECT 1 FROM project_vessels pv
            JOIN inspection_projects ip ON ip.id = pv.project_id
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE pv.id = calibration_log_entries.project_vessel_id AND p.id = auth.uid()
        )
    );

CREATE POLICY "Users can manage calibration log entries" ON calibration_log_entries FOR ALL
    TO authenticated USING (
        EXISTS (
            SELECT 1 FROM project_vessels pv
            JOIN inspection_projects ip ON ip.id = pv.project_id
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE pv.id = calibration_log_entries.project_vessel_id AND p.id = auth.uid()
              AND (ip.created_by = auth.uid() OR p.role IN ('editor', 'org_admin', 'admin'))
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM project_vessels pv
            JOIN inspection_projects ip ON ip.id = pv.project_id
            JOIN profiles p ON p.organization_id = ip.organization_id
            WHERE pv.id = calibration_log_entries.project_vessel_id AND p.id = auth.uid()
              AND (ip.created_by = auth.uid() OR p.role IN ('editor', 'org_admin', 'admin'))
        )
    );

-- ============================================================================
-- 6. Extend project_files file_type CHECK constraint
-- ============================================================================

ALTER TABLE project_files DROP CONSTRAINT IF EXISTS project_files_file_type_check;
ALTER TABLE project_files ADD CONSTRAINT project_files_file_type_check
    CHECK (file_type IN (
        'ga_drawing', 'location_drawing', 'pid_drawing', 'rba_file',
        'photo', 'reference', 'report', 'nde_file', 'other'
    ));

-- ============================================================================
-- 7. Storage bucket for project files
-- ============================================================================
-- The upload service uses path: {projectId}/{vesselId}/{uuid}.{ext}
-- RLS is enforced at the project_files table level, so storage policies
-- just need to allow authenticated users to manage files in this bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
    'project-files',
    'project-files',
    false,
    104857600 -- 100MB limit
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies scoped by organization: the first path segment is the project ID,
-- which must belong to the user's organization.

CREATE POLICY "Users can upload project files for own org"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] IN (
        SELECT ip.id::text FROM inspection_projects ip
        JOIN profiles p ON p.organization_id = ip.organization_id
        WHERE p.id = auth.uid()
    )
);

CREATE POLICY "Users can read project files for own org"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] IN (
        SELECT ip.id::text FROM inspection_projects ip
        JOIN profiles p ON p.organization_id = ip.organization_id
        WHERE p.id = auth.uid()
    )
);

CREATE POLICY "Users can delete project files for own org"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] IN (
        SELECT ip.id::text FROM inspection_projects ip
        JOIN profiles p ON p.organization_id = ip.organization_id
        WHERE p.id = auth.uid()
    )
);
