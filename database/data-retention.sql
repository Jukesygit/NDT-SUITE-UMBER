-- Data Retention Functions
-- GDPR Article 5(1)(e) - Storage Limitation
-- Run these as scheduled jobs via pg_cron or a Supabase Edge Function on a cron schedule.
--
-- SCOPE (narrowed 2026-08-26): this script now covers the 90-day cleanup of
-- resolved account/permission requests ONLY. Activity-log retention moved out of
-- this file entirely — see section 3 below for why, and
-- docs/data-retention-schedule.md for the schedule of record.
--
-- Activity-log retention window: 730 days (24 months). That figure is
-- single-sourced in public.scheduled_purge_activity_logs(), whose default
-- argument is 730 (supabase/migrations/20260626170000_activity_log_retention.sql)
-- and which is invoked with an explicit 730 by the `activity-log-retention-nightly`
-- pg_cron job (supabase/migrations/20260826150000_db_state_ledger.sql). This file
-- previously stated a conflicting 3-year window; that figure was wrong and is gone.

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION cleanup_old_account_requests() FROM PUBLIC, anon, authenticated;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION cleanup_old_permission_requests() FROM PUBLIC, anon, authenticated;

-- 3. Activity log retention — REMOVED FROM THIS FILE. DO NOT RE-ADD.
--
-- This section used to define cleanup_old_activity_logs(), deleting activity_log
-- rows older than 3 years. Both halves of that were wrong:
--
--   * The window contradicted the ratified retention period. The activity log is
--     kept for 730 days (24 months), not 3 years — see the header.
--   * More importantly, the FUNCTION ITSELF was deliberately dropped by
--     supabase/migrations/20260626150000_activity_log_integrity.sql:127-136 for
--     cause: it was SECURITY DEFINER, gated only to role='admin' (not
--     super_admin), and wrote no self-audit row — a silent history-erasure path
--     that defeats the append-only guarantee. Re-running this script as it stood
--     would have RESURRECTED that dropped function.
--
-- The standing invariant (docs/agent-memory/Decision Log.md:180, and the comment
-- on the migration that dropped it): exactly two functions may delete from
-- activity_log, and both self-audit —
--   * public.purge_activity_logs(days)            — manual, super_admin-gated
--   * public.scheduled_purge_activity_logs(days)  — automated, scheduler-only
-- Never add an ungated, non-auditing deleter here or anywhere else.
--
-- The automated path is scheduled as the `activity-log-retention-nightly`
-- pg_cron job (03:43 UTC, 730 days) by
-- supabase/migrations/20260826150000_db_state_ledger.sql.

-- 4. Master cleanup function - runs the retention policies owned by this file
-- Activity-log retention is NOT invoked here; it has its own scheduled job (see
-- section 3). The returned object says so explicitly rather than omitting the
-- key, so a caller reading the result cannot conclude the log went unpurged.
CREATE OR REPLACE FUNCTION run_data_retention()
RETURNS jsonb AS $$
DECLARE
    account_req_count integer;
    perm_req_count integer;
BEGIN
    SELECT cleanup_old_account_requests() INTO account_req_count;
    SELECT cleanup_old_permission_requests() INTO perm_req_count;

    RETURN jsonb_build_object(
        'executed_at', NOW(),
        'account_requests_deleted', account_req_count,
        'permission_requests_deleted', perm_req_count,
        'activity_logs', 'handled separately by the activity-log-retention-nightly cron job (730 days)'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- These are scheduler/owner-invoked maintenance functions, not API surface:
-- without these revokes, default PUBLIC EXECUTE exposes them as PostgREST RPCs
-- that any anon/authenticated caller could invoke (adversarial review
-- 2026-08-27, finding MINOR-3).
REVOKE ALL ON FUNCTION run_data_retention() FROM PUBLIC, anon, authenticated;

-- Schedule with pg_cron (if available on your Supabase plan):
-- SELECT cron.schedule('data-retention', '11 3 * * 0', 'SELECT run_data_retention()');
-- This runs every Sunday at 03:11 UTC. Still UNSCHEDULED as of 2026-08-26 —
-- docs/data-retention-schedule.md tracks it. Minute :11 rather than :00 keeps it
-- off the top-of-hour pile-up and clear of the two nightly jobs scheduled by
-- supabase/migrations/20260826150000_db_state_ledger.sql (02:17 and 03:43 UTC).
--
-- If pg_cron is not available, create a Supabase Edge Function that calls:
--   supabaseAdmin.rpc('run_data_retention')
-- and trigger it via an external cron service or Supabase's scheduled functions.
