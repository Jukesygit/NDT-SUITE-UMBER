-- Data Retention Functions
-- GDPR Article 5(1)(e) - Storage Limitation
-- Run these as scheduled jobs via pg_cron or a Supabase Edge Function on a cron schedule.

-- 1. Delete resolved account requests older than 90 days
CREATE OR REPLACE FUNCTION cleanup_old_account_requests()
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM account_requests
    WHERE status IN ('approved', 'rejected')
      AND updated_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Delete resolved permission requests older than 90 days
CREATE OR REPLACE FUNCTION cleanup_old_permission_requests()
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM permission_requests
    WHERE status IN ('approved', 'rejected')
      AND updated_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Delete activity log entries older than 3 years
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM activity_log
    WHERE created_at < NOW() - INTERVAL '3 years';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Master cleanup function - runs all retention policies
CREATE OR REPLACE FUNCTION run_data_retention()
RETURNS jsonb AS $$
DECLARE
    account_req_count integer;
    perm_req_count integer;
    activity_count integer;
BEGIN
    SELECT cleanup_old_account_requests() INTO account_req_count;
    SELECT cleanup_old_permission_requests() INTO perm_req_count;
    SELECT cleanup_old_activity_logs() INTO activity_count;

    RETURN jsonb_build_object(
        'executed_at', NOW(),
        'account_requests_deleted', account_req_count,
        'permission_requests_deleted', perm_req_count,
        'activity_logs_deleted', activity_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule with pg_cron (if available on your Supabase plan):
-- SELECT cron.schedule('data-retention', '0 3 * * 0', 'SELECT run_data_retention()');
-- This runs every Sunday at 3 AM.
--
-- If pg_cron is not available, create a Supabase Edge Function that calls:
--   supabaseAdmin.rpc('run_data_retention')
-- and trigger it via an external cron service or Supabase's scheduled functions.
