-- Fix: Add super_admin to all competency-related RLS policies
-- super_admin was added in 20260408120000 but competency table policies were not updated

-- ============================================================
-- competency_categories: management policy
-- ============================================================
DROP POLICY IF EXISTS "Only admins can manage competency categories" ON competency_categories;
CREATE POLICY "Only admins can manage competency categories"
    ON competency_categories FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'org_admin')
        )
    );

-- ============================================================
-- competency_definitions: management policy
-- ============================================================
DROP POLICY IF EXISTS "Only admins can manage competency definitions" ON competency_definitions;
CREATE POLICY "Only admins can manage competency definitions"
    ON competency_definitions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'org_admin')
        )
    );

-- ============================================================
-- employee_competencies: SELECT policy
-- ============================================================
DROP POLICY IF EXISTS "Users can view competencies" ON employee_competencies;
CREATE POLICY "Users can view competencies"
    ON employee_competencies FOR SELECT
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

-- ============================================================
-- employee_competencies: INSERT policy
-- ============================================================
DROP POLICY IF EXISTS "Users can create competencies" ON employee_competencies;
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

-- ============================================================
-- employee_competencies: UPDATE policy
-- ============================================================
DROP POLICY IF EXISTS "Users can update competencies" ON employee_competencies;
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

-- ============================================================
-- employee_competencies: DELETE policy
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete competencies" ON employee_competencies;
CREATE POLICY "Admins can delete competencies"
    ON employee_competencies FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'org_admin')
        )
    );

-- ============================================================
-- competency_history: SELECT policy
-- ============================================================
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
