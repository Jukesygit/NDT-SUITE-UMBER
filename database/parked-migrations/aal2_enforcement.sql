-- ############################################################################
-- ##                                                                        ##
-- ##   PARKED — DO NOT APPLY. DO NOT MOVE INTO supabase/migrations/ YET.     ##
-- ##                                                                        ##
-- ##   Applying this file before every active user holds a verified TOTP     ##
-- ##   factor locks the entire organisation out of its own data. There is    ##
-- ##   no partial failure mode: an aal1 session sees ZERO rows in every      ##
-- ##   table listed below, and password-only sessions are aal1.              ##
-- ##                                                                        ##
-- ##   This file lives OUTSIDE supabase/migrations/ deliberately: anything   ##
-- ##   in that directory is applied by the next `supabase db push`, and an   ##
-- ##   accidental push of this policy set is an org-wide outage.             ##
-- ##                                                                        ##
-- ############################################################################
--
-- Plan: docs/plans/2026-08-26-security-hardening-and-platform-ops-plan.md (P1.3)
-- Closes: audit finding M2 — "no RLS references aal2, so a password-only session
--         bypasses 2FA at the API". Enrolling in 2FA currently protects the
--         login screen but nothing at the data layer: a stolen password plus a
--         direct PostgREST call reads the same PII the app would.
--
-- Pattern: the canonical Supabase MFA-enforcement shape.
--   https://supabase.com/blog/mfa-auth-via-rls
--   https://supabase.com/docs/guides/auth/auth-mfa
--
-- ============================================================================
-- HOW TO SHIP THIS
-- ============================================================================
--   1. Ship the P1.2 enrollment gate to production and let enrollment complete.
--   2. Run GATE 1 (below). It must return ZERO rows. Re-run it immediately
--      before applying, not once a week earlier — a user created in between is
--      a user locked out.
--   3. Read the login-bootstrap ruling below so you know why two of these
--      policies are shaped differently. Nothing to resolve — it is decided.
--   4. Move this file to supabase/migrations/<fresh timestamp>_aal2_enforcement.sql.
--   5. Re-run adversarial SQL review on the moved file (standing repo rule —
--      this repo's audit history has that review catching deployment-bricking
--      defects twice).
--   6. Push, then immediately probe: an aal1 session and an aal2 session against
--      one PII table, plus a full 6-role smoke.
--
-- ROLLBACK: DROP POLICY "Enforce MFA (aal2)" ON public.<table>; for each table
--   below. Nothing else in this file is destructive — it adds policies only.
--   Have that statement list ready BEFORE pushing; if the gate was wrong, the
--   people who would run the rollback are the people who are locked out.
--
-- ============================================================================
-- GATE 1 — enrollment readiness query (run in the SQL editor; expect 0 rows)
-- ============================================================================
-- Active users with NO verified TOTP factor. Every row is a person who will be
-- unable to read their own data the moment this migration lands.
--
--   SELECT p.id,
--          p.username,
--          p.email,
--          p.role,
--          p.organization_id,
--          u.last_sign_in_at
--     FROM public.profiles p
--     JOIN auth.users u ON u.id = p.id
--    WHERE COALESCE(p.is_active, true)                       -- see note (a)
--      AND u.deleted_at IS NULL                              -- see note (b)
--      AND (u.banned_until IS NULL OR u.banned_until <= now())
--      AND NOT EXISTS (
--            SELECT 1
--              FROM auth.mfa_factors f
--             WHERE f.user_id = p.id
--               AND f.factor_type = 'totp'
--               AND f.status = 'verified'
--          )
--    ORDER BY p.role, p.username;
--
-- Companion sanity check — total enrolled vs total active, so "0 rows" cannot be
-- mistaken for "the query is broken":
--
--   SELECT count(*) FILTER (WHERE COALESCE(p.is_active, true)) AS active_users,
--          count(*) FILTER (WHERE f.id IS NOT NULL)            AS with_verified_totp
--     FROM public.profiles p
--     LEFT JOIN auth.mfa_factors f
--            ON f.user_id = p.id AND f.factor_type = 'totp' AND f.status = 'verified';
--
-- (a) `is_active` is the ONLY disabled/deleted flag this schema has on profiles
--     (database/supabase-schema.sql — there is no deleted_at / is_deleted
--     column). It is nullable with DEFAULT true, so COALESCE is required: a NULL
--     is an active user. The login flow already enforces it
--     (src/auth/auth-supabase.ts:169 signs out !isActive).
-- (b) `auth.users.deleted_at` and `auth.users.banned_until` are GoTrue columns,
--     not repo-managed. They exist on current Supabase. If the SQL editor errors
--     on either, drop that predicate — do NOT drop the mfa_factors NOT EXISTS,
--     which is the actual gate.
--
-- ============================================================================
-- THE LOGIN-BOOTSTRAP PROBLEM — RESOLVED, ruling recorded 2026-08-27
-- ============================================================================
-- Not a gate any more. Recorded here because the resolution is the reason two
-- of the policies below are shaped differently from all the others, and anyone
-- reviewing them needs to know it was a deliberate, owner-level decision rather
-- than an oversight.
--
-- THE PROBLEM (found during authoring): a uniform aal2 predicate on `profiles`
-- would have made it impossible for ANYONE to log in, including users who were
-- fully enrolled.
--
-- The sequence, with evidence:
--   1. `signInWithPassword` succeeds. The resulting session is aal1 — TOTP has
--      not been presented yet; that is what the challenge screen is for.
--   2. `loginSupabase` immediately calls `loadUserProfile`
--      (src/auth/auth-supabase.ts:158), which does
--      `sb.from('profiles').select('*').eq('id', userId).single()`
--      (src/auth/auth-supabase.ts:95-99) — and, if the profile has an org, a
--      second read of `organizations` (src/auth/auth-supabase.ts:107-111).
--   3. Under this migration both reads return zero rows at aal1.
--      `loadUserProfile` returns early on `!profile`
--      (src/auth/auth-supabase.ts:101-103), leaving `currentUser` unset.
--   4. `loginSupabase` sees `!this.currentUser` and calls `sb.auth.signOut()`,
--      returning "Unable to load your profile"
--      (src/auth/auth-supabase.ts:160-167).
--   5. The session is now gone, so the TOTP challenge that would have raised the
--      session to aal2 can never run. Every login attempt fails identically.
--      The same read happens on session restore (src/auth/auth-supabase.ts:33,
--      58, 81, 85), so existing sessions break too.
--
-- THE RULING (owner, 2026-08-27): DECIDED — widen the two login-bootstrap
-- tables to admit the caller's OWN row at aal1; every other table stays hard
-- aal2. The rejected alternative was reordering the client so the profile load
-- happens after the TOTP challenge; that is real surgery on auth-supabase.ts,
-- AuthContext and the session-restore paths, and the enrollment gate itself
-- needs the caller's role before it can decide anything.
--
-- REFINED (owner, 2026-08-27, final): the widening applies to READS ONLY. The
-- bootstrap only reads, and a password-only attacker editing the victim's own
-- profile fields is exactly the M2 exposure class this migration exists to
-- close. So each of these two tables gets FOUR restrictive policies, not one:
--
--   profiles       FOR SELECT  USING ((SELECT auth.jwt()->>'aal') = 'aal2'
--                                     OR id = (SELECT auth.uid()))
--                  FOR INSERT / UPDATE / DELETE  ... = 'aal2'   (hard)
--   organizations  FOR SELECT  USING ((SELECT auth.jwt()->>'aal') = 'aal2'
--                                     OR id = public.auth_user_org_id())
--                  FOR INSERT / UPDATE / DELETE  ... = 'aal2'   (hard)
--
-- Net position: reads of the caller's own identity row are possible at aal1;
-- EVERY write, on every table in this file including the caller's own row, needs
-- aal2. See the body for why the writes are three per-command policies rather
-- than one `FOR ALL` — that shortcut re-breaks the bootstrap, and was measured.
--
-- `organizations` resolves the caller's org through the SECURITY DEFINER helper
-- and NOT an inline `profiles` sub-select. That is load-bearing: a policy that
-- sub-selects `profiles` re-enters RLS on it, and the recursion 500s every read
-- including the login path. Same reason the helper exists at all, and the same
-- shape 20260820120000_client_shares.sql:241 already uses.
--
-- WHAT THIS COSTS, STATED PLAINLY: M2 closes fully for every table in this file
-- EXCEPT the caller's own `profiles` row and own `organizations` row, which
-- remain readable with a password-only (aal1) session BY DESIGN. A stolen
-- password therefore still exposes that one user's own profile PII (DOB, home
-- address, next of kin, mobile — supabase/migrations/20250105100000) and their
-- org's name. It does NOT expose anyone else's profile, or any row of any other
-- table below. The accepted exposure is READ of identity bootstrap rows only;
-- all substantive PII surfaces (competencies, documents, activity log,
-- inspection data) are hard aal2 with no self-row escape hatch, and no table in
-- this file accepts a WRITE below aal2.
--
-- An earlier draft used a single `FOR ALL` widened policy per table. Probing
-- showed that admitted own-row WRITES at aal1 as well (Postgres reuses USING as
-- WITH CHECK), which is the exposure class M2 is about — so it was replaced by
-- the read/write split above. Recorded because the shape looks redundant until
-- you know it was load-bearing.
--
-- ============================================================================
-- KNOWN GOTCHAS (document these before anyone reports them as bugs)
-- ============================================================================
--   * Dashboard "user impersonation" issues an aal1 token. Impersonating a user
--     in the Supabase table editor will return ZERO rows on every table below —
--     except a READ of that user's own `profiles` / `organizations` row, per the
--     ruling. Writes are denied there too.
--     That is the control working, not an outage. Query as postgres/service role
--     to inspect data.
--   * Service role and edge functions BYPASS RLS entirely and are unaffected:
--     `serve-client-share`, `manage-backup-codes`, `admin-reset-2fa`,
--     `delete-user` and the rest keep working exactly as before.
--   * SECURITY DEFINER triggers owned by postgres also bypass these policies —
--     `audit_row_change()` (20260626160000) keeps writing to `activity_log`
--     regardless of the caller's aal, so the audit trail does not go dark.
--   * RESTRICTIVE policies are ANDed with the existing PERMISSIVE ones. Nothing
--     here widens access: a user who could not see a row before still cannot.
--     The only effect is to subtract access from aal1 sessions.
--   * `FOR ALL` with only a USING clause: Postgres reuses the USING expression
--     as the WITH CHECK expression, so INSERT and UPDATE are covered too, not
--     just SELECT/DELETE. This is why no explicit WITH CHECK appears below.
--   * `(SELECT auth.jwt()->>'aal')` — the subquery wrapper is the documented
--     Supabase RLS performance pattern: it makes the planner evaluate the claim
--     ONCE per query (InitPlan) instead of once per row. Do not unwrap it.
--   * Tables whose RLS grants nothing to `authenticated` today
--     (`two_factor_backup_codes`, and INSERT on `client_share_views`) gain a
--     policy that is a no-op right now. It is included so the enforcement is
--     already in place if a permissive policy is ever added later.
--   * `password_reset_codes` is DELIBERATELY EXCLUDED. It is service-role-only
--     (database/password-reset-codes-schema.sql:26-44 — four "Service role only"
--     policies, nothing for `authenticated`) and it is read during password
--     RESET, i.e. before any session exists. An aal2 policy there would be both
--     meaningless and a trap.
--   * `storage.objects` is out of scope for this file. Documents, competency
--     certificates and scan data are fetched through signed URLs from buckets
--     with their own policies; extending aal2 to storage is a separate decision
--     with its own breakage surface (avatars, share bundles).
--
-- ============================================================================
-- TABLE SET — verified to exist, and to have RLS enabled, in the repo's schema
-- sources. Missing tables are skipped with a NOTICE rather than failing the
-- migration (the to_regclass guard pattern from
-- supabase/migrations/20260626160000_activity_log_audit_triggers.sql:194-225;
-- `vessel_scan_placements` is the known table that does not exist everywhere).
--
-- All tables get the same policy name, RESTRICTIVE-ness, command and role. Only
-- `profiles` and `organizations` differ, in their USING expression alone, per
-- the ruling above.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Phase 0 — the helper the `organizations` policy depends on.
--
-- auth_user_org_id() came from the 2026-02 RLS restore script
-- (database/restore-rls-from-csv-export.sql:128-140), a hand-run script rather
-- than a migration, so it may be absent on a freshly provisioned project.
-- Created here ONLY if absent — an existing definition is left strictly alone,
-- because a later migration may have widened it and a blind CREATE OR REPLACE
-- would silently roll that back. Same guard shape as
-- supabase/migrations/20260820120000_client_shares.sql:61-99.
-- ----------------------------------------------------------------------------
DO $phase0$
BEGIN
    IF to_regprocedure('public.auth_user_org_id()') IS NULL THEN
        EXECUTE $fn$
            CREATE FUNCTION public.auth_user_org_id()
            RETURNS UUID
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = public
            AS 'SELECT organization_id FROM profiles WHERE id = auth.uid()';
        $fn$;
    END IF;
END
$phase0$;

DO $aal2$
DECLARE
    -- ------------------------------------------------------------------
    -- The hard-aal2 set: no self-row escape hatch, no exceptions.
    -- `profiles` and `organizations` are NOT here — they are policed
    -- separately below with the widened predicate, per the ruling.
    -- ------------------------------------------------------------------
    c_tables CONSTANT TEXT[] := ARRAY[
        -- Personnel PII and competency records
        'employee_competencies',        -- database/competency-schema.sql
        'competency_documents',         -- supabase/migrations/20260728120000
        'competency_definitions',       -- database/competency-schema.sql
        'competency_categories',        -- database/competency-schema.sql
        -- Document control
        'documents',                    -- database/migrations/document-control-schema.sql
        'document_revisions',           -- database/migrations/document-control-schema.sql
        'document_review_schedule',     -- database/migrations/document-control-schema.sql
        'document_categories',          -- database/migrations/document-control-schema.sql
        -- Audit trail and approval workflows
        'activity_log',                 -- database/activity-log-schema.sql
        'permission_requests',          -- database/supabase-profile-schema.sql
        'account_requests',             -- database/supabase-schema.sql
        -- Inspection workflow (client asset data)
        'inspection_projects',          -- database/inspection-project-schema.sql
        'project_vessels',              -- database/inspection-project-schema.sql
        'vessel_models',                -- database/scan-composite-schema.sql
        'scan_composites',              -- database/scan-composite-schema.sql
        'vessel_scan_placements',       -- database/scan-composite-schema.sql (may be absent)
        'scan_log_entries',             -- database/migrations/enhance-project-vessels-inspection-detail.sql
        'calibration_log_entries',      -- database/migrations/enhance-project-vessels-inspection-detail.sql
        'inspection_procedures',        -- database/migrations/enhance-project-vessels-inspection-detail.sql
        'project_files',                -- database/inspection-project-schema.sql
        'project_images',               -- database/migrations/add-project-images.sql
        -- Client sharing
        'client_shares',                -- supabase/migrations/20260820120000
        'client_share_views',           -- supabase/migrations/20260820120000
        -- 2FA recovery material
        'two_factor_backup_codes'       -- supabase/migrations/20260826120000
    ];

    -- ------------------------------------------------------------------
    -- ADDED DURING AUTHORING — not in the plan's P1.3 list, but the same class
    -- of data, RLS-enabled, and live (each is queried by src/ or
    -- supabase/functions/). Flagged separately so review can strike the whole
    -- array in one line if any of them is judged out of scope.
    -- ------------------------------------------------------------------
    c_tables_added CONSTANT TEXT[] := ARRAY[
        -- Per-person competency change history: who held what, and when it
        -- lapsed. Same sensitivity as employee_competencies.
        'competency_history',           -- database/competency-schema.sql
        -- Free-text commentary about a named individual's competencies,
        -- including escalations. Arguably more sensitive than the record itself.
        'competency_comments',          -- database/add-competency-comments.sql
        -- email_sent_to + managers_cc: raw personal email addresses, and it has
        -- a "Users can view their own reminder logs" policy for `authenticated`.
        'email_reminder_log',           -- database/email-reminder-schema.sql
        -- manager_emails[]: a standing distribution list of personal addresses.
        'email_reminder_settings',      -- database/email-reminder-schema.sql
        -- sent_by_email / sent_by_name / recipient_ids[] and the full HTML body
        -- of every notification email an admin has sent.
        'notification_email_log',       -- database/migrations/notification-email-schema.sql
        -- recipient_email / recipient_name, one row per addressee.
        'notification_email_recipients' -- database/migrations/notification-email-schema.sql
    ];

    -- ------------------------------------------------------------------
    -- The login-bootstrap tables, each with its OWN widened predicate.
    --
    -- loadUserProfile() runs at aal1, before the TOTP challenge can raise the
    -- session (src/auth/auth-supabase.ts:158 calls it straight after
    -- signInWithPassword; it reads profiles at :95-99 and organizations at
    -- :107-111, and a zero-row result makes :160-167 sign the user out). The
    -- second disjunct admits exactly the caller's own row so that bootstrap
    -- resolves, and nothing else. See the ruling in the header.
    --
    -- organizations resolves the caller's org via the SECURITY DEFINER helper,
    -- never an inline profiles sub-select — that shape recurses through RLS on
    -- profiles and 500s the login path.
    -- ------------------------------------------------------------------
    c_login_path_tables CONSTANT TEXT[][] := ARRAY[
        -- database/supabase-schema.sql
        ['profiles',      '(SELECT auth.jwt() ->> ''aal'') = ''aal2'' OR id = (SELECT auth.uid())'],
        -- database/supabase-schema.sql
        ['organizations', '(SELECT auth.jwt() ->> ''aal'') = ''aal2'' OR id = public.auth_user_org_id()']
    ];

    c_policy_name CONSTANT TEXT := 'Enforce MFA (aal2)';
    -- The hard predicate, used for everything except the two tables above.
    c_hard_predicate CONSTANT TEXT := '(SELECT auth.jwt() ->> ''aal'') = ''aal2''';

    v_targets TEXT[];
    t         TEXT;
    i         INTEGER;
    v_applied INTEGER := 0;
    v_skipped INTEGER := 0;
BEGIN
    v_targets := c_tables || c_tables_added;

    FOREACH t IN ARRAY v_targets LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            RAISE NOTICE 'Skipping aal2 policy: table public.% does not exist', t;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Idempotent: re-running replaces rather than erroring on a duplicate.
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', c_policy_name, t);

        -- FOR ALL (implied) + USING only => USING is reused as WITH CHECK, so
        -- SELECT, INSERT, UPDATE and DELETE are all gated. RESTRICTIVE, so this
        -- is ANDed with the table's existing permissive policies and can only
        -- subtract access. TO authenticated, so postgres / service_role and the
        -- SECURITY DEFINER trigger functions are untouched.
        EXECUTE format(
            'CREATE POLICY %I ON public.%I '
            || 'AS RESTRICTIVE '
            || 'TO authenticated '
            || 'USING (%s)',
            c_policy_name, t, c_hard_predicate
        );

        v_applied := v_applied + 1;
    END LOOP;

    -- The two login-bootstrap tables. FOUR policies each: reads carry the
    -- widened predicate so the bootstrap resolves, writes carry the HARD one so
    -- an aal1 session cannot edit even its own row.
    --
    -- WHY PER-COMMAND WRITE POLICIES AND NOT ONE `FOR ALL` — measured, not
    -- assumed. Restrictive policies are ANDed: EVERY applicable one must pass.
    -- `FOR ALL` applies to SELECT as well, so `FOR SELECT (aal2 OR own row)`
    -- combined with `FOR ALL (aal2)` collapses to `aal2 AND (aal2 OR own row)`
    -- = `aal2` for reads — which re-breaks the login bootstrap this whole ruling
    -- exists to protect. Verified in a Postgres 17 container: that pairing
    -- returns ZERO rows for an aal1 own-row SELECT; the per-command shape below
    -- returns the row and still denies the write. Never "simplify" these three
    -- write policies into one `FOR ALL`.
    --
    -- Command coverage is complete: SELECT / INSERT / UPDATE / DELETE. Note the
    -- clause each command accepts — FOR INSERT takes WITH CHECK only, FOR DELETE
    -- takes USING only, FOR UPDATE takes USING (and reuses it as WITH CHECK when
    -- WITH CHECK is omitted, which is what we want: neither the old row nor the
    -- new row may be touched below aal2).
    FOR i IN 1 .. array_length(c_login_path_tables, 1) LOOP
        t := c_login_path_tables[i][1];

        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            RAISE NOTICE 'Skipping aal2 policy: table public.% does not exist', t;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Idempotent, and ALSO drops the superseded single FOR ALL policy that
        -- earlier drafts of this file created on these two tables — otherwise a
        -- re-apply would leave a stale policy ANDing in alongside the new four.
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', c_policy_name, t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', c_policy_name || ' read', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', c_policy_name || ' insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', c_policy_name || ' update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', c_policy_name || ' delete', t);

        -- READ: widened. The only place the own-row disjunct is allowed to live.
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)',
            c_policy_name || ' read', t, c_login_path_tables[i][2]
        );

        -- WRITES: hard aal2, own row included.
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',
            c_policy_name || ' insert', t, c_hard_predicate
        );
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s)',
            c_policy_name || ' update', t, c_hard_predicate
        );
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)',
            c_policy_name || ' delete', t, c_hard_predicate
        );

        RAISE NOTICE 'aal2 policies on public.%: READ admits the caller''s own row at aal1 (login bootstrap); INSERT/UPDATE/DELETE are hard aal2 — by ruling, not by oversight.', t;
        v_applied := v_applied + 1;
    END LOOP;

    RAISE NOTICE 'aal2 enforcement: % table(s) policed, % skipped (absent).', v_applied, v_skipped;
END
$aal2$;

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION
-- ============================================================================
-- 1. Every intended table carries the restrictive policy. NOTE the LIKE: the two
--    login-bootstrap tables carry four suffixed policies each, so an `=` filter
--    would silently miss them.
--
--      SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
--        FROM pg_policies
--       WHERE policyname LIKE 'Enforce MFA (aal2)%'
--       ORDER BY tablename, policyname;
--
--    `permissive` must read RESTRICTIVE on every row. A PERMISSIVE row here
--    would be catastrophic — a permissive policy OR-widens, so it would GRANT
--    every authenticated user access to the whole table.
--
--    TRIPWIRE — the `OR` may appear in EXACTLY TWO rows, and both must be the
--    SELECT policies of profiles and organizations:
--
--      SELECT tablename, policyname, cmd
--        FROM pg_policies
--       WHERE policyname LIKE 'Enforce MFA (aal2)%'
--         AND (qual LIKE '%OR%' OR with_check LIKE '%OR%');
--      -- expect exactly: profiles/…read/SELECT and organizations/…read/SELECT
--
--    An `OR` on any other table, or on any INSERT/UPDATE/DELETE policy, means a
--    predicate leaked where it should not have. That is a defect, not a variant:
--    it would let a password-only session write.
--
-- 2. The ledger records the change: the next db-state-ledger-nightly snapshot
--    (migration 20260826150000) will show a moved policy_defs_md5 and a
--    policy_count higher by the number of tables policed. That is the dated
--    evidence for the M2 remediation.
--
-- 3. Live probes, aal1 vs aal2 sessions:
--      * `documents` (representative hard-aal2 table): aal1 = zero rows;
--        aal2 = what it returned before.
--      * `profiles` at aal1: EXACTLY ONE row, the caller's own. Seeing a second
--        row means the widened predicate is wrong and cross-user PII is exposed
--        to password-only sessions — stop and roll back.
--      * `organizations` at aal1: exactly the caller's own org row.
--      * UPDATE at aal1 on someone else's profiles row: must be denied.
--      * UPDATE at aal1 on the caller's OWN profiles row: must ALSO be denied —
--        this is the read/write split doing its job. If it succeeds, the write
--        policies are missing or were collapsed back into a `FOR ALL`.
--      * UPDATE at aal2 on the caller's own profiles row: must succeed, or the
--        app's own profile editing is broken.
--
-- 4. Full 6-role smoke (super_admin, admin, manager, org_admin, editor, viewer).
--
-- 5. End-to-end login smoke — the whole point of the ruling. Sign in with a
--    password and confirm the TOTP challenge screen appears (rather than
--    "Unable to load your profile"), then complete it and confirm the app loads.
-- ============================================================================
