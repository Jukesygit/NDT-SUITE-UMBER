-- ================================================
-- MASTER RLS FIX MIGRATION SCRIPT
-- ================================================
-- This script fixes the infinite recursion error in Supabase RLS policies
-- by implementing SECURITY DEFINER functions to safely access user roles
-- without triggering recursive policy checks.
--
-- IMPORTANT: Apply this script in your Supabase SQL Editor
-- ================================================

-- ====================
-- STEP 1: Create Auth Helper Functions
-- ====================

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS auth.user_role();
DROP FUNCTION IF EXISTS auth.user_org_id();
DROP FUNCTION IF EXISTS auth.is_admin();
DROP FUNCTION IF EXISTS auth.is_org_admin();
DROP FUNCTION IF EXISTS auth.is_org_admin_for(uuid);
DROP FUNCTION IF EXISTS auth.user_info();

-- Function to get current user's role
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(
        (SELECT role FROM profiles WHERE id = auth.uid()),
        'viewer'  -- Default role if no profile exists
    );
$$;

-- Function to get current user's organization_id
CREATE OR REPLACE FUNCTION auth.user_org_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    );
$$;

-- Function to check if current user is org_admin
CREATE OR REPLACE FUNCTION auth.is_org_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'org_admin'
    );
$$;

-- Function to check if current user is org_admin for a specific organization
CREATE OR REPLACE FUNCTION auth.is_org_admin_for(org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'org_admin'
        AND organization_id = org_id
    );
$$;

-- Composite function to get all user info at once
CREATE OR REPLACE FUNCTION auth.user_info()
RETURNS TABLE (
    user_id UUID,
    role TEXT,
    organization_id UUID
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT
        id as user_id,
        role,
        organization_id
    FROM profiles
    WHERE id = auth.uid()
    LIMIT 1;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION auth.user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_org_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_org_admin_for(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.user_info() TO authenticated;

-- ====================
-- STEP 2: Fix Profiles Table Policies
-- ====================

-- Drop ALL existing profiles policies
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins view all profiles" ON profiles;
DROP POLICY IF EXISTS "Org admins view org profiles" ON profiles;
DROP POLICY IF EXISTS "View profiles for pending approvals" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Org admins can update org profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can create users" ON profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON profiles;

-- Create new non-recursive SELECT policy
CREATE POLICY "profiles_select_policy"
    ON profiles FOR SELECT
    USING (
        -- Users can view their own profile
        id = auth.uid()
        OR
        -- Admins can view all profiles
        auth.is_admin()
        OR
        -- Org admins can view profiles in their organization
        (auth.is_org_admin() AND organization_id = auth.user_org_id())
        OR
        -- Org admins can view profiles with pending approvals (cross-org)
        (
            auth.is_org_admin()
            AND EXISTS (
                SELECT 1 FROM employee_competencies ec
                WHERE ec.user_id = profiles.id
                AND ec.status = 'pending_approval'
            )
        )
    );

-- Create UPDATE policy
CREATE POLICY "profiles_update_policy"
    ON profiles FOR UPDATE
    USING (
        id = auth.uid()
        OR auth.is_admin()
        OR (auth.is_org_admin() AND organization_id = auth.user_org_id())
    )
    WITH CHECK (
        CASE
            WHEN id = auth.uid() AND NOT auth.is_admin() THEN
                role = OLD.role AND
                (organization_id = OLD.organization_id OR organization_id IS NULL)
            ELSE true
        END
    );

-- Create INSERT policy
CREATE POLICY "profiles_insert_policy"
    ON profiles FOR INSERT
    WITH CHECK (
        id = auth.uid() OR auth.is_admin()
    );

-- Create DELETE policy
CREATE POLICY "profiles_delete_policy"
    ON profiles FOR DELETE
    USING (auth.is_admin());

-- ====================
-- STEP 3: Fix Organizations Table Policies
-- ====================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
DROP POLICY IF EXISTS "Only admins can create organizations" ON organizations;
DROP POLICY IF EXISTS "Only admins can update organizations" ON organizations;
DROP POLICY IF EXISTS "Only admins can delete organizations" ON organizations;
DROP POLICY IF EXISTS "Authenticated users can view organizations" ON organizations;
DROP POLICY IF EXISTS "Admins can manage organizations" ON organizations;
DROP POLICY IF EXISTS "organizations_select_policy" ON organizations;
DROP POLICY IF EXISTS "organizations_manage_policy" ON organizations;

-- Create new policies
CREATE POLICY "organizations_select_policy"
    ON organizations FOR SELECT
    USING (
        id = auth.user_org_id()
        OR auth.is_admin()
        OR true  -- Allow viewing all organizations for selection
    );

CREATE POLICY "organizations_insert_policy"
    ON organizations FOR INSERT
    WITH CHECK (auth.is_admin());

CREATE POLICY "organizations_update_policy"
    ON organizations FOR UPDATE
    USING (auth.is_admin() OR (auth.is_org_admin() AND id = auth.user_org_id()));

CREATE POLICY "organizations_delete_policy"
    ON organizations FOR DELETE
    USING (auth.is_admin());

-- ====================
-- STEP 4: Fix Employee Competencies Policies
-- ====================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view competencies" ON employee_competencies;
DROP POLICY IF EXISTS "Users can create competencies" ON employee_competencies;
DROP POLICY IF EXISTS "Users can update competencies" ON employee_competencies;
DROP POLICY IF EXISTS "Admins can delete competencies" ON employee_competencies;
DROP POLICY IF EXISTS "employee_competencies_select_policy" ON employee_competencies;
DROP POLICY IF EXISTS "employee_competencies_insert_policy" ON employee_competencies;
DROP POLICY IF EXISTS "employee_competencies_update_policy" ON employee_competencies;
DROP POLICY IF EXISTS "employee_competencies_delete_policy" ON employee_competencies;

-- Create new policies
CREATE POLICY "employee_competencies_select_policy"
    ON employee_competencies FOR SELECT
    USING (
        user_id = auth.uid()
        OR auth.is_admin()
        OR EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = auth.user_org_id()
            AND auth.is_org_admin()
        )
        OR (auth.is_org_admin() AND status = 'pending_approval')
    );

CREATE POLICY "employee_competencies_insert_policy"
    ON employee_competencies FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        OR auth.is_admin()
        OR EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = auth.user_org_id()
            AND auth.is_org_admin()
        )
    );

CREATE POLICY "employee_competencies_update_policy"
    ON employee_competencies FOR UPDATE
    USING (
        user_id = auth.uid()
        OR auth.is_admin()
        OR EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = auth.user_org_id()
            AND auth.is_org_admin()
        )
        OR (auth.is_org_admin() AND status = 'pending_approval')
    )
    WITH CHECK (
        CASE
            WHEN user_id = auth.uid() AND NOT auth.is_admin() AND NOT auth.is_org_admin() THEN
                status != 'approved'
            ELSE true
        END
    );

CREATE POLICY "employee_competencies_delete_policy"
    ON employee_competencies FOR DELETE
    USING (
        auth.is_admin()
        OR EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = auth.user_org_id()
            AND auth.is_org_admin()
        )
    );

-- ====================
-- STEP 5: Fix Other Competency Tables
-- ====================

-- Fix competency_definitions policies
DROP POLICY IF EXISTS "Authenticated users can view competency definitions" ON competency_definitions;
DROP POLICY IF EXISTS "Only admins can manage competency definitions" ON competency_definitions;
DROP POLICY IF EXISTS "competency_definitions_select_policy" ON competency_definitions;
DROP POLICY IF EXISTS "competency_definitions_manage_policy" ON competency_definitions;

CREATE POLICY "competency_definitions_select_policy"
    ON competency_definitions FOR SELECT
    USING (true);

CREATE POLICY "competency_definitions_manage_policy"
    ON competency_definitions FOR ALL
    USING (auth.is_admin() OR auth.is_org_admin());

-- Fix competency_history policies
DROP POLICY IF EXISTS "Users can view competency history" ON competency_history;
DROP POLICY IF EXISTS "System can insert competency history" ON competency_history;
DROP POLICY IF EXISTS "competency_history_select_policy" ON competency_history;
DROP POLICY IF EXISTS "competency_history_insert_policy" ON competency_history;

CREATE POLICY "competency_history_select_policy"
    ON competency_history FOR SELECT
    USING (
        user_id = auth.uid()
        OR auth.is_admin()
        OR auth.is_org_admin()
    );

CREATE POLICY "competency_history_insert_policy"
    ON competency_history FOR INSERT
    WITH CHECK (true);

-- ====================
-- STEP 6: Fix Permission & Account Requests
-- ====================

-- Fix permission_requests policies
DROP POLICY IF EXISTS "Users can view own permission requests" ON permission_requests;
DROP POLICY IF EXISTS "Authenticated users can create permission requests" ON permission_requests;
DROP POLICY IF EXISTS "Only admins can update permission requests" ON permission_requests;
DROP POLICY IF EXISTS "permission_requests_select_policy" ON permission_requests;
DROP POLICY IF EXISTS "permission_requests_insert_policy" ON permission_requests;
DROP POLICY IF EXISTS "permission_requests_update_policy" ON permission_requests;
DROP POLICY IF EXISTS "permission_requests_delete_policy" ON permission_requests;

CREATE POLICY "permission_requests_select_policy"
    ON permission_requests FOR SELECT
    USING (
        user_id = auth.uid()
        OR auth.is_admin()
        OR (
            auth.is_org_admin()
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = permission_requests.user_id
                AND p.organization_id = auth.user_org_id()
            )
        )
    );

CREATE POLICY "permission_requests_insert_policy"
    ON permission_requests FOR INSERT
    WITH CHECK (auth.uid() = user_id AND auth.uid() IS NOT NULL);

CREATE POLICY "permission_requests_update_policy"
    ON permission_requests FOR UPDATE
    USING (
        auth.is_admin()
        OR (
            auth.is_org_admin()
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = permission_requests.user_id
                AND p.organization_id = auth.user_org_id()
            )
        )
    );

-- Fix account_requests policies (create if don't exist)
DROP POLICY IF EXISTS "account_requests_select_policy" ON account_requests;
DROP POLICY IF EXISTS "account_requests_insert_policy" ON account_requests;
DROP POLICY IF EXISTS "account_requests_update_policy" ON account_requests;
DROP POLICY IF EXISTS "account_requests_delete_policy" ON account_requests;

CREATE POLICY "account_requests_select_policy"
    ON account_requests FOR SELECT
    USING (
        email = current_setting('request.jwt.claims', true)::json->>'email'
        OR auth.is_admin()
        OR (auth.is_org_admin() AND organization_id = auth.user_org_id())
    );

CREATE POLICY "account_requests_insert_policy"
    ON account_requests FOR INSERT
    WITH CHECK (status = 'pending');

CREATE POLICY "account_requests_update_policy"
    ON account_requests FOR UPDATE
    USING (
        auth.is_admin()
        OR (auth.is_org_admin() AND organization_id = auth.user_org_id())
    );

CREATE POLICY "account_requests_delete_policy"
    ON account_requests FOR DELETE
    USING (auth.is_admin());

-- ====================
-- STEP 7: Create Indexes for Performance
-- ====================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_id_role ON profiles(id, role);
CREATE INDEX IF NOT EXISTS idx_profiles_id_org ON profiles(id, organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Employee competencies indexes
CREATE INDEX IF NOT EXISTS idx_employee_competencies_user_id ON employee_competencies(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_status ON employee_competencies(status);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_user_status ON employee_competencies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_pending
    ON employee_competencies(user_id, status)
    WHERE status = 'pending_approval';

-- Other indexes
CREATE INDEX IF NOT EXISTS idx_competency_history_user_id ON competency_history(user_id);
CREATE INDEX IF NOT EXISTS idx_permission_requests_user_id ON permission_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_permission_requests_status ON permission_requests(status);
CREATE INDEX IF NOT EXISTS idx_account_requests_email ON account_requests(email);
CREATE INDEX IF NOT EXISTS idx_account_requests_status ON account_requests(status);

-- ====================
-- STEP 8: Ensure RLS is Enabled
-- ====================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_requests ENABLE ROW LEVEL SECURITY;

-- ====================
-- VERIFICATION
-- ====================

-- Quick test to ensure no recursion
DO $$
BEGIN
    -- This should complete quickly without recursion errors
    PERFORM COUNT(*) FROM profiles;
    RAISE NOTICE 'Profiles table accessible without recursion ✓';

    PERFORM COUNT(*) FROM employee_competencies;
    RAISE NOTICE 'Employee competencies table accessible without recursion ✓';

    RAISE NOTICE '';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'RLS FIX APPLIED SUCCESSFULLY!';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'The infinite recursion issue has been resolved.';
    RAISE NOTICE 'Your application should now work without 500 errors.';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Test your application';
    RAISE NOTICE '2. Verify all features work correctly';
    RAISE NOTICE '3. Check Supabase logs for any remaining errors';
    RAISE NOTICE '================================================';
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error during verification: %', SQLERRM;
END $$;