-- ============================================================================
-- L4 — profiles role/organization guard is BEFORE UPDATE only
-- Security audit 2026-08-12 (docs/security-audit-2026-08-12.md, finding L4)
-- ============================================================================
-- protect_sensitive_profile_fields() (latest definition:
-- supabase/migrations/20260408120000_add_super_admin_and_tab_visibility.sql:254)
-- is wired to a BEFORE UPDATE trigger only
-- (supabase/migrations/20260205143953_protect_role_escalation.sql:41-45), so the
-- role/organisation rules are not applied to INSERTs.
--
-- The audit rates this Low because profiles.id FKs auth.users and all user
-- creation runs through service-role edge functions, but the INSERT side is
-- reachable: the current profiles INSERT policy "Admins can create users"
-- (20260408120000:98-110) lets `manager` and same-org `org_admin` insert profile
-- rows with any role value, and the older "Allow profile creation"
-- (database/migrations/fix-profile-creation.sql:11) may still exist alongside it
-- (RLS policies OR together — audit finding M12). Neither can escalate on UPDATE.
-- This closes the INSERT side.
--
-- TWO PARTS (the second added after adversarial review, findings 4.1/4.2):
--   1. the trigger is widened to BEFORE INSERT OR UPDATE, so a role value that
--      slips past RLS is coerced to 'viewer' (backstop);
--   2. the RLS gate itself is repaired — BOTH legacy INSERT policies are dropped
--      and replaced by one org-correct policy. Part 1 alone was not enough: the
--      legacy policies' org test is a tautology (unaliased self-subquery), so
--      org_admin/manager could insert profile rows into ANY organisation, and a
--      coerced-to-'viewer' row planted in a foreign tenant is still a defect.
--      Details in the block above that policy at the bottom of this file.
--
-- Cannot fight handle_new_user(): the signup trigger
-- (20260209130000_security_medium_severity_fixes.sql:67) runs with no JWT, so
-- auth.uid() IS NULL and the INSERT branch returns untouched. It already forces
-- role='viewer' itself. Service-role edge functions (create-user,
-- bulk-create-users, sync-users) likewise have no auth.uid().
--
-- Behaviour of the INSERT branch:
--   auth.uid() IS NULL                        → allow as-is (definer/service-role)
--   caller is super_admin/admin               → allow (admin minting a
--                                               super_admin still raises, mirroring
--                                               the UPDATE-side rule)
--   anything else (incl. manager, org_admin,
--   missing profile row)                      → NEW.role coerced to 'viewer'
-- The non-privileged path COERCES rather than raising, on purpose: an INSERT
-- that fails hard could break a self-heal/signup path, and silently landing on
-- the least-privileged role is the safe failure mode.
--
-- The UPDATE branch below is reproduced verbatim from 20260408120000 — no
-- behaviour change. In particular the self-deactivation rule from the older
-- hand-run database/migrations/prevent-role-self-escalation.sql:59-64 is NOT
-- re-added; it is absent from the current effective definition and restoring it
-- would be an out-of-scope behaviour change.
-- ============================================================================

CREATE OR REPLACE FUNCTION protect_sensitive_profile_fields()
RETURNS TRIGGER AS $$
DECLARE
    current_user_role TEXT;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();

    -- No auth context: SECURITY DEFINER triggers (handle_new_user) and
    -- service-role callers (admin edge functions). Unchanged behaviour.
    IF current_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT role INTO current_user_role FROM profiles WHERE id = current_user_id;

    -- ------------------------------------------------------------------
    -- INSERT branch (L4): OLD is not assigned on INSERT, so this must
    -- return before any OLD.* reference below.
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
    -- UPDATE branch — verbatim from 20260408120000 (no behaviour change)
    -- ------------------------------------------------------------------

    -- Cannot change your own role
    IF NEW.id = current_user_id AND OLD.role IS DISTINCT FROM NEW.role THEN
        RAISE EXCEPTION 'Security violation: Cannot change your own role';
    END IF;

    -- Cannot change your own organization
    IF NEW.id = current_user_id AND OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'Security violation: Cannot change your own organization';
    END IF;

    -- Only super_admin and admin can change roles
    IF OLD.role IS DISTINCT FROM NEW.role AND current_user_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Security violation: Only admins can change user roles';
    END IF;

    -- Only super_admin can assign/remove super_admin role
    IF (OLD.role = 'super_admin' OR NEW.role = 'super_admin') AND OLD.role IS DISTINCT FROM NEW.role AND current_user_role != 'super_admin' THEN
        RAISE EXCEPTION 'Security violation: Only super admins can assign the super admin role';
    END IF;

    -- Only super_admin and admin can change organizations
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id AND current_user_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Security violation: Only admins can change user organizations';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The trigger must be recreated: a CREATE OR REPLACE on the function does not
-- widen the existing BEFORE UPDATE wiring to INSERT.
DROP TRIGGER IF EXISTS protect_sensitive_profile_fields_trigger ON profiles;
CREATE TRIGGER protect_sensitive_profile_fields_trigger
    BEFORE INSERT OR UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION protect_sensitive_profile_fields();

-- ============================================================================
-- [review 4.1 / 4.2] profiles INSERT policy — collapse the two broken policies
-- ============================================================================
-- The trigger above is a backstop, not the gate. The RLS side is currently
-- broken twice over, and RLS policies OR together (audit finding M12), so the
-- weakest of the two decides:
--
--   4.1  "Allow profile creation" (database/migrations/fix-profile-creation.sql:10)
--        is a hand-run script that DROPs "Admins can create users" and installs
--        itself. No migration ever drops it, so it can be live ALONGSIDE the
--        policy 20260408120000 recreates.
--
--   4.2  Both of those policies use an UNALIASED self-subquery:
--            EXISTS (SELECT 1 FROM profiles
--                    WHERE id = auth.uid()
--                    AND (... OR (role = 'org_admin'
--                                 AND organization_id = profiles.organization_id)))
--        Inside that subquery, `profiles` resolves to the SUBQUERY's own range
--        table entry, not the row being inserted — so the org test reads
--        caller.organization_id = caller.organization_id, a tautology. The
--        org_admin (and, in the 20260408120000 shape, `manager`) branch is
--        therefore effectively unconditional: a profile row could be inserted
--        into ANY organisation.
--
-- Replacement: ONE policy, expressed through the SECURITY DEFINER helpers from
-- 20260812120000 (which runs first). The helpers fix both defects at once —
-- they take the caller's role/org out of a subquery entirely, so unqualified
-- `organization_id` in the WITH CHECK can only mean the NEW row's column, and
-- there is no `SELECT ... FROM profiles` left inside a policy ON profiles.
-- That last point matters as much for INSERT as for SELECT: the recursion
-- outage documented in database/migrations/fix-profiles-rls-self-reference.sql
-- is triggered by RLS re-entering the same table, WITH CHECK included.
--
-- Branches:
--   auth.uid() IS NULL   → allow. Required: handle_new_user() (signup trigger)
--                          and the service-role edge functions (create-user,
--                          bulk-create-users, sync-users) run with no JWT. Those
--                          paths set role themselves ('viewer' for signup).
--   super_admin / admin  → allow (global user administration).
--   org_admin            → allow only into their OWN organisation — the actual
--                          predicate the two old policies intended.
--   everyone else        → denied outright. `manager` LOSES profile-insert here;
--                          that matches the C2 decision in 20260812120000 that
--                          manager is a customer-facing, org-scoped role, and
--                          the app creates users through service-role edge
--                          functions anyway (which bypass RLS).
-- ============================================================================
DROP POLICY IF EXISTS "Allow profile creation" ON profiles;
DROP POLICY IF EXISTS "Admins can create users" ON profiles;

CREATE POLICY "Allow profile creation"
  ON profiles FOR INSERT
  WITH CHECK (
    -- Definer trigger / service-role context (no JWT)
    auth.uid() IS NULL
    OR get_my_role() IN ('super_admin', 'admin')
    OR (
      get_my_role() = 'org_admin'
      AND profiles.organization_id = get_my_org_id()
    )
  );
