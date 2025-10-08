-- Asset Access Request Schema for NDT Suite
-- Enables users to request access to specific shared assets

-- Asset access requests table
CREATE TABLE IF NOT EXISTS asset_access_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL,
    vessel_id TEXT, -- Optional: request access to specific vessel
    scan_id TEXT, -- Optional: request access to specific scan
    requested_permission TEXT NOT NULL DEFAULT 'view' CHECK (requested_permission IN ('view', 'edit')),
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES auth.users(id),
    rejected_by UUID REFERENCES auth.users(id),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    -- Prevent duplicate requests
    CONSTRAINT unique_asset_access_request UNIQUE (user_organization_id, owner_organization_id, asset_id, vessel_id, scan_id, status)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_asset_access_requests_user ON asset_access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_access_requests_user_org ON asset_access_requests(user_organization_id);
CREATE INDEX IF NOT EXISTS idx_asset_access_requests_owner_org ON asset_access_requests(owner_organization_id);
CREATE INDEX IF NOT EXISTS idx_asset_access_requests_status ON asset_access_requests(status);
CREATE INDEX IF NOT EXISTS idx_asset_access_requests_asset_id ON asset_access_requests(asset_id);

-- Enable Row Level Security (RLS)
ALTER TABLE asset_access_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for asset_access_requests
-- Users can view their own requests and admins can view all requests for their org
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

-- Authenticated users can create asset access requests
CREATE POLICY "Authenticated users can create asset access requests"
    ON asset_access_requests FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND auth.uid() IS NOT NULL
        AND user_organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Only admins and org_admins can update asset access requests
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

-- Function to approve asset access request and create share
CREATE OR REPLACE FUNCTION approve_asset_access_request(request_id UUID)
RETURNS JSONB AS $$
DECLARE
    request_record asset_access_requests;
    share_type TEXT;
    result JSONB;
BEGIN
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
            ELSE permission
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject asset access request
CREATE OR REPLACE FUNCTION reject_asset_access_request(request_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    request_record asset_access_requests;
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending asset access requests for organization
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
) AS $$
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's asset access requests
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
) AS $$
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
