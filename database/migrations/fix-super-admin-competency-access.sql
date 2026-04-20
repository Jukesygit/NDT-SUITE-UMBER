-- ==========================================================================
-- FIX: super_admin cannot view/manage competencies
-- Date: 2026-04-14
-- Problem: The super_admin role was added after competency RLS policies
--   were written. All employee_competencies, competency_history, and
--   competency_comments policies only check for 'admin' — never
--   'super_admin'. The auth_is_admin() helper function also only
--   checks role = 'admin'.
--
-- Fix:
--   1. Update auth_is_admin() to include super_admin
--   2. Rewrite employee_competencies policies to include super_admin
--   3. Update competency_history SELECT policy
--   4. Update competency_comments policies
-- ==========================================================================

-- ============================================================================
-- STEP 1: Fix auth_is_admin() helper to include super_admin
-- ============================================================================
-- This also fixes any other policies that rely on auth_is_admin().

CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    );
END;
$$;

-- ============================================================================
-- STEP 2: Fix employee_competencies SELECT policy
-- ============================================================================
-- The security-audit-fix migration created this with 'admin' and 'manager'
-- but not 'super_admin'.

DROP POLICY IF EXISTS "Users can view competencies" ON employee_competencies;
DROP POLICY IF EXISTS "employee_competencies_select_new" ON employee_competencies;

CREATE POLICY "Users can view competencies"
ON employee_competencies FOR SELECT
TO authenticated
USING (
    -- Super admin and admin can see ALL competencies
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
    )
    OR
    -- Manager can see ALL competencies
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'manager'
    )
    OR
    -- Users can see their own competencies
    user_id = auth.uid()
    OR
    -- Org admin can see competencies of users in same org
    EXISTS (
        SELECT 1 FROM profiles p
        JOIN profiles target ON target.id = employee_competencies.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'org_admin'
        AND p.organization_id IS NOT NULL
        AND p.organization_id = target.organization_id
    )
);

-- ============================================================================
-- STEP 3: Fix employee_competencies INSERT policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can create competencies" ON employee_competencies;
DROP POLICY IF EXISTS "employee_competencies_insert_new" ON employee_competencies;

CREATE POLICY "Users can create competencies"
ON employee_competencies FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND (
            p.role IN ('super_admin', 'admin')
            OR (p.role = 'org_admin' AND p.organization_id IN (
                SELECT organization_id FROM profiles WHERE id = employee_competencies.user_id
            ))
        )
    )
);

-- ============================================================================
-- STEP 4: Fix employee_competencies UPDATE policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can update competencies" ON employee_competencies;
DROP POLICY IF EXISTS "employee_competencies_update_new" ON employee_competencies;

CREATE POLICY "Users can update competencies"
ON employee_competencies FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND (
            p.role IN ('super_admin', 'admin')
            OR (p.role = 'org_admin' AND p.organization_id IN (
                SELECT organization_id FROM profiles WHERE id = employee_competencies.user_id
            ))
        )
    )
);

-- ============================================================================
-- STEP 5: Fix employee_competencies DELETE policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can delete own competencies" ON employee_competencies;
DROP POLICY IF EXISTS "Admins can delete competencies" ON employee_competencies;
DROP POLICY IF EXISTS "employee_competencies_delete_new" ON employee_competencies;

CREATE POLICY "Users can delete own competencies"
ON employee_competencies FOR DELETE
TO authenticated
USING (
    user_id = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
    )
    OR
    EXISTS (
        SELECT 1 FROM profiles p
        JOIN profiles target ON target.id = employee_competencies.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'org_admin'
        AND p.organization_id = target.organization_id
    )
);

-- ============================================================================
-- STEP 6: Fix competency_history SELECT policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can view competency history" ON competency_history;

CREATE POLICY "Users can view competency history"
ON competency_history FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'org_admin')
    )
);

-- ============================================================================
-- STEP 7: Fix competency_comments policies
-- ============================================================================

-- SELECT
DROP POLICY IF EXISTS "Users can view competency comments" ON competency_comments;

CREATE POLICY "Users can view competency comments"
ON competency_comments FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM employee_competencies ec
        WHERE ec.id = competency_comments.employee_competency_id
        AND (
            ec.user_id = auth.uid()
            OR
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                AND (
                    p.role IN ('super_admin', 'admin')
                    OR (p.role = 'org_admin' AND p.organization_id IN (
                        SELECT organization_id FROM profiles WHERE id = ec.user_id
                    ))
                )
            )
        )
    )
);

-- INSERT
DROP POLICY IF EXISTS "Users can create competency comments" ON competency_comments;

CREATE POLICY "Users can create competency comments"
ON competency_comments FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM employee_competencies ec
        WHERE ec.id = competency_comments.employee_competency_id
        AND (
            ec.user_id = auth.uid()
            OR
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                AND (
                    p.role IN ('super_admin', 'admin')
                    OR (p.role = 'org_admin' AND p.organization_id IN (
                        SELECT organization_id FROM profiles WHERE id = ec.user_id
                    ))
                )
            )
        )
    )
);

-- UPDATE
DROP POLICY IF EXISTS "Users can update own competency comments" ON competency_comments;

CREATE POLICY "Users can update own competency comments"
ON competency_comments FOR UPDATE
TO authenticated
USING (
    created_by = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'org_admin')
    )
);

-- DELETE
DROP POLICY IF EXISTS "Users can delete own competency comments" ON competency_comments;

CREATE POLICY "Users can delete own competency comments"
ON competency_comments FOR DELETE
TO authenticated
USING (
    created_by = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'org_admin')
    )
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check updated policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('employee_competencies', 'competency_history', 'competency_comments')
ORDER BY tablename, policyname;

-- Verify auth_is_admin() now includes super_admin
SELECT auth_is_admin();
