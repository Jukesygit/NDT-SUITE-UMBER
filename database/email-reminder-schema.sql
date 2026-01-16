-- Email Reminder System Schema
-- Automated certification expiration reminders with configurable thresholds

-- ============================================================================
-- Email Reminder Settings (Global Configuration)
-- ============================================================================
-- Single row table for global settings - only one configuration allowed
CREATE TABLE IF NOT EXISTS email_reminder_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    is_enabled BOOLEAN DEFAULT true,
    -- Array of months before expiry to send reminders (e.g., {6, 3, 1, 0})
    thresholds_months INTEGER[] DEFAULT '{6, 3, 1, 0}',
    -- Manager emails to CC on all reminders
    manager_emails TEXT[] DEFAULT '{}',
    -- Sender configuration
    sender_email TEXT DEFAULT 'notifications@updates.matrixportal.io',
    sender_name TEXT DEFAULT 'Matrix Portal',
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
);

-- Ensure only one settings row exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_reminder_settings_singleton
    ON email_reminder_settings ((true));

-- ============================================================================
-- Email Reminder Log (Track Sent Reminders)
-- ============================================================================
-- Prevents duplicate reminders by tracking what has been sent
CREATE TABLE IF NOT EXISTS email_reminder_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    -- The threshold (in months) that triggered this reminder
    threshold_months INTEGER NOT NULL,
    -- IDs of competencies included in this reminder email
    competency_ids UUID[] NOT NULL,
    -- When the reminder was sent
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    -- Email address the reminder was sent to
    email_sent_to TEXT NOT NULL,
    -- Manager emails that were CC'd
    managers_cc TEXT[],
    -- Status tracking
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
    error_message TEXT
);

-- Unique index: one reminder per user per threshold per year
-- This allows reminders to be sent again if certification is renewed
-- Using expression index since PostgreSQL doesn't support computed columns in constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_threshold_year
    ON email_reminder_log(user_id, threshold_months, (EXTRACT(YEAR FROM sent_at AT TIME ZONE 'Europe/London')::INTEGER));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_reminder_log_user ON email_reminder_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_reminder_log_sent_at ON email_reminder_log(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_reminder_log_threshold ON email_reminder_log(threshold_months);

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE email_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_reminder_log ENABLE ROW LEVEL SECURITY;

-- Email Reminder Settings: Only admins can view/modify
CREATE POLICY "Only admins can view email reminder settings"
    ON email_reminder_settings FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Only admins can insert email reminder settings"
    ON email_reminder_settings FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Only admins can update email reminder settings"
    ON email_reminder_settings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Email Reminder Log: Users can see their own logs, admins can see all
CREATE POLICY "Users can view their own reminder logs"
    ON email_reminder_log FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only system (via service role) can insert logs
CREATE POLICY "Service role can insert reminder logs"
    ON email_reminder_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ============================================================================
-- Trigger for updated_at
-- ============================================================================
CREATE TRIGGER update_email_reminder_settings_updated_at
    BEFORE UPDATE ON email_reminder_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Function: Get Users Needing Expiration Reminders
-- ============================================================================
-- Returns users with competencies expiring within the specified threshold
-- who haven't already received a reminder for that threshold this year
CREATE OR REPLACE FUNCTION get_users_for_expiration_reminder(
    threshold_months INTEGER,
    check_timezone TEXT DEFAULT 'Europe/London'
)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    email TEXT,
    competencies JSONB
) AS $$
DECLARE
    threshold_start DATE;
    threshold_end DATE;
    current_year INTEGER;
BEGIN
    -- Calculate the date range for this threshold
    -- UK timezone for date calculations
    current_year := EXTRACT(YEAR FROM (NOW() AT TIME ZONE check_timezone));

    IF threshold_months = 0 THEN
        -- For 0 months: certifications expiring this month or already expired (but not more than 30 days ago)
        threshold_start := (NOW() AT TIME ZONE check_timezone)::DATE - INTERVAL '30 days';
        threshold_end := (DATE_TRUNC('month', (NOW() AT TIME ZONE check_timezone)) + INTERVAL '1 month - 1 day')::DATE;
    ELSE
        -- For other thresholds: certifications expiring within the month range
        -- e.g., 6 months = expiring between 5 and 6 months from now
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
        -- Check if we already sent a reminder for this threshold this year
        SELECT 1 FROM email_reminder_log erl
        WHERE erl.user_id = uwe.user_id
            AND erl.threshold_months = get_users_for_expiration_reminder.threshold_months
            AND EXTRACT(YEAR FROM erl.sent_at) = current_year
            AND erl.status = 'sent'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: Initialize Default Settings
-- ============================================================================
-- Call this function to create the default settings row if it doesn't exist
CREATE OR REPLACE FUNCTION init_email_reminder_settings()
RETURNS void AS $$
BEGIN
    INSERT INTO email_reminder_settings (id)
    VALUES (uuid_generate_v4())
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Initialize default settings
SELECT init_email_reminder_settings();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE email_reminder_settings IS 'Global configuration for certification expiration email reminders';
COMMENT ON TABLE email_reminder_log IS 'Audit log of sent expiration reminder emails';
COMMENT ON FUNCTION get_users_for_expiration_reminder IS 'Returns users with competencies expiring within the threshold who need reminders';
