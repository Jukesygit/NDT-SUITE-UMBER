-- ============================================
-- Inspections Table Migration
-- ============================================
-- Adds a dedicated inspections table to allow named inspections
-- with metadata like status, inspector, date, and notes
-- ============================================

-- ============================================
-- INSPECTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS inspections (
    id TEXT PRIMARY KEY,
    vessel_id TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('planned', 'in_progress', 'completed', 'on_hold')),
    inspector_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    inspection_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_inspections_vessel_id ON inspections(vessel_id);
CREATE INDEX IF NOT EXISTS idx_inspections_inspector_id ON inspections(inspector_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
CREATE INDEX IF NOT EXISTS idx_inspections_created_at ON inspections(created_at DESC);

-- ============================================
-- Add inspection_id to related tables
-- ============================================

-- Add inspection_id to scans (optional - scans can belong to an inspection)
ALTER TABLE scans ADD COLUMN IF NOT EXISTS inspection_id TEXT REFERENCES inspections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_scans_inspection_id ON scans(inspection_id);

-- Add inspection_id to vessel_images (optional - images can belong to an inspection)
ALTER TABLE vessel_images ADD COLUMN IF NOT EXISTS inspection_id TEXT REFERENCES inspections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vessel_images_inspection_id ON vessel_images(inspection_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

-- SELECT: Can view inspections if can view parent vessel
CREATE POLICY "Users can view inspections from accessible vessels" ON inspections FOR SELECT
USING (
    -- SYSTEM or Matrix org can see all inspections
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Inspections from accessible vessels
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE
            a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            OR a.id IN (
                SELECT asset_id FROM shared_assets
                WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            )
    )
);

-- INSERT: Can create inspections if can access parent vessel
CREATE POLICY "Users can create inspections in accessible vessels" ON inspections FOR INSERT
WITH CHECK (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- UPDATE: Can update inspections if can update parent vessel
CREATE POLICY "Users can update inspections in own org" ON inspections FOR UPDATE
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- DELETE: Can delete inspections if can delete parent vessel
CREATE POLICY "Editors can delete inspections" ON inspections FOR DELETE
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- Trigger for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_inspections_updated_at ON inspections;
CREATE TRIGGER update_inspections_updated_at
    BEFORE UPDATE ON inspections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE inspections IS 'Named inspection records that group scans, images, and notes for a specific inspection event';
COMMENT ON COLUMN inspections.name IS 'User-defined name for the inspection (e.g., "Annual Inspection 2024", "Pre-service Check")';
COMMENT ON COLUMN inspections.status IS 'Current status: planned, in_progress, completed, or on_hold';
COMMENT ON COLUMN inspections.inspector_id IS 'User who performed or is performing the inspection';
COMMENT ON COLUMN inspections.inspection_date IS 'Date when the inspection was/will be performed';
COMMENT ON COLUMN inspections.notes IS 'Free-form notes about the inspection';
