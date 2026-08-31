-- ############################################################################
-- ##                                                                        ##
-- ##   PARKED — DO NOT APPLY. DO NOT MOVE INTO supabase/migrations/ YET.     ##
-- ##                                                                        ##
-- ##   THIS FILE IS DESTRUCTIVE AND IRREVERSIBLE. It DROPs nine tables and   ##
-- ##   fifteen functions. There is no down-migration. If a table turns out   ##
-- ##   to hold rows, those rows are gone and the only recovery is a          ##
-- ##   point-in-time restore of the whole database.                          ##
-- ##                                                                        ##
-- ##   DO NOT APPLY UNTIL THE ZERO-ROW GATE BELOW PASSES.                    ##
-- ##   Any nonzero count = STOP. Investigate that table's CONTENTS before    ##
-- ##   dropping anything: this family holds client asset data, inspection    ##
-- ##   measurements, site photographs and free-text messages tied to named   ##
-- ##   users. A non-empty table turns this from a cleanup into a             ##
-- ##   data-retention and lawful-basis decision for the owner.               ##
-- ##                                                                        ##
-- ##   This file lives OUTSIDE supabase/migrations/ deliberately: anything   ##
-- ##   in that directory is applied by the next `supabase db push`, and an   ##
-- ##   accidental push of a DROP set before the gate has passed is           ##
-- ##   unrecoverable data loss, not an outage you can roll back.             ##
-- ##                                                                        ##
-- ############################################################################
--
-- Investigation: docs/plans/2026-08-27-legacy-table-investigation.md
--   Read it before applying. It carries the verdicts (all nine DORMANT, none
--   LIVE, none UNSAFE), the FK family map (§4.1), the RPC inventory (§5.2), the
--   zero-code-reference proof (§6.1) and the GDPR-tolerance evidence (§6.2).
--
-- ============================================================================
-- WHY — what these are and why they are going
-- ============================================================================
-- Nine tables and their RPC surface are Data-Hub-era leftovers. The Data Hub
-- feature was removed on 2026-02-06 in commit fe0f1bf ("refactor: Remove legacy
-- tools, Data Hub, and dead code", 30,439 deletions), but that cleanup was
-- FRONTEND-ONLY: every `.from()` against these tables was deleted and the tables
-- themselves were never dropped. They then rode through the 2026-08-17 eu-west-2
-- cutover in the dump/restore. They have been dormant ~6.5 months.
--
-- The evidence that they are dead (investigation §6.1):
--   * ZERO `.from()` references across src/ and supabase/functions/. The live
--     equivalents are project_vessels (7 refs), scan_composites (13),
--     inspection_projects (5), vessel_models (8), project_images (5).
--   * ZERO `.rpc()` calls to any of the eight legacy RPCs. The codebase's
--     complete .rpc() inventory is 8 targets, none of them legacy.
--   * No type for any of the nine in src/types/database.types.ts.
--   * Zero references in companion/ (the Python client).
--   * No current-era table has a FOREIGN KEY into any of the nine, and none of
--     the nine FK-references a current-era table (§4.1): every FK points at
--     another of the nine, at organizations, or at auth.users. NOTE the claim
--     is scoped to FOREIGN KEYS — policy dependencies are a separate axis, and
--     the adversarial review (2026-08-28) found four live storage.objects
--     policies referencing assets/shared_assets, handled in Phase 1.5 below.
--     Dependency sweeps must always cover BOTH public AND storage schemas.
--
-- The RPCs matter MORE than the tables, and that is the finding that motivated
-- this file (investigation §5.2). They are SECURITY DEFINER, owned by postgres,
-- and carry `GRANT ALL ... TO anon` as well as TO authenticated. A SECURITY
-- DEFINER function runs as the table owner and a table owner BYPASSES RLS, so
-- these functions are a standing hole in any RLS-based control — including the
-- parked aal2 gate, whose policies are `TO authenticated` and therefore do not
-- constrain them (see database/parked-migrations/aal2_enforcement.sql:361).
-- Adding the nine tables to the aal2 policed set would NOT have closed that
-- hole. Dropping the functions does.
--
-- They are not exploitable today — every one is NULL-safe, so an anon caller
-- gets an empty result — but `GRANT ALL ... TO anon` on a SECURITY DEFINER
-- function that reads org data is a defence-in-depth failure by this repo's own
-- standing rule. If this drop is deferred for any reason, run the REVOKE listed
-- in the investigation §8.3(2) as the interim mitigation.
--
-- ============================================================================
-- WHY THE GDPR ERASURE FUNCTIONS TOLERATE THESE DROPS
-- ============================================================================
-- Four of the nine are named in the data-driven cleanup lists of BOTH erasure
-- edge functions — supabase/functions/delete-my-account/index.ts and
-- supabase/functions/delete-user/index.ts:
--
--   delete-my-account/index.ts:377  { table: 'asset_access_requests', ... } delete
--   delete-my-account/index.ts:378  { table: 'shared_assets',         ... } delete
--   delete-my-account/index.ts:406  { table: 'assets',                ... } nullify
--   delete-my-account/index.ts:408-409  asset_access_requests.approved_by / .rejected_by
--   delete-my-account/index.ts:414  { table: 'inspections',           ... } nullify
--   delete-user/index.ts:367-368, 397-398  the same entries
--
-- These are TABLE-NAME STRINGS IN A LIST, not feature code, and both functions
-- already skip a missing relation rather than failing. They share an identical
-- guard (delete-my-account/index.ts:50-56, 68-80):
--
--   const MISSING_RELATION_CODES = new Set(['PGRST202','PGRST204','PGRST205','42P01','42703'])
--   // isMissingRelation(error) -> console.warn(... 'relation/column not present') ; return true
--
-- 42P01 is undefined_table, 42703 is undefined_column, PGRST205 is the
-- PostgREST schema-cache table miss. A dropped table therefore produces a
-- warning and a SKIPPED STEP, not a failed erasure.
--
-- THE PHANTOM-TABLE PROOF (investigation §6.2) — this is not theory, it is
-- already exercised in production every day. Both functions also reference
-- `user_asset_access` (delete-my-account/index.ts:376; delete-user/index.ts:366,
-- 396) — a table that DOES NOT EXIST in the live database. It is not among the
-- 44. That code path runs on every single account deletion today and is
-- silently skipped, which is precisely the designed behaviour. Dropping these
-- four tables puts them in exactly the state `user_asset_access` is already in
-- and has been in all along.
--
-- Both functions run as `supabaseAdmin` (service role), which bypasses RLS, so
-- no policy on these tables — including asset_access_requests having no DELETE
-- policy — has ever obstructed erasure either.
--
--   => Dropping these tables DOES NOT BRICK ACCOUNT DELETION.
--
-- FOLLOW-UP (hygiene, not a blocker, and NOT part of this file): after this
-- migration is applied, tidy the now-dead entries out of both erasure lists,
-- along with the pre-existing phantom `user_asset_access`. The guard covers
-- them either way; the tidy is for the next reader, not for correctness.
--
-- ============================================================================
-- HOW TO SHIP THIS
-- ============================================================================
--   1. Run GATE 1 (the ledger query below). It needs at least one
--      db_state_snapshots row — the nightly `db-state-ledger-nightly` job runs
--      at 02:17 UTC (supabase/migrations/20260826150000_db_state_ledger.sql),
--      so the first snapshot is expected the morning of 2026-08-28.
--   2. Run GATE 2 (exact counts). THIS IS NOT OPTIONAL AND NOT A DUPLICATE OF
--      GATE 1 — read the note under GATE 2 for why the ledger alone cannot
--      prove zero for these nine tables.
--   3. Confirm a pre-drop backup exists and its restore has been tested. A
--      DROP is not reversible from the app side; the backup IS the rollback.
--   4. Move this file to
--      supabase/migrations/<fresh timestamp>_legacy_data_hub_drop.sql.
--   5. Re-run adversarial SQL review on the moved file (standing repo rule —
--      this repo's audit history has that review catching deployment-bricking
--      defects twice, including a deletion-bricking phantom table).
--   6. Push, then run the POST-APPLY VERIFICATION block at the foot of this
--      file.
--
-- ============================================================================
-- ROLLBACK — THERE ISN'T ONE. READ THIS BEFORE APPLYING.
-- ============================================================================
-- These are DROP statements. There is no down-migration and this file does not
-- pretend to offer one. Stated plainly:
--
--   * DROP TABLE destroys the table, its rows, its indexes, its constraints,
--     its triggers and its policies. Nothing in Postgres retains them.
--   * DROP FUNCTION destroys the function body. The definitions are recoverable
--     from the schema-only dump taken during the investigation and from the
--     repo's historical SQL files (see "ORPHANED DEFINITION FILES" below), so
--     the FUNCTIONS could be hand-recreated. THE ROWS COULD NOT.
--   * The ONLY rollback for the data is a point-in-time restore of the whole
--     database to a moment before this migration ran. That is a full-platform
--     operation, not a migration; it rolls back EVERYTHING else too.
--
-- This is why GATE 1 and GATE 2 both exist and why Phase 0 below re-checks the
-- row counts at apply time and aborts the transaction rather than trusting that
-- someone ran the gates. If the gates say zero, the loss is nil and the
-- irreversibility is harmless. If they do not, this file must not run.
--
-- ============================================================================
-- GATE 1 — the ledger zero-row gate (run in the SQL editor)
-- ============================================================================
-- Reads the LATEST db_state_snapshots row and projects the recorded count for
-- each of the nine. EXPECT 9 ROWS, every row_count = 0.
--
--   SELECT s.captured_at,
--          t.table_name,
--          (s.table_counts -> t.table_name ->> 'count')::BIGINT AS row_count,
--           s.table_counts -> t.table_name ->> 'method'         AS method
--     FROM (SELECT captured_at, table_counts
--             FROM public.db_state_snapshots
--            ORDER BY captured_at DESC
--            LIMIT 1) s
--     CROSS JOIN unnest(ARRAY[
--           'assets',
--           'vessels',
--           'scans',
--           'strakes',
--           'vessel_images',
--           'inspections',
--           'shared_assets',
--           'asset_access_requests',
--           'sync_metadata'
--         ]) AS t(table_name)
--    ORDER BY t.table_name;
--
-- HOW TO READ THE RESULT — three distinct failure shapes, do not conflate them:
--
--   (a) row_count > 0 on ANY row
--       STOP. Do not apply. That table has contents. Investigate WHAT is in it
--       before deciding anything — this becomes a migrate-or-erase retention
--       decision for the owner, not a drop. See the WHY section for what these
--       tables can hold.
--
--   (b) ZERO ROWS RETURNED
--       The ledger is empty — the nightly job has not captured yet, or pg_cron
--       was never enabled (the migration RAISEs a WARNING and skips scheduling
--       in that case; see 20260826150000 lines 355-359). This is NOT a pass.
--       Seed one manually as postgres:  SELECT public.capture_db_state();
--
--   (c) row_count IS NULL
--       Two different causes, and they mean opposite things:
--         * method = 'estimate_unavailable' — pg_class.reltuples is -1, i.e.
--           the table has NEVER BEEN ANALYSED. The ledger deliberately records
--           NULL here rather than inventing a zero (20260826150000:233-236). A
--           never-analysed table is UNKNOWN, not empty. NOT a pass — GATE 2
--           settles it.
--         * method IS ALSO NULL — the key is absent from table_counts entirely,
--           meaning that table did not exist when the snapshot was taken. On a
--           re-run after a successful apply this is the EXPECTED result for all
--           nine.
--
-- Sanity companion — confirms the ledger is actually populated, so "all zeros"
-- cannot be misread when the real answer is "the query found nothing":
--
--   SELECT captured_at,
--          (SELECT count(*) FROM jsonb_object_keys(table_counts)) AS tables_recorded
--     FROM public.db_state_snapshots
--    ORDER BY captured_at DESC
--    LIMIT 3;
--   -- expect tables_recorded = 44 before this migration, 35 after.
--
-- Once several snapshots exist, also check that no snapshot EVER recorded rows.
-- A table emptied last week is still a retention question:
--
--   SELECT s.captured_at, t.table_name,
--          (s.table_counts -> t.table_name ->> 'count')::BIGINT AS row_count
--     FROM public.db_state_snapshots s
--     CROSS JOIN unnest(ARRAY['assets','vessels','scans','strakes','vessel_images',
--                             'inspections','shared_assets','asset_access_requests',
--                             'sync_metadata']) AS t(table_name)
--    WHERE (s.table_counts -> t.table_name ->> 'count')::BIGINT > 0
--    ORDER BY s.captured_at DESC;
--   -- expect ZERO rows.
--
-- ============================================================================
-- GATE 2 — EXACT counts. MANDATORY. NOT a duplicate of GATE 1.
-- ============================================================================
-- WHY THIS GATE EXISTS — read this, it is the sharpest edge in the whole file.
--
-- The ledger does NOT hold exact counts for these nine tables. capture_db_state()
-- takes an exact count(*) for exactly seven small, sensitive tables — its
-- c_exact_tables list is profiles, organizations, employee_competencies,
-- competency_documents, documents, client_shares, two_factor_backup_codes
-- (20260826150000:196-204). EVERY OTHER public table, including all nine here,
-- is recorded from pg_class.reltuples, i.e. AN ESTIMATE (20260826150000:237-240).
--
-- reltuples is maintained by VACUUM/ANALYZE. On a table that has not been
-- analysed since its rows were written, it can read 0 — or -1 — while the table
-- holds data. These nine have been untouched for ~6.5 months and are prime
-- candidates for exactly that state. A ledger estimate of 0 is therefore
-- CONSISTENT WITH a non-empty table and is NOT proof.
--
-- GATE 1 is the dated, auditable evidence artefact. GATE 2 is the proof. Run
-- both. EXPECT 9 ROWS, every exact_rows = 0:
--
--   SELECT 'assets'                AS table_name, count(*) AS exact_rows FROM public.assets
--   UNION ALL SELECT 'vessels',               count(*) FROM public.vessels
--   UNION ALL SELECT 'scans',                 count(*) FROM public.scans
--   UNION ALL SELECT 'strakes',               count(*) FROM public.strakes
--   UNION ALL SELECT 'vessel_images',         count(*) FROM public.vessel_images
--   UNION ALL SELECT 'inspections',           count(*) FROM public.inspections
--   UNION ALL SELECT 'shared_assets',         count(*) FROM public.shared_assets
--   UNION ALL SELECT 'asset_access_requests', count(*) FROM public.asset_access_requests
--   UNION ALL SELECT 'sync_metadata',         count(*) FROM public.sync_metadata
--   ORDER BY table_name;
--
-- Run it as postgres or service_role. As `authenticated` these tables are
-- RLS-filtered, so a zero could be the POLICY talking rather than the table
-- being empty — which would be the worst possible way to pass this gate.
--
-- Optional but cheap: ANALYZE the nine first, so the ledger's own estimate
-- converges on the truth and the next snapshot is trustworthy evidence:
--
--   ANALYZE public.assets, public.vessels, public.scans, public.strakes,
--           public.vessel_images, public.inspections, public.shared_assets,
--           public.asset_access_requests, public.sync_metadata;
--
-- Phase 0 of this migration re-runs the GATE 2 logic at apply time and aborts
-- the transaction if anything is non-empty. That is a backstop, not a
-- substitute: by the time it fires you have already taken the maintenance
-- window.
--
-- ============================================================================
-- DROP ORDER IS LOAD-BEARING
-- ============================================================================
-- Phase 1 — the EIGHT legacy RPCs, FIRST.
--   get_accessible_assets() is declared `RETURNS SETOF public.assets`
--   (verified in the live dump), which makes the function depend on the
--   composite type of the assets table. `DROP TABLE public.assets` therefore
--   FAILS while that function exists:
--     ERROR: cannot drop table assets because other objects depend on it
--   Dropping the functions first means CASCADE is never needed, which is the
--   point — see "NO CASCADE" below.
--
-- Phase 1.5 — four storage.objects policies depending on assets/shared_assets,
--   narrowed to their own-org branch (adversarial review 2026-08-28, BLOCKER-1).
--   Must run before Phase 2 or DROP TABLE public.assets fails on the dependency.
--
-- Phase 2 — the NINE tables, children before parents.
--   The FK graph within the family (all verified in the live dump):
--     vessels.asset_id        -> assets(id)   ON DELETE CASCADE
--     inspections.vessel_id   -> vessels(id)  ON DELETE CASCADE
--     scans.vessel_id         -> vessels(id)  ON DELETE CASCADE
--     scans.strake_id         -> strakes(id)  ON DELETE SET NULL
--     strakes.vessel_id       -> vessels(id)  ON DELETE CASCADE
--     vessel_images.vessel_id -> vessels(id)  ON DELETE CASCADE
--   Note scans -> strakes: `scans` must go before `strakes`, not merely before
--   `vessels`. shared_assets, asset_access_requests and sync_metadata have no
--   inbound FKs from the family and are free-standing.
--
-- Phase 3 — the two vessel-access helpers, AFTER the tables.
--   user_can_access_vessel(text) is referenced by all four `inspections`
--   policies (inspections_select/insert/update/delete_policy), so Postgres
--   records a dependency and `DROP FUNCTION` FAILS while those policies exist.
--   Dropping the `inspections` table in Phase 2 removes its policies and
--   releases the dependency. Hence: tables first, this helper second. (The
--   investigation §8.2 lists this helper as step 3 and the tables as step 4;
--   that ordering is inverted and would error. This file uses the order that
--   actually works, and the container probe below proves both directions.)
--
-- Phase 4 — the five path helpers, LAST and OPTIONAL.
--   These are pure string concatenation. They read NO table (verified: their
--   bodies are a single RETURN of a `||` expression), so they are NOT a
--   dependency of anything above and dropping them is not required for the
--   table drops to succeed. They are included because they are legacy-era
--   orphans with zero code references, built around the legacy text
--   asset_id/vessel_id shape. A reviewer may strike Phase 4 entirely without
--   affecting the correctness of Phases 0-3.
--
-- NO CASCADE, ANYWHERE — deliberate.
--   Every DROP here is un-CASCADEd. `DROP TABLE ... CASCADE` would silently
--   remove any dependent object it found, including functions this file has not
--   accounted for. Without CASCADE, an unexpected dependency makes this
--   migration FAIL LOUDLY and roll back, which is the behaviour you want from a
--   destructive migration. If a CASCADE ever looks necessary here, that is new
--   information about the schema and the answer is to investigate it, not to
--   add the keyword.
--
-- IF EXISTS, EVERYWHERE — deliberate.
--   Makes the file re-runnable and safe against a partially-applied state
--   (e.g. someone ran it statement-by-statement in the SQL editor and stopped
--   half way, or a phase was applied by hand earlier). Note the BEGIN/COMMIT
--   wrapper means a normal `db push` apply is atomic and cannot partially
--   apply; IF EXISTS covers the hand-run case and the honest re-run.
--
-- ============================================================================
-- WHAT THIS FILE DOES *NOT* TOUCH
-- ============================================================================
--   * public.update_updated_at_column() — five of the nine carry a
--     BEFORE UPDATE trigger calling it, and those triggers die with their
--     tables. The FUNCTION IS SHARED WITH LIVE TABLES (project_vessels among
--     them) and MUST SURVIVE. It is not dropped here. Do not "tidy" it.
--   * No sequences. Verified against the live dump: the only sequence in the
--     entire public schema is client_share_views_id_seq, which belongs to a
--     live-era table. The legacy family uses `text` primary keys and
--     uuid_generate_v4() defaults, so nothing here owns a sequence and no
--     DROP SEQUENCE is needed.
--   * Policies, indexes, constraints and triggers on the nine are NOT dropped
--     individually. DROP TABLE removes all of them with the table. Listing them
--     separately would add 40+ statements that could drift out of sync with the
--     schema and prove nothing. For the record, what goes with the tables:
--     35 policies, 28 indexes, 10 PK/unique constraints and 5 update triggers.
--   * The aal2 policed set (database/parked-migrations/aal2_enforcement.sql)
--     needs NO change. None of the nine is in it. After this drop the
--     unpoliced complement reduces from 13 names to the 4 deliberate exclusions
--     (db_state_snapshots, password_reset_codes, system_announcements,
--     tab_visibility_settings). See investigation §8.1.
--
-- ORPHANED DEFINITION FILES — after this applies, these repo files describe
-- tables that no longer exist. Retire or mark historical (investigation §8.2.7):
--   database/supabase-assets-schema.sql
--   database/supabase-sharing-schema.sql
--   database/supabase-strakes-schema.sql
--   database/supabase-asset-access-requests-schema.sql
--   database/migrations/add-inspections-table.sql
--
-- Two unrelated doc corrections the investigation raised, neither blocking:
--   * CLAUDE.md § "Key Database Tables" says `inspection_projects / vessels /
--     scans`. Two of those three are the tables this file drops. Correct to
--     `inspection_projects / project_vessels / scan_composites` (§3).
--   * src/pages/admin/tabs/UKASComplianceTab.tsx:104 cites "shared_assets table
--     with permission_level" as compliance evidence. After this migration that
--     names a nonexistent table (and it already names a nonexistent column —
--     the live one is `permission`). Accuracy issue in a compliance artefact
--     (§6.1).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Phase 0 — apply-time zero-row backstop.
--
-- Re-runs GATE 2's logic inside the transaction and ABORTS if any table holds
-- rows. This exists because the gates above are human procedure and this
-- migration is irreversible: procedure gets skipped, an EXCEPTION does not.
-- Runs as the migration role (postgres), which bypasses RLS, so the counts are
-- the true table contents and not a policy-filtered view of them.
--
-- Absent tables are skipped, not treated as an error — a re-run after a
-- successful apply must still pass this phase.
--
-- OVERRIDE: if the owner has consciously decided to destroy non-empty tables
-- after a retention/lawful-basis review, flip c_allow_nonempty to true AND
-- record the decision (who, when, on what basis) in the Engineering Log. Do not
-- flip it to make an inconvenient error go away — that error is the control
-- that stands between a routine cleanup and unrecoverable loss of client
-- inspection data.
-- ----------------------------------------------------------------------------
DO $gate$
DECLARE
    c_tables CONSTANT TEXT[] := ARRAY[
        'assets',
        'vessels',
        'scans',
        'strakes',
        'vessel_images',
        'inspections',
        'shared_assets',
        'asset_access_requests',
        'sync_metadata'
    ];
    -- OVERRIDE EXERCISED (owner: Jonas Whitehead, 2026-08-28, option (a)
    -- archive-then-drop). GATE 2 found 92 rows across six tables; a full
    -- archive (data + same-day schema DDL + sha256 manifest) was taken FIRST to
    -- C:\Users\jonas\ndt-backups\legacy-data-hub-archive-2026-08-28\
    -- (sha256 legacy-data-hub-data.sql = 074e04f7bd61...3f9c97c). Basis: Data
    -- Hub removed from the app 2026-02-06, data UI-unreachable since, tables
    -- carried anon-granted definer-RPC surface. 107 referenced storage objects
    -- become orphans (inventory in the archive README) — separate cleanup.
    -- Recorded in the Engineering Log per the OVERRIDE note's requirement.
    c_allow_nonempty CONSTANT BOOLEAN := true;    -- see OVERRIDE note above

    t          TEXT;
    v_n        BIGINT;
    v_present  INTEGER := 0;
    v_absent   INTEGER := 0;
    v_offenders TEXT := '';
BEGIN
    FOREACH t IN ARRAY c_tables LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            RAISE NOTICE 'Zero-row gate: public.% is already absent — skipping.', t;
            v_absent := v_absent + 1;
            CONTINUE;
        END IF;

        v_present := v_present + 1;
        EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_n;

        IF v_n > 0 THEN
            v_offenders := v_offenders || format(E'\n  public.%s: %s row(s)', t, v_n);
        END IF;
    END LOOP;

    IF v_offenders <> '' AND NOT c_allow_nonempty THEN
        RAISE EXCEPTION
            E'ABORTED — legacy Data Hub drop refused: table(s) are NOT empty.%\n\n'
            'This migration destroys these rows irreversibly. Do not re-run it until the '
            'contents have been reviewed and a retention decision recorded. See '
            'docs/plans/2026-08-27-legacy-table-investigation.md and the GATE sections of '
            'database/parked-migrations/legacy_data_hub_drop.sql.',
            v_offenders;
    END IF;

    IF v_offenders <> '' THEN
        RAISE WARNING
            'Zero-row gate OVERRIDDEN (c_allow_nonempty = true). Destroying rows in:%',
            v_offenders;
        RAISE NOTICE
            'Zero-row gate OVERRIDDEN: % table(s) present (rows destroyed under the recorded override — see WARNING above), % already absent.',
            v_present, v_absent;
    ELSE
        RAISE NOTICE 'Zero-row gate passed: % table(s) present and empty, % already absent.',
            v_present, v_absent;
    END IF;
END
$gate$;

-- ----------------------------------------------------------------------------
-- Phase 1 — the eight legacy SECURITY DEFINER RPCs.
--
-- FIRST, unconditionally. get_accessible_assets() RETURNS SETOF public.assets,
-- so the assets table cannot be dropped while it exists. Dropping these first
-- is what lets every table drop below stay un-CASCADEd.
--
-- Argument TYPES are what identify a function to DROP; parameter names and
-- DEFAULTs are not part of the identity and are omitted. Signatures verified
-- against the live schema dump.
-- ----------------------------------------------------------------------------

-- Reads assets + shared_assets. The hard dependency on public.assets.
DROP FUNCTION IF EXISTS public.get_accessible_assets();

-- Returns a full asset + vessels + images + scans JSON tree.
DROP FUNCTION IF EXISTS public.get_asset_hierarchy(text);

-- Reads shared_assets.
DROP FUNCTION IF EXISTS public.get_shared_assets_for_organization(uuid);

-- Reads shared_assets. (uuid, text, text DEFAULT NULL, text DEFAULT NULL)
DROP FUNCTION IF EXISTS public.get_organizations_for_shared_asset(uuid, text, text, text);

-- Reads asset_access_requests; returns username + user_email.
DROP FUNCTION IF EXISTS public.get_pending_asset_access_requests_for_org(uuid);

-- Reads asset_access_requests.
DROP FUNCTION IF EXISTS public.get_user_asset_access_requests(uuid);

-- WRITES shared_assets from an approved request.
DROP FUNCTION IF EXISTS public.approve_asset_access_request(uuid);

-- WRITES asset_access_requests. (uuid, text DEFAULT NULL)
DROP FUNCTION IF EXISTS public.reject_asset_access_request(uuid, text);

-- ----------------------------------------------------------------------------
-- Phase 1.5 — storage.objects policies that depend on assets/shared_assets.
--
-- ADDED BY ADVERSARIAL REVIEW 2026-08-28 (BLOCKER-1): four live storage
-- policies ("Users can view accessible {3D models, scan data, scan images,
-- vessel images}") carry a cross-org branch joining public.assets +
-- public.shared_assets. pg_depend records that dependency, so the un-CASCADEd
-- DROP TABLE public.assets below would FAIL and roll the whole migration back.
-- Second instance of this repo's storage-policy-omission scar class:
-- dependency sweeps must cover BOTH public AND storage schemas.
--
-- Each policy is recreated with its own-org branch ONLY. Access-neutral by
-- proof, not assertion: the removed cross-org branch joins shared_assets,
-- which holds 0 rows (GATE 2 / archive 2026-08-28), so it grants nothing to
-- anyone today. Covered by the owner's option-(a) decision — policies
-- referencing the dropped family are part of the family.
-- ----------------------------------------------------------------------------
DO $storage$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('Users can view accessible 3D models',     '3d-models'),
        ('Users can view accessible scan data',     'scan-data'),
        ('Users can view accessible scan images',   'scan-images'),
        ('Users can view accessible vessel images', 'vessel-images')
    ) AS v(polname, bucket) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.polname);
        EXECUTE format(
            'CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated '
            'USING (bucket_id = %L AND (storage.foldername(name))[1] IN ('
            '  SELECT p.organization_id::text FROM public.profiles p WHERE p.id = auth.uid()))',
            r.polname, r.bucket);
    END LOOP;
END
$storage$;

-- ----------------------------------------------------------------------------
-- Phase 2 — the nine tables, children before parents.
--
-- No CASCADE: an unexpected dependency must fail this migration loudly rather
-- than be silently removed. Policies, indexes, constraints and triggers on each
-- table are dropped with it by Postgres.
-- ----------------------------------------------------------------------------

-- --- the assets family, leaves inward -------------------------------------

-- FK -> vessels AND -> strakes, so it must precede strakes, not just vessels.
-- Ordered before inspections as free insurance (review 2026-08-28): the
-- never-applied hand-run script add-inspections-table.sql declares
-- scans.inspection_id -> inspections; live has no such FK, but this order is
-- correct under both states.
DROP TABLE IF EXISTS public.scans;

-- FK -> vessels. (The same never-applied script declares an inspections FK
-- here too — same insurance.)
DROP TABLE IF EXISTS public.vessel_images;

-- FK -> vessels. The only table whose policies call user_can_access_vessel();
-- dropping it here is what releases that function for Phase 3.
DROP TABLE IF EXISTS public.inspections;

-- FK -> vessels. Safe now that scans (its only inbound FK) is gone.
DROP TABLE IF EXISTS public.strakes;

-- FK -> assets. Safe now that all four of its children are gone.
DROP TABLE IF EXISTS public.vessels;

-- Family root. FKs out to organizations / auth.users only.
DROP TABLE IF EXISTS public.assets;

-- --- free-standing members (no inbound FK from the family) ----------------

DROP TABLE IF EXISTS public.shared_assets;
DROP TABLE IF EXISTS public.asset_access_requests;
DROP TABLE IF EXISTS public.sync_metadata;

-- ----------------------------------------------------------------------------
-- Phase 3 — the two vessel-access helpers.
--
-- AFTER the tables, necessarily. Both read `vessels JOIN assets`, so both are
-- broken the moment Phase 2 runs; and user_can_access_vessel() cannot be
-- dropped BEFORE the inspections table because that table's four policies
-- depend on it.
-- ----------------------------------------------------------------------------

-- Policy helper for the (now dropped) inspections policies. SECURITY DEFINER.
DROP FUNCTION IF EXISTS public.user_can_access_vessel(text);

-- NOT IN THE INVESTIGATION'S INVENTORY — found while authoring this file
-- against the live dump. A second, near-duplicate vessel-access helper:
-- SECURITY DEFINER, owned by postgres, `GRANT ALL ... TO anon`, reads
-- `vessels JOIN assets`, and — unlike its twin — has NO `SET search_path`,
-- which is an independent hardening defect by this repo's standing rule. It is
-- referenced by NO policy and NO application code: a complete orphan. Left
-- behind, it would be a SECURITY DEFINER function permanently querying two
-- tables that no longer exist.
DROP FUNCTION IF EXISTS public.can_access_vessel(text);

-- ----------------------------------------------------------------------------
-- Phase 4 — legacy storage-path helpers. OPTIONAL; strike this phase freely.
--
-- Five overloads that build a storage path by string concatenation from the
-- legacy text asset_id/vessel_id shape. They read no table, so nothing above
-- depends on them and nothing breaks if they stay. They have zero code
-- references and no policy references, and three of the five are SECURITY
-- DEFINER with an anon grant for no reason at all.
--
-- Note the overload pairs are distinguished by ARITY (4-vs-5 and 5-vs-6
-- arguments), so each DROP below is unambiguous.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.generate_3d_model_path(uuid, text, text, text);

DROP FUNCTION IF EXISTS public.generate_scan_image_path(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.generate_scan_image_path(uuid, text, text, text, text, text);

DROP FUNCTION IF EXISTS public.generate_vessel_image_path(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.generate_vessel_image_path(uuid, text, text, text, text);

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION
-- ============================================================================
-- 1. All nine tables are gone. EXPECT 9 rows, every regclass NULL.
--
--      SELECT t.table_name, to_regclass('public.' || t.table_name) AS still_exists
--        FROM unnest(ARRAY[
--              'assets','vessels','scans','strakes','vessel_images',
--              'inspections','shared_assets','asset_access_requests','sync_metadata'
--            ]) AS t(table_name)
--       ORDER BY t.table_name;
--
--    A non-NULL in still_exists means that table survived — the migration did
--    not fully apply. Investigate before assuming success.
--
-- 2. The public table count is 44 -> 35.
--
--      SELECT count(*) AS public_tables
--        FROM pg_class c
--        JOIN pg_namespace n ON n.oid = c.relnamespace
--       WHERE n.nspname = 'public' AND c.relkind = 'r';
--      -- expect 35
--
--    The ledger corroborates this on its own schedule: the NEXT
--    db-state-ledger-nightly snapshot (02:17 UTC) will carry 35 keys in
--    table_counts instead of 44, and a moved policy_defs_md5 with policy_count
--    lower by the 35 policies that went with the nine tables. That is the
--    dated, attributable evidence for this change:
--
--      SELECT captured_at,
--             (SELECT count(*) FROM jsonb_object_keys(table_counts)) AS tables,
--             policy_count,
--             policy_defs_md5
--        FROM public.db_state_snapshots
--       ORDER BY captured_at DESC
--       LIMIT 3;
--      -- expect the newest row: tables = 35, policy_count down 35, md5 moved.
--
-- 3. Every dropped function name is gone from pg_proc. EXPECT ZERO ROWS.
--
--      SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--        FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND p.proname IN (
--               'get_accessible_assets',
--               'get_asset_hierarchy',
--               'get_shared_assets_for_organization',
--               'get_organizations_for_shared_asset',
--               'get_pending_asset_access_requests_for_org',
--               'get_user_asset_access_requests',
--               'approve_asset_access_request',
--               'reject_asset_access_request',
--               'user_can_access_vessel',
--               'can_access_vessel',
--               'generate_3d_model_path',
--               'generate_scan_image_path',
--               'generate_vessel_image_path'
--             )
--       ORDER BY p.proname, args;
--
--    (13 names, 15 functions — generate_scan_image_path and
--    generate_vessel_image_path each have two overloads. If Phase 4 was struck,
--    expect the five generate_* rows to remain and nothing else.)
--
-- 4. No orphaned dependency was left behind anywhere in the database — no
--    policy, view, constraint or function still names a dropped relation.
--    EXPECT ZERO ROWS.
--
--      SELECT schemaname, tablename, policyname
--        FROM pg_policies
--       WHERE qual ~ '(assets|vessels|scans|strakes|vessel_images|inspections|sync_metadata)'
--          OR with_check ~ '(assets|vessels|scans|strakes|vessel_images|inspections|sync_metadata)'
--       ORDER BY schemaname, tablename, policyname;
--
--    CAUTION reading this one: the regex matches substrings, so live-era names
--    (project_vessels, scan_composites, shared_assets-free policies, and
--    anything containing "assets" or "vessels") WILL appear. It is a
--    review prompt, not a pass/fail. What you are looking for is a policy
--    referencing a BARE legacy name. Any true orphan would in any case have
--    made the migration fail, since nothing here uses CASCADE.
--
-- 5. THE CURRENT ERA IS UNTOUCHED — the check that matters most. Every live
--    table still present. EXPECT every row non-NULL.
--
--      SELECT t.table_name, to_regclass('public.' || t.table_name) AS present
--        FROM unnest(ARRAY[
--              'profiles','organizations','inspection_projects','project_vessels',
--              'scan_composites','vessel_models','project_images','project_files',
--              'documents','employee_competencies','competency_documents',
--              'activity_log','client_shares','db_state_snapshots'
--            ]) AS t(table_name)
--       ORDER BY t.table_name;
--
-- 6. Shared machinery survived. EXPECT non-NULL, and the live triggers intact.
--
--      SELECT to_regprocedure('public.update_updated_at_column()') AS must_not_be_null;
--
--      SELECT c.relname AS table_name, tg.tgname
--        FROM pg_trigger tg
--        JOIN pg_class c ON c.oid = tg.tgrelid
--        JOIN pg_namespace n ON n.oid = c.relnamespace
--       WHERE n.nspname = 'public'
--         AND NOT tg.tgisinternal
--         AND tg.tgfoid = 'public.update_updated_at_column()'::regprocedure
--       ORDER BY c.relname;
--      -- expect the live-era triggers (project_vessels among them) and NONE of
--      -- assets / scans / shared_assets / strakes / vessels.
--
-- 7. Account deletion still works — the GDPR path, exercised not assumed.
--    Run a real account-deletion against a disposable test user and confirm it
--    completes. The edge-function logs should show the skip warnings:
--      "Account erasure: skipping <step> — relation/column not present in this database"
--    for the now-dropped tables, alongside the pre-existing one for
--    user_asset_access. Warnings are the designed behaviour (see the GDPR
--    section above); a FAILED erasure is not, and would mean the missing-
--    relation guard is not covering something this file dropped.
--
-- 8. PostgREST schema cache. Supabase reloads it automatically on DDL, but if
--    any client still gets a stale 404/PGRST205 for a dropped name, force it:
--      NOTIFY pgrst, 'reload schema';
-- ============================================================================
