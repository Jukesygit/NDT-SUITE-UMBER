-- ============================================
-- User-Level Asset Access Migration
-- ============================================
-- This migration adds user-level granular access control:
-- 1. SYSTEM org users still see ALL assets
-- 2. Organization members see their org's assets
-- 3. Individual users can be granted access to specific assets/vessels
-- 4. Sharing still works via shared_assets table
-- ============================================

-- ============================================
-- Create user_asset_access table
-- ============================================

CREATE TABLE IF NOT EXISTS user_asset_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_level TEXT NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'write', 'admin')),
    notes TEXT,

    -- Prevent duplicate grants
    UNIQUE(user_id, asset_id)
);

-- Add indexes for performance
CREATE INDEX idx_user_asset_access_user ON user_asset_access(user_id);
CREATE INDEX idx_user_asset_access_asset ON user_asset_access(asset_id);
CREATE INDEX idx_user_asset_access_granted_at ON user_asset_access(granted_at DESC);

-- Enable RLS on the new table
ALTER TABLE user_asset_access ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_asset_access table
-- Users can see their own access grants
CREATE POLICY "Users can view their own asset access grants" ON user_asset_access FOR SELECT
USING (
    user_id = auth.uid()
    OR
    -- SYSTEM org can see all grants
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
        (SELECT id FROM organizations WHERE name = 'SYSTEM')
    OR
    -- Admin users in the asset's organization can see grants for their assets
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- Only SYSTEM org and asset owners can grant access
CREATE POLICY "SYSTEM org and asset owners can grant access" ON user_asset_access FOR INSERT
WITH CHECK (
    -- SYSTEM org can grant access to any asset
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
        (SELECT id FROM organizations WHERE name = 'SYSTEM')
    OR
    -- Users can grant access to their organization's assets
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- Only SYSTEM org and asset owners can revoke access
CREATE POLICY "SYSTEM org and asset owners can revoke access" ON user_asset_access FOR DELETE
USING (
    -- SYSTEM org can revoke any access
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
        (SELECT id FROM organizations WHERE name = 'SYSTEM')
    OR
    -- Users can revoke access to their organization's assets
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- Only SYSTEM org and asset owners can update access
CREATE POLICY "SYSTEM org and asset owners can update access" ON user_asset_access FOR UPDATE
USING (
    -- SYSTEM org can update any access
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
        (SELECT id FROM organizations WHERE name = 'SYSTEM')
    OR
    -- Users can update access to their organization's assets
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- ============================================
-- Update ASSETS RLS policies with user-level access
-- ============================================

DROP POLICY IF EXISTS "Users can view accessible assets" ON assets;

CREATE POLICY "Users can view accessible assets" ON assets FOR SELECT
USING (
    -- SYSTEM organization can see ALL assets
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
        (SELECT id FROM organizations WHERE name = 'SYSTEM')
    OR
    -- Own organization's assets
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR
    -- Assets shared with their organization
    id IN (
        SELECT asset_id
        FROM shared_assets
        WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    OR
    -- Assets specifically granted to this user
    id IN (
        SELECT asset_id
        FROM user_asset_access
        WHERE user_id = auth.uid()
    )
);

-- ============================================
-- Update VESSELS RLS policies
-- ============================================

DROP POLICY IF EXISTS "Users can view vessels from accessible assets" ON vessels;

CREATE POLICY "Users can view vessels from accessible assets" ON vessels FOR SELECT
USING (
    asset_id IN (
        SELECT id FROM assets
        WHERE
            -- SYSTEM org can see all
            (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
                (SELECT id FROM organizations WHERE name = 'SYSTEM')
            OR
            -- Own org's assets
            organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            OR
            -- Shared assets
            id IN (
                SELECT asset_id FROM shared_assets
                WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            )
            OR
            -- User-specific access
            id IN (
                SELECT asset_id FROM user_asset_access
                WHERE user_id = auth.uid()
            )
    )
);

-- ============================================
-- Update VESSEL IMAGES RLS policies
-- ============================================

DROP POLICY IF EXISTS "Users can view images from accessible vessels" ON vessel_images;

CREATE POLICY "Users can view images from accessible vessels" ON vessel_images FOR SELECT
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE
            -- SYSTEM org can see all
            (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
                (SELECT id FROM organizations WHERE name = 'SYSTEM')
            OR
            -- Own org's assets
            a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            OR
            -- Shared assets
            a.id IN (
                SELECT asset_id FROM shared_assets
                WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            )
            OR
            -- User-specific access
            a.id IN (
                SELECT asset_id FROM user_asset_access
                WHERE user_id = auth.uid()
            )
    )
);

-- ============================================
-- Update SCANS RLS policies
-- ============================================

DROP POLICY IF EXISTS "Users can view scans from accessible vessels" ON scans;

CREATE POLICY "Users can view scans from accessible vessels" ON scans FOR SELECT
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE
            -- SYSTEM org can see all
            (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
                (SELECT id FROM organizations WHERE name = 'SYSTEM')
            OR
            -- Own org's assets
            a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            OR
            -- Shared assets
            a.id IN (
                SELECT asset_id FROM shared_assets
                WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            )
            OR
            -- User-specific access
            a.id IN (
                SELECT asset_id FROM user_asset_access
                WHERE user_id = auth.uid()
            )
    )
);

-- ============================================
-- Update STRAKES RLS policies
-- ============================================

DROP POLICY IF EXISTS "Users can view strakes from accessible vessels" ON strakes;

CREATE POLICY "Users can view strakes from accessible vessels" ON strakes FOR SELECT
USING (
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE
            -- SYSTEM org can see all
            (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
                (SELECT id FROM organizations WHERE name = 'SYSTEM')
            OR
            -- Own org's assets
            a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            OR
            -- Shared assets
            a.id IN (
                SELECT asset_id FROM shared_assets
                WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            )
            OR
            -- User-specific access
            a.id IN (
                SELECT asset_id FROM user_asset_access
                WHERE user_id = auth.uid()
            )
    )
);

-- ============================================
-- Update helper functions
-- ============================================

-- Update get_accessible_assets function to include user-level access
CREATE OR REPLACE FUNCTION get_accessible_assets()
RETURNS SETOF assets AS $$
DECLARE
    current_org_id UUID;
    is_system_org BOOLEAN;
BEGIN
    -- Get current user's organization
    SELECT organization_id INTO current_org_id
    FROM profiles
    WHERE id = auth.uid();

    -- Check if user is in SYSTEM org
    SELECT (current_org_id = id) INTO is_system_org
    FROM organizations
    WHERE name = 'SYSTEM';

    -- Return appropriate assets
    IF is_system_org THEN
        -- SYSTEM org sees ALL assets
        RETURN QUERY
        SELECT a.*
        FROM assets a
        ORDER BY a.created_at DESC;
    ELSE
        -- Other orgs see own assets + shared assets + user-specific grants
        RETURN QUERY
        SELECT DISTINCT a.*
        FROM assets a
        WHERE a.organization_id = current_org_id
        OR a.id IN (
            SELECT asset_id
            FROM shared_assets
            WHERE shared_with_organization_id = current_org_id
        )
        OR a.id IN (
            SELECT asset_id
            FROM user_asset_access
            WHERE user_id = auth.uid()
        )
        ORDER BY a.created_at DESC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Helper functions for user access management
-- ============================================

-- Grant asset access to a user
CREATE OR REPLACE FUNCTION grant_user_asset_access(
    p_user_id UUID,
    p_asset_id UUID,
    p_access_level TEXT DEFAULT 'read',
    p_notes TEXT DEFAULT NULL
)
RETURNS user_asset_access AS $$
DECLARE
    v_result user_asset_access;
BEGIN
    INSERT INTO user_asset_access (user_id, asset_id, access_level, granted_by, notes)
    VALUES (p_user_id, p_asset_id, p_access_level, auth.uid(), p_notes)
    ON CONFLICT (user_id, asset_id)
    DO UPDATE SET
        access_level = EXCLUDED.access_level,
        granted_by = auth.uid(),
        granted_at = NOW(),
        notes = EXCLUDED.notes
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke asset access from a user
CREATE OR REPLACE FUNCTION revoke_user_asset_access(
    p_user_id UUID,
    p_asset_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_deleted BOOLEAN;
BEGIN
    DELETE FROM user_asset_access
    WHERE user_id = p_user_id AND asset_id = p_asset_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all users with access to an asset
CREATE OR REPLACE FUNCTION get_asset_users(p_asset_id UUID)
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    full_name TEXT,
    access_level TEXT,
    granted_at TIMESTAMPTZ,
    granted_by_email TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        uaa.user_id,
        u.email,
        p.full_name,
        uaa.access_level,
        uaa.granted_at,
        granter.email as granted_by_email
    FROM user_asset_access uaa
    JOIN auth.users u ON uaa.user_id = u.id
    JOIN profiles p ON p.id = u.id
    LEFT JOIN auth.users granter ON uaa.granted_by = granter.id
    WHERE uaa.asset_id = p_asset_id
    ORDER BY uaa.granted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all assets accessible to a specific user
CREATE OR REPLACE FUNCTION get_user_accessible_assets(p_user_id UUID)
RETURNS TABLE (
    asset_id UUID,
    asset_name TEXT,
    access_source TEXT, -- 'organization', 'shared', 'user_grant', 'system'
    access_level TEXT
) AS $$
DECLARE
    v_org_id UUID;
    v_is_system BOOLEAN;
BEGIN
    -- Get user's organization
    SELECT organization_id INTO v_org_id
    FROM profiles WHERE id = p_user_id;

    -- Check if SYSTEM org
    SELECT (v_org_id = id) INTO v_is_system
    FROM organizations WHERE name = 'SYSTEM';

    IF v_is_system THEN
        -- SYSTEM sees all assets
        RETURN QUERY
        SELECT a.id, a.name, 'system'::TEXT, 'admin'::TEXT
        FROM assets a;
    ELSE
        -- Organization assets
        RETURN QUERY
        SELECT a.id, a.name, 'organization'::TEXT, 'write'::TEXT
        FROM assets a
        WHERE a.organization_id = v_org_id

        UNION

        -- Shared assets
        SELECT a.id, a.name, 'shared'::TEXT, 'read'::TEXT
        FROM assets a
        JOIN shared_assets sa ON a.id = sa.asset_id
        WHERE sa.shared_with_organization_id = v_org_id

        UNION

        -- User-specific grants
        SELECT a.id, a.name, 'user_grant'::TEXT, uaa.access_level
        FROM assets a
        JOIN user_asset_access uaa ON a.id = uaa.asset_id
        WHERE uaa.user_id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE user_asset_access IS 'Grants individual users access to specific assets';
COMMENT ON FUNCTION grant_user_asset_access IS 'Grant or update asset access for a specific user';
COMMENT ON FUNCTION revoke_user_asset_access IS 'Revoke asset access from a specific user';
COMMENT ON FUNCTION get_asset_users IS 'Get all users who have been granted access to an asset';
COMMENT ON FUNCTION get_user_accessible_assets IS 'Get all assets accessible to a user with access source information';
