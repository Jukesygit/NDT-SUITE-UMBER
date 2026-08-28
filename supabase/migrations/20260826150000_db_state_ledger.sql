-- ============================================================================
-- DB state ledger — nightly drift snapshot + the two retention/evidence crons
-- Plan: docs/plans/2026-08-26-security-hardening-and-platform-ops-plan.md (P3.3)
-- ============================================================================
-- PURPOSE
--   1. Audit finding M12 ("the effective RLS policy set is not provable from
--      source — only a live pg_policies dump proves it") is closed CONTINUOUSLY
--      rather than by a one-off dump: every night this ledger records the policy
--      count and an md5 over the deparsed definition of every policy in the
--      database. Two snapshots with the same md5 are proof the policy set did
--      not move between those dates; a changed md5 is a dated, attributable
--      drift event that an auditor can ask about.
--   2. Finding F5 (senior-engineer review): interval DB state logging alongside
--      backups — per-table row counts, per-bucket storage object counts and the
--      migration-ledger tail, so a restore can be checked against what the live
--      database actually held on a given night.
--   3. Finding M8: the retention purge function shipped in
--      20260626170000_activity_log_retention.sql with its cron.schedule
--      DELIBERATELY commented out, so activity-log PII has been retained
--      indefinitely. This migration turns that schedule on.
--
--   The job is PURE SQL. It deliberately makes no HTTP call: the repo's previous
--   cron job silently 401'd for months because it posted to an edge function
--   with a service-role bearer that was not a valid auth token. Nothing here can
--   fail that way.
--
-- WHAT CHANGES THE MD5
--   policy_defs_md5 is md5 over one line per policy, ordered by
--   (schemaname, tablename, policyname) — the deterministic ordering IS the
--   point: without it the hash would churn on every capture and prove nothing.
--   Each line carries schema.table.policy | PERMISSIVE|RESTRICTIVE | roles |
--   cmd | USING expression | WITH CHECK expression, so the hash moves when, and
--   only when, a policy is added, dropped, renamed, re-roled, or has either of
--   its expressions changed. Note the expressions are Postgres's DEPARSED form,
--   so a semantically-equivalent rewrite of a predicate also moves the hash.
--   That is intended — this is a drift detector, not a semantic differ. The hash
--   covers EVERY schema (public, storage, auth, realtime…), so a platform
--   upgrade that ships new managed policies will also move it; the row-level
--   detail needed to tell those apart is recovered by diffing pg_policies at the
--   time, not from this column.
--
-- THIS LEDGER IS EVIDENCE INFRASTRUCTURE
--   No application code reads db_state_snapshots, and none ever should. It is
--   written by one pg_cron job running as the job owner and read by a human
--   super_admin (or by the backup/restore scripts under plan item P3.1/P3.2).
--   If a feature ever wants these numbers, it should compute them itself rather
--   than couple to an audit artefact.
--
-- VERIFICATION AFTER PUSH
--   select jobname, schedule, active from cron.job order by jobname;
--   select capture_db_state();                       -- seeds row 1 immediately
--   select captured_at, policy_count, policy_defs_md5 from db_state_snapshots
--    order by captured_at desc limit 5;
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Phase 0 — the RLS helper this migration's policy depends on.
--
-- auth_user_role() was introduced by the 2026-02 RLS restore script
-- (database/restore-rls-from-csv-export.sql), which is a hand-run script rather
-- than a migration, so on a freshly provisioned project it may not exist yet.
-- Created here ONLY if absent — an existing definition is left strictly alone,
-- because a later migration may have widened it and a blind CREATE OR REPLACE
-- would silently roll that back. Same guard shape as
-- 20260820120000_client_shares.sql:61-99.
-- ----------------------------------------------------------------------------
DO $phase0$
BEGIN
    IF to_regprocedure('public.auth_user_role()') IS NULL THEN
        EXECUTE $fn$
            CREATE FUNCTION public.auth_user_role()
            RETURNS TEXT
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = public
            AS 'SELECT role FROM profiles WHERE id = auth.uid()';
        $fn$;
    END IF;
END
$phase0$;

-- ----------------------------------------------------------------------------
-- db_state_snapshots — one row per nightly capture
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.db_state_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- { "<table>": { "count": <bigint|null>, "method": "exact"
    --                                       | "estimate"
    --                                       | "estimate_unavailable" }, ... }
    -- Self-describing on purpose: an estimate that wobbles by a few rows is not
    -- drift, and a consumer diffing two snapshots must be able to tell the two
    -- apart. See capture_db_state() for the exact/estimate split.
    table_counts JSONB NOT NULL DEFAULT '{}'::JSONB,

    -- Count of rows in pg_policies, all schemas.
    policy_count INTEGER,
    -- md5 over the ordered, fully-rendered policy definitions. See header.
    policy_defs_md5 TEXT,

    -- { "<bucket id>": <bigint>, ... } — every bucket, including empty ones, so
    -- a bucket emptied overnight reads 0 rather than silently disappearing.
    storage_object_counts JSONB NOT NULL DEFAULT '{}'::JSONB,

    -- The 10 most recent applied migration versions, newest first.
    migration_tail JSONB NOT NULL DEFAULT '[]'::JSONB
);

COMMENT ON TABLE public.db_state_snapshots IS
    'Nightly drift/evidence ledger (audit M12 + F5). Written by the db-state-ledger-nightly pg_cron job; read by super_admins and the DR scripts. Never referenced by application code.';
COMMENT ON COLUMN public.db_state_snapshots.table_counts IS
    'Per-public-table row counts as {"count": n, "method": "exact"|"estimate"|"estimate_unavailable"}.';
COMMENT ON COLUMN public.db_state_snapshots.policy_defs_md5 IS
    'md5 of every pg_policies row rendered and ordered by (schemaname, tablename, policyname). Changes only when the policy set actually changes.';

CREATE INDEX IF NOT EXISTS db_state_snapshots_captured_at_idx
    ON public.db_state_snapshots (captured_at DESC);

-- ----------------------------------------------------------------------------
-- Row level security
--
-- Read: super_admin only, through the SECURITY DEFINER helper rather than an
-- inline profiles sub-select (a policy that self-subqueries profiles re-enters
-- RLS and 500s every read — the recurring scar in this repo's policy history).
-- The check is NULL-safe by construction: auth_user_role() returns NULL for a
-- caller with no profile row, and NULL = 'super_admin' is NULL, not true, so the
-- policy fails CLOSED.
--
-- Write: nobody, from any API role — including service_role. This table is
-- audit EVIDENCE (the md5 chain is what makes drift provable), so the service
-- key must not be able to rewrite it: service_role carries BYPASSRLS, meaning
-- the absent-write-policy defence below does NOT apply to it — only the grant
-- revocation does. The one writer is capture_db_state() running as the table
-- owner (postgres) under the pg_cron job. (Adversarial review 2026-08-27,
-- finding MAJOR-1.)
-- ----------------------------------------------------------------------------
ALTER TABLE public.db_state_snapshots ENABLE ROW LEVEL SECURITY;

-- Supabase grants ALL on new public tables to anon/authenticated/service_role
-- by default; strip that back to read-only for the two that keep anything.
REVOKE ALL ON public.db_state_snapshots FROM anon;
REVOKE ALL ON public.db_state_snapshots FROM authenticated;
GRANT SELECT ON public.db_state_snapshots TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.db_state_snapshots FROM service_role;

DROP POLICY IF EXISTS "Super admins can read db state snapshots" ON public.db_state_snapshots;
CREATE POLICY "Super admins can read db state snapshots"
    ON public.db_state_snapshots FOR SELECT
    TO authenticated
    USING (public.auth_user_role() = 'super_admin');

-- No INSERT / UPDATE / DELETE policy exists, on purpose: with RLS enabled and no
-- policy for a command, that command is denied for anon/authenticated even if a
-- grant were somehow restored. service_role bypasses RLS, so for it the grant
-- revocation above is the only (and sufficient) barrier.

-- ----------------------------------------------------------------------------
-- capture_db_state() — the nightly capture, plus its own retention
--
-- COST MODEL (the exact-vs-estimate split)
--   A real count(*) over every public table is a sequential scan of the whole
--   database every night; on the scan/composite tables that is gigabytes of
--   thickness-grid payload for a number nobody audits row-by-row. So:
--     * ESTIMATE (pg_class.reltuples) for every public table. Cheap, catalog
--       only, and precise enough to see "this table lost 90% of its rows".
--       reltuples is -1 on a table that has never been analysed (PG14+), which
--       is recorded as method 'estimate_unavailable' with a NULL count rather
--       than being clamped to 0 — a fake zero would read as catastrophic loss.
--     * EXACT count(*) for the small, sensitive tables where an off-by-a-few
--       count is itself the finding: identity, tenancy, personnel PII, document
--       control, share links and 2FA recovery material. These are all small
--       (hundreds to low thousands of rows), so the scan is trivial.
--   Anything that grows large should NOT be added to the exact list without
--   re-checking the runtime of the nightly job.
--
-- SECURITY
--   SECURITY DEFINER so the job can read pg_policies, storage.objects and the
--   migration ledger regardless of the caller, with search_path pinned and every
--   cross-schema object explicitly qualified. EXECUTE is revoked from PUBLIC and
--   from both client roles; the owner (postgres, which is also the pg_cron job
--   owner) retains it implicitly. It is deliberately NOT granted to service_role
--   — nothing outside the scheduler needs to write to the ledger.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_db_state()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Small + sensitive: worth an exact count every night. See COST MODEL above.
    c_exact_tables CONSTANT TEXT[] := ARRAY[
        'profiles',
        'organizations',
        'employee_competencies',
        'competency_documents',
        'documents',
        'client_shares',
        'two_factor_backup_codes'
    ];
    -- Self-pruning window. The ledger is drift evidence, not an archive: 400
    -- days keeps a full year plus a margin so a year-on-year comparison never
    -- falls off the end mid-review.
    c_retention_days CONSTANT INTEGER := 400;

    v_id             UUID;
    v_table_counts   JSONB := '{}'::JSONB;
    v_policy_count   INTEGER;
    v_policy_md5     TEXT;
    v_storage_counts JSONB := '{}'::JSONB;
    v_migration_tail JSONB := '[]'::JSONB;
    v_rel            RECORD;
    v_exact          BIGINT;
BEGIN
    -- 1. Per-table row counts (ordered for a stable, diffable walk).
    FOR v_rel IN
        SELECT c.relname AS name, c.reltuples AS est
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'          -- ordinary tables only: no views,
                                        -- partitions, matviews or sequences
         ORDER BY c.relname
    LOOP
        IF v_rel.name = ANY(c_exact_tables) THEN
            EXECUTE format('SELECT count(*) FROM public.%I', v_rel.name) INTO v_exact;
            v_table_counts := v_table_counts || jsonb_build_object(
                v_rel.name, jsonb_build_object('count', v_exact, 'method', 'exact'));
        ELSIF v_rel.est < 0 THEN
            -- Never analysed: report the absence, do not invent a number.
            v_table_counts := v_table_counts || jsonb_build_object(
                v_rel.name, jsonb_build_object('count', NULL::BIGINT, 'method', 'estimate_unavailable'));
        ELSE
            v_table_counts := v_table_counts || jsonb_build_object(
                v_rel.name, jsonb_build_object('count', round(v_rel.est)::BIGINT, 'method', 'estimate'));
        END IF;
    END LOOP;

    -- 2. Effective policy set (audit M12). The ORDER BY inside string_agg is
    --    load-bearing — see the header.
    SELECT count(*)::INTEGER,
           md5(COALESCE(string_agg(
                   p.schemaname || '.' || p.tablename || '.' || p.policyname
                     || '|' || COALESCE(p.permissive, '')
                     || '|' || COALESCE(array_to_string(p.roles, ','), '')
                     || '|' || COALESCE(p.cmd, '')
                     || '|' || COALESCE(p.qual, '')
                     || '|' || COALESCE(p.with_check, ''),
                   E'\n' ORDER BY p.schemaname, p.tablename, p.policyname), ''))
      INTO v_policy_count, v_policy_md5
      FROM pg_policies p;

    -- 3. Storage objects per bucket. Guarded: a database without the storage
    --    schema (a bare local restore) records an empty object rather than
    --    failing the whole capture.
    IF to_regclass('storage.buckets') IS NOT NULL
       AND to_regclass('storage.objects') IS NOT NULL THEN
        SELECT COALESCE(jsonb_object_agg(b.id, COALESCE(o.n, 0)), '{}'::JSONB)
          INTO v_storage_counts
          FROM storage.buckets b
          LEFT JOIN (
              SELECT bucket_id, count(*)::BIGINT AS n
                FROM storage.objects
               GROUP BY bucket_id
          ) o ON o.bucket_id = b.id;
    END IF;

    -- 4. Migration ledger tail. Only `version` is selected: it is the one column
    --    present in every version of the Supabase CLI's ledger table.
    IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(t.version ORDER BY t.version DESC), '[]'::JSONB)
          INTO v_migration_tail
          FROM (
              SELECT version
                FROM supabase_migrations.schema_migrations
               ORDER BY version DESC
               LIMIT 10
          ) t;
    END IF;

    INSERT INTO public.db_state_snapshots (
        table_counts, policy_count, policy_defs_md5, storage_object_counts, migration_tail
    ) VALUES (
        v_table_counts, v_policy_count, v_policy_md5, v_storage_counts, v_migration_tail
    )
    RETURNING id INTO v_id;

    -- 5. Self-prune. Done here rather than in a second cron job so the ledger
    --    can never grow unbounded because someone forgot to schedule a cleaner.
    DELETE FROM public.db_state_snapshots
     WHERE captured_at < NOW() - (c_retention_days || ' days')::INTERVAL;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.capture_db_state() IS
    'Writes one db_state_snapshots row (table counts, pg_policies md5, storage counts, migration tail) and prunes snapshots older than 400 days. Scheduler-only: EXECUTE is revoked from all client roles.';

-- Owner must be postgres: it is both the SECURITY DEFINER principal that reads
-- pg_policies/storage.objects and the role the pg_cron job runs as. Migrations
-- run as postgres, so this is normally a no-op restatement of the invariant.
ALTER FUNCTION public.capture_db_state() OWNER TO postgres;

-- Lock it down (EXECUTE-to-PUBLIC is the standing scar on SECURITY DEFINER
-- functions in this repo). The owner keeps EXECUTE implicitly; no client role
-- and no service_role can invoke it.
REVOKE ALL ON FUNCTION public.capture_db_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_db_state() FROM anon;
REVOKE ALL ON FUNCTION public.capture_db_state() FROM authenticated;

-- ============================================================================
-- Schedules
-- ============================================================================
-- Inside the same transaction as everything above, matching the proven shape of
-- 20260820120000_client_shares.sql (one balanced BEGIN/COMMIT per migration
-- file). cron.schedule() writes to an ordinary table and is transactional: if a
-- later statement fails, the schedule rolls back with it. That is the behaviour
-- we want here — a half-applied migration that created the ledger but silently
-- failed to schedule it would leave M8/M12 open while looking done. (The related
-- scar from the 2026-08-17 migration runbook is the inverse case: a schedule
-- issued inside a multi-statement `psql -c` string was silently rolled back by a
-- later failure and nobody noticed. Hence the explicit verification query in the
-- header — always confirm cron.job after pushing.)
--
-- Idempotency: cron.unschedule() RAISES when the job name does not exist, so
-- existence is checked against cron.job first and the unschedule is additionally
-- wrapped in a handler. Re-running this migration re-creates both jobs rather
-- than duplicating them.
--
-- LEGACY NAME: 20260626170000's commented-out block, and
-- docs/data-retention-schedule.md, both name the retention job
-- `activity-log-retention` at 03:17 UTC. This migration schedules
-- `activity-log-retention-nightly` at 03:43 UTC instead, so the legacy name is
-- ALSO unscheduled here — otherwise a hand-created legacy job and this one would
-- both purge, and the docs would describe a job that no longer exists.
-- docs/data-retention-schedule.md must be updated to the new name/time.
--
-- Minute choice: :17 and :43 deliberately avoid :00/:30, where every scheduler
-- on the platform piles up.
-- ============================================================================
DO $cron$
DECLARE
    c_stale_jobs CONSTANT TEXT[] := ARRAY[
        'db-state-ledger-nightly',
        'activity-log-retention-nightly',
        'activity-log-retention'   -- legacy name; see note above
    ];
    v_job RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE WARNING
            'pg_cron is not installed: db-state-ledger-nightly and activity-log-retention-nightly were NOT scheduled. Audit findings M12 (continuous RLS evidence) and M8 (activity-log retention) remain OPEN until they are. Enable pg_cron, then re-run this DO block.';
        RETURN;
    END IF;

    FOR v_job IN
        SELECT jobid, jobname FROM cron.job WHERE jobname = ANY(c_stale_jobs)
    LOOP
        BEGIN
            PERFORM cron.unschedule(v_job.jobid);
            RAISE NOTICE 'Unscheduled existing cron job % (jobid %)', v_job.jobname, v_job.jobid;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Could not unschedule cron job % (jobid %): %', v_job.jobname, v_job.jobid, SQLERRM;
        END;
    END LOOP;

    -- Nightly DB state ledger — 02:17 UTC.
    PERFORM cron.schedule(
        'db-state-ledger-nightly',
        '17 2 * * *',
        $job$SELECT public.capture_db_state();$job$
    );

    -- Activity-log retention — 03:43 UTC, 730 days (the ratified window; see
    -- docs/data-retention-schedule.md and the plan's P3.3 decision). The
    -- function is scheduler-only and self-audits its own deletion.
    PERFORM cron.schedule(
        'activity-log-retention-nightly',
        '43 3 * * *',
        $job$SELECT public.scheduled_purge_activity_logs(730);$job$
    );
END
$cron$;

COMMIT;
