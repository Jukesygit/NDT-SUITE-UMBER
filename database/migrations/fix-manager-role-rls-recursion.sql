-- ==========================================================================
-- FIX: super_admin migration broke profiles RLS (infinite recursion)
-- Date: 2026-04-08
-- Problem: 20260408120000_add_super_admin_and_tab_visibility.sql rewrote
--   all profiles RLS policies using direct subqueries on profiles,
--   undoing the fix from fix-profiles-rls-self-reference.sql.
--   This causes infinite recursion and 500 errors on every profiles query.
--
-- Fix: Rewrite all profiles policies to use the SECURITY DEFINER helper
--   functions get_my_role() and get_my_org_id() which bypass RLS.
--   Also fix tab_visibility_settings policies that reference profiles.
-- ==========================================================================

-- Ensure helper functions exist and include super_admin awareness
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- ============================================================================
-- PROFILES: SELECT
-- ============================================================================
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    USING (
        id = auth.uid()
        OR get_my_role() IN ('super_admin', 'admin')
        OR get_my_role() = 'manager'
        OR (get_my_role() = 'org_admin' AND organization_id = get_my_org_id())
        OR (organization_id IS NOT NULL AND organization_id = get_my_org_id())
    );

-- ============================================================================
-- PROFILES: INSERT
-- ============================================================================
DROP POLICY IF EXISTS "Admins can create users" ON profiles;
CREATE POLICY "Admins can create users"
    ON profiles FOR INSERT
    WITH CHECK (
        get_my_role() IN ('super_admin', 'admin')
        OR get_my_role() = 'manager'
        OR (get_my_role() = 'org_admin' AND organization_id = get_my_org_id())
    );

-- ============================================================================
-- PROFILES: UPDATE
-- ============================================================================
DROP POLICY IF EXISTS "Admins can update users" ON profiles;
CREATE POLICY "Admins can update users"
    ON profiles FOR UPDATE
    USING (
        id = auth.uid()
        OR get_my_role() IN ('super_admin', 'admin')
        OR (get_my_role() = 'org_admin' AND organization_id = get_my_org_id() AND role NOT IN ('super_admin', 'admin'))
        OR (get_my_role() = 'manager' AND organization_id = get_my_org_id() AND role NOT IN ('super_admin', 'admin', 'manager'))
    )
    WITH CHECK (
        id = auth.uid()
        OR get_my_role() IN ('super_admin', 'admin')
        OR (get_my_role() = 'org_admin' AND organization_id = get_my_org_id() AND role NOT IN ('super_admin', 'admin'))
        OR (get_my_role() = 'manager' AND organization_id = get_my_org_id() AND role NOT IN ('super_admin', 'admin', 'manager'))
    );

-- ============================================================================
-- PROFILES: DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Admins can delete users" ON profiles;
CREATE POLICY "Admins can delete users"
    ON profiles FOR DELETE
    USING (
        id != auth.uid()
        AND (
            get_my_role() IN ('super_admin', 'admin')
            OR (get_my_role() = 'manager' AND organization_id = get_my_org_id() AND role NOT IN ('super_admin', 'admin', 'manager'))
            OR (get_my_role() = 'org_admin' AND organization_id = get_my_org_id() AND role NOT IN ('super_admin', 'admin', 'manager', 'org_admin'))
        )
    );

-- ============================================================================
-- ORGANIZATIONS: fix self-referencing policies added by super_admin migration
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
CREATE POLICY "Users can view their organization"
    ON organizations FOR SELECT
    USING (
        id = get_my_org_id()
        OR get_my_role() IN ('super_admin', 'admin')
    );

DROP POLICY IF EXISTS "Only admins can create organizations" ON organizations;
CREATE POLICY "Only admins can create organizations"
    ON organizations FOR INSERT
    WITH CHECK (
        get_my_role() IN ('super_admin', 'admin')
    );

DROP POLICY IF EXISTS "Only admins can update organizations" ON organizations;
CREATE POLICY "Only admins can update organizations"
    ON organizations FOR UPDATE
    USING (
        get_my_role() IN ('super_admin', 'admin')
    );

DROP POLICY IF EXISTS "Only admins can delete organizations" ON organizations;
CREATE POLICY "Only admins can delete organizations"
    ON organizations FOR DELETE
    USING (
        get_my_role() IN ('super_admin', 'admin')
    );

-- ============================================================================
-- ACCOUNT REQUESTS: fix self-referencing policies
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view account requests" ON account_requests;
CREATE POLICY "Admins can view account requests"
    ON account_requests FOR SELECT
    USING (
        get_my_role() IN ('super_admin', 'admin')
        OR get_my_role() = 'manager'
        OR (get_my_role() = 'org_admin' AND organization_id = get_my_org_id())
    );

DROP POLICY IF EXISTS "Admins can update account requests" ON account_requests;
CREATE POLICY "Admins can update account requests"
    ON account_requests FOR UPDATE
    USING (
        get_my_role() IN ('super_admin', 'admin')
        OR get_my_role() = 'manager'
        OR (get_my_role() = 'org_admin' AND organization_id = get_my_org_id())
    );

-- ============================================================================
-- SYSTEM ANNOUNCEMENTS: fix self-referencing policies
-- ============================================================================
DROP POLICY IF EXISTS "Users can view active announcements, admins can view all" ON system_announcements;
CREATE POLICY "Users can view active announcements, admins can view all"
    ON system_announcements FOR SELECT
    USING (
        is_active = true
        OR get_my_role() IN ('super_admin', 'admin')
    );

DROP POLICY IF EXISTS "Only admins can insert announcements" ON system_announcements;
CREATE POLICY "Only admins can insert announcements"
    ON system_announcements FOR INSERT
    WITH CHECK (
        get_my_role() IN ('super_admin', 'admin')
    );

DROP POLICY IF EXISTS "Only admins can update announcements" ON system_announcements;
CREATE POLICY "Only admins can update announcements"
    ON system_announcements FOR UPDATE
    USING (
        get_my_role() IN ('super_admin', 'admin')
    );

DROP POLICY IF EXISTS "Only admins can delete announcements" ON system_announcements;
CREATE POLICY "Only admins can delete announcements"
    ON system_announcements FOR DELETE
    USING (
        get_my_role() IN ('super_admin', 'admin')
    );

-- ============================================================================
-- TAB VISIBILITY: fix self-referencing policies
-- ============================================================================
DROP POLICY IF EXISTS "Only super admins can update tab visibility" ON tab_visibility_settings;
CREATE POLICY "Only super admins can update tab visibility"
    ON tab_visibility_settings FOR UPDATE
    USING (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "Only super admins can insert tab visibility" ON tab_visibility_settings;
CREATE POLICY "Only super admins can insert tab visibility"
    ON tab_visibility_settings FOR INSERT
    WITH CHECK (get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "Only super admins can delete tab visibility" ON tab_visibility_settings;
CREATE POLICY "Only super admins can delete tab visibility"
    ON tab_visibility_settings FOR DELETE
    USING (get_my_role() = 'super_admin');

-- ============================================================================
-- Verify
-- ============================================================================
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('profiles', 'organizations', 'account_requests', 'system_announcements', 'tab_visibility_settings')
ORDER BY tablename, policyname;
