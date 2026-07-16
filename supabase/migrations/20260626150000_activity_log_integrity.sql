-- ============================================================================
-- Activity Log v2 — integrity hardening (P1 of the true audit-trail rework)
-- Design: docs/plans/2026-06-26-activity-log-true-audit-trail-design.md
-- ============================================================================
-- Turns the activity log into a server-authoritative, append-only, admin-only
-- audit trail:
--   1. log_activity() forces the actor from auth.uid() — the client can no
--      longer forge who performed an action.
--   2. Direct INSERT/UPDATE/DELETE by authenticated users is removed; all writes
--      flow through SECURITY DEFINER functions/triggers or the service role.
--   3. The log is immutable (no UPDATE/DELETE for app users); only a
--      super_admin-gated purge function may delete, and it audits itself.
--   4. Read access is super_admin + admin only (the old policy used
--      ('admin','manager') and omitted super_admin entirely).
-- ============================================================================

-- 1. Harden log_activity: actor is ALWAYS auth.uid() -------------------------
-- CRITICAL: keep the EXACT 10-argument signature. Adding/removing parameters
-- creates a second PostgREST overload and silently breaks all RPC logging (see
-- 20260617120000_fix_log_activity_overload.sql). organization_id and actor_role
-- are therefore resolved server-side from the authenticated actor's profile, not
-- passed by the client. p_user_id is retained for signature stability but is
-- IGNORED for actor identity (anti-forgery).
CREATE OR REPLACE FUNCTION public.log_activity(
    p_user_id UUID,
    p_action_type TEXT,
    p_action_category TEXT,
    p_description TEXT,
    p_details JSONB DEFAULT NULL,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id TEXT DEFAULT NULL,
    p_entity_name TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_role  TEXT;
    v_org   UUID;
    v_log_id UUID;
BEGIN
    -- Snapshot the actor's role + org from their profile (never trust the client).
    IF v_actor IS NOT NULL THEN
        SELECT role, organization_id
          INTO v_role, v_org
          FROM profiles
         WHERE id = v_actor;
    END IF;

    INSERT INTO activity_log (
        user_id, user_email, user_name,
        action_type, action_category, description, details,
        entity_type, entity_id, entity_name,
        ip_address, user_agent,
        organization_id, actor_role
    ) VALUES (
        v_actor, NULL, NULL,                          -- never cache actor PII (see 20260225120000)
        p_action_type, p_action_category, p_description, p_details,
        p_entity_type, p_entity_id, p_entity_name,
        p_ip_address, p_user_agent,
        v_org, v_role
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_activity(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, INET, TEXT) TO authenticated;

-- 2. Remove the forgery surface ---------------------------------------------
-- Old policy allowed ANY authenticated user to INSERT arbitrary rows
-- (WITH CHECK (true)) with a client-supplied user_id. Drop it and revoke the
-- table privileges; legitimate writes go through SECURITY DEFINER log_activity(),
-- the audit triggers (P2), or the service role (edge functions, P3) — all of
-- which bypass RLS as the table/function owner.
-- This permissive INSERT policy has existed under TWO names: the original
-- "Allow activity logging" (WITH CHECK (true)) and "Authenticated users can log
-- activity" (the rename applied by 20260205160751_security_audit_fix_search_path.sql,
-- which is the name present on the live DB). Drop BOTH so no permissive INSERT
-- policy survives in any environment — otherwise a future stray GRANT could
-- re-open client-side forgery (and actor_role is now forgeable too).
DROP POLICY IF EXISTS "Allow activity logging" ON activity_log;
DROP POLICY IF EXISTS "Authenticated users can log activity" ON activity_log;
REVOKE INSERT, UPDATE, DELETE ON activity_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON activity_log FROM anon;

-- 3. Immutability ------------------------------------------------------------
-- There is intentionally NO UPDATE or DELETE policy for app users, so the log is
-- append-only for everyone except the service role and the purge function below.
-- (REVOKE above is belt-and-braces alongside the absence of a policy.)

-- 4. Read access: super_admin + admin only ----------------------------------
DROP POLICY IF EXISTS "Admins and managers can view all activity logs" ON activity_log;
DROP POLICY IF EXISTS "Admins can view all activity logs" ON activity_log;
CREATE POLICY "Admins can view all activity logs"
    ON activity_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('super_admin', 'admin')
        )
    );
-- "Users can view own activity" (self-read) is left in place: it only exposes a
-- user's own rows and supports an optional future "My Activity" view. It does not
-- widen the admin viewer, which queries all rows and is gated by the policy above.

-- 5. Ensure the service-role write path exists (P3 edge-function logging) -----
-- The "Service role full access" policy is defined only in the non-migration file
-- database/activity-log-schema.sql, so environments bootstrapped purely from the
-- supabase/migrations pipeline may lack it. Re-assert it idempotently so edge
-- functions (service role) can write audit rows in P3.
DROP POLICY IF EXISTS "Service role full access" ON activity_log;
CREATE POLICY "Service role full access"
    ON activity_log FOR ALL
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

-- 6. Remove the legacy, ungated delete path ----------------------------------
-- cleanup_old_activity_logs() was SECURITY DEFINER, gated only to role='admin'
-- (not super_admin), and wrote NO self-audit row — a silent history-erasure path
-- that defeats the immutability guarantee. Drop both overloads so
-- purge_activity_logs() below is the SINGLE deletion path into activity_log.
-- (Grep confirms only migrations referenced it; no app/edge code calls it.)
-- INVARIANT going forward: no SECURITY DEFINER function other than
-- purge_activity_logs() may DELETE or UPDATE activity_log.
DROP FUNCTION IF EXISTS public.cleanup_old_activity_logs(INTEGER);
DROP FUNCTION IF EXISTS public.cleanup_old_activity_logs();

-- 7. Retention purge (super_admin only, self-auditing) -----------------------
CREATE OR REPLACE FUNCTION public.purge_activity_logs(p_older_than_days INTEGER DEFAULT 730)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor   UUID := auth.uid();
    v_is_super BOOLEAN;
    v_deleted INTEGER;
BEGIN
    SELECT (role = 'super_admin') INTO v_is_super FROM profiles WHERE id = v_actor;
    IF NOT COALESCE(v_is_super, FALSE) THEN
        RAISE EXCEPTION 'Only super_admin may purge activity logs';
    END IF;

    IF p_older_than_days IS NULL OR p_older_than_days < 1 THEN
        RAISE EXCEPTION 'p_older_than_days must be a positive integer';
    END IF;

    DELETE FROM activity_log
     WHERE created_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- The purge audits itself so the deletion is never silent.
    INSERT INTO activity_log (
        user_id, action_type, action_category, description, details, actor_role
    ) VALUES (
        v_actor, 'logs_purged', 'data',
        format('Purged %s activity log entr%s older than %s days',
               v_deleted, CASE WHEN v_deleted = 1 THEN 'y' ELSE 'ies' END, p_older_than_days),
        jsonb_build_object('deleted_count', v_deleted, 'older_than_days', p_older_than_days),
        'super_admin'
    );

    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_activity_logs(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_activity_logs(INTEGER) TO authenticated; -- self-gates to super_admin
