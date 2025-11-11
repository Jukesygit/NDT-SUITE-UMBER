-- Fix Permission Requests and Account Requests RLS Policies
-- This script replaces all request-related RLS policies with non-recursive versions
-- using the auth helper functions created in auth-helper-functions.sql

-- IMPORTANT: Run auth-helper-functions.sql FIRST before running this script!

-- ====================
-- Fix PERMISSION_REQUESTS table
-- ====================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own permission requests" ON permission_requests;
DROP POLICY IF EXISTS "Authenticated users can create permission requests" ON permission_requests;
DROP POLICY IF EXISTS "Only admins can update permission requests" ON permission_requests;

-- Create new SELECT policy
CREATE POLICY "permission_requests_select_policy"
    ON permission_requests FOR SELECT
    USING (
        -- Users can view their own requests
        user_id = auth.uid()
        OR
        -- Admins can view all requests
        auth.is_admin()
        OR
        -- Org admins can view requests from their organization
        (
            auth.is_org_admin()
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = permission_requests.user_id
                AND p.organization_id = auth.user_org_id()
            )
        )
    );

-- Create INSERT policy
CREATE POLICY "permission_requests_insert_policy"
    ON permission_requests FOR INSERT
    WITH CHECK (
        -- Users can only create requests for themselves
        auth.uid() = user_id
        AND auth.uid() IS NOT NULL
    );

-- Create UPDATE policy
CREATE POLICY "permission_requests_update_policy"
    ON permission_requests FOR UPDATE
    USING (
        -- Only admins and org admins can update requests
        auth.is_admin()
        OR
        -- Org admins can update requests from their organization
        (
            auth.is_org_admin()
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = permission_requests.user_id
                AND p.organization_id = auth.user_org_id()
            )
        )
    );

-- Create DELETE policy
CREATE POLICY "permission_requests_delete_policy"
    ON permission_requests FOR DELETE
    USING (
        -- Users can delete their own pending requests
        (user_id = auth.uid() AND status = 'pending')
        OR
        -- Admins can delete any request
        auth.is_admin()
    );

-- ====================
-- Fix ACCOUNT_REQUESTS table
-- ====================

-- Create RLS policies for account_requests (these might not exist yet)

-- Drop any existing policies
DROP POLICY IF EXISTS "Public can view pending account requests" ON account_requests;
DROP POLICY IF EXISTS "Public can create account requests" ON account_requests;
DROP POLICY IF EXISTS "Admins can view all account requests" ON account_requests;
DROP POLICY IF EXISTS "Admins can update account requests" ON account_requests;
DROP POLICY IF EXISTS "Admins can delete account requests" ON account_requests;

-- Create SELECT policy
CREATE POLICY "account_requests_select_policy"
    ON account_requests FOR SELECT
    USING (
        -- Public can view their own requests (by email)
        email = current_setting('request.jwt.claims', true)::json->>'email'
        OR
        -- Admins can view all requests
        auth.is_admin()
        OR
        -- Org admins can view requests for their organization
        (
            auth.is_org_admin()
            AND organization_id = auth.user_org_id()
        )
    );

-- Create INSERT policy (public access for registration)
CREATE POLICY "account_requests_insert_policy"
    ON account_requests FOR INSERT
    WITH CHECK (
        -- Anyone can create an account request (public registration)
        -- But they must be creating with 'pending' status
        status = 'pending'
    );

-- Create UPDATE policy
CREATE POLICY "account_requests_update_policy"
    ON account_requests FOR UPDATE
    USING (
        -- Only admins can update account requests
        auth.is_admin()
        OR
        -- Org admins can update requests for their organization
        (
            auth.is_org_admin()
            AND organization_id = auth.user_org_id()
        )
    );

-- Create DELETE policy
CREATE POLICY "account_requests_delete_policy"
    ON account_requests FOR DELETE
    USING (
        -- Only admins can delete account requests
        auth.is_admin()
    );

-- ====================
-- Update approval functions to use helper functions
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
    is_authorized := auth.is_admin() OR auth.is_org_admin();

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
    IF auth.is_org_admin() AND NOT auth.is_admin() THEN
        IF NOT EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = request_record.user_id
            AND p.organization_id = auth.user_org_id()
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
    is_authorized := auth.is_admin() OR auth.is_org_admin();

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
    IF auth.is_org_admin() AND NOT auth.is_admin() THEN
        IF NOT EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = request_record.user_id
            AND p.organization_id = auth.user_org_id()
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

-- Create similar functions for account requests
CREATE OR REPLACE FUNCTION approve_account_request(request_id UUID)
RETURNS JSONB AS $$
DECLARE
    request_record account_requests;
    new_user_id UUID;
BEGIN
    -- Check authorization using helper function
    IF NOT (auth.is_admin() OR auth.is_org_admin()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM account_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- Org admins can only approve for their organization
    IF auth.is_org_admin() AND NOT auth.is_admin() THEN
        IF request_record.organization_id != auth.user_org_id() THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cannot approve requests outside your organization');
        END IF;
    END IF;

    -- Note: Creating the actual auth user requires admin SDK access
    -- This function only updates the request status
    -- The actual user creation should be handled by your backend

    -- Update the request status
    UPDATE account_requests
    SET status = 'approved',
        approved_by = auth.uid(),
        approved_at = NOW()
    WHERE id = request_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account request approved',
        'data', row_to_json(request_record)
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_account_request(request_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    request_record account_requests;
BEGIN
    -- Check authorization using helper function
    IF NOT (auth.is_admin() OR auth.is_org_admin()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM account_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- Org admins can only reject for their organization
    IF auth.is_org_admin() AND NOT auth.is_admin() THEN
        IF request_record.organization_id != auth.user_org_id() THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cannot reject requests outside your organization');
        END IF;
    END IF;

    -- Update the request status
    UPDATE account_requests
    SET status = 'rejected',
        rejected_by = auth.uid(),
        rejected_at = NOW(),
        rejection_reason = reason
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Account request rejected');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure RLS is enabled
ALTER TABLE permission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_requests ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_permission_requests_user_id ON permission_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_permission_requests_status ON permission_requests(status);
CREATE INDEX IF NOT EXISTS idx_account_requests_email ON account_requests(email);

-- Verification comment
COMMENT ON SCHEMA public IS 'Request tables RLS policies have been fixed to prevent infinite recursion using auth helper functions.';