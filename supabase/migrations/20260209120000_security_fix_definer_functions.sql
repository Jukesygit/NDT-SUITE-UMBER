-- Security Fix: Critical vulnerability remediation
-- Date: 2026-02-09
-- Fixes: VULN-01 (role injection), VULN-03-11 (SECURITY DEFINER auth + search_path)
-- Run this migration on the production database.

-- ============================================================================
-- P0 CRITICAL FIX: handle_new_user() — prevent role injection via user_metadata
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    org_id UUID;
BEGIN
    -- Try to parse organization_id, default to NULL if invalid
    BEGIN
        org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        org_id := NULL;
    END;

    INSERT INTO public.profiles (id, username, email, role, organization_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        NEW.email,
        'viewer',  -- SECURITY: Always default to viewer. Only admin Edge Functions should set elevated roles.
        org_id
    );
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX: approve_asset_access_request — add authorization check + search_path
-- ============================================================================
CREATE OR REPLACE FUNCTION approve_asset_access_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record asset_access_requests;
    share_type TEXT;
BEGIN
    -- SECURITY: Verify caller is admin or org_admin of the asset's owning organization
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (
            role = 'admin'
            OR (role = 'org_admin' AND organization_id = (
                SELECT owner_organization_id FROM asset_access_requests WHERE id = request_id
            ))
        )
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
        UPDATE shared_assets
        SET permission = CASE
            WHEN request_record.requested_permission = 'edit' THEN 'edit'
            ELSE permission
        END,
        updated_at = NOW()
        WHERE owner_organization_id = request_record.owner_organization_id
        AND shared_with_organization_id = request_record.user_organization_id
        AND asset_id = request_record.asset_id
        AND (vessel_id IS NULL AND request_record.vessel_id IS NULL OR vessel_id = request_record.vessel_id)
        AND (scan_id IS NULL AND request_record.scan_id IS NULL OR scan_id = request_record.scan_id);
    ELSE
        INSERT INTO shared_assets (
            owner_organization_id, shared_with_organization_id, asset_id,
            vessel_id, scan_id, share_type, permission, shared_by
        ) VALUES (
            request_record.owner_organization_id, request_record.user_organization_id,
            request_record.asset_id, request_record.vessel_id, request_record.scan_id,
            share_type, request_record.requested_permission, auth.uid()
        );
    END IF;

    UPDATE asset_access_requests
    SET status = 'approved', approved_by = auth.uid(), approved_at = NOW()
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Asset access request approved and share created');
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'approve_asset_access_request error: %', SQLERRM;
        RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred');
END;
$$;

-- ============================================================================
-- FIX: reject_asset_access_request — add authorization check + search_path
-- ============================================================================
CREATE OR REPLACE FUNCTION reject_asset_access_request(request_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record asset_access_requests;
BEGIN
    -- SECURITY: Verify caller is admin or org_admin of the asset's owning organization
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (
            role = 'admin'
            OR (role = 'org_admin' AND organization_id = (
                SELECT owner_organization_id FROM asset_access_requests WHERE id = request_id
            ))
        )
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    SELECT * INTO request_record
    FROM asset_access_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    UPDATE asset_access_requests
    SET status = 'rejected', rejected_by = auth.uid(), rejected_at = NOW(), rejection_reason = reason
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Asset access request rejected');
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'reject_asset_access_request error: %', SQLERRM;
        RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred');
END;
$$;

-- ============================================================================
-- FIX: get_pending_asset_access_requests_for_org — add authorization + search_path
-- ============================================================================
CREATE OR REPLACE FUNCTION get_pending_asset_access_requests_for_org(org_id UUID)
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
    -- SECURITY: Verify caller is admin or org_admin of the queried organization
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (role = 'admin' OR (role = 'org_admin' AND organization_id = org_id))
    ) THEN
        RETURN;  -- Return empty result set for unauthorized callers
    END IF;

    RETURN QUERY
    SELECT aar.id, aar.user_id, p.username, p.email, o.name,
           aar.asset_id, aar.vessel_id, aar.scan_id,
           aar.requested_permission, aar.message, aar.created_at
    FROM asset_access_requests aar
    JOIN profiles p ON aar.user_id = p.id
    JOIN organizations o ON aar.user_organization_id = o.id
    WHERE aar.owner_organization_id = org_id AND aar.status = 'pending'
    ORDER BY aar.created_at DESC;
END;
$$;

-- ============================================================================
-- FIX: get_user_asset_access_requests — restrict to own requests + search_path
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_asset_access_requests(p_user_id UUID)
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
    -- SECURITY: Users can only see their own requests. Admins can see any user's requests.
    IF p_user_id != auth.uid() AND NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN;  -- Return empty result set for unauthorized callers
    END IF;

    RETURN QUERY
    SELECT aar.id, o.name, aar.asset_id, aar.vessel_id, aar.scan_id,
           aar.requested_permission, aar.status, aar.message, aar.rejection_reason,
           aar.created_at, aar.approved_at, aar.rejected_at
    FROM asset_access_requests aar
    JOIN organizations o ON aar.owner_organization_id = o.id
    WHERE aar.user_id = p_user_id
    ORDER BY aar.created_at DESC;
END;
$$;

-- ============================================================================
-- FIX: get_asset_hierarchy — add authorization check + search_path
-- ============================================================================
CREATE OR REPLACE FUNCTION get_asset_hierarchy(p_asset_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
    asset_org_id UUID;
BEGIN
    -- Get the asset's organization
    SELECT organization_id INTO asset_org_id FROM assets WHERE id = p_asset_id;

    -- SECURITY: Verify caller belongs to the same org or is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (role = 'admin' OR organization_id = asset_org_id)
    ) THEN
        -- Also check shared_assets for cross-org access
        IF NOT EXISTS (
            SELECT 1 FROM shared_assets sa
            JOIN profiles p ON p.organization_id = sa.shared_with_organization_id
            WHERE p.id = auth.uid() AND sa.asset_id = p_asset_id
        ) THEN
            RETURN NULL;
        END IF;
    END IF;

    SELECT json_build_object(
        'asset', row_to_json(a.*),
        'vessels', (
            SELECT COALESCE(json_agg(json_build_object(
                'vessel', row_to_json(v.*),
                'images', (SELECT COALESCE(json_agg(row_to_json(vi.*)), '[]'::json) FROM vessel_images vi WHERE vi.vessel_id = v.id),
                'scans', (SELECT COALESCE(json_agg(row_to_json(s.*)), '[]'::json) FROM scans s WHERE s.vessel_id = v.id)
            )), '[]'::json)
            FROM vessels v WHERE v.asset_id = a.id
        )
    ) INTO result
    FROM assets a
    WHERE a.id = p_asset_id;

    RETURN result;
END;
$$;

-- ============================================================================
-- FIX: get_shared_assets_for_organization — add authorization + search_path
-- Must DROP first because return type changed (adding owner_org_id column)
-- ============================================================================
DROP FUNCTION IF EXISTS get_shared_assets_for_organization(UUID);
CREATE OR REPLACE FUNCTION get_shared_assets_for_organization(org_id UUID)
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
    -- SECURITY: Verify caller belongs to the queried organization or is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (role = 'admin' OR organization_id = org_id)
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT sa.id, sa.owner_organization_id, o.name, sa.asset_id, sa.vessel_id, sa.scan_id,
           sa.share_type, sa.permission, sa.created_at
    FROM shared_assets sa
    JOIN organizations o ON sa.owner_organization_id = o.id
    WHERE sa.shared_with_organization_id = org_id
    ORDER BY sa.created_at DESC;
END;
$$;

-- ============================================================================
-- FIX: get_organizations_for_shared_asset — add authorization + search_path
-- Must DROP first because return column names changed
-- ============================================================================
DROP FUNCTION IF EXISTS get_organizations_for_shared_asset(UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION get_organizations_for_shared_asset(
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
    -- SECURITY: Verify caller belongs to the owning organization or is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND (role = 'admin' OR organization_id = p_owner_org_id)
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT sa.id, o.id, o.name, sa.permission, sa.created_at
    FROM shared_assets sa
    JOIN organizations o ON sa.shared_with_organization_id = o.id
    WHERE sa.owner_organization_id = p_owner_org_id
    AND sa.asset_id = p_asset_id
    AND (p_vessel_id IS NULL OR sa.vessel_id = p_vessel_id)
    AND (p_scan_id IS NULL OR sa.scan_id = p_scan_id)
    ORDER BY sa.created_at DESC;
END;
$$;

-- ============================================================================
-- FIX: employee_competencies DELETE policy — scope org_admin to own organization
-- ============================================================================
DROP POLICY IF EXISTS "Users can delete own competencies" ON employee_competencies;
CREATE POLICY "Users can delete own competencies"
    ON employee_competencies FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
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
-- FIX: account_requests INSERT policy — restrict to service_role
-- ============================================================================
DROP POLICY IF EXISTS "Anyone can create account requests" ON account_requests;
CREATE POLICY "Service role can create account requests"
    ON account_requests FOR INSERT
    TO service_role
    WITH CHECK (true);

-- ============================================================================
-- FIX: competency_history INSERT policy — restrict to service_role
-- ============================================================================
DROP POLICY IF EXISTS "System can insert competency history" ON competency_history;
CREATE POLICY "System can insert competency history"
    ON competency_history FOR INSERT
    TO service_role
    WITH CHECK (true);

-- ============================================================================
-- FIX: Add SET search_path to remaining SECURITY DEFINER functions
-- ============================================================================

-- log_competency_change
CREATE OR REPLACE FUNCTION log_competency_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    action_type TEXT;
    old_val JSONB;
    new_val JSONB;
    org_id UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_type := 'create';
        old_val := NULL;
        new_val := to_jsonb(NEW);
        org_id := (SELECT organization_id FROM profiles WHERE id = NEW.user_id);
    ELSIF TG_OP = 'UPDATE' THEN
        action_type := 'update';
        old_val := to_jsonb(OLD);
        new_val := to_jsonb(NEW);
        org_id := (SELECT organization_id FROM profiles WHERE id = NEW.user_id);
    ELSIF TG_OP = 'DELETE' THEN
        action_type := 'delete';
        old_val := to_jsonb(OLD);
        new_val := NULL;
        org_id := (SELECT organization_id FROM profiles WHERE id = OLD.user_id);
    END IF;

    INSERT INTO competency_history (
        competency_id, user_id, action, old_value, new_value, changed_by, organization_id
    ) VALUES (
        COALESCE(NEW.id, OLD.id),
        COALESCE(NEW.user_id, OLD.user_id),
        action_type,
        old_val,
        new_val,
        auth.uid(),
        org_id
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- log_activity
CREATE OR REPLACE FUNCTION log_activity(
    p_user_id UUID,
    p_action_type TEXT,
    p_description TEXT,
    p_details JSONB DEFAULT NULL,
    p_organization_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO activity_log (user_id, action_type, description, details, organization_id)
    VALUES (p_user_id, p_action_type, p_description, p_details, p_organization_id)
    RETURNING id INTO new_id;
    RETURN new_id;
END;
$$;

-- cleanup_old_activity_logs
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs(days_to_keep INTEGER DEFAULT 90)
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

-- cleanup_expired_reset_codes — keep original return type (void)
CREATE OR REPLACE FUNCTION cleanup_expired_reset_codes()
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
