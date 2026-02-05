-- ============================================================================
-- SECURITY FIX - Function Search Path Vulnerabilities & RLS Policy Fixes
-- Date: 2026-02-05
-- Issue: Supabase Security Advisor warnings for functions without search_path
-- ============================================================================

-- This migration fixes all remaining functions that have mutable search_path.
-- The search_path should be explicitly set to prevent SQL injection attacks
-- where an attacker could manipulate the search path to call malicious functions.

-- ============================================================================
-- PART 1: PASSWORD RESET FUNCTIONS
-- ============================================================================

-- Fix cleanup_expired_reset_codes function
CREATE OR REPLACE FUNCTION public.cleanup_expired_reset_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM password_reset_codes
    WHERE expires_at < NOW() - INTERVAL '1 day'
       OR used_at IS NOT NULL;
END;
$$;

-- ============================================================================
-- PART 2: ASSET FUNCTIONS
-- ============================================================================

-- Fix get_asset_hierarchy function
CREATE OR REPLACE FUNCTION public.get_asset_hierarchy(p_asset_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'asset', row_to_json(a.*),
        'vessels', (
            SELECT json_agg(
                json_build_object(
                    'vessel', row_to_json(v.*),
                    'images', (
                        SELECT json_agg(row_to_json(vi.*))
                        FROM vessel_images vi
                        WHERE vi.vessel_id = v.id
                        ORDER BY vi.created_at DESC
                    ),
                    'scans', (
                        SELECT json_agg(row_to_json(s.*))
                        FROM scans s
                        WHERE s.vessel_id = v.id
                        ORDER BY s.created_at DESC
                    )
                )
            )
            FROM vessels v
            WHERE v.asset_id = a.id
            ORDER BY v.created_at DESC
        )
    ) INTO result
    FROM assets a
    WHERE a.id = p_asset_id;

    RETURN result;
END;
$$;

-- Fix get_accessible_assets function
CREATE OR REPLACE FUNCTION public.get_accessible_assets()
RETURNS SETOF assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT a.*
    FROM assets a
    WHERE a.organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    OR a.id IN (
        SELECT asset_id
        FROM shared_assets
        WHERE shared_with_organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
    ORDER BY a.created_at DESC;
END;
$$;

-- ============================================================================
-- PART 3: SHARING FUNCTIONS
-- ============================================================================

-- Fix get_shared_assets_for_organization function
CREATE OR REPLACE FUNCTION public.get_shared_assets_for_organization(org_id UUID)
RETURNS TABLE (
    share_id UUID,
    owner_org_id UUID,
    owner_org_name TEXT,
    asset_id TEXT,
    vessel_id TEXT,
    scan_id TEXT,
    share_type TEXT,
    permission TEXT,
    shared_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.id,
        sa.owner_organization_id,
        o.name,
        sa.asset_id,
        sa.vessel_id,
        sa.scan_id,
        sa.share_type,
        sa.permission,
        sa.created_at
    FROM shared_assets sa
    JOIN organizations o ON sa.owner_organization_id = o.id
    WHERE sa.shared_with_organization_id = org_id;
END;
$$;

-- Fix get_organizations_for_shared_asset function
CREATE OR REPLACE FUNCTION public.get_organizations_for_shared_asset(
    p_owner_org_id UUID,
    p_asset_id TEXT,
    p_vessel_id TEXT DEFAULT NULL,
    p_scan_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    share_id UUID,
    organization_id UUID,
    organization_name TEXT,
    permission TEXT,
    shared_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.id,
        o.id,
        o.name,
        sa.permission,
        sa.created_at
    FROM shared_assets sa
    JOIN organizations o ON sa.shared_with_organization_id = o.id
    WHERE sa.owner_organization_id = p_owner_org_id
    AND sa.asset_id = p_asset_id
    AND (p_vessel_id IS NULL OR sa.vessel_id = p_vessel_id)
    AND (p_scan_id IS NULL OR sa.scan_id = p_scan_id);
END;
$$;

-- ============================================================================
-- PART 4: ASSET ACCESS REQUEST FUNCTIONS
-- ============================================================================

-- Fix approve_asset_access_request function
CREATE OR REPLACE FUNCTION public.approve_asset_access_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record asset_access_requests;
    share_type TEXT;
    result JSONB;
BEGIN
    -- Verify caller is admin/org_admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM asset_access_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- Determine share type
    IF request_record.scan_id IS NOT NULL THEN
        share_type := 'scan';
    ELSIF request_record.vessel_id IS NOT NULL THEN
        share_type := 'vessel';
    ELSE
        share_type := 'asset';
    END IF;

    -- Check if share already exists
    IF EXISTS (
        SELECT 1 FROM shared_assets
        WHERE owner_organization_id = request_record.owner_organization_id
        AND shared_with_organization_id = request_record.user_organization_id
        AND asset_id = request_record.asset_id
        AND (vessel_id IS NULL AND request_record.vessel_id IS NULL OR vessel_id = request_record.vessel_id)
        AND (scan_id IS NULL AND request_record.scan_id IS NULL OR scan_id = request_record.scan_id)
    ) THEN
        -- Update existing share if permission is being upgraded
        UPDATE shared_assets
        SET permission = CASE
            WHEN request_record.requested_permission = 'edit' THEN 'edit'
            ELSE shared_assets.permission
        END,
        updated_at = NOW()
        WHERE owner_organization_id = request_record.owner_organization_id
        AND shared_with_organization_id = request_record.user_organization_id
        AND asset_id = request_record.asset_id
        AND (vessel_id IS NULL AND request_record.vessel_id IS NULL OR vessel_id = request_record.vessel_id)
        AND (scan_id IS NULL AND request_record.scan_id IS NULL OR scan_id = request_record.scan_id);
    ELSE
        -- Create new share
        INSERT INTO shared_assets (
            owner_organization_id,
            shared_with_organization_id,
            asset_id,
            vessel_id,
            scan_id,
            share_type,
            permission,
            shared_by
        ) VALUES (
            request_record.owner_organization_id,
            request_record.user_organization_id,
            request_record.asset_id,
            request_record.vessel_id,
            request_record.scan_id,
            share_type,
            request_record.requested_permission,
            auth.uid()
        );
    END IF;

    -- Update the request status
    UPDATE asset_access_requests
    SET status = 'approved',
        approved_by = auth.uid(),
        approved_at = NOW()
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Asset access request approved and share created');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Fix reject_asset_access_request function
CREATE OR REPLACE FUNCTION public.reject_asset_access_request(request_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record asset_access_requests;
BEGIN
    -- Verify caller is admin/org_admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM asset_access_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- Update the request status
    UPDATE asset_access_requests
    SET status = 'rejected',
        rejected_by = auth.uid(),
        rejected_at = NOW(),
        rejection_reason = reason
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Asset access request rejected');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Fix get_pending_asset_access_requests_for_org function
CREATE OR REPLACE FUNCTION public.get_pending_asset_access_requests_for_org(org_id UUID)
RETURNS TABLE (
    request_id UUID,
    user_id UUID,
    username TEXT,
    user_email TEXT,
    user_org_name TEXT,
    asset_id TEXT,
    vessel_id TEXT,
    scan_id TEXT,
    requested_permission TEXT,
    message TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Verify caller is admin/org_admin for this org
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (role = 'admin' OR (role = 'org_admin' AND organization_id = org_id))
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        aar.id,
        aar.user_id,
        p.username,
        p.email,
        o.name,
        aar.asset_id,
        aar.vessel_id,
        aar.scan_id,
        aar.requested_permission,
        aar.message,
        aar.created_at
    FROM asset_access_requests aar
    JOIN profiles p ON aar.user_id = p.id
    JOIN organizations o ON aar.user_organization_id = o.id
    WHERE aar.owner_organization_id = org_id
    AND aar.status = 'pending'
    ORDER BY aar.created_at DESC;
END;
$$;

-- Fix get_user_asset_access_requests function
CREATE OR REPLACE FUNCTION public.get_user_asset_access_requests(p_user_id UUID)
RETURNS TABLE (
    request_id UUID,
    owner_org_name TEXT,
    asset_id TEXT,
    vessel_id TEXT,
    scan_id TEXT,
    requested_permission TEXT,
    status TEXT,
    message TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Users can only get their own requests, admins can get any
    IF p_user_id != auth.uid() AND NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        aar.id,
        o.name,
        aar.asset_id,
        aar.vessel_id,
        aar.scan_id,
        aar.requested_permission,
        aar.status,
        aar.message,
        aar.rejection_reason,
        aar.created_at,
        aar.approved_at,
        aar.rejected_at
    FROM asset_access_requests aar
    JOIN organizations o ON aar.owner_organization_id = o.id
    WHERE aar.user_id = p_user_id
    ORDER BY aar.created_at DESC;
END;
$$;

-- ============================================================================
-- PART 5: EMAIL REMINDER FUNCTIONS
-- ============================================================================

-- Fix get_users_for_expiration_reminder function
CREATE OR REPLACE FUNCTION public.get_users_for_expiration_reminder(
    threshold_months INTEGER,
    check_timezone TEXT DEFAULT 'Europe/London'
)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    email TEXT,
    competencies JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    threshold_start DATE;
    threshold_end DATE;
    current_year INTEGER;
BEGIN
    current_year := EXTRACT(YEAR FROM (NOW() AT TIME ZONE check_timezone));

    IF threshold_months = 0 THEN
        threshold_start := (NOW() AT TIME ZONE check_timezone)::DATE - INTERVAL '30 days';
        threshold_end := (DATE_TRUNC('month', (NOW() AT TIME ZONE check_timezone)) + INTERVAL '1 month - 1 day')::DATE;
    ELSE
        threshold_start := (NOW() AT TIME ZONE check_timezone)::DATE + ((threshold_months - 1) * INTERVAL '1 month');
        threshold_end := (NOW() AT TIME ZONE check_timezone)::DATE + (threshold_months * INTERVAL '1 month');
    END IF;

    RETURN QUERY
    WITH expiring_competencies AS (
        SELECT
            ec.user_id,
            ec.competency_id,
            cd.name AS competency_name,
            ec.expiry_date,
            EXTRACT(DAY FROM ec.expiry_date - NOW())::INTEGER AS days_until_expiry
        FROM employee_competencies ec
        JOIN competency_definitions cd ON ec.competency_id = cd.id
        WHERE ec.expiry_date IS NOT NULL
            AND ec.status = 'active'
            AND ec.expiry_date::DATE BETWEEN threshold_start AND threshold_end
    ),
    users_with_expiring AS (
        SELECT
            p.id AS user_id,
            p.username,
            p.email,
            jsonb_agg(
                jsonb_build_object(
                    'competency_id', exc.competency_id,
                    'name', exc.competency_name,
                    'expiry_date', exc.expiry_date,
                    'days_until_expiry', exc.days_until_expiry
                ) ORDER BY exc.expiry_date ASC
            ) AS competencies
        FROM expiring_competencies exc
        JOIN profiles p ON exc.user_id = p.id
        WHERE p.is_active = true
            AND p.email IS NOT NULL
        GROUP BY p.id, p.username, p.email
    )
    SELECT
        uwe.user_id,
        uwe.username,
        uwe.email,
        uwe.competencies
    FROM users_with_expiring uwe
    WHERE NOT EXISTS (
        SELECT 1 FROM email_reminder_log erl
        WHERE erl.user_id = uwe.user_id
            AND erl.threshold_months = get_users_for_expiration_reminder.threshold_months
            AND EXTRACT(YEAR FROM erl.sent_at) = current_year
            AND erl.status = 'sent'
    );
END;
$$;

-- Fix init_email_reminder_settings function
CREATE OR REPLACE FUNCTION public.init_email_reminder_settings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO email_reminder_settings (id)
    VALUES (uuid_generate_v4())
    ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================================================
-- PART 6: STORAGE PATH GENERATION FUNCTIONS
-- ============================================================================

-- Drop and recreate to fix parameter names
DROP FUNCTION IF EXISTS public.generate_3d_model_path(UUID, TEXT, TEXT, TEXT);
CREATE FUNCTION public.generate_3d_model_path(
    p_organization_id UUID,
    p_asset_id TEXT,
    p_vessel_id TEXT,
    p_filename TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN p_organization_id::TEXT || '/' || p_asset_id || '/' || p_vessel_id || '/3d-models/' || p_filename;
END;
$$;

-- Drop and recreate to fix parameter names
DROP FUNCTION IF EXISTS public.generate_vessel_image_path(UUID, TEXT, TEXT, TEXT);
CREATE FUNCTION public.generate_vessel_image_path(
    p_organization_id UUID,
    p_asset_id TEXT,
    p_vessel_id TEXT,
    p_filename TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN p_organization_id::TEXT || '/' || p_asset_id || '/' || p_vessel_id || '/images/' || p_filename;
END;
$$;

-- Drop and recreate to fix parameter names
DROP FUNCTION IF EXISTS public.generate_scan_image_path(UUID, TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.generate_scan_image_path(
    p_organization_id UUID,
    p_asset_id TEXT,
    p_vessel_id TEXT,
    p_scan_id TEXT,
    p_filename TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN p_organization_id::TEXT || '/' || p_asset_id || '/' || p_vessel_id || '/scans/' || p_scan_id || '/' || p_filename;
END;
$$;

-- ============================================================================
-- PART 7: ROLE AND PERMISSION FUNCTIONS
-- ============================================================================

-- Drop and recreate get_current_user_role_and_org (return type changed)
DROP FUNCTION IF EXISTS public.get_current_user_role_and_org();
CREATE FUNCTION public.get_current_user_role_and_org()
RETURNS TABLE (
    user_role TEXT,
    organization_id UUID,
    organization_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.role,
        p.organization_id,
        o.name
    FROM profiles p
    LEFT JOIN organizations o ON p.organization_id = o.id
    WHERE p.id = auth.uid();
END;
$$;

-- Fix is_system_org_user function
CREATE OR REPLACE FUNCTION public.is_system_org_user()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles p
        JOIN organizations o ON p.organization_id = o.id
        WHERE p.id = auth.uid()
        AND o.is_system_org = true
    );
END;
$$;

-- Fix check_profile_role_update function
CREATE OR REPLACE FUNCTION public.check_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_role TEXT;
BEGIN
    SELECT role INTO current_user_role
    FROM profiles
    WHERE id = auth.uid();

    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF current_user_role != 'admin' THEN
            RAISE EXCEPTION 'Only admins can change user roles';
        END IF;

        IF OLD.role = 'admin' AND NEW.role != 'admin' AND OLD.id != auth.uid() THEN
            IF (SELECT COUNT(*) FROM profiles WHERE role = 'admin' AND id != OLD.id) < 1 THEN
                RAISE EXCEPTION 'Cannot remove the last admin';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 8: ACTIVITY LOG FUNCTIONS
-- ============================================================================

-- Fix log_activity function
CREATE OR REPLACE FUNCTION public.log_activity(
    p_user_id UUID,
    p_action_type TEXT,
    p_action_category TEXT,
    p_description TEXT,
    p_details JSONB DEFAULT NULL,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id TEXT DEFAULT NULL,
    p_entity_name TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_email TEXT;
    v_user_name TEXT;
    v_log_id UUID;
BEGIN
    IF p_user_id IS NOT NULL THEN
        SELECT email, username INTO v_user_email, v_user_name
        FROM profiles WHERE id = p_user_id;
    END IF;

    INSERT INTO activity_log (
        user_id, user_email, user_name,
        action_type, action_category, description, details,
        entity_type, entity_id, entity_name,
        ip_address, user_agent
    ) VALUES (
        p_user_id, v_user_email, v_user_name,
        p_action_type, p_action_category, p_description, p_details,
        p_entity_type, p_entity_id, p_entity_name,
        p_ip_address, p_user_agent
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- Fix cleanup_old_activity_logs function
CREATE OR REPLACE FUNCTION public.cleanup_old_activity_logs(days_to_keep INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM activity_log
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- ============================================================================
-- PART 9: COMPETENCY FUNCTIONS
-- ============================================================================

-- Fix get_competencies_with_comments function
CREATE OR REPLACE FUNCTION public.get_competencies_with_comments(
    p_user_id UUID DEFAULT NULL,
    p_days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
    competency_id UUID,
    competency_name TEXT,
    user_id UUID,
    username TEXT,
    comment_count BIGINT,
    latest_comment TEXT,
    latest_comment_date TIMESTAMPTZ,
    has_pinned_comments BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ec.id as competency_id,
        cd.name as competency_name,
        ec.user_id,
        p.username,
        COUNT(cc.id) as comment_count,
        (
            SELECT cc2.comment_text
            FROM competency_comments cc2
            WHERE cc2.employee_competency_id = ec.id
            ORDER BY cc2.created_at DESC
            LIMIT 1
        ) as latest_comment,
        MAX(cc.created_at) as latest_comment_date,
        BOOL_OR(cc.is_pinned) as has_pinned_comments
    FROM employee_competencies ec
    JOIN competency_definitions cd ON ec.competency_id = cd.id
    JOIN profiles p ON ec.user_id = p.id
    LEFT JOIN competency_comments cc ON ec.id = cc.employee_competency_id
        AND cc.created_at >= NOW() - INTERVAL '1 day' * p_days_back
    WHERE (p_user_id IS NULL OR ec.user_id = p_user_id)
    GROUP BY ec.id, cd.name, ec.user_id, p.username
    HAVING COUNT(cc.id) > 0
    ORDER BY MAX(cc.created_at) DESC;
END;
$$;

-- Fix get_expiring_competencies_with_comments function
CREATE OR REPLACE FUNCTION public.get_expiring_competencies_with_comments(
    days_threshold INTEGER DEFAULT 30
)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    email TEXT,
    competency_id UUID,
    competency_name TEXT,
    expiry_date TIMESTAMPTZ,
    days_until_expiry INTEGER,
    comment_count BIGINT,
    latest_comment TEXT,
    latest_comment_type TEXT,
    has_renewal_in_progress BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ec.user_id,
        p.username,
        p.email,
        ec.id as competency_id,
        cd.name as competency_name,
        ec.expiry_date,
        EXTRACT(DAY FROM ec.expiry_date - NOW())::INTEGER as days_until_expiry,
        COUNT(cc.id) as comment_count,
        (
            SELECT cc2.comment_text
            FROM competency_comments cc2
            WHERE cc2.employee_competency_id = ec.id
            ORDER BY cc2.created_at DESC
            LIMIT 1
        ) as latest_comment,
        (
            SELECT cc2.comment_type
            FROM competency_comments cc2
            WHERE cc2.employee_competency_id = ec.id
            ORDER BY cc2.created_at DESC
            LIMIT 1
        ) as latest_comment_type,
        EXISTS (
            SELECT 1 FROM competency_comments cc3
            WHERE cc3.employee_competency_id = ec.id
            AND cc3.comment_type = 'renewal_in_progress'
        ) as has_renewal_in_progress
    FROM employee_competencies ec
    JOIN profiles p ON ec.user_id = p.id
    JOIN competency_definitions cd ON ec.competency_id = cd.id
    LEFT JOIN competency_comments cc ON ec.id = cc.employee_competency_id
    WHERE ec.expiry_date IS NOT NULL
        AND ec.expiry_date > NOW()
        AND ec.expiry_date <= (NOW() + INTERVAL '1 day' * days_threshold)
        AND ec.status = 'active'
    GROUP BY ec.id, ec.user_id, p.username, p.email, cd.name, ec.expiry_date
    ORDER BY ec.expiry_date ASC;
END;
$$;

-- Fix update_competency_created_at function
CREATE OR REPLACE FUNCTION public.update_competency_created_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.created_at IS NOT NULL AND OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RETURN NEW;
    END IF;
    NEW.created_at = OLD.created_at;
    RETURN NEW;
END;
$$;

-- Fix refresh_competency_comment_summary function
CREATE OR REPLACE FUNCTION public.refresh_competency_comment_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY competency_comment_summary;
END;
$$;

-- Fix get_category_id function
CREATE OR REPLACE FUNCTION public.get_category_id(category_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cat_id UUID;
BEGIN
    SELECT id INTO cat_id
    FROM competency_categories
    WHERE name = category_name;
    RETURN cat_id;
END;
$$;

-- ============================================================================
-- PART 10: RLS POLICY FIXES
-- ============================================================================

-- Fix activity_log INSERT policy (overly permissive)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'activity_log'
        AND policyname = 'Allow activity logging'
    ) THEN
        DROP POLICY "Allow activity logging" ON activity_log;

        CREATE POLICY "Authenticated users can log activity"
        ON activity_log FOR INSERT
        TO authenticated
        WITH CHECK (
            auth.uid() IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                AND profiles.organization_id IS NOT NULL
            )
        );
    END IF;
END $$;

-- Fix competency_history INSERT policy (overly permissive)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'competency_history'
        AND policyname = 'competency_history_insert_new'
    ) THEN
        DROP POLICY "competency_history_insert_new" ON competency_history;

        CREATE POLICY "Authenticated users with org can insert history"
        ON competency_history FOR INSERT
        TO authenticated
        WITH CHECK (
            auth.uid() IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                AND profiles.organization_id IS NOT NULL
            )
        );
    END IF;
END $$;

-- Fix email_reminder_log INSERT policy (should be service_role only)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'email_reminder_log'
        AND policyname = 'Service role can insert reminder logs'
    ) THEN
        DROP POLICY "Service role can insert reminder logs" ON email_reminder_log;

        CREATE POLICY "Only service role can insert reminder logs"
        ON email_reminder_log FOR INSERT
        TO service_role
        WITH CHECK (true);
    END IF;
END $$;

-- ============================================================================
-- PART 11: MATERIALIZED VIEW ACCESS FIX
-- ============================================================================

-- Revoke access from anonymous role on competency_comment_summary
REVOKE ALL ON public.competency_comment_summary FROM anon;
REVOKE ALL ON public.competency_comment_summary FROM public;

-- Grant only to authenticated users
GRANT SELECT ON public.competency_comment_summary TO authenticated;
