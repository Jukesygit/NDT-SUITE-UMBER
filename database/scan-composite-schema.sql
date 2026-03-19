-- Scan Composite & Vessel Model Schema
-- Tables for storing C-scan composite data and vessel model configurations

-- ============================================================================
-- Table: scan_composites
-- Stores merged C-scan thickness data from CSV imports
-- ============================================================================
CREATE TABLE IF NOT EXISTS scan_composites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    thickness_data JSONB NOT NULL,
    x_axis JSONB NOT NULL,
    y_axis JSONB NOT NULL,
    stats JSONB,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    source_files JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Table: vessel_models
-- Stores vessel geometry configuration and display state
-- ============================================================================
CREATE TABLE IF NOT EXISTS vessel_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Table: vessel_scan_placements
-- Links scan composites to vessel models with positioning metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS vessel_scan_placements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vessel_model_id UUID NOT NULL REFERENCES vessel_models(id) ON DELETE CASCADE,
    scan_composite_id UUID NOT NULL REFERENCES scan_composites(id) ON DELETE CASCADE,
    index_start_mm DOUBLE PRECISION NOT NULL,
    scan_direction TEXT NOT NULL DEFAULT 'cw'
        CHECK (scan_direction IN ('cw', 'ccw')),
    index_direction TEXT NOT NULL DEFAULT 'forward'
        CHECK (index_direction IN ('forward', 'reverse')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_scan_composites_organization
    ON scan_composites(organization_id);
CREATE INDEX IF NOT EXISTS idx_scan_composites_created_by
    ON scan_composites(created_by);

CREATE INDEX IF NOT EXISTS idx_vessel_models_organization
    ON vessel_models(organization_id);
CREATE INDEX IF NOT EXISTS idx_vessel_models_created_by
    ON vessel_models(created_by);

CREATE INDEX IF NOT EXISTS idx_vessel_scan_placements_vessel
    ON vessel_scan_placements(vessel_model_id);
CREATE INDEX IF NOT EXISTS idx_vessel_scan_placements_scan
    ON vessel_scan_placements(scan_composite_id);

-- ============================================================================
-- Trigger: updated_at for vessel_models
-- ============================================================================
CREATE TRIGGER update_vessel_models_updated_at
    BEFORE UPDATE ON vessel_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE scan_composites ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessel_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessel_scan_placements ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- scan_composites policies
-- ----------------------------------------------------------------------------

-- SELECT: Users can view composites belonging to their organization
CREATE POLICY "Users can view org scan composites"
    ON scan_composites FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = scan_composites.organization_id
        )
    );

-- INSERT: Users can create composites in their own organization
CREATE POLICY "Users can create scan composites"
    ON scan_composites FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = scan_composites.organization_id
        )
    );

-- DELETE: Only the creator or admins can delete
CREATE POLICY "Owner can delete scan composites"
    ON scan_composites FOR DELETE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = scan_composites.organization_id
              AND profiles.role IN ('admin', 'org_admin')
        )
    );

-- ----------------------------------------------------------------------------
-- vessel_models policies
-- ----------------------------------------------------------------------------

-- SELECT: Users can view vessel models in their organization
CREATE POLICY "Users can view org vessel models"
    ON vessel_models FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = vessel_models.organization_id
        )
    );

-- INSERT: Users can create vessel models in their own organization
CREATE POLICY "Users can create vessel models"
    ON vessel_models FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = vessel_models.organization_id
        )
    );

-- UPDATE: Only the creator or admins can update
CREATE POLICY "Owner can update vessel models"
    ON vessel_models FOR UPDATE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = vessel_models.organization_id
              AND profiles.role IN ('admin', 'org_admin')
        )
    );

-- DELETE: Only the creator or admins can delete
CREATE POLICY "Owner can delete vessel models"
    ON vessel_models FOR DELETE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id = vessel_models.organization_id
              AND profiles.role IN ('admin', 'org_admin')
        )
    );

-- ----------------------------------------------------------------------------
-- vessel_scan_placements policies
-- ----------------------------------------------------------------------------

-- SELECT: Users can view placements for vessel models in their organization
CREATE POLICY "Users can view org vessel scan placements"
    ON vessel_scan_placements FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM vessel_models vm
            JOIN profiles p ON p.organization_id = vm.organization_id
            WHERE vm.id = vessel_scan_placements.vessel_model_id
              AND p.id = auth.uid()
        )
    );

-- INSERT/UPDATE/DELETE: Only vessel model owner or admins
CREATE POLICY "Owner can manage vessel scan placements"
    ON vessel_scan_placements FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM vessel_models vm
            WHERE vm.id = vessel_scan_placements.vessel_model_id
              AND (
                  vm.created_by = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM profiles p
                      WHERE p.id = auth.uid()
                        AND p.organization_id = vm.organization_id
                        AND p.role IN ('admin', 'org_admin')
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM vessel_models vm
            WHERE vm.id = vessel_scan_placements.vessel_model_id
              AND (
                  vm.created_by = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM profiles p
                      WHERE p.id = auth.uid()
                        AND p.organization_id = vm.organization_id
                        AND p.role IN ('admin', 'org_admin')
                  )
              )
        )
    );

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE scan_composites IS 'Merged C-scan thickness data composites from CSV imports';
COMMENT ON TABLE vessel_models IS 'Vessel geometry configurations for the 3D vessel modeler';
COMMENT ON TABLE vessel_scan_placements IS 'Links scan composites to vessel models with positioning and direction metadata';
