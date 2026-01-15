-- Activity Log Schema
-- Tracks all user actions across the system for admin and manager monitoring

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Activity Log Table
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Who performed the action
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    user_email TEXT,           -- Cached for when user is deleted
    user_name TEXT,            -- Cached for when user is deleted

    -- What action was performed
    action_type TEXT NOT NULL,
    action_category TEXT NOT NULL,  -- 'auth', 'profile', 'competency', 'admin', 'asset', 'config'

    -- Action details
    description TEXT NOT NULL,
    details JSONB,             -- Flexible field for action-specific data

    -- Entity being acted upon (if applicable)
    entity_type TEXT,          -- 'user', 'organization', 'competency', 'asset', etc.
    entity_id TEXT,            -- ID of the entity
    entity_name TEXT,          -- Human-readable name of entity

    -- Request metadata
    ip_address INET,
    user_agent TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action type reference (using TEXT for flexibility, this comment documents valid values)
COMMENT ON COLUMN activity_log.action_type IS
'Action types: login_success, login_failed, logout, profile_updated, avatar_changed,
competency_created, competency_updated, competency_deleted, competency_approved,
competency_rejected, document_uploaded, user_created, user_updated, user_deleted,
organization_created, organization_updated, organization_deleted, permission_approved,
permission_rejected, account_approved, account_rejected, asset_created, asset_updated,
asset_deleted, asset_transferred, vessel_created, vessel_updated, config_updated,
announcement_created, announcement_updated, share_created, share_deleted';

COMMENT ON COLUMN activity_log.action_category IS
'Categories: auth, profile, competency, admin, asset, config';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action_type ON activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_action_category ON activity_log(action_category);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_activity_log_filters
    ON activity_log(action_category, created_at DESC);

-- Enable RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotent migrations)
DROP POLICY IF EXISTS "Admins can view all activity logs" ON activity_log;
DROP POLICY IF EXISTS "Admins and managers can view all activity logs" ON activity_log;
DROP POLICY IF EXISTS "Users can view own activity" ON activity_log;
DROP POLICY IF EXISTS "Allow activity logging" ON activity_log;
DROP POLICY IF EXISTS "Service role full access" ON activity_log;

-- Admins and managers can view all activity logs from all organizations
CREATE POLICY "Admins and managers can view all activity logs"
    ON activity_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- Users can view their own activity (optional, for profile page)
CREATE POLICY "Users can view own activity"
    ON activity_log FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Insert policy - allow authenticated users and service role
CREATE POLICY "Allow activity logging"
    ON activity_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role full access"
    ON activity_log FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to log activity (SECURITY DEFINER to bypass RLS for inserts)
CREATE OR REPLACE FUNCTION log_activity(
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
RETURNS UUID AS $$
DECLARE
    v_user_email TEXT;
    v_user_name TEXT;
    v_log_id UUID;
BEGIN
    -- Get user info (cached for historical purposes)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION log_activity TO authenticated;

-- Optional: Function to clean up old activity logs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs(days_to_keep INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM activity_log
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
