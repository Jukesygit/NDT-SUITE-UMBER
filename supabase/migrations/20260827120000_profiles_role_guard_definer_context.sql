-- ============================================================================
-- The role-escalation guard blocks the VETTED approval path it was never meant
-- to stop: approve_permission_request() fails for every org_admin caller.
-- Security audit 2026-08 (raised as "new issue, pre-existing").
-- ============================================================================
--
-- THE DEFECT
--   approve_permission_request()
--   (20260812120000_security_audit_role_scoping.sql:343-429) is SECURITY
--   DEFINER. It authorises the caller itself — caller must be admin or
--   org_admin, an org_admin may only approve requests from users in their OWN
--   organisation, and elevated grants ('manager','admin','super_admin') require
--   an admin/super_admin caller — and only then does:
--
--       UPDATE profiles SET role = request_record.requested_role ...
--
--   That UPDATE fires protect_sensitive_profile_fields()
--   (20260812123000_profiles_role_guard_insert.sql:54-135), whose UPDATE branch
--   asks a question about the CALLER:
--
--       IF OLD.role IS DISTINCT FROM NEW.role
--          AND current_user_role NOT IN ('super_admin', 'admin') THEN RAISE
--
--   SECURITY DEFINER changes the SQL role, NOT the request identity: auth.uid()
--   reads the request JWT claims GUC, so inside the RPC it still resolves to the
--   org_admin who called it. current_user_role is therefore 'org_admin', the
--   gate fires, and the guard built to stop UNVETTED role changes kills the
--   vetted one. The RPC's own `WHEN OTHERS` handler then swallows the P0001 and
--   returns the generic envelope, so the operator sees no reason for the
--   failure and the server log holds the only clue.
--
--   Blast radius: EVERY org_admin approval of a permission request. `admin`
--   callers are unaffected (they satisfy the gate), which is why this survived.
--
-- REPRODUCTION (throwaway postgres:17.11 container; Supabase-shaped roles,
-- auth.uid() over request.jwt.claims, profiles + permission_requests, the RLS
-- helpers/policies, and BOTH functions loaded verbatim from the migrations):
--
--   org_admin approves an in-org request for 'editor' (non-elevated):
--     approve_permission_request(...) -> {"error": "An unexpected error
--                                         occurred", "success": false}
--     subject profiles.role           -> unchanged ('viewer')
--     permission_requests.status      -> unchanged ('pending')
--   The same UPDATE run through a definer function WITHOUT the RPC's exception
--   envelope surfaces the real error:
--     P0001  Security violation: Only admins can change user roles
--   Control: the identical approval by an `admin` caller succeeds and the
--   subject becomes 'editor'. The defect is specific to the org_admin path.
--
-- MECHANISM — why the trigger function must be SECURITY INVOKER
--   The trigger has to tell "a client is updating profiles directly" from "our
--   own vetted server-side code is updating profiles". Measured in the
--   container, with the same org_admin JWT present in both cases:
--
--     context of the UPDATE          | SECURITY DEFINER trg | SECURITY INVOKER trg
--     -------------------------------+----------------------+---------------------
--     direct client UPDATE           | current_user=postgres| current_user=authenticated
--     UPDATE inside a definer fn     | current_user=postgres| current_user=postgres
--
--   A SECURITY DEFINER trigger reads current_user as its OWN owner in both
--   cases and can distinguish nothing — which is why the guard could not simply
--   be taught to make an exception. Nor can the outer context be recovered from
--   inside a definer: a SECURITY INVOKER function called from a definer
--   function also reports current_user=postgres (measured). session_user is no
--   help either — it is 'authenticator' for all PostgREST traffic, RPC and
--   direct update alike. So the ONE discriminator is current_user, and it is
--   only legible if the guard itself runs as the invoker.
--
--   The guard consequently switches to SECURITY INVOKER, and its role lookup
--   moves from a raw `SELECT role FROM profiles` to the existing SECURITY
--   DEFINER helper get_my_role() (20260812120000:61-69). Without that swap the
--   lookup would newly be subject to RLS; through the helper it keeps exactly
--   today's RLS-free semantics in every context, and it is the same helper the
--   profiles policies already rely on.
--
-- WHY current_user CANNOT BE FORGED FROM A CLIENT SESSION
--   PostgREST connects as `authenticator` (NOINHERIT) and does SET LOCAL ROLE
--   to the JWT's `role` claim; that claim can only name a role authenticator is
--   a member of — anon, authenticated, service_role — and PostgREST rejects
--   anything else. There is no route from a REST request to `SET ROLE postgres`
--   (authenticator holds no membership in it, and SET ROLE is not exposed by
--   PostgREST at all). The ONLY way current_user becomes the guard's owner is
--   to actually be executing inside a SECURITY DEFINER function owned by that
--   role — i.e. inside code that shipped through a migration and was reviewed.
--   Measured, from a real `authenticator` login (non-superuser, NOINHERIT) that
--   had done SET LOCAL ROLE authenticated, exactly as PostgREST does:
--     SET ROLE postgres                    -> 42501 permission denied to set role "postgres"
--     SET SESSION AUTHORIZATION postgres   -> 42501 permission denied
--     SET ROLE service_role                -> ALLOWED (authenticator IS a member)
--   That last line is the reason service_role is NOT added to the vetted set
--   below: it is reachable by anyone presenting the service key, so vetting it
--   would be a real widening, whereas the guard's owner is not reachable at all.
--   Contrast the explicitly rejected alternative, a session GUC flag: a GUC is
--   session state, it is soft, and a guard must not depend on anything the
--   session it is judging could set.
--
--   The vetted role is resolved dynamically as the owner of THIS function
--   rather than hardcoded as 'postgres', so the check states its own meaning —
--   "the role that deploys our migrations" — and stays correct if a project is
--   ever provisioned under a different owner. If the lookup yields NULL the
--   context is treated as UNVETTED (fail closed).
--
-- WHAT STAYS BLOCKED (all verified in the container after this migration)
--   * org_admin doing `UPDATE profiles SET role = ...` directly (PostgREST,
--     current_user='authenticated') — still P0001. RLS deliberately PERMITS
--     that UPDATE for in-org non-admin rows
--     (database/migrations/fix-manager-role-rls-recursion.sql:65-78), so this
--     trigger is the only thing standing between an org_admin and self-service
--     role assignment. It still stands.
--   * editor/viewer/manager direct role updates — still blocked.
--   * Approving one's OWN request. The two self-mutation rules ("cannot change
--     your own role/organization") are keyed on auth.uid(), NOT on the caller's
--     role, so they are NOT caller-role checks and are left absolute in EVERY
--     context, the RPC included. An approver can therefore never approve a
--     request naming themselves.
--   * Assigning or removing 'super_admin' by anyone who is not a super_admin —
--     also left absolute in every context, so a vetted definer cannot mint a
--     super_admin on behalf of a lesser caller either.
--   * The RPC's own authorisation is untouched by this migration: caller must
--     be admin/org_admin, org_admin is org-scoped, and elevated grants
--     ('manager','admin','super_admin') still require an admin/super_admin
--     caller. This migration widens WHO the trigger lets through, never WHAT
--     the RPC is willing to grant, so it opens no path around that allowlist —
--     an org_admin approving a 'manager' request is still refused by the RPC,
--     before any UPDATE is attempted.
--
-- WHAT IS NO LONGER BLOCKED, AND IS WORTH A CONSCIOUS DECISION
--   Restoring the vetted path restores ALL of it, including the parts the
--   broken guard had been suppressing by accident. 'org_admin' is not on the
--   RPC's elevated list ('manager','admin','super_admin'), so an org_admin may
--   now approve an in-org request for 'org_admin' and mint a co-administrator
--   of their own tenant — verified in the container: the RPC returns success
--   and the target's role becomes 'org_admin'. That is the RPC's pre-existing
--   policy from 20260812120000, not something introduced here, and changing it
--   would mean editing that allowlist rather than this trigger. It is called
--   out because until now the defect had been masking it.
--
-- SCOPE HELD DELIBERATELY
--   * The INSERT branch (finding L4) is carried over with its behaviour
--     unchanged, including the coerce-to-'viewer' fallback, and is NOT made
--     context-aware: no definer path inserts profile rows while an end-user JWT
--     is present (handle_new_user and the service-role edge functions all run
--     with auth.uid() IS NULL), so making it context-aware would be a change
--     with no caller.
--   * The `auth.uid() IS NULL` early return is untouched. That is how the
--     service-role edge functions (create-user, bulk-create-users, sync-users,
--     approve-account-request) already pass: they build their client from the
--     service key and never forward the user's Authorization header, so no
--     `sub` claim reaches the database. service_role is NOT added to the vetted
--     set — it does not need to be, and adding it would widen the exemption to
--     anyone holding the service key for no product gain.
--   * Two NULL-safety holes in the inherited gates are closed while they are
--     being touched: `current_user_role NOT IN (...)` and
--     `current_user_role != 'super_admin'` both evaluate to NULL — i.e. the IF
--     is NOT taken, and the update PASSES — for a caller who has a JWT but no
--     profiles row. Same three-valued-logic trap as BLOCKER 6.1 in
--     20260812120000. Every gate below now tests `IS NULL OR ...` and fails
--     closed. No grants change; nothing is granted to anon.
--
-- VERIFICATION AFTER PUSH
--   select p.prosecdef as is_definer, p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'protect_sensitive_profile_fields';   -- expect f
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
--   -- The unforgeability assumption, asserted against the live cluster: the
--   -- guard's owner must NOT be among the roles PostgREST can switch into.
--   select r.rolname as authenticator_can_become
--     from pg_auth_members m
--     join pg_roles r on r.oid = m.roleid
--     join pg_roles a on a.oid = m.member
--    where a.rolname = 'authenticator';
--   -- expect exactly: anon, authenticated, service_role
--   select p.proname, pg_get_userbyid(p.proowner) as owner
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('protect_sensitive_profile_fields',
--                        'approve_permission_request');
--   -- both owners must match, and must not appear in the list above
--
--   -- then, as an org_admin, approve a pending non-elevated in-org request.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Hard dependency: get_my_role() (20260812120000, which sorts earlier). Fail at
-- migration time with a legible message rather than at the first profiles write.
-- ----------------------------------------------------------------------------
DO $dep$
BEGIN
    IF to_regprocedure('public.get_my_role()') IS NULL THEN
        RAISE EXCEPTION
            'get_my_role() is missing; apply 20260812120000_security_audit_role_scoping.sql first';
    END IF;

    -- The vetting compares current_user to THIS guard's owner. If the guard and
    -- approve_permission_request are owned by different roles, the vetting never
    -- engages inside the RPC and this migration silently fixes nothing. Fail
    -- loudly at migration time instead (adversarial review 2026-08-27, MINOR-2).
    -- CREATE OR REPLACE preserves owners, so this migration cannot cause the
    -- mismatch — it can only inherit one.
    IF to_regprocedure('public.approve_permission_request(uuid)') IS NOT NULL AND
       (SELECT proowner FROM pg_proc WHERE oid = 'public.protect_sensitive_profile_fields()'::regprocedure)
       IS DISTINCT FROM
       (SELECT proowner FROM pg_proc WHERE oid = 'public.approve_permission_request(uuid)'::regprocedure) THEN
        RAISE EXCEPTION
            'guard and approve_permission_request have different owners; the definer-context vetting will not engage';
    END IF;
END
$dep$;

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER          -- was SECURITY DEFINER; see MECHANISM in the header
SET search_path = public
AS $fn$
DECLARE
    current_user_role TEXT;
    current_user_id   UUID;
    guard_owner       NAME;
    is_vetted_context BOOLEAN;
BEGIN
    current_user_id := auth.uid();

    -- No end-user identity on the request: the definer signup trigger
    -- (handle_new_user) and the service-role edge functions. Unchanged.
    IF current_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Through the definer helper, so the lookup keeps its pre-existing RLS-free
    -- semantics now that this function is SECURITY INVOKER.
    current_user_role := public.get_my_role();

    -- ------------------------------------------------------------------
    -- INSERT branch (L4) — behaviour carried over unchanged from
    -- 20260812123000. OLD is not assigned on INSERT, so this must return
    -- before any OLD.* reference below.
    -- ------------------------------------------------------------------
    IF TG_OP = 'INSERT' THEN
        IF current_user_role IS NULL OR current_user_role NOT IN ('super_admin', 'admin') THEN
            -- Non-privileged caller (manager, org_admin, editor, viewer, or a
            -- caller with no profile row): force the least-privileged role.
            -- [review 5.1] Coercion is silent to the client by design, so leave a
            -- server-side trail: a burst of these is an attempted escalation.
            IF NEW.role IS DISTINCT FROM 'viewer' THEN
                RAISE LOG 'protect_sensitive_profile_fields: coerced INSERT role % -> viewer for profile % (caller %, caller role %)',
                    COALESCE(NEW.role, '<null>'),
                    NEW.id,
                    current_user_id,
                    COALESCE(current_user_role, '<no profile row>');
            END IF;
            NEW.role := 'viewer';
        ELSIF NEW.role = 'super_admin' AND current_user_role <> 'super_admin' THEN
            -- Mirrors the UPDATE-side rule: only super_admin mints super_admin.
            RAISE EXCEPTION 'Security violation: Only super admins can assign the super admin role';
        END IF;

        RETURN NEW;
    END IF;

    -- ------------------------------------------------------------------
    -- UPDATE branch
    -- ------------------------------------------------------------------

    -- (1) Self-mutation. Keyed on identity, not on the caller's role, so it is
    --     NOT a caller-role check: it stays absolute in EVERY context and is
    --     what stops an approver approving their own request.
    IF NEW.id = current_user_id AND OLD.role IS DISTINCT FROM NEW.role THEN
        RAISE EXCEPTION 'Security violation: Cannot change your own role';
    END IF;

    IF NEW.id = current_user_id AND OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'Security violation: Cannot change your own organization';
    END IF;

    -- (2) Caller-role gates. These ask whether the CALLER is privileged enough
    --     to reassign somebody's role/organisation — the right question for a
    --     client writing to profiles directly, and the wrong one for our own
    --     SECURITY DEFINER code, which has already run its own authorisation
    --     (that is the defect in the header). Resolve the execution context
    --     only when a role/organisation change is actually on the table, so
    --     ordinary profile edits do not pay for the catalog lookup.
    IF OLD.role IS DISTINCT FROM NEW.role
       OR OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN

        SELECT r.rolname
          INTO guard_owner
          FROM pg_proc p
          JOIN pg_roles r ON r.oid = p.proowner
         WHERE p.oid = 'public.protect_sensitive_profile_fields()'::regprocedure;

        -- Unforgeable from a client session: PostgREST can only SET ROLE to
        -- anon/authenticated/service_role. NULL owner => not vetted.
        is_vetted_context := (guard_owner IS NOT NULL AND current_user = guard_owner);

        IF NOT is_vetted_context THEN
            -- NULL-safe: a caller with a JWT but no profiles row has a NULL
            -- role, and the inherited `NOT IN (...)` let that through.
            IF OLD.role IS DISTINCT FROM NEW.role
               AND (current_user_role IS NULL
                    OR current_user_role NOT IN ('super_admin', 'admin')) THEN
                RAISE EXCEPTION 'Security violation: Only admins can change user roles';
            END IF;

            IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
               AND (current_user_role IS NULL
                    OR current_user_role NOT IN ('super_admin', 'admin')) THEN
                RAISE EXCEPTION 'Security violation: Only admins can change user organizations';
            END IF;
        END IF;
    END IF;

    -- (3) super_admin assignment/removal. Absolute in every context, vetted or
    --     not, so no definer path can mint a super_admin for a lesser caller.
    --     NULL-safe for the same reason as above.
    IF (OLD.role = 'super_admin' OR NEW.role = 'super_admin')
       AND OLD.role IS DISTINCT FROM NEW.role
       AND (current_user_role IS NULL OR current_user_role <> 'super_admin') THEN
        RAISE EXCEPTION 'Security violation: Only super admins can assign the super admin role';
    END IF;

    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.protect_sensitive_profile_fields() IS
    'Role/organisation escalation guard on profiles. SECURITY INVOKER on purpose: current_user is the only unforgeable way to tell a direct PostgREST client write (authenticated/anon) from our own vetted SECURITY DEFINER code (the function owner), and a definer trigger reads current_user as its own owner in both cases. Caller-role gates apply to client writes only; the self-mutation and super_admin rules are absolute.';

-- Re-assert the wiring so the migration is self-contained and idempotent.
-- CREATE OR REPLACE on the function does not touch trigger registration.
DROP TRIGGER IF EXISTS protect_sensitive_profile_fields_trigger ON profiles;
CREATE TRIGGER protect_sensitive_profile_fields_trigger
    BEFORE INSERT OR UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION protect_sensitive_profile_fields();

COMMIT;
