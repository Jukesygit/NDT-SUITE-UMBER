-- ============================================
-- NDT Suite - Assets, Vessels, and Scans Schema
-- ============================================
-- This schema creates tables to store actual asset data in Supabase
-- allowing cross-device synchronization and sharing

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ASSETS TABLE
-- ============================================
-- Stores top-level assets (structures being inspected)
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_assets_org_id ON assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_assets_created_by ON assets(created_by);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);

-- ============================================
-- VESSELS TABLE
-- ============================================
-- Stores vessels/components within assets
CREATE TABLE IF NOT EXISTS vessels (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    model_3d_url TEXT, -- URL to 3D model in Supabase Storage
    model_3d_filename TEXT, -- Original filename
    model_3d_size INTEGER, -- File size in bytes
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_vessels_asset_id ON vessels(asset_id);
CREATE INDEX IF NOT EXISTS idx_vessels_created_at ON vessels(created_at DESC);

-- ============================================
-- VESSEL IMAGES TABLE
-- ============================================
-- Stores photos/images of vessels
CREATE TABLE IF NOT EXISTS vessel_images (
    id TEXT PRIMARY KEY,
    vessel_id TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL, -- URL to image in Supabase Storage
    image_filename TEXT, -- Original filename
    image_size INTEGER, -- File size in bytes
    thumbnail_url TEXT, -- Optional thumbnail URL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_vessel_images_vessel_id ON vessel_images(vessel_id);
CREATE INDEX IF NOT EXISTS idx_vessel_images_created_at ON vessel_images(created_at DESC);

-- ============================================
-- SCANS TABLE
-- ============================================
-- Stores inspection scans (PEC, C-Scan, 3D View)
CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    vessel_id TEXT NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tool_type TEXT NOT NULL CHECK (tool_type IN ('pec', 'cscan', '3dview')),
    data JSONB, -- Scan data (for small scans)
    data_url TEXT, -- URL to scan data file in Supabase Storage (for large scans)
    thumbnail_url TEXT, -- URL to thumbnail in Supabase Storage
    heatmap_url TEXT, -- URL to heatmap image in Supabase Storage
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_scans_vessel_id ON scans(vessel_id);
CREATE INDEX IF NOT EXISTS idx_scans_tool_type ON scans(tool_type);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);

-- ============================================
-- SYNC METADATA TABLE
-- ============================================
-- Tracks sync status for conflict resolution
CREATE TABLE IF NOT EXISTS sync_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('asset', 'vessel', 'vessel_image', 'scan')),
    entity_id TEXT NOT NULL,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    device_id TEXT, -- Optional device identifier
    sync_version INTEGER DEFAULT 1, -- For conflict resolution
    UNIQUE(user_id, entity_type, entity_id, device_id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_sync_metadata_user ON sync_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_metadata_entity ON sync_metadata(entity_type, entity_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessel_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ASSETS RLS POLICIES
-- ============================================

-- SELECT: Users can view assets from their org OR shared with their org
CREATE POLICY "Users can view accessible assets" ON assets FOR SELECT
USING (
    -- Own organization's assets
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR
    -- Assets shared with their organization
    id IN (
        SELECT asset_id
        FROM shared_assets
        WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- INSERT: Users can create assets in their organization
CREATE POLICY "Users can create assets in their org" ON assets FOR INSERT
WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
);

-- UPDATE: Users can update assets in their org (if they have permission)
CREATE POLICY "Users can update own org assets" ON assets FOR UPDATE
USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (
        -- Asset owner
        created_by = auth.uid()
        OR
        -- Editor or higher role
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- DELETE: Only editors and above can delete
CREATE POLICY "Editors can delete own org assets" ON assets FOR DELETE
USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
);

-- ============================================
-- VESSELS RLS POLICIES
-- ============================================

-- SELECT: Can view vessels if can view parent asset
CREATE POLICY "Users can view vessels from accessible assets" ON vessels FOR SELECT
USING (
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        OR id IN (SELECT asset_id FROM shared_assets WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    )
);

-- INSERT: Can create vessels if can access parent asset
CREATE POLICY "Users can create vessels in accessible assets" ON vessels FOR INSERT
WITH CHECK (
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- UPDATE: Can update vessels if can update parent asset
CREATE POLICY "Users can update vessels in own org" ON vessels FOR UPDATE
USING (
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (
            created_by = auth.uid()
            OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
        )
    )
);

-- DELETE: Can delete vessels if can delete parent asset
CREATE POLICY "Editors can delete vessels" ON vessels FOR DELETE
USING (
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- VESSEL IMAGES RLS POLICIES
-- ============================================

-- SELECT: Can view images if can view parent vessel
CREATE POLICY "Users can view images from accessible vessels" ON vessel_images FOR SELECT
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        OR a.id IN (SELECT asset_id FROM shared_assets WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    )
);

-- INSERT: Can add images if can access parent vessel
CREATE POLICY "Users can add images to accessible vessels" ON vessel_images FOR INSERT
WITH CHECK (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- UPDATE: Can update images if can update parent vessel
CREATE POLICY "Users can update images in own org" ON vessel_images FOR UPDATE
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- DELETE: Can delete images if can delete parent vessel
CREATE POLICY "Editors can delete images" ON vessel_images FOR DELETE
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- SCANS RLS POLICIES
-- ============================================

-- SELECT: Can view scans if can view parent vessel
CREATE POLICY "Users can view scans from accessible vessels" ON scans FOR SELECT
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        OR a.id IN (SELECT asset_id FROM shared_assets WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
    )
);

-- INSERT: Can create scans if can access parent vessel
CREATE POLICY "Users can create scans in accessible vessels" ON scans FOR INSERT
WITH CHECK (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- UPDATE: Can update scans if can update parent vessel
CREATE POLICY "Users can update scans in own org" ON scans FOR UPDATE
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- DELETE: Can delete scans if can delete parent vessel
CREATE POLICY "Editors can delete scans" ON scans FOR DELETE
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- SYNC METADATA RLS POLICIES
-- ============================================

-- Users can only see and manage their own sync metadata
CREATE POLICY "Users can view own sync metadata" ON sync_metadata FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create own sync metadata" ON sync_metadata FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sync metadata" ON sync_metadata FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own sync metadata" ON sync_metadata FOR DELETE
USING (user_id = auth.uid());

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_assets_updated_at ON assets;
CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vessels_updated_at ON vessels;
CREATE TRIGGER update_vessels_updated_at
    BEFORE UPDATE ON vessels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scans_updated_at ON scans;
CREATE TRIGGER update_scans_updated_at
    BEFORE UPDATE ON scans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- UTILITY FUNCTIONS FOR QUERIES
-- ============================================

-- Get all assets accessible to current user (own org + shared)
CREATE OR REPLACE FUNCTION get_accessible_assets()
RETURNS SETOF assets AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT a.*
    FROM assets a
    WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR a.id IN (
        SELECT asset_id
        FROM shared_assets
        WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    ORDER BY a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get full asset hierarchy (asset -> vessels -> scans) for a specific asset
CREATE OR REPLACE FUNCTION get_asset_hierarchy(p_asset_id TEXT)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'asset', row_to_json(a.*),
        'vessels', (
            SELECT json_agg(
                json_build_object(
                    'vessel', row_to_json(v.*),
                    'images', (
                        SELECT json_agg(row_to_json(vi.*))
                        FROM vessel_images vi
                        WHERE vi.vessel_id = v.id
                        ORDER BY vi.created_at DESC
                    ),
                    'scans', (
                        SELECT json_agg(row_to_json(s.*))
                        FROM scans s
                        WHERE s.vessel_id = v.id
                        ORDER BY s.created_at DESC
                    )
                )
            )
            FROM vessels v
            WHERE v.asset_id = a.id
            ORDER BY v.created_at DESC
        )
    ) INTO result
    FROM assets a
    WHERE a.id = p_asset_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE assets IS 'Stores top-level assets (structures being inspected)';
COMMENT ON TABLE vessels IS 'Stores vessels/components within assets with optional 3D models';
COMMENT ON TABLE vessel_images IS 'Stores photos and images of vessels';
COMMENT ON TABLE scans IS 'Stores inspection scans (PEC, C-Scan, 3D View) with data and visualizations';
COMMENT ON TABLE sync_metadata IS 'Tracks synchronization status for offline-first architecture';

COMMENT ON COLUMN assets.metadata IS 'Additional JSON metadata for extensibility';
COMMENT ON COLUMN vessels.model_3d_url IS 'URL to 3D model file (.obj) in Supabase Storage';
COMMENT ON COLUMN scans.data IS 'Small scan data stored inline as JSONB';
COMMENT ON COLUMN scans.data_url IS 'URL to large scan data file in Supabase Storage';
