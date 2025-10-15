-- ============================================
-- Organization-Based Asset Ownership Migration
-- ============================================
-- This migration ensures:
-- 1. SYSTEM org can see ALL assets (super admin access)
-- 2. Other orgs can ONLY see their own assets
-- 3. Sharing is optional and controlled via shared_assets table
-- ============================================

-- First, let's update the ASSETS RLS policies to give SYSTEM org full access

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view accessible assets" ON assets;

-- Create new SELECT policy with SYSTEM org support
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
    )
);

-- ============================================
-- Update helper functions
-- ============================================

-- Update get_accessible_assets function to respect org boundaries
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
        -- Other orgs see only their own assets + shared assets
        RETURN QUERY
        SELECT DISTINCT a.*
        FROM assets a
        WHERE a.organization_id = current_org_id
        OR a.id IN (
            SELECT asset_id
            FROM shared_assets
            WHERE shared_with_organization_id = current_org_id
        )
        ORDER BY a.created_at DESC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Add helper function to check if user is in SYSTEM org
-- ============================================

CREATE OR REPLACE FUNCTION is_system_org_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT organization_id = (SELECT id FROM organizations WHERE name = 'SYSTEM')
        FROM profiles
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION is_system_org_user IS 'Returns true if the current user belongs to the SYSTEM organization';
COMMENT ON FUNCTION get_accessible_assets IS 'Returns all assets accessible to current user - SYSTEM org sees all, others see own + shared';
