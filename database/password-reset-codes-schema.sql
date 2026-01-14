-- Password Reset Codes Schema
-- Custom password reset flow to bypass corporate email link scanners

-- Create the password_reset_codes table
CREATE TABLE IF NOT EXISTS password_reset_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email ON password_reset_codes(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_code ON password_reset_codes(code);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at ON password_reset_codes(expires_at);

-- Enable RLS
ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only service role can access this table (Edge Functions)
-- No direct client access allowed for security
CREATE POLICY "Service role only - select" ON password_reset_codes
    FOR SELECT
    TO service_role
    USING (true);

CREATE POLICY "Service role only - insert" ON password_reset_codes
    FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Service role only - update" ON password_reset_codes
    FOR UPDATE
    TO service_role
    USING (true);

CREATE POLICY "Service role only - delete" ON password_reset_codes
    FOR DELETE
    TO service_role
    USING (true);

-- Function to clean up expired codes (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_reset_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM password_reset_codes
    WHERE expires_at < NOW() - INTERVAL '1 day'
       OR used_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment for documentation
COMMENT ON TABLE password_reset_codes IS 'Stores temporary codes for password reset flow. Codes expire after 15 minutes and can only be used once.';
