-- Migration: Allow Manager role to view all personnel and activity from all organizations
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- STEP 1: Update Activity Log policy to include managers
-- ============================================================================

-- Drop existing admin-only policy
DROP POLICY IF EXISTS "Admins can view all activity logs" ON activity_log;

-- Create new policy allowing both admins AND managers to view all activity logs
CREATE POLICY "Admins and managers can view all activity logs"
    ON activity_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'manager')
        )
    );

-- ============================================================================
-- STEP 2: Ensure profiles view policy allows managers to see all orgs
-- (This should already exist from add-manager-role.sql, but ensuring it's correct)
-- ============================================================================

-- Drop and recreate to ensure correct policy
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;

CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    USING (
        -- User can always view their own profile
        id = auth.uid()
        OR
        -- Admin and Manager can view ALL profiles (all organizations)
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'manager')
        )
        OR
        -- Org admin can only view profiles in their organization
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'org_admin'
            AND p.organization_id = profiles.organization_id
        )
    );

-- ============================================================================
-- STEP 3: Update employee_competencies view policy for managers
-- ============================================================================

-- Check if the policy exists and update it
DROP POLICY IF EXISTS "Users can view competencies" ON employee_competencies;

CREATE POLICY "Users can view competencies"
    ON employee_competencies FOR SELECT
    TO authenticated
    USING (
        -- User can view their own competencies
        user_id = auth.uid()
        OR
        -- Admin and Manager can view ALL competencies (all organizations)
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'manager')
        )
        OR
        -- Org admin can view competencies for users in their organization
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN profiles target ON target.id = employee_competencies.user_id
            WHERE p.id = auth.uid()
            AND p.role = 'org_admin'
            AND p.organization_id = target.organization_id
        )
    );

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Show current RLS policies on profiles
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('profiles', 'activity_log', 'employee_competencies')
ORDER BY tablename, policyname;

-- Done! Managers can now view all personnel and activity from all organizations.
