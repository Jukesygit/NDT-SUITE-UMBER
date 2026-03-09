-- =============================================================================
-- RESTORE RLS POLICIES FROM CSV EXPORT
-- =============================================================================
-- Source: docs/Supabase Snippet Row-Level Security Policies.csv
-- Generated: 2026-02-25
--
-- This script restores ALL RLS policies from the pg_policies CSV export
-- taken before pii-lockdown.sql was run.
--
-- RUN IN: Supabase SQL Editor
--
-- PREREQUISITES:
--   Helper functions are created in PHASE 0 of this script:
--     - auth_is_admin()
--     - auth_is_org_admin()
--     - auth_user_org_id()
--   These must already exist (from security-audit-fix-2026-02.sql / fix-inspections-rls.sql):
--     - can_access_vessel(TEXT)
--     - user_can_access_vessel(TEXT)
--
-- TABLES IN CSV:
--   account_requests, activity_log, asset_access_requests, assets,
--   competency_categories, competency_comments, competency_definitions,
--   competency_history, document_categories, document_review_schedule,
--   document_revisions, documents, email_reminder_log, email_reminder_settings,
--   employee_competencies, inspections, notification_email_log,
--   notification_email_recipients, organizations, password_reset_codes,
--   permission_requests, storage.objects
--
-- TABLES NOT IN CSV (sourced from pii-lockdown-restore.sql):
--   profiles, shared_assets, system_announcements, user_asset_access
--
-- SECURITY FIXES APPLIED (from code review):
--   C1: Added admin/org_admin/manager UPDATE policies on profiles
--   C2: Scoped profiles INSERT to caller's org for org_admin/manager
--   C3: Scoped profiles DELETE to caller's org + role hierarchy protection
--   C4: Added org scoping to employee_competencies _new policies
--   C5: Added org scoping to competency_history SELECT for org_admin
--   I1: Removed old {public} inspection policies (superseded by authenticated)
--   I5: Rewrote Phase 5 policies to use SECURITY DEFINER helper functions
--   S2: Added STABLE volatility marker to all helper functions
--   S5: Added missing folder check to competency document SELECT
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- PHASE 0: ENSURE HELPER FUNCTIONS EXIST
-- These are used by multiple policies. CREATE OR REPLACE is idempotent.
-- =============================================================================

-- auth_is_admin(): Returns true if current user has admin role
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
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$;

-- auth_is_org_admin(): Returns true if current user has org_admin role
CREATE OR REPLACE FUNCTION public.auth_is_org_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'org_admin'
    );
END;
$$;

-- auth_user_org_id(): Returns the current user's organization_id
CREATE OR REPLACE FUNCTION public.auth_user_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
    );
END;
$$;

-- auth_user_role(): Returns the current user's role (avoids self-referencing profiles)
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
        SELECT role FROM profiles WHERE id = auth.uid()
    );
END;
$$;

-- Grant execute to authenticated and public roles
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO public;
GRANT EXECUTE ON FUNCTION public.auth_is_org_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_org_admin() TO public;
GRANT EXECUTE ON FUNCTION public.auth_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_org_id() TO public;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO public;

-- =============================================================================
-- PHASE 1: DROP ALL EXISTING POLICIES (lockdown + any stragglers)
-- =============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all public schema policies on relevant tables
    FOR r IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
            'account_requests', 'activity_log', 'asset_access_requests', 'assets',
            'competency_categories', 'competency_comments', 'competency_definitions',
            'competency_history', 'document_categories', 'document_review_schedule',
            'document_revisions', 'documents', 'email_reminder_log',
            'email_reminder_settings', 'employee_competencies', 'inspections',
            'notification_email_log', 'notification_email_recipients',
            'organizations', 'password_reset_codes', 'permission_requests',
            'profiles', 'shared_assets', 'system_announcements', 'user_asset_access'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;

    -- Drop all storage.objects policies
    FOR r IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
    END LOOP;
END $$;

-- =============================================================================
-- PHASE 2: ENSURE RLS IS ENABLED ON ALL TABLES
-- =============================================================================

ALTER TABLE account_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_review_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- These may not exist - wrapped in DO block
DO $$ BEGIN
    ALTER TABLE shared_assets ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE system_announcements ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_asset_access ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- =============================================================================
-- PHASE 3: CREATE POLICIES FROM CSV EXPORT
-- =============================================================================

-- =====================================================
-- TABLE: account_requests (5 policies)
-- =====================================================

CREATE POLICY "Service role can create account requests"
    ON account_requests FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "account_requests_delete_new"
    ON account_requests FOR DELETE
    TO authenticated
    USING (auth_is_admin() = true);

CREATE POLICY "account_requests_insert_new"
    ON account_requests FOR INSERT
    TO public
    WITH CHECK (status = 'pending'::text);

CREATE POLICY "account_requests_select_new"
    ON account_requests FOR SELECT
    TO public
    USING ((auth_is_admin() = true) OR (auth_is_org_admin() = true));

CREATE POLICY "account_requests_update_new"
    ON account_requests FOR UPDATE
    TO authenticated
    USING ((auth_is_admin() = true) OR (auth_is_org_admin() = true));

-- =====================================================
-- TABLE: activity_log (4 policies)
-- =====================================================

CREATE POLICY "Admins can view all activity logs"
    ON activity_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'::text
        )
    );

CREATE POLICY "Authenticated users can log activity"
    ON activity_log FOR INSERT
    TO authenticated
    WITH CHECK (
        (auth.uid() IS NOT NULL)
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id IS NOT NULL
        )
    );

CREATE POLICY "Service role full access"
    ON activity_log FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can view own activity"
    ON activity_log FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- =====================================================
-- TABLE: asset_access_requests (3 policies)
-- =====================================================

CREATE POLICY "Admins can update asset access requests"
    ON asset_access_requests FOR UPDATE
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND (
                  profiles.role = 'admin'::text
                  OR (profiles.role = 'org_admin'::text
                      AND profiles.organization_id = asset_access_requests.owner_organization_id)
              )
        )
    );

CREATE POLICY "Authenticated users can create asset access requests"
    ON asset_access_requests FOR INSERT
    TO public
    WITH CHECK (
        (auth.uid() = user_id)
        AND (auth.uid() IS NOT NULL)
        AND (user_organization_id IN (
            SELECT profiles.organization_id
            FROM profiles
            WHERE profiles.id = auth.uid()
        ))
    );

CREATE POLICY "Users can view relevant asset access requests"
    ON asset_access_requests FOR SELECT
    TO public
    USING (
        (user_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND (
                  profiles.role = 'admin'::text
                  OR (profiles.role = 'org_admin'::text
                      AND profiles.organization_id = asset_access_requests.owner_organization_id)
              )
        )
    );

-- =====================================================
-- TABLE: assets (4 policies)
-- =====================================================

CREATE POLICY "Editors can delete own org assets"
    ON assets FOR DELETE
    TO public
    USING (
        (
            (organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()))
            AND ((SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['editor'::text, 'org_admin'::text, 'admin'::text]))
        )
        OR ((SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = 'admin'::text)
    );

CREATE POLICY "Users can create assets in their org"
    ON assets FOR INSERT
    TO public
    WITH CHECK (
        (
            (organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()))
            AND (created_by = auth.uid())
        )
        OR (
            ((SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = 'admin'::text)
            AND (created_by = auth.uid())
        )
    );

CREATE POLICY "Users can update own org assets"
    ON assets FOR UPDATE
    TO public
    USING (
        (
            (organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()))
            AND (
                (created_by = auth.uid())
                OR ((SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['editor'::text, 'org_admin'::text, 'admin'::text]))
            )
        )
        OR ((SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = 'admin'::text)
    );

CREATE POLICY "Users can view accessible assets"
    ON assets FOR SELECT
    TO public
    USING (
        -- SYSTEM or Matrix org users can see all
        ((SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()) IN (
            SELECT organizations.id FROM organizations
            WHERE organizations.name = ANY (ARRAY['SYSTEM'::text, 'Matrix'::text])
        ))
        OR
        -- Same org
        (organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()))
        OR
        -- Shared assets
        (id IN (
            SELECT shared_assets.asset_id FROM shared_assets
            WHERE shared_assets.shared_with_organization_id = (
                SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()
            )
        ))
    );

-- =====================================================
-- TABLE: competency_categories (2 policies)
-- =====================================================

CREATE POLICY "Authenticated users can view competency categories"
    ON competency_categories FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admins can manage competency categories"
    ON competency_categories FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

-- =====================================================
-- TABLE: competency_comments (4 policies)
-- =====================================================

CREATE POLICY "Users can create competency comments"
    ON competency_comments FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM employee_competencies ec
            WHERE ec.id = competency_comments.employee_competency_id
              AND (
                  ec.user_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM profiles p
                      WHERE p.id = auth.uid()
                        AND (
                            p.role = 'admin'::text
                            OR (p.role = 'org_admin'::text
                                AND p.organization_id IN (
                                    SELECT profiles.organization_id FROM profiles WHERE profiles.id = ec.user_id
                                ))
                        )
                  )
              )
        )
    );

CREATE POLICY "Users can delete own competency comments"
    ON competency_comments FOR DELETE
    TO authenticated
    USING (
        (created_by = auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Users can update own competency comments"
    ON competency_comments FOR UPDATE
    TO authenticated
    USING (
        (created_by = auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Users can view competency comments"
    ON competency_comments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM employee_competencies ec
            WHERE ec.id = competency_comments.employee_competency_id
              AND (
                  ec.user_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM profiles p
                      WHERE p.id = auth.uid()
                        AND (
                            p.role = 'admin'::text
                            OR (p.role = 'org_admin'::text
                                AND p.organization_id IN (
                                    SELECT profiles.organization_id FROM profiles WHERE profiles.id = ec.user_id
                                ))
                        )
                  )
              )
        )
    );

-- =====================================================
-- TABLE: competency_definitions (2 policies)
-- =====================================================

CREATE POLICY "competency_definitions_all_new"
    ON competency_definitions FOR ALL
    TO authenticated
    USING ((auth_is_admin() = true) OR (auth_is_org_admin() = true));

CREATE POLICY "competency_definitions_select_new"
    ON competency_definitions FOR SELECT
    TO authenticated
    USING (true);

-- =====================================================
-- TABLE: competency_history (3 policies)
-- =====================================================

CREATE POLICY "Authenticated users with org can insert history"
    ON competency_history FOR INSERT
    TO authenticated
    WITH CHECK (
        (auth.uid() IS NOT NULL)
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.organization_id IS NOT NULL
        )
    );

CREATE POLICY "System can insert competency history"
    ON competency_history FOR INSERT
    TO service_role
    WITH CHECK (true);

-- FIX C5: Added org scoping to org_admin check
CREATE POLICY "competency_history_select_new"
    ON competency_history FOR SELECT
    TO authenticated
    USING (
        (user_id = auth.uid())
        OR (auth_is_admin() = true)
        OR (
            auth_is_org_admin() = true
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = competency_history.user_id
                  AND profiles.organization_id = auth_user_org_id()
            )
        )
    );

-- =====================================================
-- TABLE: document_categories (2 policies)
-- =====================================================

CREATE POLICY "Admins can manage document categories"
    ON document_categories FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Authenticated users can view document categories"
    ON document_categories FOR SELECT
    TO authenticated
    USING (true);

-- =====================================================
-- TABLE: document_review_schedule (2 policies)
-- =====================================================

CREATE POLICY "Admins can manage review schedules in their org"
    ON document_review_schedule FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM documents d
            JOIN profiles p ON p.id = auth.uid()
            WHERE d.id = document_review_schedule.document_id
              AND d.organization_id = p.organization_id
              AND p.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Admins can view review schedules in their org"
    ON document_review_schedule FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM documents d
            JOIN profiles p ON p.id = auth.uid()
            WHERE d.id = document_review_schedule.document_id
              AND d.organization_id = p.organization_id
              AND p.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

-- =====================================================
-- TABLE: document_revisions (3 policies)
-- =====================================================

CREATE POLICY "Admins can create revisions in their org"
    ON document_revisions FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM documents d
            JOIN profiles p ON p.id = auth.uid()
            WHERE d.id = document_revisions.document_id
              AND d.organization_id = p.organization_id
              AND p.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Admins can update revisions in their org"
    ON document_revisions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM documents d
            JOIN profiles p ON p.id = auth.uid()
            WHERE d.id = document_revisions.document_id
              AND d.organization_id = p.organization_id
              AND p.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Users can view approved revisions in their org"
    ON document_revisions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_revisions.document_id
              AND d.organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid())
        )
        AND (
            status = 'approved'::text
            OR EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                  AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
            )
        )
    );

-- =====================================================
-- TABLE: documents (4 policies)
-- =====================================================

CREATE POLICY "Admins can create documents in their org"
    ON documents FOR INSERT
    TO authenticated
    WITH CHECK (
        (organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()))
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Admins can delete documents in their org"
    ON documents FOR DELETE
    TO authenticated
    USING (
        (organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()))
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Admins can update documents in their org"
    ON documents FOR UPDATE
    TO authenticated
    USING (
        (organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()))
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Users can view approved documents in their org"
    ON documents FOR SELECT
    TO authenticated
    USING (
        (organization_id = (SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()))
        AND (
            status = 'approved'::text
            OR EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                  AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
            )
        )
    );

-- =====================================================
-- TABLE: email_reminder_log (2 policies)
-- =====================================================

CREATE POLICY "Only service role can insert reminder logs"
    ON email_reminder_log FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Users can view their own reminder logs"
    ON email_reminder_log FOR SELECT
    TO authenticated
    USING (
        (user_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text
        )
    );

-- =====================================================
-- TABLE: email_reminder_settings (3 policies)
-- =====================================================

CREATE POLICY "Only admins can insert email reminder settings"
    ON email_reminder_settings FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text)
    );

CREATE POLICY "Only admins can update email reminder settings"
    ON email_reminder_settings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text)
    );

CREATE POLICY "Only admins can view email reminder settings"
    ON email_reminder_settings FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text)
    );

-- =====================================================
-- TABLE: employee_competencies (4 policies)
-- FIX C4: Added org scoping to org_admin checks.
--         Removed duplicate old DELETE policy.
--         org_admin can only access competencies for users in their own org.
-- =====================================================

CREATE POLICY "employee_competencies_delete_new"
    ON employee_competencies FOR DELETE
    TO authenticated
    USING (
        auth_is_admin() = true
        OR (
            auth_is_org_admin() = true
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = employee_competencies.user_id
                  AND profiles.organization_id = auth_user_org_id()
            )
        )
    );

CREATE POLICY "employee_competencies_insert_new"
    ON employee_competencies FOR INSERT
    TO authenticated
    WITH CHECK (
        (user_id = auth.uid())
        OR (auth_is_admin() = true)
        OR (
            auth_is_org_admin() = true
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = employee_competencies.user_id
                  AND profiles.organization_id = auth_user_org_id()
            )
        )
    );

CREATE POLICY "employee_competencies_select_new"
    ON employee_competencies FOR SELECT
    TO authenticated
    USING (
        (user_id = auth.uid())
        OR (auth_is_admin() = true)
        OR (
            auth_is_org_admin() = true
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = employee_competencies.user_id
                  AND profiles.organization_id = auth_user_org_id()
            )
        )
    );

CREATE POLICY "employee_competencies_update_new"
    ON employee_competencies FOR UPDATE
    TO authenticated
    USING (
        (user_id = auth.uid())
        OR (auth_is_admin() = true)
        OR (
            auth_is_org_admin() = true
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = employee_competencies.user_id
                  AND profiles.organization_id = auth_user_org_id()
            )
        )
    )
    WITH CHECK (
        (auth_is_admin() = true)
        OR (
            auth_is_org_admin() = true
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = employee_competencies.user_id
                  AND profiles.organization_id = auth_user_org_id()
            )
        )
        OR ((user_id = auth.uid()) AND (status <> 'approved'::text))
    );

-- =====================================================
-- TABLE: inspections (4 policies)
-- FIX I1+I2: Removed old {public} role policies (superseded).
--            Keeping only authenticated-role policies using user_can_access_vessel().
-- DEPRECATED old policies (removed):
--   "Editors can delete inspections" (public, can_access_vessel)
--   "Users can create inspections in accessible vessels" (public, can_access_vessel)
--   "Users can update inspections in own org" (public, can_access_vessel)
--   "Users can view inspections from accessible vessels" (public, inline subquery)
-- =====================================================

CREATE POLICY "inspections_delete_policy"
    ON inspections FOR DELETE
    TO authenticated
    USING (user_can_access_vessel(vessel_id));

CREATE POLICY "inspections_insert_policy"
    ON inspections FOR INSERT
    TO authenticated
    WITH CHECK (user_can_access_vessel(vessel_id));

CREATE POLICY "inspections_select_policy"
    ON inspections FOR SELECT
    TO authenticated
    USING (user_can_access_vessel(vessel_id));

CREATE POLICY "inspections_update_policy"
    ON inspections FOR UPDATE
    TO authenticated
    USING (user_can_access_vessel(vessel_id))
    WITH CHECK (user_can_access_vessel(vessel_id));

-- =====================================================
-- TABLE: notification_email_log (3 policies)
-- =====================================================

CREATE POLICY "Admins can insert notification logs"
    ON notification_email_log FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text)
    );

CREATE POLICY "Admins can update notification logs"
    ON notification_email_log FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text)
    );

CREATE POLICY "Admins can view notification logs"
    ON notification_email_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text)
    );

-- =====================================================
-- TABLE: notification_email_recipients (3 policies)
-- =====================================================

CREATE POLICY "Admins can insert recipient logs"
    ON notification_email_recipients FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text)
    );

CREATE POLICY "Admins can update recipient logs"
    ON notification_email_recipients FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text)
    );

CREATE POLICY "Admins can view recipient logs"
    ON notification_email_recipients FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text)
    );

-- =====================================================
-- TABLE: organizations (4 policies)
-- =====================================================

CREATE POLICY "organizations_delete_new"
    ON organizations FOR DELETE
    TO authenticated
    USING (auth_is_admin() = true);

CREATE POLICY "organizations_insert_new"
    ON organizations FOR INSERT
    TO authenticated
    WITH CHECK (auth_is_admin() = true);

CREATE POLICY "organizations_select_new"
    ON organizations FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "organizations_update_new"
    ON organizations FOR UPDATE
    TO authenticated
    USING (
        (auth_is_admin() = true)
        OR ((auth_is_org_admin() = true) AND (id = auth_user_org_id()))
    );

-- =====================================================
-- TABLE: password_reset_codes (4 policies)
-- =====================================================

CREATE POLICY "Service role only - delete"
    ON password_reset_codes FOR DELETE
    TO service_role
    USING (true);

CREATE POLICY "Service role only - insert"
    ON password_reset_codes FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Service role only - select"
    ON password_reset_codes FOR SELECT
    TO service_role
    USING (true);

CREATE POLICY "Service role only - update"
    ON password_reset_codes FOR UPDATE
    TO service_role
    USING (true);

-- =====================================================
-- TABLE: permission_requests (3 policies)
-- =====================================================

CREATE POLICY "permission_requests_insert_new"
    ON permission_requests FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "permission_requests_select_new"
    ON permission_requests FOR SELECT
    TO authenticated
    USING (
        (user_id = auth.uid())
        OR (auth_is_admin() = true)
        OR (auth_is_org_admin() = true)
    );

CREATE POLICY "permission_requests_update_new"
    ON permission_requests FOR UPDATE
    TO authenticated
    USING ((auth_is_admin() = true) OR (auth_is_org_admin() = true));


-- =============================================================================
-- PHASE 4: STORAGE POLICIES (from CSV)
-- =============================================================================

-- =====================================================
-- STORAGE: Controlled documents
-- =====================================================

CREATE POLICY "Admins can delete controlled documents"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = 'controlled-documents'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Admins can upload controlled documents"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = 'controlled-documents'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
        )
    );

CREATE POLICY "Users can view controlled documents"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = 'controlled-documents'
    );

-- =====================================================
-- STORAGE: Avatars
-- =====================================================

CREATE POLICY "Anyone can view avatars"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'avatars');

CREATE POLICY "Users can delete own avatar"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can update own avatar"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can upload own avatar"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- =====================================================
-- STORAGE: Competency documents
-- =====================================================

CREATE POLICY "Users can upload their own competency documents"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = 'competency-documents'
        AND (
            (storage.foldername(name))[2] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text
            )
            OR EXISTS (
                SELECT 1 FROM profiles admin_profile
                JOIN profiles target_profile ON admin_profile.organization_id = target_profile.organization_id
                WHERE admin_profile.id = auth.uid()
                  AND admin_profile.role = 'org_admin'::text
                  AND target_profile.id::text = (storage.foldername(objects.name))[2]
            )
        )
    );

-- FIX S5: Added missing (storage.foldername(name))[1] = 'competency-documents' check
CREATE POLICY "Users can view their own competency documents"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = 'competency-documents'
        AND (
            (storage.foldername(name))[2] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::text
            )
            OR EXISTS (
                SELECT 1 FROM profiles p1
                JOIN profiles p2 ON p1.organization_id = p2.organization_id
                WHERE p1.id = auth.uid()
                  AND p1.role = 'org_admin'::text
                  AND p2.id::text = (storage.foldername(objects.name))[2]
            )
        )
    );

CREATE POLICY "Users can update their own competency documents"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[2] = auth.uid()::text
    );

CREATE POLICY "Users can delete their own competency documents"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'documents'
        AND (
            (storage.foldername(name))[2] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                  AND profiles.role = ANY (ARRAY['admin'::text, 'org_admin'::text])
            )
        )
    );

-- =====================================================
-- STORAGE: 3D models
-- =====================================================

CREATE POLICY "Users can upload 3D models for own org vessels"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = '3d-models'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
        )
    );

CREATE POLICY "Users can view accessible 3D models"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = '3d-models'
        AND (
            (storage.foldername(name))[1] IN (
                SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
            )
            OR (storage.foldername(name))[2] IN (
                SELECT a.id FROM assets a
                JOIN shared_assets sa ON a.id = sa.asset_id
                WHERE sa.shared_with_organization_id = (
                    SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can update own org 3D models"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = '3d-models'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['editor'::text, 'org_admin'::text, 'admin'::text])
        )
    );

CREATE POLICY "Editors can delete 3D models"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = '3d-models'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['editor'::text, 'org_admin'::text, 'admin'::text])
        )
    );

-- =====================================================
-- STORAGE: Scan data
-- =====================================================

CREATE POLICY "Users can upload scan data for own org"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'scan-data'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
        )
    );

CREATE POLICY "Users can view accessible scan data"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'scan-data'
        AND (
            (storage.foldername(name))[1] IN (
                SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
            )
            OR (storage.foldername(name))[2] IN (
                SELECT a.id FROM assets a
                JOIN shared_assets sa ON a.id = sa.asset_id
                WHERE sa.shared_with_organization_id = (
                    SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can update own org scan data"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'scan-data'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['editor'::text, 'org_admin'::text, 'admin'::text])
        )
    );

CREATE POLICY "Editors can delete scan data"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'scan-data'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['editor'::text, 'org_admin'::text, 'admin'::text])
        )
    );

-- =====================================================
-- STORAGE: Scan images
-- =====================================================

CREATE POLICY "Users can upload scan images for own org"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'scan-images'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
        )
    );

CREATE POLICY "Users can view accessible scan images"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'scan-images'
        AND (
            (storage.foldername(name))[1] IN (
                SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
            )
            OR (storage.foldername(name))[2] IN (
                SELECT a.id FROM assets a
                JOIN shared_assets sa ON a.id = sa.asset_id
                WHERE sa.shared_with_organization_id = (
                    SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can update own org scan images"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'scan-images'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['editor'::text, 'org_admin'::text, 'admin'::text])
        )
    );

CREATE POLICY "Editors can delete scan images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'scan-images'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['editor'::text, 'org_admin'::text, 'admin'::text])
        )
    );

-- =====================================================
-- STORAGE: Vessel images
-- =====================================================

CREATE POLICY "Users can upload vessel images for own org"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'vessel-images'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
        )
    );

CREATE POLICY "Users can view accessible vessel images"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'vessel-images'
        AND (
            (storage.foldername(name))[1] IN (
                SELECT profiles.organization_id::text FROM profiles WHERE profiles.id = auth.uid()
            )
            OR (storage.foldername(name))[2] IN (
                SELECT a.id FROM assets a
                JOIN shared_assets sa ON a.id = sa.asset_id
                WHERE sa.shared_with_organization_id = (
                    SELECT profiles.organization_id FROM profiles WHERE profiles.id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can update own org vessel images"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'vessel-images'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['editor'::text, 'org_admin'::text, 'admin'::text])
        )
    );

CREATE POLICY "Editors can delete vessel images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'vessel-images'
        AND (storage.foldername(name))[1] IN (
            SELECT profiles.organization_id::text FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = ANY (ARRAY['editor'::text, 'org_admin'::text, 'admin'::text])
        )
    );


-- =============================================================================
-- PHASE 5: TABLES NOT IN CSV (sourced from pii-lockdown-restore.sql)
-- These tables were not in the CSV export but need policies.
-- =============================================================================

-- =====================================================
-- TABLE: profiles (NOT IN CSV - from security-audit-fix + restore)
-- CRITICAL: All policies use SECURITY DEFINER helper functions
--           to avoid self-referencing infinite recursion.
-- FIX C1: Added admin/org_admin/manager UPDATE policies.
-- FIX C2: Scoped INSERT to caller's org for org_admin/manager.
-- FIX C3: Scoped DELETE to caller's org + role hierarchy protection.
-- =====================================================

-- SELECT: Own profile, admin sees all, same-org users see each other
CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR auth_is_admin() = true
        OR (organization_id IS NOT NULL AND organization_id = auth_user_org_id())
    );

-- UPDATE: Self-update for any user
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- UPDATE: Admin can update any profile
CREATE POLICY "Admins can update any profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth_is_admin() = true)
    WITH CHECK (auth_is_admin() = true);

-- UPDATE: Org admin can update same-org profiles (except admin profiles)
CREATE POLICY "Org admins can update profiles in their org"
    ON profiles FOR UPDATE
    TO authenticated
    USING (
        auth_is_org_admin() = true
        AND organization_id = auth_user_org_id()
        AND role NOT IN ('admin')
    )
    WITH CHECK (
        auth_is_org_admin() = true
        AND organization_id = auth_user_org_id()
        AND role NOT IN ('admin')
    );

-- UPDATE: Manager can update same-org profiles (except admin/manager/org_admin)
CREATE POLICY "Managers can update profiles in their org"
    ON profiles FOR UPDATE
    TO authenticated
    USING (
        auth_user_role() = 'manager'
        AND organization_id = auth_user_org_id()
        AND role NOT IN ('admin', 'manager', 'org_admin')
    )
    WITH CHECK (
        auth_user_role() = 'manager'
        AND organization_id = auth_user_org_id()
        AND role NOT IN ('admin', 'manager', 'org_admin')
    );

-- INSERT: Scoped to caller's org for non-admin roles
CREATE POLICY "Admins can create users"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (
        auth_is_admin() = true
        OR (auth_is_org_admin() = true AND organization_id = auth_user_org_id())
        OR (auth_user_role() = 'manager' AND organization_id = auth_user_org_id())
    );

-- DELETE: Scoped to caller's org + role hierarchy protection
CREATE POLICY "Admins can delete users"
    ON profiles FOR DELETE
    TO authenticated
    USING (
        id != auth.uid()
        AND (
            auth_is_admin() = true
            OR (
                auth_is_org_admin() = true
                AND organization_id = auth_user_org_id()
                AND role NOT IN ('admin', 'org_admin')
            )
            OR (
                auth_user_role() = 'manager'
                AND organization_id = auth_user_org_id()
                AND role NOT IN ('admin', 'manager', 'org_admin')
            )
        )
    );

-- =====================================================
-- TABLE: shared_assets (NOT IN CSV - from restore)
-- FIX I5: Using helper functions instead of direct profiles subqueries.
-- =====================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shared_assets' AND table_schema = 'public') THEN
        CREATE POLICY "Users can view relevant shares"
            ON shared_assets FOR SELECT
            USING (
                auth_is_admin() = true
                OR owner_organization_id = auth_user_org_id()
                OR shared_with_organization_id = auth_user_org_id()
            );

        CREATE POLICY "Only admins can create shares"
            ON shared_assets FOR INSERT
            WITH CHECK (auth_is_admin() = true);

        CREATE POLICY "Only admins can update shares"
            ON shared_assets FOR UPDATE
            USING (auth_is_admin() = true);

        CREATE POLICY "Only admins can delete shares"
            ON shared_assets FOR DELETE
            USING (auth_is_admin() = true);
    END IF;
END $$;

-- =====================================================
-- TABLE: system_announcements (NOT IN CSV - from restore)
-- FIX I5: Using helper functions instead of direct profiles subqueries.
-- =====================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_announcements' AND table_schema = 'public') THEN
        CREATE POLICY "Users can view active announcements"
            ON system_announcements FOR SELECT
            USING (is_active = true OR auth_is_admin() = true);

        CREATE POLICY "Only admins can insert announcements"
            ON system_announcements FOR INSERT
            WITH CHECK (auth_is_admin() = true);

        CREATE POLICY "Only admins can update announcements"
            ON system_announcements FOR UPDATE
            USING (auth_is_admin() = true);

        CREATE POLICY "Only admins can delete announcements"
            ON system_announcements FOR DELETE
            USING (auth_is_admin() = true);
    END IF;
END $$;

-- =====================================================
-- TABLE: user_asset_access (NOT IN CSV - from restore)
-- FIX I5: Using auth_user_org_id() instead of direct profiles subqueries.
-- =====================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_asset_access' AND table_schema = 'public') THEN
        CREATE POLICY "Users can view their own asset access grants"
            ON user_asset_access FOR SELECT
            USING (
                user_id = auth.uid()
                OR auth_user_org_id() = (SELECT id FROM organizations WHERE name = 'SYSTEM')
                OR asset_id IN (
                    SELECT id FROM assets WHERE organization_id = auth_user_org_id()
                )
            );

        CREATE POLICY "SYSTEM org and asset owners can grant access"
            ON user_asset_access FOR INSERT
            WITH CHECK (
                auth_user_org_id() = (SELECT id FROM organizations WHERE name = 'SYSTEM')
                OR asset_id IN (
                    SELECT id FROM assets WHERE organization_id = auth_user_org_id()
                )
            );

        CREATE POLICY "SYSTEM org and asset owners can revoke access"
            ON user_asset_access FOR DELETE
            USING (
                auth_user_org_id() = (SELECT id FROM organizations WHERE name = 'SYSTEM')
                OR asset_id IN (
                    SELECT id FROM assets WHERE organization_id = auth_user_org_id()
                )
            );

        CREATE POLICY "SYSTEM org and asset owners can update access"
            ON user_asset_access FOR UPDATE
            USING (
                auth_user_org_id() = (SELECT id FROM organizations WHERE name = 'SYSTEM')
                OR asset_id IN (
                    SELECT id FROM assets WHERE organization_id = auth_user_org_id()
                )
            );
    END IF;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION: Run these after the restore to confirm everything is in place
-- =============================================================================

-- Count policies by table
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
GROUP BY tablename
ORDER BY tablename;

-- Show all policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;
