-- Migration: Add Manager Role and Fix Admin Update Permissions
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- STEP 1: Update role constraints to include 'manager'
-- ============================================================================

-- Update profiles table constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'org_admin', 'editor', 'viewer'));

-- Update account_requests table constraint
ALTER TABLE account_requests DROP CONSTRAINT IF EXISTS account_requests_requested_role_check;
ALTER TABLE account_requests ADD CONSTRAINT account_requests_requested_role_check
  CHECK (requested_role IN ('admin', 'manager', 'org_admin', 'editor', 'viewer'));

-- Update permission_requests table constraint (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permission_requests') THEN
        ALTER TABLE permission_requests DROP CONSTRAINT IF EXISTS permission_requests_requested_role_check;
        ALTER TABLE permission_requests ADD CONSTRAINT permission_requests_requested_role_check
          CHECK (requested_role IN ('admin', 'manager', 'org_admin', 'editor', 'viewer'));
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Add RLS policy for admins to update other users
-- This is the fix for the "stuck on saving" issue!
-- ============================================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Admins can update users" ON profiles;

-- Create policy allowing admins and org_admins to update user profiles
CREATE POLICY "Admins can update users"
    ON profiles FOR UPDATE
    USING (
        -- User can update their own profile
        id = auth.uid()
        OR
        -- Admin can update any profile
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
        OR
        -- Org admin can update profiles in their organization (except admins)
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'org_admin'
            AND p.organization_id = profiles.organization_id
            AND profiles.role != 'admin'
        )
        OR
        -- Manager can update profiles in their organization (except admins and other managers)
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'manager'
            AND p.organization_id = profiles.organization_id
            AND profiles.role NOT IN ('admin', 'manager')
        )
    )
    WITH CHECK (
        -- Same conditions for the new row
        id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'org_admin'
            AND p.organization_id = profiles.organization_id
            AND profiles.role != 'admin'
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'manager'
            AND p.organization_id = profiles.organization_id
            AND profiles.role NOT IN ('admin', 'manager')
        )
    );

-- Drop the old restrictive policy (users can only update own profile)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- ============================================================================
-- STEP 3: Update other RLS policies to recognize 'manager' role
-- ============================================================================

-- Update view policy to include manager
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    USING (
        id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'
                OR p.role = 'manager'
                OR (p.role = 'org_admin' AND p.organization_id = profiles.organization_id)
            )
        )
    );

-- Update create policy to include manager
DROP POLICY IF EXISTS "Admins can create users" ON profiles;
CREATE POLICY "Admins can create users"
    ON profiles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR role = 'manager'
                OR (role = 'org_admin' AND organization_id = profiles.organization_id)
            )
        )
    );

-- Update delete policy to include manager
DROP POLICY IF EXISTS "Admins can delete users" ON profiles;
CREATE POLICY "Admins can delete users"
    ON profiles FOR DELETE
    USING (
        id != auth.uid() -- Can't delete yourself
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'
                OR (p.role = 'manager' AND p.organization_id = profiles.organization_id AND profiles.role NOT IN ('admin', 'manager'))
                OR (p.role = 'org_admin' AND p.organization_id = profiles.organization_id AND profiles.role NOT IN ('admin', 'manager', 'org_admin'))
            )
        )
    );

-- ============================================================================
-- VERIFICATION: Test the changes
-- ============================================================================

-- Check the constraint was updated
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass
AND contype = 'c';

-- Show current RLS policies on profiles
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles';

-- Done! The manager role is now available and admins can update user roles.
