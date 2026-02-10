-- ==========================================================================
-- FIX: Profiles RLS policy causes 500 Internal Server Error
-- Date: 2026-02-10
-- Problem: The M8 security fix (security-fix-medium-severity-2026-02.sql)
--   introduced a self-referencing RLS policy on `profiles`. The policy's
--   USING clause contains subqueries that SELECT from `profiles` itself:
--
--     EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
--
--   PostgreSQL applies RLS to those inner queries too, creating recursive
--   policy evaluation that causes a 500 Internal Server Error on every
--   profiles SELECT — including the login flow's loadUserProfile() call.
--
-- Fix: Create two SECURITY DEFINER helper functions that read the current
--   user's role and organization_id WITHOUT triggering RLS (because
--   SECURITY DEFINER runs as the function owner, typically postgres/superuser).
--   Then rewrite the policy to call these helpers instead of subquerying
--   the profiles table directly.
-- ==========================================================================

-- Step 1: Create helper function to get the current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Step 2: Create helper function to get the current user's organization_id
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- Step 3: Drop the broken policy
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;

-- Step 4: Recreate the policy using helper functions (no self-reference)
CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    USING (
        -- Everyone can always see their own profile
        id = auth.uid()
        OR
        -- Admins can see ALL profiles (global administration)
        get_my_role() = 'admin'
        OR
        -- Non-admin users can see profiles in their own organization
        (
            organization_id IS NOT NULL
            AND organization_id = get_my_org_id()
        )
    );
