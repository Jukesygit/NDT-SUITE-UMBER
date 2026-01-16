-- Migration: Custom Notification Email System
-- Date: 2026-01-16
-- Description: Tables for admin custom notification emails with audit logging

-- ============================================================================
-- notification_email_log - Main audit log for sent notification emails
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_email_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Who sent the notification
    sent_by UUID NOT NULL REFERENCES profiles(id),
    sent_by_email TEXT,           -- Cached for when user is deleted
    sent_by_name TEXT,            -- Cached for when user is deleted

    -- Email content
    subject TEXT NOT NULL,
    body TEXT NOT NULL,           -- HTML body content

    -- Recipients (array of user IDs for quick reference)
    recipient_ids UUID[] NOT NULL,
    recipient_count INTEGER NOT NULL DEFAULT 0,

    -- Delivery tracking
    successful_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,

    -- Status: 'pending', 'sending', 'completed', 'failed'
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'completed', 'failed')),
    error_message TEXT,

    -- Filters used (for audit trail)
    filters_used JSONB,  -- { organization_id, role, search_term }

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_email_log_sent_by ON notification_email_log(sent_by);
CREATE INDEX IF NOT EXISTS idx_notification_email_log_status ON notification_email_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_email_log_created_at ON notification_email_log(created_at DESC);

-- ============================================================================
-- notification_email_recipients - Individual recipient tracking for detailed audit
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_email_recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID NOT NULL REFERENCES notification_email_log(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    sent_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_recipients_notification ON notification_email_recipients(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_recipient ON notification_email_recipients(recipient_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE notification_email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_email_recipients ENABLE ROW LEVEL SECURITY;

-- Only admins can view notification logs
CREATE POLICY "Admins can view notification logs"
    ON notification_email_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can insert notification logs
CREATE POLICY "Admins can insert notification logs"
    ON notification_email_log FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can update notification logs
CREATE POLICY "Admins can update notification logs"
    ON notification_email_log FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Same policies for recipient tracking
CREATE POLICY "Admins can view recipient logs"
    ON notification_email_recipients FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can insert recipient logs"
    ON notification_email_recipients FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update recipient logs"
    ON notification_email_recipients FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE notification_email_log IS 'Audit log of custom admin notification emails';
COMMENT ON TABLE notification_email_recipients IS 'Individual recipient tracking for notification emails';
COMMENT ON COLUMN notification_email_log.filters_used IS 'JSON object storing filter criteria used for recipient selection';
COMMENT ON COLUMN notification_email_log.recipient_ids IS 'Array of recipient user IDs for quick reference';
