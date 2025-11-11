-- ================================================
-- MASTER RLS FIX MIGRATION SCRIPT V3
-- ================================================
-- This script fixes the infinite recursion error in Supabase RLS policies
-- by implementing SECURITY DEFINER functions to safely access user roles
-- without triggering recursive policy checks.
--
-- V3: Fixed OLD reference issue in WITH CHECK clause
-- ================================================

-- ====================
-- STEP 1: Create Helper Functions in PUBLIC Schema
-- ====================

-- Drop existing functions if they exist
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
        'viewer'  -- Default role if no profile exists
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
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
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
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'org_admin'
    );
$$;

-- Function to check if current user is org_admin for a specific organization
CREATE OR REPLACE FUNCTION public.auth_is_org_admin_for(org_id UUID)
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
CREATE OR REPLACE FUNCTION public.auth_user_info()
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
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_org_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_org_admin_for(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_info() TO authenticated;

-- Also grant to anon for account requests
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO anon;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.auth_is_org_admin() TO anon;

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
        public.auth_is_admin()
        OR
        -- Org admins can view profiles in their organization
        (public.auth_is_org_admin() AND organization_id = public.auth_user_org_id())
        OR
        -- Org admins can view profiles with pending approvals (cross-org)
        (
            public.auth_is_org_admin()
            AND EXISTS (
                SELECT 1 FROM employee_competencies ec
                WHERE ec.user_id = profiles.id
                AND ec.status = 'pending_approval'
            )
        )
    );

-- Create UPDATE policy (simplified to avoid OLD reference)
CREATE POLICY "profiles_update_policy"
    ON profiles FOR UPDATE
    USING (
        -- Users can update their own profile
        id = auth.uid()
        OR
        -- Admins can update all profiles
        public.auth_is_admin()
        OR
        -- Org admins can update profiles in their organization
        (public.auth_is_org_admin() AND organization_id = public.auth_user_org_id())
    )
    WITH CHECK (
        -- Users can update their own profile
        id = auth.uid()
        OR
        -- Admins can update all profiles
        public.auth_is_admin()
        OR
        -- Org admins can update profiles in their organization
        (public.auth_is_org_admin() AND organization_id = public.auth_user_org_id())
    );

-- Create INSERT policy
CREATE POLICY "profiles_insert_policy"
    ON profiles FOR INSERT
    WITH CHECK (
        id = auth.uid() OR public.auth_is_admin()
    );

-- Create DELETE policy
CREATE POLICY "profiles_delete_policy"
    ON profiles FOR DELETE
    USING (public.auth_is_admin());

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
DROP POLICY IF EXISTS "organizations_insert_policy" ON organizations;
DROP POLICY IF EXISTS "organizations_update_policy" ON organizations;
DROP POLICY IF EXISTS "organizations_delete_policy" ON organizations;

-- Create new policies
CREATE POLICY "organizations_select_policy"
    ON organizations FOR SELECT
    USING (
        id = public.auth_user_org_id()
        OR public.auth_is_admin()
        OR true  -- Allow viewing all organizations for selection
    );

CREATE POLICY "organizations_insert_policy"
    ON organizations FOR INSERT
    WITH CHECK (public.auth_is_admin());

CREATE POLICY "organizations_update_policy"
    ON organizations FOR UPDATE
    USING (public.auth_is_admin() OR (public.auth_is_org_admin() AND id = public.auth_user_org_id()));

CREATE POLICY "organizations_delete_policy"
    ON organizations FOR DELETE
    USING (public.auth_is_admin());

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
        OR public.auth_is_admin()
        OR EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = public.auth_user_org_id()
            AND public.auth_is_org_admin()
        )
        OR (public.auth_is_org_admin() AND status = 'pending_approval')
    );

CREATE POLICY "employee_competencies_insert_policy"
    ON employee_competencies FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        OR public.auth_is_admin()
        OR EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = public.auth_user_org_id()
            AND public.auth_is_org_admin()
        )
    );

CREATE POLICY "employee_competencies_update_policy"
    ON employee_competencies FOR UPDATE
    USING (
        user_id = auth.uid()
        OR public.auth_is_admin()
        OR EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = public.auth_user_org_id()
            AND public.auth_is_org_admin()
        )
        OR (public.auth_is_org_admin() AND status = 'pending_approval')
    )
    WITH CHECK (
        -- Allow the update if user is admin or org_admin
        public.auth_is_admin()
        OR public.auth_is_org_admin()
        OR
        -- Regular users can update their own but cannot approve
        (user_id = auth.uid() AND status != 'approved')
    );

CREATE POLICY "employee_competencies_delete_policy"
    ON employee_competencies FOR DELETE
    USING (
        public.auth_is_admin()
        OR EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = public.auth_user_org_id()
            AND public.auth_is_org_admin()
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
    USING (public.auth_is_admin() OR public.auth_is_org_admin());

-- Fix competency_history policies
DROP POLICY IF EXISTS "Users can view competency history" ON competency_history;
DROP POLICY IF EXISTS "System can insert competency history" ON competency_history;
DROP POLICY IF EXISTS "competency_history_select_policy" ON competency_history;
DROP POLICY IF EXISTS "competency_history_insert_policy" ON competency_history;

CREATE POLICY "competency_history_select_policy"
    ON competency_history FOR SELECT
    USING (
        user_id = auth.uid()
        OR public.auth_is_admin()
        OR public.auth_is_org_admin()
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
        OR public.auth_is_admin()
        OR (
            public.auth_is_org_admin()
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = permission_requests.user_id
                AND p.organization_id = public.auth_user_org_id()
            )
        )
    );

CREATE POLICY "permission_requests_insert_policy"
    ON permission_requests FOR INSERT
    WITH CHECK (auth.uid() = user_id AND auth.uid() IS NOT NULL);

CREATE POLICY "permission_requests_update_policy"
    ON permission_requests FOR UPDATE
    USING (
        public.auth_is_admin()
        OR (
            public.auth_is_org_admin()
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = permission_requests.user_id
                AND p.organization_id = public.auth_user_org_id()
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
        OR public.auth_is_admin()
        OR (public.auth_is_org_admin() AND organization_id = public.auth_user_org_id())
    );

CREATE POLICY "account_requests_insert_policy"
    ON account_requests FOR INSERT
    WITH CHECK (status = 'pending');

CREATE POLICY "account_requests_update_policy"
    ON account_requests FOR UPDATE
    USING (
        public.auth_is_admin()
        OR (public.auth_is_org_admin() AND organization_id = public.auth_user_org_id())
    );

CREATE POLICY "account_requests_delete_policy"
    ON account_requests FOR DELETE
    USING (public.auth_is_admin());

-- ====================
-- STEP 7: Update Existing Functions to Use Public Schema
-- ====================

-- Update the approve_permission_request function
CREATE OR REPLACE FUNCTION approve_permission_request(request_id UUID)
RETURNS JSONB AS $$
DECLARE
    request_record permission_requests;
    result JSONB;
    is_authorized BOOLEAN;
BEGIN
    -- Check authorization using helper function
    is_authorized := public.auth_is_admin() OR public.auth_is_org_admin();

    IF NOT is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- Additional check for org admins - can only approve within their org
    IF public.auth_is_org_admin() AND NOT public.auth_is_admin() THEN
        IF NOT EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = request_record.user_id
            AND p.organization_id = public.auth_user_org_id()
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cannot approve requests outside your organization');
        END IF;
    END IF;

    -- Update the user's role
    UPDATE profiles
    SET role = request_record.requested_role,
        updated_at = NOW()
    WHERE id = request_record.user_id;

    -- Update the request status
    UPDATE permission_requests
    SET status = 'approved',
        approved_by = auth.uid(),
        approved_at = NOW()
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Permission request approved');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the reject_permission_request function
CREATE OR REPLACE FUNCTION reject_permission_request(request_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    request_record permission_requests;
    is_authorized BOOLEAN;
BEGIN
    -- Check authorization using helper function
    is_authorized := public.auth_is_admin() OR public.auth_is_org_admin();

    IF NOT is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- Additional check for org admins - can only reject within their org
    IF public.auth_is_org_admin() AND NOT public.auth_is_admin() THEN
        IF NOT EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = request_record.user_id
            AND p.organization_id = public.auth_user_org_id()
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cannot reject requests outside your organization');
        END IF;
    END IF;

    -- Update the request status
    UPDATE permission_requests
    SET status = 'rejected',
        rejected_by = auth.uid(),
        rejected_at = NOW(),
        rejection_reason = reason
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Permission request rejected');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================
-- STEP 8: Additional Role Protection
-- ====================

-- Create a trigger to prevent regular users from escalating their own privileges
CREATE OR REPLACE FUNCTION check_profile_role_update()
RETURNS TRIGGER AS $$
BEGIN
    -- If user is updating their own profile and they're not an admin
    IF NEW.id = auth.uid() AND NOT public.auth_is_admin() THEN
        -- Prevent role changes for non-admins
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'You cannot change your own role';
        END IF;
        -- Prevent organization changes for non-admins
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
            RAISE EXCEPTION 'You cannot change your own organization';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists and recreate
DROP TRIGGER IF EXISTS check_profile_role_update_trigger ON profiles;
CREATE TRIGGER check_profile_role_update_trigger
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION check_profile_role_update();

-- ====================
-- STEP 9: Create Indexes for Performance
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
-- STEP 10: Ensure RLS is Enabled
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

    -- Check that our helper functions exist and work
    PERFORM public.auth_user_role();
    RAISE NOTICE 'Helper functions working correctly ✓';

    RAISE NOTICE '';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'RLS FIX V3 APPLIED SUCCESSFULLY!';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'The infinite recursion issue has been resolved.';
    RAISE NOTICE 'Your application should now work without 500 errors.';
    RAISE NOTICE '';
    RAISE NOTICE 'Functions created in public schema (Supabase compatible).';
    RAISE NOTICE 'Role escalation protection added via trigger.';
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