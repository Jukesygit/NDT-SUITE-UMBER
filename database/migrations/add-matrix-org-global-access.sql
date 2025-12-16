-- ============================================
-- Matrix Organization Global Access Migration
-- ============================================
-- This migration grants Matrix organization members
-- read, create, and update access to all organizations' assets and vessels
-- (DELETE remains org-restricted for safety)
-- ============================================

-- ============================================
-- Helper function to check privileged orgs
-- ============================================

CREATE OR REPLACE FUNCTION is_privileged_org_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT p.organization_id IN (
            SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
        )
        FROM profiles p
        WHERE p.id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_privileged_org_user IS 'Returns true if the current user belongs to SYSTEM or Matrix organization';

-- ============================================
-- ASSETS RLS POLICIES
-- ============================================

-- SELECT: Matrix/SYSTEM can see all
DROP POLICY IF EXISTS "Users can view accessible assets" ON assets;

CREATE POLICY "Users can view accessible assets" ON assets FOR SELECT
USING (
    -- SYSTEM or Matrix organization can see ALL assets
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
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

-- INSERT: Matrix/SYSTEM can create in any org
DROP POLICY IF EXISTS "Users can create assets in their org" ON assets;

CREATE POLICY "Users can create assets in their org" ON assets FOR INSERT
WITH CHECK (
    -- SYSTEM/Matrix users can create assets in ANY organization
    (
        (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
            SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
        )
        AND created_by = auth.uid()
    )
    OR
    -- Normal users: can create assets in their own organization
    (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND created_by = auth.uid()
    )
    OR
    -- Admins: can create assets in ANY organization
    (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        AND created_by = auth.uid()
    )
);

-- UPDATE: Matrix/SYSTEM can update any org's assets
DROP POLICY IF EXISTS "Users can update own org assets" ON assets;

CREATE POLICY "Users can update own org assets" ON assets FOR UPDATE
USING (
    -- SYSTEM/Matrix users can update assets in ANY organization
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Normal users: can update assets in their org if owner or editor+
    (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (
            created_by = auth.uid()
            OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
        )
    )
    OR
    -- Admins: can update assets in ANY organization
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- VESSELS RLS POLICIES
-- ============================================

-- SELECT: Matrix/SYSTEM can see all vessels
DROP POLICY IF EXISTS "Users can view vessels from accessible assets" ON vessels;

CREATE POLICY "Users can view vessels from accessible assets" ON vessels FOR SELECT
USING (
    -- SYSTEM or Matrix org can see all vessels
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Vessels from own org's assets or shared assets
    asset_id IN (
        SELECT id FROM assets
        WHERE
            organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            OR id IN (
                SELECT asset_id FROM shared_assets
                WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
            )
    )
);

-- INSERT: Matrix/SYSTEM can create vessels in any asset
DROP POLICY IF EXISTS "Users can create vessels in accessible assets" ON vessels;

CREATE POLICY "Users can create vessels in accessible assets" ON vessels FOR INSERT
WITH CHECK (
    -- SYSTEM/Matrix users can create vessels in ANY asset
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Normal users: can create vessels in their own org's assets
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- UPDATE: Matrix/SYSTEM can update any vessel
DROP POLICY IF EXISTS "Users can update vessels in own org" ON vessels;

CREATE POLICY "Users can update vessels in own org" ON vessels FOR UPDATE
USING (
    -- SYSTEM/Matrix users can update ANY vessel
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Normal users: can update vessels in their org's assets
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (
            created_by = auth.uid()
            OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
        )
    )
);

-- ============================================
-- VESSEL IMAGES RLS POLICIES
-- ============================================

-- SELECT: Matrix/SYSTEM can see all images
DROP POLICY IF EXISTS "Users can view images from accessible vessels" ON vessel_images;

CREATE POLICY "Users can view images from accessible vessels" ON vessel_images FOR SELECT
USING (
    -- SYSTEM or Matrix org can see all images
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Images from accessible vessels
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

-- INSERT: Matrix/SYSTEM can add images to any vessel
DROP POLICY IF EXISTS "Users can add images to accessible vessels" ON vessel_images;

CREATE POLICY "Users can add images to accessible vessels" ON vessel_images FOR INSERT
WITH CHECK (
    -- SYSTEM/Matrix users can add images to ANY vessel
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Normal users: can add images to their org's vessels
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- UPDATE: Matrix/SYSTEM can update any image
DROP POLICY IF EXISTS "Users can update images in own org" ON vessel_images;

CREATE POLICY "Users can update images in own org" ON vessel_images FOR UPDATE
USING (
    -- SYSTEM/Matrix users can update ANY image
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Normal users: can update images in their org's vessels
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

-- SELECT: Matrix/SYSTEM can see all scans
DROP POLICY IF EXISTS "Users can view scans from accessible vessels" ON scans;

CREATE POLICY "Users can view scans from accessible vessels" ON scans FOR SELECT
USING (
    -- SYSTEM or Matrix org can see all scans
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Scans from accessible vessels
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

-- INSERT: Matrix/SYSTEM can create scans in any vessel
DROP POLICY IF EXISTS "Users can create scans in accessible vessels" ON scans;

CREATE POLICY "Users can create scans in accessible vessels" ON scans FOR INSERT
WITH CHECK (
    -- SYSTEM/Matrix users can create scans in ANY vessel
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Normal users: can create scans in their org's vessels
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- UPDATE: Matrix/SYSTEM can update any scan
DROP POLICY IF EXISTS "Users can update scans in own org" ON scans;

CREATE POLICY "Users can update scans in own org" ON scans FOR UPDATE
USING (
    -- SYSTEM/Matrix users can update ANY scan
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Normal users: can update scans in their org's vessels
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- STRAKES RLS POLICIES (if table exists)
-- ============================================

-- SELECT: Matrix/SYSTEM can see all strakes
DROP POLICY IF EXISTS "Users can view strakes from accessible vessels" ON strakes;

CREATE POLICY "Users can view strakes from accessible vessels" ON strakes FOR SELECT
USING (
    -- SYSTEM or Matrix org can see all strakes
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Strakes from accessible vessels
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

-- INSERT: Matrix/SYSTEM can create strakes in any vessel
DROP POLICY IF EXISTS "Users can create strakes" ON strakes;

CREATE POLICY "Users can create strakes" ON strakes FOR INSERT
WITH CHECK (
    -- SYSTEM/Matrix users can create strakes in ANY vessel
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Normal users: can create strakes in their org's vessels
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- UPDATE: Matrix/SYSTEM can update any strake
DROP POLICY IF EXISTS "Users can update strakes" ON strakes;

CREATE POLICY "Users can update strakes" ON strakes FOR UPDATE
USING (
    -- SYSTEM/Matrix users can update ANY strake
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) IN (
        SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix')
    )
    OR
    -- Normal users: can update strakes in their org's vessels
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
);

-- ============================================
-- Update get_accessible_assets function
-- ============================================

CREATE OR REPLACE FUNCTION get_accessible_assets()
RETURNS SETOF assets AS $$
DECLARE
    current_org_id UUID;
    is_privileged_org BOOLEAN;
BEGIN
    -- Get current user's organization
    SELECT organization_id INTO current_org_id
    FROM profiles
    WHERE id = auth.uid();

    -- Check if user is in SYSTEM or Matrix org
    SELECT current_org_id IN (SELECT id FROM organizations WHERE name IN ('SYSTEM', 'Matrix'))
    INTO is_privileged_org;

    -- Return appropriate assets
    IF is_privileged_org THEN
        -- Privileged orgs see ALL assets
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

COMMENT ON FUNCTION get_accessible_assets IS 'Returns all assets accessible to current user - SYSTEM/Matrix orgs see all, others see own + shared';
