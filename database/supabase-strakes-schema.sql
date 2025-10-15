-- ============================================
-- NDT Suite - Strakes Schema
-- ============================================
-- This schema adds support for strakes (vessel sections) with coverage tracking

-- ============================================
-- STRAKES TABLE
-- ============================================
-- Stores strake definitions for vessels
CREATE TABLE IF NOT EXISTS strakes (
    id TEXT PRIMARY KEY,
    vessel_id TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    total_area DOUBLE PRECISION NOT NULL DEFAULT 0, -- Total area in m²
    required_coverage DOUBLE PRECISION NOT NULL DEFAULT 100, -- Required coverage percentage
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_strakes_vessel_id ON strakes(vessel_id);
CREATE INDEX IF NOT EXISTS idx_strakes_created_at ON strakes(created_at DESC);

-- Add strake_id to scans table to link scans to strakes
ALTER TABLE scans ADD COLUMN IF NOT EXISTS strake_id TEXT REFERENCES strakes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_scans_strake_id ON scans(strake_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE strakes ENABLE ROW LEVEL SECURITY;

-- SELECT: Can view strakes if can view parent vessel
CREATE POLICY "Users can view strakes from accessible vessels" ON strakes FOR SELECT
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        OR a.id IN (SELECT asset_id FROM shared_assets WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    )
);

-- INSERT: Can create strakes if can access parent vessel
CREATE POLICY "Users can create strakes in accessible vessels" ON strakes FOR INSERT
WITH CHECK (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- UPDATE: Can update strakes if can update parent vessel
CREATE POLICY "Users can update strakes in own org" ON strakes FOR UPDATE
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- DELETE: Can delete strakes if can delete parent vessel
CREATE POLICY "Editors can delete strakes" ON strakes FOR DELETE
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- TRIGGERS
-- ============================================

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_strakes_updated_at ON strakes;
CREATE TRIGGER update_strakes_updated_at
    BEFORE UPDATE ON strakes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE strakes IS 'Stores strake definitions (vessel sections) with area and coverage requirements';
COMMENT ON COLUMN strakes.total_area IS 'Total surface area of the strake in square meters (m²)';
COMMENT ON COLUMN strakes.required_coverage IS 'Required coverage percentage (0-100)';
COMMENT ON COLUMN scans.strake_id IS 'Reference to strake that this scan belongs to (optional)';
