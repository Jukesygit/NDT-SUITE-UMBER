-- ============================================================================
-- Security Audit Remediation — Feb 2026
-- Fixes remaining vulnerabilities from penetration test report
-- ============================================================================

-- ============================================================================
-- FIX 1: cleanup_old_activity_logs() — Restrict to admin only
-- ISSUE: Any authenticated user could delete audit logs
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_activity_logs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Only admins can purge audit logs
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: only admins can purge activity logs';
    END IF;

    DELETE FROM activity_log
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- ============================================================================
-- FIX 2: cleanup_expired_reset_codes() — Restrict to admin only
-- ISSUE: Any authenticated user could trigger deletion of reset codes
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_reset_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only admins can trigger reset code cleanup
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: only admins can purge reset codes';
    END IF;

    DELETE FROM password_reset_codes
    WHERE expires_at < NOW() - INTERVAL '1 day'
       OR used_at IS NOT NULL;
END;
$$;

-- ============================================================================
-- FIX 3: approve_permission_request() — Add cross-org check + remove SQLERRM
-- ISSUE: org_admin could approve requests from other organizations
-- ISSUE: SQLERRM leaked database internals in error responses
-- ============================================================================

DROP FUNCTION IF EXISTS public.approve_permission_request(UUID);
CREATE OR REPLACE FUNCTION public.approve_permission_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record permission_requests;
    caller_profile profiles;
BEGIN
    -- Get caller profile
    SELECT * INTO caller_profile
    FROM profiles
    WHERE id = auth.uid();

    -- Verify caller is admin or org_admin
    IF caller_profile.role NOT IN ('admin', 'org_admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- org_admin can only approve requests from users in the same organization
    IF caller_profile.role = 'org_admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM profiles
            WHERE id = request_record.user_id
            AND organization_id = caller_profile.organization_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: user is not in your organization');
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
        RAISE LOG 'approve_permission_request error: %', SQLERRM;
        RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred');
END;
$$;

-- ============================================================================
-- FIX 4: reject_permission_request() — Add cross-org check + remove SQLERRM
-- ISSUE: Same cross-org and SQLERRM issues as approve_permission_request
-- ============================================================================

DROP FUNCTION IF EXISTS public.reject_permission_request(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.reject_permission_request(request_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record permission_requests;
    caller_profile profiles;
BEGIN
    -- Get caller profile
    SELECT * INTO caller_profile
    FROM profiles
    WHERE id = auth.uid();

    -- Verify caller is admin or org_admin
    IF caller_profile.role NOT IN ('admin', 'org_admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- org_admin can only reject requests from users in the same organization
    IF caller_profile.role = 'org_admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM profiles
            WHERE id = request_record.user_id
            AND organization_id = caller_profile.organization_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: user is not in your organization');
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
        RAISE LOG 'reject_permission_request error: %', SQLERRM;
        RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred');
END;
$$;
