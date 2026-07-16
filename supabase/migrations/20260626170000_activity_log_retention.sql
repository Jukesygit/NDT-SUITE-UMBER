-- ============================================================================
-- Activity Log v2 — scheduled retention (P5 of the true audit-trail rework)
-- Design: docs/plans/2026-06-26-activity-log-true-audit-trail-design.md
-- ============================================================================
-- purge_activity_logs() (migration 20260626150000) is the MANUAL, super_admin-
-- gated purge invoked from the admin UI. That function gates on auth.uid(), so it
-- cannot run from a scheduler (pg_cron has no auth context). This migration adds a
-- system variant for automated retention plus a commented pg_cron schedule.
--
-- Retention default: 730 days (24 months), configurable per call.
-- Both delete paths self-audit; neither is ungated/silent (the invariant that the
-- legacy cleanup_old_activity_logs() violated and was dropped in 20260626150000).
-- ============================================================================

-- System retention purge: intended for pg_cron / service-role automation only.
-- It does NOT gate on auth.uid() (there is none under a scheduler); instead it is
-- locked down via REVOKE so no client role can call it. It records a self-audit
-- row attributed to the system (actor NULL, actor_role 'system').
CREATE OR REPLACE FUNCTION public.scheduled_purge_activity_logs(p_older_than_days INTEGER DEFAULT 730)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    IF p_older_than_days IS NULL OR p_older_than_days < 1 THEN
        RAISE EXCEPTION 'p_older_than_days must be a positive integer';
    END IF;

    DELETE FROM activity_log
     WHERE created_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    INSERT INTO activity_log (
        user_id, action_type, action_category, description, details, actor_role
    ) VALUES (
        NULL, 'logs_purged', 'data',
        format('Scheduled retention purge removed %s activity log entr%s older than %s days',
               v_deleted, CASE WHEN v_deleted = 1 THEN 'y' ELSE 'ies' END, p_older_than_days),
        jsonb_build_object('deleted_count', v_deleted, 'older_than_days', p_older_than_days, 'source', 'scheduler'),
        'system'
    );

    RETURN v_deleted;
END;
$$;

-- Lock it down: no client role may invoke the system purge. pg_cron runs as the
-- job owner (a superuser/postgres role), which can execute it; service_role is
-- granted for an externally-triggered scheduler (e.g. an Edge Function cron).
REVOKE ALL ON FUNCTION public.scheduled_purge_activity_logs(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scheduled_purge_activity_logs(INTEGER) FROM authenticated;
REVOKE ALL ON FUNCTION public.scheduled_purge_activity_logs(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.scheduled_purge_activity_logs(INTEGER) TO service_role;

-- ----------------------------------------------------------------------------
-- Enable the nightly schedule (ops action). Requires the pg_cron extension,
-- which is available on Supabase but must be enabled by a project admin. Uncomment
-- the block below once pg_cron is enabled to run the purge nightly at 03:17 UTC.
-- ----------------------------------------------------------------------------
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--     'activity-log-retention',
--     '17 3 * * *',
--     $$SELECT public.scheduled_purge_activity_logs(730);$$
-- );
-- To change retention later: SELECT cron.unschedule('activity-log-retention'); then re-schedule.
