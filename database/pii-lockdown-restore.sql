-- =============================================================================
-- PII LOCKDOWN RESTORE SCRIPT
-- Reverses database/pii-lockdown.sql and restores full RLS policies.
--
-- FOR FUTURE CLAUDE INSTANCES:
--   This script restores all RLS policies that were removed by pii-lockdown.sql.
--   After running this SQL in Supabase SQL Editor, also set
--   VITE_MAINTENANCE_MODE=false in .env, rebuild (npm run build), and redeploy.
--
-- IMPORTANT: The user also has a CSV export of the original pg_policies output
--   saved externally. If this script fails on any policy, cross-reference that
--   CSV to get the exact original policy definition.
--
-- POLICIES RECONSTRUCTED FROM: supabase-schema.sql, competency-schema.sql,
--   supabase-profile-schema.sql, activity-log-schema.sql, email-reminder-schema.sql,
--   password-reset-codes-schema.sql, storage-policies.sql, add-competency-comments.sql,
--   supabase-sharing-schema.sql, supabase-asset-access-requests-schema.sql,
--   migrations/document-control-schema.sql, migrations/notification-email-schema.sql,
--   migrations/user-level-asset-access.sql
-- =============================================================================

BEGIN;

-- =====================================================
-- STEP 1: Drop all lockdown policies
-- =====================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'lockdown_%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- =====================================================
-- STEP 2: PROFILES
-- =====================================================
CREATE POLICY "Users can view profiles"
    ON profiles FOR SELECT
    USING (
        id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'
                OR p.role = 'manager'
                OR (p.role = 'org_admin' AND p.organization_id = profiles.organization_id)
            )
        )
    );

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can create users"
    ON profiles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR role = 'manager'
                OR (role = 'org_admin' AND organization_id = profiles.organization_id)
            )
        )
    );

CREATE POLICY "Admins can delete users"
    ON profiles FOR DELETE
    USING (
        id != auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (
                p.role = 'admin'
                OR p.role = 'manager'
                OR (p.role = 'org_admin' AND p.organization_id = profiles.organization_id)
            )
        )
    );

-- =====================================================
-- STEP 3: ORGANIZATIONS
-- =====================================================
CREATE POLICY "Users can view their organization"
    ON organizations FOR SELECT
    USING (
        id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Only admins can create organizations"
    ON organizations FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admins can update organizations"
    ON organizations FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admins can delete organizations"
    ON organizations FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- =====================================================
-- STEP 4: ACTIVITY_LOG
-- =====================================================
CREATE POLICY "Admins and managers can view all activity logs"
    ON activity_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Users can view own activity"
    ON activity_log FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Allow activity logging"
    ON activity_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Service role full access"
    ON activity_log FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- STEP 5: EMPLOYEE_COMPETENCIES
-- =====================================================
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
                p.role = 'admin'
                OR (p.role = 'org_admin' AND p.organization_id IN (
                    SELECT organization_id FROM profiles WHERE id = employee_competencies.user_id
                ))
            )
        )
    );

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
                p.role = 'admin'
                OR (p.role = 'org_admin' AND p.organization_id IN (
                    SELECT organization_id FROM profiles WHERE id = employee_competencies.user_id
                ))
            )
        )
    );

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
                p.role = 'admin'
                OR (p.role = 'org_admin' AND p.organization_id IN (
                    SELECT organization_id FROM profiles WHERE id = employee_competencies.user_id
                ))
            )
        )
    );

CREATE POLICY "Admins can delete competencies"
    ON employee_competencies FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- =====================================================
-- STEP 6: COMPETENCY_HISTORY
-- =====================================================
CREATE POLICY "Users can view competency history"
    ON competency_history FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

CREATE POLICY "System can insert competency history"
    ON competency_history FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- =====================================================
-- STEP 7: COMPETENCY_COMMENTS
-- =====================================================
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
                        p.role = 'admin'
                        OR (p.role = 'org_admin' AND p.organization_id IN (
                            SELECT organization_id FROM profiles WHERE id = ec.user_id
                        ))
                    )
                )
            )
        )
    );

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
                        p.role = 'admin'
                        OR (p.role = 'org_admin' AND p.organization_id IN (
                            SELECT organization_id FROM profiles WHERE id = ec.user_id
                        ))
                    )
                )
            )
        )
    );

CREATE POLICY "Users can update own competency comments"
    ON competency_comments FOR UPDATE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

CREATE POLICY "Users can delete own competency comments"
    ON competency_comments FOR DELETE
    TO authenticated
    USING (
        created_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- =====================================================
-- STEP 8: COMPETENCY_CATEGORIES
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
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- =====================================================
-- STEP 9: COMPETENCY_DEFINITIONS
-- =====================================================
CREATE POLICY "Authenticated users can view competency definitions"
    ON competency_definitions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admins can manage competency definitions"
    ON competency_definitions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    );

-- =====================================================
-- STEP 10: ACCOUNT_REQUESTS
-- =====================================================
CREATE POLICY "Anyone can create account requests"
    ON account_requests FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Admins can view account requests"
    ON account_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR role = 'manager'
                OR (role = 'org_admin' AND organization_id = account_requests.organization_id)
            )
        )
    );

CREATE POLICY "Admins can update account requests"
    ON account_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR role = 'manager'
                OR (role = 'org_admin' AND organization_id = account_requests.organization_id)
            )
        )
    );

-- =====================================================
-- STEP 11: PERMISSION_REQUESTS
-- =====================================================
CREATE POLICY "Users can view own permission requests"
    ON permission_requests FOR SELECT
    USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND (role = 'admin' OR role = 'org_admin')
        )
    );

CREATE POLICY "Authenticated users can create permission requests"
    ON permission_requests FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND auth.uid() IS NOT NULL
    );

CREATE POLICY "Only admins can update permission requests"
    ON permission_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND (role = 'admin' OR role = 'org_admin')
        )
    );

-- =====================================================
-- STEP 12: SYSTEM_ANNOUNCEMENTS
-- =====================================================
CREATE POLICY "Users can view active announcements, admins can view all"
    ON system_announcements FOR SELECT
    USING (
        is_active = true
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Only admins can insert announcements"
    ON system_announcements FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admins can update announcements"
    ON system_announcements FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admins can delete announcements"
    ON system_announcements FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- =====================================================
-- STEP 13: EMAIL_REMINDER_SETTINGS
-- =====================================================
CREATE POLICY "Only admins can view email reminder settings"
    ON email_reminder_settings FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admins can insert email reminder settings"
    ON email_reminder_settings FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admins can update email reminder settings"
    ON email_reminder_settings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- =====================================================
-- STEP 14: EMAIL_REMINDER_LOG
-- =====================================================
CREATE POLICY "Users can view their own reminder logs"
    ON email_reminder_log FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Service role can insert reminder logs"
    ON email_reminder_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- =====================================================
-- STEP 15: NOTIFICATION_EMAIL_LOG
-- =====================================================
CREATE POLICY "Admins can view notification logs"
    ON notification_email_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can insert notification logs"
    ON notification_email_log FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can update notification logs"
    ON notification_email_log FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- =====================================================
-- STEP 16: NOTIFICATION_EMAIL_RECIPIENTS
-- =====================================================
CREATE POLICY "Admins can view recipient logs"
    ON notification_email_recipients FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can insert recipient logs"
    ON notification_email_recipients FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can update recipient logs"
    ON notification_email_recipients FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- =====================================================
-- STEP 17: PASSWORD_RESET_CODES (service_role only)
-- Note: These may not have been affected by lockdown since
-- lockdown targets TO authenticated, and these are TO service_role.
-- Included for completeness.
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'password_reset_codes' AND policyname = 'Service role only - select'
    ) THEN
        CREATE POLICY "Service role only - select" ON password_reset_codes
            FOR SELECT TO service_role USING (true);
        CREATE POLICY "Service role only - insert" ON password_reset_codes
            FOR INSERT TO service_role WITH CHECK (true);
        CREATE POLICY "Service role only - update" ON password_reset_codes
            FOR UPDATE TO service_role USING (true);
        CREATE POLICY "Service role only - delete" ON password_reset_codes
            FOR DELETE TO service_role USING (true);
    END IF;
END $$;

-- =====================================================
-- STEP 18: SHARED_ASSETS
-- =====================================================
CREATE POLICY "Users can view relevant shares"
    ON shared_assets FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
        OR
        owner_organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
        OR
        shared_with_organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Only admins can create shares"
    ON shared_assets FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admins can update shares"
    ON shared_assets FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Only admins can delete shares"
    ON shared_assets FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- =====================================================
-- STEP 19: ASSET_ACCESS_REQUESTS
-- =====================================================
CREATE POLICY "Users can view relevant asset access requests"
    ON asset_access_requests FOR SELECT
    USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR (role = 'org_admin' AND organization_id = asset_access_requests.owner_organization_id)
            )
        )
    );

CREATE POLICY "Authenticated users can create asset access requests"
    ON asset_access_requests FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND auth.uid() IS NOT NULL
        AND user_organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Admins can update asset access requests"
    ON asset_access_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
                role = 'admin'
                OR (role = 'org_admin' AND organization_id = asset_access_requests.owner_organization_id)
            )
        )
    );

-- =====================================================
-- STEP 20: USER_ASSET_ACCESS
-- =====================================================
CREATE POLICY "Users can view their own asset access grants" ON user_asset_access FOR SELECT
USING (
    user_id = auth.uid()
    OR
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
        (SELECT id FROM organizations WHERE name = 'SYSTEM')
    OR
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "SYSTEM org and asset owners can grant access" ON user_asset_access FOR INSERT
WITH CHECK (
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
        (SELECT id FROM organizations WHERE name = 'SYSTEM')
    OR
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "SYSTEM org and asset owners can revoke access" ON user_asset_access FOR DELETE
USING (
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
        (SELECT id FROM organizations WHERE name = 'SYSTEM')
    OR
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "SYSTEM org and asset owners can update access" ON user_asset_access FOR UPDATE
USING (
    (SELECT organization_id FROM profiles WHERE id = auth.uid()) =
        (SELECT id FROM organizations WHERE name = 'SYSTEM')
    OR
    asset_id IN (
        SELECT id FROM assets
        WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
);

-- =====================================================
-- STEP 21: DOCUMENT_CATEGORIES (if table exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_categories' AND table_schema = 'public') THEN
        CREATE POLICY "Authenticated users can view document categories"
            ON document_categories FOR SELECT TO authenticated USING (true);

        CREATE POLICY "Admins can manage document categories"
            ON document_categories FOR ALL TO authenticated
            USING (
                EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'org_admin'))
            );
    END IF;
END $$;

-- =====================================================
-- STEP 22: DOCUMENTS (if table exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents' AND table_schema = 'public') THEN
        CREATE POLICY "Users can view approved documents in their org"
            ON documents FOR SELECT TO authenticated
            USING (
                organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
                AND (
                    status = 'approved'
                    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'org_admin'))
                )
            );

        CREATE POLICY "Admins can create documents in their org"
            ON documents FOR INSERT TO authenticated
            WITH CHECK (
                organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
                AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'org_admin'))
            );

        CREATE POLICY "Admins can update documents in their org"
            ON documents FOR UPDATE TO authenticated
            USING (
                organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
                AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'org_admin'))
            );

        CREATE POLICY "Admins can delete documents in their org"
            ON documents FOR DELETE TO authenticated
            USING (
                organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
                AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'org_admin'))
            );
    END IF;
END $$;

-- =====================================================
-- STEP 23: DOCUMENT_REVISIONS (if table exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_revisions' AND table_schema = 'public') THEN
        CREATE POLICY "Users can view approved revisions in their org"
            ON document_revisions FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM documents d
                    WHERE d.id = document_revisions.document_id
                    AND d.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
                )
                AND (
                    status = 'approved'
                    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'org_admin'))
                )
            );

        CREATE POLICY "Admins can create revisions in their org"
            ON document_revisions FOR INSERT TO authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM documents d
                    JOIN profiles p ON p.id = auth.uid()
                    WHERE d.id = document_revisions.document_id
                    AND d.organization_id = p.organization_id
                    AND p.role IN ('admin', 'org_admin')
                )
            );

        CREATE POLICY "Admins can update revisions in their org"
            ON document_revisions FOR UPDATE TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM documents d
                    JOIN profiles p ON p.id = auth.uid()
                    WHERE d.id = document_revisions.document_id
                    AND d.organization_id = p.organization_id
                    AND p.role IN ('admin', 'org_admin')
                )
            );
    END IF;
END $$;

-- =====================================================
-- STEP 24: DOCUMENT_REVIEW_SCHEDULE (if table exists)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_review_schedule' AND table_schema = 'public') THEN
        CREATE POLICY "Admins can view review schedules in their org"
            ON document_review_schedule FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM documents d
                    JOIN profiles p ON p.id = auth.uid()
                    WHERE d.id = document_review_schedule.document_id
                    AND d.organization_id = p.organization_id
                    AND p.role IN ('admin', 'org_admin')
                )
            );

        CREATE POLICY "Admins can manage review schedules in their org"
            ON document_review_schedule FOR ALL TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM documents d
                    JOIN profiles p ON p.id = auth.uid()
                    WHERE d.id = document_review_schedule.document_id
                    AND d.organization_id = p.organization_id
                    AND p.role IN ('admin', 'org_admin')
                )
            );
    END IF;
END $$;

-- =====================================================
-- STEP 25: STORAGE POLICIES (competency documents + controlled documents)
-- =====================================================
CREATE POLICY "Users can upload their own competency documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'competency-documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Users can view their own competency documents"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'documents'
    AND (
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
        )
        OR
        EXISTS (
            SELECT 1 FROM public.profiles p1
            JOIN public.profiles p2 ON p1.organization_id = p2.organization_id
            WHERE p1.id = auth.uid()
            AND p1.role = 'org_admin'
            AND p2.id::text = (storage.foldername(name))[2]
        )
    )
);

CREATE POLICY "Users can update their own competency documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Users can delete their own competency documents"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'documents'
    AND (
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    )
);

-- Controlled documents storage policies
CREATE POLICY "Users can view controlled documents"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'controlled-documents'
);

CREATE POLICY "Admins can upload controlled documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'controlled-documents'
    AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
    )
);

CREATE POLICY "Admins can delete controlled documents"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'controlled-documents'
    AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
    )
);

COMMIT;

-- =====================================================
-- VERIFICATION: Check restored policies
-- =====================================================
SELECT tablename, policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
