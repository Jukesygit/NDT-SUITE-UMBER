-- Asset Sharing Schema for NDT Suite
-- This enables admins to share assets and their subfolders/scans with other organizations

-- Shared assets table
CREATE TABLE IF NOT EXISTS shared_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    shared_with_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL, -- References the asset ID in IndexedDB
    vessel_id TEXT, -- Optional: Share specific vessel only
    scan_id TEXT, -- Optional: Share specific scan only
    share_type TEXT NOT NULL CHECK (share_type IN ('asset', 'vessel', 'scan')),
    permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
    shared_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_share UNIQUE (owner_organization_id, shared_with_organization_id, asset_id, vessel_id, scan_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_shared_assets_owner ON shared_assets(owner_organization_id);
CREATE INDEX IF NOT EXISTS idx_shared_assets_shared_with ON shared_assets(shared_with_organization_id);
CREATE INDEX IF NOT EXISTS idx_shared_assets_asset_id ON shared_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_shared_assets_vessel_id ON shared_assets(vessel_id);
CREATE INDEX IF NOT EXISTS idx_shared_assets_scan_id ON shared_assets(scan_id);

-- Enable Row Level Security (RLS)
ALTER TABLE shared_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shared_assets
-- Admins can view all shares
-- Organizations can view shares they own or are recipients of
CREATE POLICY "Users can view relevant shares"
    ON shared_assets FOR SELECT
    USING (
        -- Admins can see all
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        OR
        -- Users can see shares involving their organization
        owner_organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
        OR
        shared_with_organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Only admins can create shares
CREATE POLICY "Only admins can create shares"
    ON shared_assets FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can update shares
CREATE POLICY "Only admins can update shares"
    ON shared_assets FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can delete shares
CREATE POLICY "Only admins can delete shares"
    ON shared_assets FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Trigger for updated_at
CREATE TRIGGER update_shared_assets_updated_at
    BEFORE UPDATE ON shared_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get all assets shared with a specific organization
CREATE OR REPLACE FUNCTION get_shared_assets_for_organization(org_id UUID)
RETURNS TABLE (
    share_id UUID,
    owner_org_id UUID,
    owner_org_name TEXT,
    asset_id TEXT,
    vessel_id TEXT,
    scan_id TEXT,
    share_type TEXT,
    permission TEXT,
    shared_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.id,
        sa.owner_organization_id,
        o.name,
        sa.asset_id,
        sa.vessel_id,
        sa.scan_id,
        sa.share_type,
        sa.permission,
        sa.created_at
    FROM shared_assets sa
    JOIN organizations o ON sa.owner_organization_id = o.id
    WHERE sa.shared_with_organization_id = org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all organizations an asset is shared with
CREATE OR REPLACE FUNCTION get_organizations_for_shared_asset(
    p_owner_org_id UUID,
    p_asset_id TEXT,
    p_vessel_id TEXT DEFAULT NULL,
    p_scan_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    share_id UUID,
    organization_id UUID,
    organization_name TEXT,
    permission TEXT,
    shared_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.id,
        o.id,
        o.name,
        sa.permission,
        sa.created_at
    FROM shared_assets sa
    JOIN organizations o ON sa.shared_with_organization_id = o.id
    WHERE sa.owner_organization_id = p_owner_org_id
    AND sa.asset_id = p_asset_id
    AND (p_vessel_id IS NULL OR sa.vessel_id = p_vessel_id)
    AND (p_scan_id IS NULL OR sa.scan_id = p_scan_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
