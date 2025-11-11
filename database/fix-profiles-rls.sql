-- Fix Profiles Table RLS Policies
-- This script replaces all profiles RLS policies with non-recursive versions
-- using the auth helper functions created in auth-helper-functions.sql

-- IMPORTANT: Run auth-helper-functions.sql FIRST before running this script!

-- Step 1: Drop all existing profiles policies
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins view all profiles" ON profiles;
DROP POLICY IF EXISTS "Org admins view org profiles" ON profiles;
DROP POLICY IF EXISTS "View profiles for pending approvals" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Org admins can update org profiles" ON profiles;

-- Step 2: Create new SELECT policy using helper functions (no recursion!)
CREATE POLICY "profiles_select_policy"
    ON profiles FOR SELECT
    USING (
        -- Users can view their own profile
        id = auth.uid()
        OR
        -- Admins can view all profiles (using helper function)
        auth.is_admin()
        OR
        -- Org admins can view profiles in their organization
        (auth.is_org_admin() AND organization_id = auth.user_org_id())
        OR
        -- Org admins can view profiles of users with pending competency approvals (cross-org)
        -- This is safe because we're not querying profiles recursively
        (
            auth.is_org_admin()
            AND EXISTS (
                SELECT 1 FROM employee_competencies ec
                WHERE ec.user_id = profiles.id
                AND ec.status = 'pending_approval'
            )
        )
    );

-- Step 3: Create UPDATE policy using helper functions
CREATE POLICY "profiles_update_policy"
    ON profiles FOR UPDATE
    USING (
        -- Users can update their own profile
        id = auth.uid()
        OR
        -- Admins can update all profiles
        auth.is_admin()
        OR
        -- Org admins can update profiles in their organization
        (auth.is_org_admin() AND organization_id = auth.user_org_id())
    )
    WITH CHECK (
        -- Prevent users from escalating their own privileges
        CASE
            WHEN id = auth.uid() AND NOT auth.is_admin() THEN
                -- Non-admins cannot change their own role or organization
                role = OLD.role AND
                (organization_id = OLD.organization_id OR organization_id IS NULL)
            ELSE
                -- Admins and org admins updating others have no restrictions
                true
        END
    );

-- Step 4: Create INSERT policy (for new user registration)
CREATE POLICY "profiles_insert_policy"
    ON profiles FOR INSERT
    WITH CHECK (
        -- Only allow inserting your own profile on registration
        id = auth.uid()
        OR
        -- Or admins can create profiles for others
        auth.is_admin()
    );

-- Step 5: Create DELETE policy (admins only)
CREATE POLICY "profiles_delete_policy"
    ON profiles FOR DELETE
    USING (
        -- Only admins can delete profiles
        auth.is_admin()
    );

-- Step 6: Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Step 7: Create additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_user_status
    ON employee_competencies(user_id, status)
    WHERE status = 'pending_approval';

-- Verification queries (run these after applying to test)
-- Test 1: Check if a regular user can see their own profile
-- SELECT * FROM profiles WHERE id = auth.uid();

-- Test 2: Check if admin can see all profiles
-- SET LOCAL role TO 'authenticated';
-- SET LOCAL request.jwt.claim.sub TO '<admin_user_id>';
-- SELECT COUNT(*) FROM profiles;

-- Test 3: Check if org_admin can see org profiles
-- SET LOCAL role TO 'authenticated';
-- SET LOCAL request.jwt.claim.sub TO '<org_admin_user_id>';
-- SELECT * FROM profiles WHERE organization_id = '<org_id>';

-- Test 4: Check pending approvals cross-org access
-- SELECT p.* FROM profiles p
-- WHERE EXISTS (
--     SELECT 1 FROM employee_competencies ec
--     WHERE ec.user_id = p.id
--     AND ec.status = 'pending_approval'
-- );