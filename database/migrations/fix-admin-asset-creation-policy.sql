-- ============================================
-- FIX: Allow admins to create assets in any organization
-- ============================================
-- Issue: Admin users from SYSTEM org couldn't create assets for other orgs
-- because the RLS policy required organization_id to match user's org.
--
-- Run this in Supabase SQL Editor to fix the issue.
-- ============================================

-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Users can create assets in their org" ON assets;

-- Create new INSERT policy that allows:
-- 1. Normal users to create assets in their own org
-- 2. Admin users to create assets in ANY organization
CREATE POLICY "Users can create assets in their org" ON assets FOR INSERT
WITH CHECK (
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

-- Also fix UPDATE policy to allow admins to update assets in any org
DROP POLICY IF EXISTS "Users can update own org assets" ON assets;

CREATE POLICY "Users can update own org assets" ON assets FOR UPDATE
USING (
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

-- Also fix DELETE policy to allow admins to delete assets in any org
DROP POLICY IF EXISTS "Editors can delete own org assets" ON assets;

CREATE POLICY "Editors can delete own org assets" ON assets FOR DELETE
USING (
    -- Normal users: editors+ can delete in their org
    (
        organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('editor', 'org_admin', 'admin')
    )
    OR
    -- Admins: can delete assets in ANY organization
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Verify the policies were created
SELECT
    policyname,
    cmd,
    qual::text as using_clause,
    with_check::text as with_check_clause
FROM pg_policies
WHERE tablename = 'assets';
