-- Fix Competency Tables RLS Policies
-- This script replaces all competency-related RLS policies with non-recursive versions
-- using the auth helper functions created in auth-helper-functions.sql

-- IMPORTANT: Run auth-helper-functions.sql FIRST before running this script!

-- ====================
-- Fix ORGANIZATIONS table
-- ====================

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view organizations" ON organizations;
DROP POLICY IF EXISTS "Admins can manage organizations" ON organizations;

-- Create new policies using helper functions
CREATE POLICY "organizations_select_policy"
    ON organizations FOR SELECT
    TO authenticated
    USING (true);  -- All authenticated users can view organizations

CREATE POLICY "organizations_manage_policy"
    ON organizations FOR ALL
    TO authenticated
    USING (auth.is_admin() OR auth.is_org_admin());

-- ====================
-- Fix COMPETENCY_DEFINITIONS table
-- ====================

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view competency definitions" ON competency_definitions;
DROP POLICY IF EXISTS "Only admins can manage competency definitions" ON competency_definitions;

-- Create new policies using helper functions
CREATE POLICY "competency_definitions_select_policy"
    ON competency_definitions FOR SELECT
    TO authenticated
    USING (true);  -- All authenticated users can view definitions

CREATE POLICY "competency_definitions_manage_policy"
    ON competency_definitions FOR ALL
    TO authenticated
    USING (auth.is_admin() OR auth.is_org_admin());

-- ====================
-- Fix EMPLOYEE_COMPETENCIES table
-- ====================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view competencies" ON employee_competencies;
DROP POLICY IF EXISTS "Users can create competencies" ON employee_competencies;
DROP POLICY IF EXISTS "Users can update competencies" ON employee_competencies;
DROP POLICY IF EXISTS "Admins can delete competencies" ON employee_competencies;

-- Create new SELECT policy
CREATE POLICY "employee_competencies_select_policy"
    ON employee_competencies FOR SELECT
    TO authenticated
    USING (
        -- Users can view their own competencies
        user_id = auth.uid()
        OR
        -- Admins can view all
        auth.is_admin()
        OR
        -- Org admins can view competencies of users in their organization
        EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = auth.user_org_id()
            AND auth.is_org_admin()
        )
        OR
        -- Special case: Org admins can view pending approvals across organizations
        (auth.is_org_admin() AND status = 'pending_approval')
    );

-- Create INSERT policy
CREATE POLICY "employee_competencies_insert_policy"
    ON employee_competencies FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Users can create their own competencies
        user_id = auth.uid()
        OR
        -- Admins can create for anyone
        auth.is_admin()
        OR
        -- Org admins can create for users in their organization
        EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = auth.user_org_id()
            AND auth.is_org_admin()
        )
    );

-- Create UPDATE policy
CREATE POLICY "employee_competencies_update_policy"
    ON employee_competencies FOR UPDATE
    TO authenticated
    USING (
        -- Users can update their own competencies (limited)
        user_id = auth.uid()
        OR
        -- Admins can update all
        auth.is_admin()
        OR
        -- Org admins can update competencies in their organization
        EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = auth.user_org_id()
            AND auth.is_org_admin()
        )
        OR
        -- Special case: Org admins can approve pending competencies across organizations
        (auth.is_org_admin() AND status = 'pending_approval')
    )
    WITH CHECK (
        -- Prevent regular users from approving their own competencies
        CASE
            WHEN user_id = auth.uid() AND NOT auth.is_admin() AND NOT auth.is_org_admin() THEN
                status != 'approved'  -- Regular users cannot set status to approved
            ELSE
                true  -- Admins and org_admins have no restrictions
        END
    );

-- Create DELETE policy
CREATE POLICY "employee_competencies_delete_policy"
    ON employee_competencies FOR DELETE
    TO authenticated
    USING (
        -- Only admins and org_admins can delete
        auth.is_admin()
        OR
        -- Org admins can delete competencies in their organization
        EXISTS (
            SELECT 1 FROM profiles target_profile
            WHERE target_profile.id = employee_competencies.user_id
            AND target_profile.organization_id = auth.user_org_id()
            AND auth.is_org_admin()
        )
    );

-- ====================
-- Fix COMPETENCY_HISTORY table
-- ====================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view competency history" ON competency_history;
DROP POLICY IF EXISTS "System can insert competency history" ON competency_history;

-- Create new policies using helper functions
CREATE POLICY "competency_history_select_policy"
    ON competency_history FOR SELECT
    TO authenticated
    USING (
        -- Users can view their own history
        user_id = auth.uid()
        OR
        -- Admins and org_admins can view all
        auth.is_admin()
        OR
        auth.is_org_admin()
    );

CREATE POLICY "competency_history_insert_policy"
    ON competency_history FOR INSERT
    TO authenticated
    WITH CHECK (true);  -- System inserts via triggers

-- ====================
-- Fix PENDING_COMPETENCIES table (if it exists)
-- ====================

-- Check if table exists and apply policies
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pending_competencies') THEN
        -- Drop existing policies
        DROP POLICY IF EXISTS "Users can view pending competencies" ON pending_competencies;
        DROP POLICY IF EXISTS "Users can create pending competencies" ON pending_competencies;
        DROP POLICY IF EXISTS "Admins can manage pending competencies" ON pending_competencies;

        -- Create new policies
        EXECUTE 'CREATE POLICY "pending_competencies_select_policy"
            ON pending_competencies FOR SELECT
            TO authenticated
            USING (
                user_id = auth.uid()
                OR auth.is_admin()
                OR auth.is_org_admin()
            )';

        EXECUTE 'CREATE POLICY "pending_competencies_insert_policy"
            ON pending_competencies FOR INSERT
            TO authenticated
            WITH CHECK (
                user_id = auth.uid()
                OR auth.is_admin()
            )';

        EXECUTE 'CREATE POLICY "pending_competencies_manage_policy"
            ON pending_competencies FOR ALL
            TO authenticated
            USING (
                auth.is_admin()
                OR auth.is_org_admin()
            )';
    END IF;
END $$;

-- ====================
-- Fix COMPETENCY_COMMENTS table (if it exists)
-- ====================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'competency_comments') THEN
        -- Drop existing policies
        DROP POLICY IF EXISTS "View competency comments" ON competency_comments;
        DROP POLICY IF EXISTS "Create competency comments" ON competency_comments;
        DROP POLICY IF EXISTS "Update own comments" ON competency_comments;
        DROP POLICY IF EXISTS "Delete comments" ON competency_comments;

        -- Create new SELECT policy
        EXECUTE 'CREATE POLICY "competency_comments_select_policy"
            ON competency_comments FOR SELECT
            TO authenticated
            USING (
                -- View own comments
                created_by = auth.uid()
                OR
                -- Admins view all
                auth.is_admin()
                OR
                -- Org admins can view comments on competencies in their org
                EXISTS (
                    SELECT 1 FROM employee_competencies ec
                    JOIN profiles p ON p.id = ec.user_id
                    WHERE ec.id = competency_comments.competency_id
                    AND p.organization_id = auth.user_org_id()
                    AND auth.is_org_admin()
                )
            )';

        -- Create INSERT policy
        EXECUTE 'CREATE POLICY "competency_comments_insert_policy"
            ON competency_comments FOR INSERT
            TO authenticated
            WITH CHECK (
                -- Must be creating as yourself
                created_by = auth.uid()
                AND (
                    -- And be admin
                    auth.is_admin()
                    OR
                    -- Or org_admin for competencies in your org
                    EXISTS (
                        SELECT 1 FROM employee_competencies ec
                        JOIN profiles p ON p.id = ec.user_id
                        WHERE ec.id = competency_comments.competency_id
                        AND p.organization_id = auth.user_org_id()
                        AND auth.is_org_admin()
                    )
                )
            )';

        -- Create UPDATE policy
        EXECUTE 'CREATE POLICY "competency_comments_update_policy"
            ON competency_comments FOR UPDATE
            TO authenticated
            USING (
                -- Can only update own comments
                created_by = auth.uid()
            )';

        -- Create DELETE policy
        EXECUTE 'CREATE POLICY "competency_comments_delete_policy"
            ON competency_comments FOR DELETE
            TO authenticated
            USING (
                -- Delete own comments
                created_by = auth.uid()
                OR
                -- Or be admin
                auth.is_admin()
            )';
    END IF;
END $$;

-- Ensure RLS is enabled on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_history ENABLE ROW LEVEL SECURITY;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_employee_competencies_user_id
    ON employee_competencies(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_status
    ON employee_competencies(status);
CREATE INDEX IF NOT EXISTS idx_employee_competencies_user_status
    ON employee_competencies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_competency_history_user_id
    ON competency_history(user_id);

-- Verification queries
COMMENT ON SCHEMA public IS 'Competency RLS policies have been fixed to prevent infinite recursion using auth helper functions.';