-- Profile Management Schema for NDT Suite
-- This enables users to request permission upgrades from admins

-- Permission requests table
CREATE TABLE IF NOT EXISTS permission_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requested_role TEXT NOT NULL CHECK (requested_role IN ('admin', 'org_admin', 'editor', 'viewer')),
    user_current_role TEXT NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES auth.users(id),
    rejected_by UUID REFERENCES auth.users(id),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_permission_requests_user ON permission_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_permission_requests_status ON permission_requests(status);

-- Enable Row Level Security (RLS)
ALTER TABLE permission_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for permission_requests
-- Users can view their own permission requests
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

-- Authenticated users can create permission requests
CREATE POLICY "Authenticated users can create permission requests"
    ON permission_requests FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND auth.uid() IS NOT NULL
    );

-- Only admins can update permission requests
CREATE POLICY "Only admins can update permission requests"
    ON permission_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND (role = 'admin' OR role = 'org_admin')
        )
    );

-- Function to approve permission request and update user role
CREATE OR REPLACE FUNCTION approve_permission_request(request_id UUID)
RETURNS JSONB AS $$
DECLARE
    request_record permission_requests;
    result JSONB;
BEGIN
    -- Get the request
    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
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

-- Function to reject permission request
CREATE OR REPLACE FUNCTION reject_permission_request(request_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    request_record permission_requests;
BEGIN
    -- Get the request
    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
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
