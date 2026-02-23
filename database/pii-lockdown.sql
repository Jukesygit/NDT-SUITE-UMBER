-- =============================================================================
-- PII LOCKDOWN SCRIPT
-- Denies all data access to PII tables while keeping auth functional.
-- Auth (auth.users, magic links) is UNAFFECTED - it uses the auth schema.
--
-- BEFORE RUNNING: Export your current policies for restore:
--   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
--   FROM pg_policies WHERE schemaname IN ('public', 'storage')
--   ORDER BY tablename, policyname;
--
-- TO REVERSE: Re-create original policies from your export.
-- =============================================================================

BEGIN;

-- =====================================================
-- HELPER: Drop all policies on a table dynamically
-- This is safer than hardcoding policy names which may differ
-- =====================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all policies on PII tables (NOT profiles, organizations, or activity_log - handled separately)
    FOR r IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
            'employee_competencies',
            'competency_history',
            'competency_comments',
            'competency_categories',
            'competency_definitions',
            'account_requests',
            'permission_requests',
            'email_reminder_settings',
            'email_reminder_log',
            'notification_email_log',
            'notification_email_recipients',
            'system_announcements',
            'documents',
            'document_categories',
            'document_revisions',
            'document_review_schedule',
            'password_reset_codes',
            'shared_assets',
            'asset_access_requests',
            'user_asset_access'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;

    -- Drop all policies on profiles (will replace with self-SELECT only)
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', r.policyname);
    END LOOP;

    -- Drop all policies on organizations (will replace with own-org SELECT only)
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'organizations'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON organizations', r.policyname);
    END LOOP;

    -- Drop all policies on activity_log (will replace with INSERT-only)
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'activity_log'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON activity_log', r.policyname);
    END LOOP;

    -- Drop all storage policies
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
    END LOOP;
END $$;

-- =====================================================
-- PROFILES: Self-SELECT only (auth-manager needs this)
-- =====================================================
CREATE POLICY "lockdown_profiles_self_select"
    ON profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- =====================================================
-- ORGANIZATIONS: Own-org SELECT only (auth-manager needs this)
-- =====================================================
CREATE POLICY "lockdown_orgs_self_org_select"
    ON organizations FOR SELECT
    TO authenticated
    USING (
        id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    );

-- =====================================================
-- ACTIVITY_LOG: INSERT only (auth-manager logs login/logout)
-- =====================================================
CREATE POLICY "lockdown_activity_log_insert_only"
    ON activity_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- =====================================================
-- ALL OTHER PII TABLES: Deny everything
-- =====================================================

-- Helper function to create deny-all policies only on tables that exist
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'employee_competencies',
        'competency_history',
        'competency_comments',
        'competency_categories',
        'competency_definitions',
        'account_requests',
        'permission_requests',
        'email_reminder_settings',
        'email_reminder_log',
        'notification_email_log',
        'notification_email_recipients',
        'system_announcements',
        'documents',
        'document_categories',
        'document_revisions',
        'document_review_schedule',
        'password_reset_codes',
        'shared_assets',
        'asset_access_requests',
        'user_asset_access'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = tbl AND table_schema = 'public'
        ) THEN
            EXECUTE format(
                'CREATE POLICY "lockdown_deny_all" ON %I FOR ALL TO authenticated USING (false)',
                tbl
            );
        END IF;
    END LOOP;
END $$;

-- =====================================================
-- STORAGE: No policies = no access (RLS enabled, no policy = deny)
-- Already dropped all storage.objects policies above.
-- =====================================================

COMMIT;

-- =====================================================
-- VERIFICATION: Check what policies remain
-- =====================================================
SELECT tablename, policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
