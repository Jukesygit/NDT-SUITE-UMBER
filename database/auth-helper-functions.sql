-- Auth Helper Functions for RLS Policies
-- These functions use SECURITY DEFINER to bypass RLS and prevent infinite recursion
-- They provide safe access to user role and organization information

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

-- Composite function to get all user info at once (more efficient for complex policies)
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

-- Create indexes to optimize these lookups
CREATE INDEX IF NOT EXISTS idx_profiles_id_role ON profiles(id, role);
CREATE INDEX IF NOT EXISTS idx_profiles_id_org ON profiles(id, organization_id);