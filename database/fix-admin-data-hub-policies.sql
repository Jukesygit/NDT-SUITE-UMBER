-- ============================================
-- Fix Admin Policies for Data Hub
-- ============================================
-- This migration updates RLS policies to allow admins (SYSTEM org users)
-- to create vessels, vessel_images, and scans in any organization's assets.
--
-- Date: 2025-11-29
-- Issue: Admins could create assets in any org, but couldn't create
--        vessels/images/scans in those assets due to restrictive RLS policies.

-- ============================================
-- VESSELS: Update INSERT policy for admins
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can create vessels in accessible assets" ON vessels;

-- Create new policy with admin exception
CREATE POLICY "Users can create vessels in accessible assets" ON vessels FOR INSERT
WITH CHECK (
    -- Normal users: can create vessels in assets from their own organization
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    OR
    -- Admins: can create vessels in ANY asset (regardless of organization)
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- VESSELS: Update UPDATE policy for admins
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can update vessels in own org" ON vessels;

-- Create new policy with admin exception
CREATE POLICY "Users can update vessels in own org" ON vessels FOR UPDATE
USING (
    -- Normal users: editors+ can update vessels in their org's assets
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (
            created_by = auth.uid()
            OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
        )
    )
    OR
    -- Admins: can update vessels in ANY asset
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- VESSELS: Update DELETE policy for admins
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Editors can delete vessels" ON vessels;

-- Create new policy with admin exception
CREATE POLICY "Editors can delete vessels" ON vessels FOR DELETE
USING (
    -- Normal users: editors+ can delete vessels in their org's assets
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
    OR
    -- Admins: can delete vessels in ANY asset
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- VESSEL IMAGES: Update INSERT policy for admins
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can add images to accessible vessels" ON vessel_images;

-- Create new policy with admin exception
CREATE POLICY "Users can add images to accessible vessels" ON vessel_images FOR INSERT
WITH CHECK (
    -- Normal users: can add images to vessels in their org's assets
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    OR
    -- Admins: can add images to ANY vessel
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- VESSEL IMAGES: Update UPDATE policy for admins
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can update images in own org" ON vessel_images;

-- Create new policy with admin exception
CREATE POLICY "Users can update images in own org" ON vessel_images FOR UPDATE
USING (
    -- Normal users: editors+ can update images in their org's vessels
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
    OR
    -- Admins: can update images in ANY vessel
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- VESSEL IMAGES: Update DELETE policy for admins
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Editors can delete images" ON vessel_images;

-- Create new policy with admin exception
CREATE POLICY "Editors can delete images" ON vessel_images FOR DELETE
USING (
    -- Normal users: editors+ can delete images in their org's vessels
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
    OR
    -- Admins: can delete images in ANY vessel
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- SCANS: Update INSERT policy for admins
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can create scans in accessible vessels" ON scans;

-- Create new policy with admin exception
CREATE POLICY "Users can create scans in accessible vessels" ON scans FOR INSERT
WITH CHECK (
    -- Normal users: can create scans in vessels from their org's assets
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    OR
    -- Admins: can create scans in ANY vessel
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- SCANS: Update UPDATE policy for admins
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can update scans in own org" ON scans;

-- Create new policy with admin exception
CREATE POLICY "Users can update scans in own org" ON scans FOR UPDATE
USING (
    -- Normal users: editors+ can update scans in their org's vessels
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
    OR
    -- Admins: can update scans in ANY vessel
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- SCANS: Update DELETE policy for admins
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Editors can delete scans" ON scans;

-- Create new policy with admin exception
CREATE POLICY "Editors can delete scans" ON scans FOR DELETE
USING (
    -- Normal users: editors+ can delete scans in their org's vessels
    vessel_id IN (
        SELECT v.id FROM vessels v
        JOIN assets a ON v.asset_id = a.id
        WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
    OR
    -- Admins: can delete scans in ANY vessel
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- Verification
-- ============================================
-- After running this migration, admins should be able to:
-- 1. Create vessels in any asset
-- 2. Create images in any vessel
-- 3. Create scans in any vessel
-- 4. Update/delete all of the above

-- To verify, run:
-- SELECT policyname FROM pg_policies WHERE tablename IN ('vessels', 'vessel_images', 'scans');
