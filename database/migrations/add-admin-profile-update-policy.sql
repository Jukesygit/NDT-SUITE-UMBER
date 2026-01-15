-- Migration: Add RLS policies for admin profile updates and manager viewing
-- Issues Fixed:
--   1. Admins cannot edit other users' emails (no UPDATE policy for admin access)
--   2. Managers cannot see all personnel (not included in SELECT policy)
-- Date: 2025-01-15

-- ============================================================================
-- FIX 1: UPDATE Policies - Allow admins/org_admins to update other profiles
-- ============================================================================

-- Drop existing admin update policy if exists (to make this migration idempotent)
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- Create policy allowing admins to update any profile
CREATE POLICY "Admins can update any profile"
    ON profiles FOR UPDATE
    USING (
        -- Allow if the current user is an admin
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
    )
    WITH CHECK (
        -- Admins can set any values
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
    );

-- Also allow org_admins to update profiles within their organization
DROP POLICY IF EXISTS "Org admins can update profiles in their org" ON profiles;

CREATE POLICY "Org admins can update profiles in their org"
    ON profiles FOR UPDATE
    USING (
        -- Allow if the current user is an org_admin and the target is in their org
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'org_admin'
            AND p.organization_id = profiles.organization_id
        )
        -- Don't allow org_admins to modify other admins
        AND (
            SELECT role FROM profiles WHERE id = profiles.id
        ) NOT IN ('admin')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'org_admin'
            AND p.organization_id = profiles.organization_id
        )
        -- Prevent org_admins from promoting anyone to admin
        AND profiles.role NOT IN ('admin')
    );

-- ============================================================================
-- FIX 2: SELECT Policy - Allow managers to view all personnel in their org
-- ============================================================================

-- Drop and recreate the SELECT policy to include managers
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;

CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    USING (
        -- Users can always see their own profile
        id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                -- Admins can see all profiles
                p.role = 'admin'
                -- Org admins can see profiles in their organization
                OR (p.role = 'org_admin' AND p.organization_id = profiles.organization_id)
                -- Managers can see profiles in their organization
                OR (p.role = 'manager' AND p.organization_id = profiles.organization_id)
            )
        )
    );

-- ============================================================================
-- Verify policies were created
-- ============================================================================
SELECT
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
