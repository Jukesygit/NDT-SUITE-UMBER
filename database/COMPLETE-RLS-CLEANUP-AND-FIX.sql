-- ================================================
-- COMPLETE RLS CLEANUP AND FIX
-- ================================================
-- This script COMPLETELY removes ALL existing RLS policies
-- and recreates them properly without recursion
-- ================================================

-- ====================
-- STEP 0: AGGRESSIVE CLEANUP - Remove ALL existing policies
-- ====================

-- Drop ALL policies on profiles table (using DO block to handle any policy name)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Drop ALL policies on organizations table
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'organizations'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON organizations', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Drop ALL policies on employee_competencies table
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'employee_competencies'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON employee_competencies', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Drop ALL policies on competency_definitions table
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'competency_definitions'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON competency_definitions', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Drop ALL policies on competency_history table
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'competency_history'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON competency_history', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Drop ALL policies on permission_requests table
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'permission_requests'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON permission_requests', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Drop ALL policies on account_requests table
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'account_requests'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON account_requests', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- ====================
-- STEP 1: Create/Replace Helper Functions
-- ====================

-- Drop and recreate helper functions
DROP FUNCTION IF EXISTS public.auth_user_role();
DROP FUNCTION IF EXISTS public.auth_user_org_id();
DROP FUNCTION IF EXISTS public.auth_is_admin();
DROP FUNCTION IF EXISTS public.auth_is_org_admin();
DROP FUNCTION IF EXISTS public.auth_is_org_admin_for(uuid);
DROP FUNCTION IF EXISTS public.auth_user_info();

-- Function to get current user's role
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(
        (SELECT role FROM profiles WHERE id = auth.uid()),
        'viewer'
    );
$$;

-- Function to get current user's organization_id
CREATE OR REPLACE FUNCTION public.auth_user_org_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(
        (SELECT role = 'admin' FROM profiles WHERE id = auth.uid()),
        false
    );
$$;

-- Function to check if current user is org_admin
CREATE OR REPLACE FUNCTION public.auth_is_org_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT COALESCE(
        (SELECT role = 'org_admin' FROM profiles WHERE id = auth.uid()),
        false
    );
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.auth_user_org_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_org_admin() TO authenticated, anon;

-- ====================
-- STEP 2: Create NEW Profiles Policies (NO RECURSION)
-- ====================

-- Simple SELECT policy - no nested queries to profiles!
CREATE POLICY "profiles_select_new"
    ON profiles FOR SELECT
    TO authenticated
    USING (
        -- Own profile
        id = auth.uid()
        OR
        -- Admin (using helper function - no recursion!)
        public.auth_is_admin() = true
        OR
        -- Org admin for same org (using helper function - no recursion!)
        (public.auth_is_org_admin() = true AND organization_id = public.auth_user_org_id())
    );

-- Simple UPDATE policy
CREATE POLICY "profiles_update_new"
    ON profiles FOR UPDATE
    TO authenticated
    USING (
        id = auth.uid()
        OR public.auth_is_admin() = true
        OR (public.auth_is_org_admin() = true AND organization_id = public.auth_user_org_id())
    )
    WITH CHECK (
        id = auth.uid()
        OR public.auth_is_admin() = true
        OR (public.auth_is_org_admin() = true AND organization_id = public.auth_user_org_id())
    );

-- Simple INSERT policy
CREATE POLICY "profiles_insert_new"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (
        id = auth.uid() OR public.auth_is_admin() = true
    );

-- Simple DELETE policy
CREATE POLICY "profiles_delete_new"
    ON profiles FOR DELETE
    TO authenticated
    USING (public.auth_is_admin() = true);

-- ====================
-- STEP 3: Create Organizations Policies
-- ====================

CREATE POLICY "organizations_select_new"
    ON organizations FOR SELECT
    TO authenticated
    USING (true); -- Everyone can view orgs for selection

CREATE POLICY "organizations_insert_new"
    ON organizations FOR INSERT
    TO authenticated
    WITH CHECK (public.auth_is_admin() = true);

CREATE POLICY "organizations_update_new"
    ON organizations FOR UPDATE
    TO authenticated
    USING (
        public.auth_is_admin() = true
        OR (public.auth_is_org_admin() = true AND id = public.auth_user_org_id())
    );

CREATE POLICY "organizations_delete_new"
    ON organizations FOR DELETE
    TO authenticated
    USING (public.auth_is_admin() = true);

-- ====================
-- STEP 4: Create Employee Competencies Policies
-- ====================

CREATE POLICY "employee_competencies_select_new"
    ON employee_competencies FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
    );

CREATE POLICY "employee_competencies_insert_new"
    ON employee_competencies FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        OR public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
    );

CREATE POLICY "employee_competencies_update_new"
    ON employee_competencies FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
    )
    WITH CHECK (
        public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
        OR (user_id = auth.uid() AND status != 'approved')
    );

CREATE POLICY "employee_competencies_delete_new"
    ON employee_competencies FOR DELETE
    TO authenticated
    USING (
        public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
    );

-- ====================
-- STEP 5: Create Competency Definitions Policies
-- ====================

CREATE POLICY "competency_definitions_select_new"
    ON competency_definitions FOR SELECT
    TO authenticated
    USING (true); -- Everyone can view definitions

CREATE POLICY "competency_definitions_all_new"
    ON competency_definitions FOR ALL
    TO authenticated
    USING (
        public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
    );

-- ====================
-- STEP 6: Create Competency History Policies
-- ====================

CREATE POLICY "competency_history_select_new"
    ON competency_history FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
    );

CREATE POLICY "competency_history_insert_new"
    ON competency_history FOR INSERT
    TO authenticated
    WITH CHECK (true); -- System inserts via triggers

-- ====================
-- STEP 7: Create Permission & Account Requests Policies
-- ====================

-- Permission requests
CREATE POLICY "permission_requests_select_new"
    ON permission_requests FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
    );

CREATE POLICY "permission_requests_insert_new"
    ON permission_requests FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "permission_requests_update_new"
    ON permission_requests FOR UPDATE
    TO authenticated
    USING (
        public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
    );

-- Account requests
CREATE POLICY "account_requests_select_new"
    ON account_requests FOR SELECT
    USING (
        public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
    );

CREATE POLICY "account_requests_insert_new"
    ON account_requests FOR INSERT
    WITH CHECK (status = 'pending');

CREATE POLICY "account_requests_update_new"
    ON account_requests FOR UPDATE
    TO authenticated
    USING (
        public.auth_is_admin() = true
        OR public.auth_is_org_admin() = true
    );

CREATE POLICY "account_requests_delete_new"
    ON account_requests FOR DELETE
    TO authenticated
    USING (public.auth_is_admin() = true);

-- ====================
-- STEP 8: Create Indexes
-- ====================

CREATE INDEX IF NOT EXISTS idx_profiles_id_role ON profiles(id, role);
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_user ON employee_competencies(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_status ON employee_competencies(status);

-- ====================
-- STEP 9: Ensure RLS is Enabled
-- ====================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_requests ENABLE ROW LEVEL SECURITY;

-- ====================
-- FINAL VERIFICATION
-- ====================

DO $$
BEGIN
    -- Test that we can query without recursion
    PERFORM COUNT(*) FROM profiles;
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'COMPLETE CLEANUP AND FIX APPLIED!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'All old policies removed and replaced.';
    RAISE NOTICE 'Helper functions created successfully.';
    RAISE NOTICE 'New policies applied without recursion.';
    RAISE NOTICE '';
    RAISE NOTICE 'Please refresh your browser completely:';
    RAISE NOTICE '1. Close all tabs';
    RAISE NOTICE '2. Clear browser cache';
    RAISE NOTICE '3. Restart your application';
    RAISE NOTICE '========================================';
END $$;

-- List all current policies as final check
SELECT
    tablename,
    policyname,
    cmd as operation
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'organizations', 'employee_competencies', 'competency_definitions')
ORDER BY tablename, policyname;