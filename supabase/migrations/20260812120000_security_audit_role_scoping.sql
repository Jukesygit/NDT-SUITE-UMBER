-- ============================================================================
-- Security audit 2026-08-12 — cross-tenant role scoping (C2 + H5)
-- ============================================================================
-- Source: docs/security-audit-2026-08-12.md
--
-- C2 (Critical) — `manager` reads every organisation's personnel PII.
--   The `manager` branch of three SELECT policies carries NO organization_id
--   predicate, unlike the sibling `org_admin` branch:
--     profiles              20260408120000_add_super_admin_and_tab_visibility.sql:81-94
--     employee_competencies 20260618120000_fix_super_admin_competency_access.sql:30-54
--     competency_documents  20260728120000_competency_multi_documents.sql:55-85
--   Resolution: `manager` is treated as a CUSTOMER-facing role, so its branch is
--   org-scoped IDENTICALLY to the sibling `org_admin` branch on each table.
--   Precedent: 20260626150000_activity_log_integrity.sql already de-scoped the
--   over-broad `manager` read for the activity log, and
--   database/migrations/add-admin-profile-update-policy.sql:85 already used the
--   org-scoped manager predicate for profiles — this closes the inconsistency.
--
--   C2 also covers approve_permission_request
--   (20260224120000_security_audit_remediation.sql:84-112), which has no role
--   allowlist — a tenant org_admin could approve a request granting `manager`.
--
-- H5 (High) — `org_admin` cross-org access to competency history + comments.
--   20260618120000_fix_super_admin_competency_access.sql lists `org_admin` in a
--   FLAT role list (no org predicate) for competency_history SELECT (:128-138),
--   competency_comments UPDATE (:195-205) and DELETE (:209-219), even though the
--   same file correctly org-scopes `org_admin` for employee_competencies and for
--   competency_comments SELECT/INSERT. Those correct patterns are mirrored here.
--
-- Scope discipline: every OTHER branch of every recreated policy (self-access,
-- super_admin/admin global, org_admin) is copied VERBATIM from the current
-- definition — only the branch named in the finding changes.
--
-- M12 note (stale duplicates): this repo drops policies by exact name, so
-- differently-named older policies survive in the live DB and OR-widen access.
-- Stale duplicates found for the tables touched here are dropped by name below.
-- The effective live policy set still must be proven against production
-- pg_policies (see M12 remediation).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Non-recursive RLS helpers (prerequisite for the profiles policy below)
-- ---------------------------------------------------------------------------
-- A policy ON profiles must NEVER contain `SELECT ... FROM profiles`: Postgres
-- applies RLS to the inner query too, so the policy recurses and EVERY profiles
-- read 500s — including loadUserProfile() in the login flow. That outage is
-- documented in database/migrations/fix-profiles-rls-self-reference.sql, which
-- introduced these two SECURITY DEFINER STABLE helpers to break the cycle
-- (SECURITY DEFINER runs as the function owner, so the inner read is not
-- re-filtered by RLS).
--
-- Definitions are copied verbatim from that file (search_path pinned) and are
-- re-asserted here with CREATE OR REPLACE so this migration is self-contained:
-- fix-profiles-rls-self-reference.sql is a hand-run script with no ordering
-- guarantee relative to supabase/migrations/.
--
-- Scope note: only policies ON profiles need the helpers. Policies on OTHER
-- tables that subquery profiles (employee_competencies, competency_documents,
-- storage.objects, ...) are not recursive and are left as EXISTS subqueries.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- [C2] profiles SELECT — org-scope the manager branch
-- Current: "Users can view profiles" (20260408120000:81-94). All known scripts
-- reuse this exact name, so no differently-named duplicate to drop here.
--
-- Rewritten through get_my_role()/get_my_org_id() instead of the inherited
-- `EXISTS (SELECT 1 FROM profiles p ...)` shape — see the helper block above.
-- Command (SELECT) and the absent TO clause (i.e. TO PUBLIC) are preserved from
-- 20260408120000; the RLS predicate itself is what changes.
--
-- Predicate equivalence with the pre-C2 policy, branch by branch:
--   self                 id = auth.uid()                          unchanged
--   super_admin/admin    global read                              unchanged
--   org_admin            same-org read                            unchanged
--   manager              WAS global (cross-tenant PII) → now same-org, i.e.
--                        identical to the org_admin branch (the C2 fix).
-- `organization_id IS NOT NULL` guards the platform rows whose org is NULL: a
-- NULL = NULL comparison is NULL (not true), but the explicit test documents the
-- intent and keeps a manager/org_admin with a NULL org from matching.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;

CREATE POLICY "Users can view profiles"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR get_my_role() IN ('super_admin', 'admin')
    OR (
      get_my_role() IN ('manager', 'org_admin')
      AND organization_id IS NOT NULL
      AND organization_id = get_my_org_id()
    )
  );

-- ---------------------------------------------------------------------------
-- [C2] employee_competencies SELECT — org-scope the manager branch
-- Current: "Users can view competencies" (20260618120000:30-54).
-- Stale duplicate: "employee_competencies_select_new"
-- (database/restore-rls-from-csv-export.sql:775) — self OR auth_is_admin() OR
-- org-scoped org_admin, a strict subset of the policy below. Re-dropped for
-- idempotence (20260618120000 already dropped it once; the restore script can
-- have recreated it since).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view competencies" ON employee_competencies;
DROP POLICY IF EXISTS "employee_competencies_select_new" ON employee_competencies;

CREATE POLICY "Users can view competencies"
ON employee_competencies FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
    )
    OR
    -- [C2] was: EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    --                   AND p.role = 'manager')  -- no org predicate
    EXISTS (
        SELECT 1 FROM profiles p
        JOIN profiles target ON target.id = employee_competencies.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'manager'
        AND p.organization_id IS NOT NULL
        AND p.organization_id = target.organization_id
    )
    OR
    user_id = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM profiles p
        JOIN profiles target ON target.id = employee_competencies.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'org_admin'
        AND p.organization_id IS NOT NULL
        AND p.organization_id = target.organization_id
    )
);

-- ---------------------------------------------------------------------------
-- [C2] competency_documents SELECT — org-scope the manager branch
-- Current: "Users can view competency documents" (20260728120000:55-85).
-- The child policy mirrors the parent employee_competencies SELECT predicate,
-- so the manager branch is scoped through the same `ec.user_id` join the
-- org_admin branch already uses.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view competency documents" ON competency_documents;

CREATE POLICY "Users can view competency documents"
ON competency_documents FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM employee_competencies ec
        WHERE ec.id = competency_documents.employee_competency_id
        AND (
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
            )
            OR
            -- [C2] was: EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            --                   AND p.role = 'manager')  -- no org predicate
            EXISTS (
                SELECT 1 FROM profiles p
                JOIN profiles target ON target.id = ec.user_id
                WHERE p.id = auth.uid()
                AND p.role = 'manager'
                AND p.organization_id IS NOT NULL
                AND p.organization_id = target.organization_id
            )
            OR
            ec.user_id = auth.uid()
            OR
            EXISTS (
                SELECT 1 FROM profiles p
                JOIN profiles target ON target.id = ec.user_id
                WHERE p.id = auth.uid()
                AND p.role = 'org_admin'
                AND p.organization_id IS NOT NULL
                AND p.organization_id = target.organization_id
            )
        )
    )
);

-- ---------------------------------------------------------------------------
-- [H5] competency_history SELECT — org-scope the org_admin branch
-- Current: "Users can view competency history" (20260618120000:128-138) —
--   user_id = auth.uid() OR role IN ('super_admin','admin','org_admin').
-- Stale duplicate: "competency_history_select_new"
-- (database/restore-rls-from-csv-export.sql:522) — self OR auth_is_admin() OR
-- org-scoped org_admin, a strict subset of the policy below, and NEVER dropped
-- by any migration (M12 trap). Dropped here.
-- Scoping mirrors the employee_competencies org_admin pattern in the same file.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view competency history" ON competency_history;
DROP POLICY IF EXISTS "competency_history_select_new" ON competency_history;

CREATE POLICY "Users can view competency history"
ON competency_history FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
    )
    OR
    -- [H5] org_admin was previously in the flat role list above (no org predicate)
    EXISTS (
        SELECT 1 FROM profiles p
        JOIN profiles target ON target.id = competency_history.user_id
        WHERE p.id = auth.uid()
        AND p.role = 'org_admin'
        AND p.organization_id IS NOT NULL
        AND p.organization_id = target.organization_id
    )
);

-- ---------------------------------------------------------------------------
-- [H5] competency_comments UPDATE — org-scope the org_admin branch
-- Current: "Users can update own competency comments" (20260618120000:195-205) —
--   created_by = auth.uid() OR role IN ('super_admin','admin','org_admin').
-- The org_admin branch resolves the subject through employee_competencies,
-- exactly as the comment SELECT/INSERT policies in the same file already do.
-- USING-only (no WITH CHECK), matching the original — Postgres reuses USING as
-- the check expression for UPDATE.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own competency comments" ON competency_comments;

CREATE POLICY "Users can update own competency comments"
ON competency_comments FOR UPDATE
TO authenticated
USING (
    created_by = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
    )
    OR
    -- [H5] org_admin was previously in the flat role list above (no org predicate)
    EXISTS (
        SELECT 1 FROM employee_competencies ec
        WHERE ec.id = competency_comments.employee_competency_id
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'org_admin'
            AND p.organization_id IN (
                SELECT organization_id FROM profiles WHERE id = ec.user_id
            )
        )
    )
);

-- ---------------------------------------------------------------------------
-- [H5] competency_comments DELETE — org-scope the org_admin branch
-- Current: "Users can delete own competency comments" (20260618120000:209-219).
-- Same shape as the UPDATE policy above.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own competency comments" ON competency_comments;

CREATE POLICY "Users can delete own competency comments"
ON competency_comments FOR DELETE
TO authenticated
USING (
    created_by = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
    )
    OR
    -- [H5] org_admin was previously in the flat role list above (no org predicate)
    EXISTS (
        SELECT 1 FROM employee_competencies ec
        WHERE ec.id = competency_comments.employee_competency_id
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'org_admin'
            AND p.organization_id IN (
                SELECT organization_id FROM profiles WHERE id = ec.user_id
            )
        )
    )
);

-- ---------------------------------------------------------------------------
-- [C2] approve_permission_request() — elevated-role allowlist + NULL-safe gates
-- Body preserved verbatim from 20260224120000_security_audit_remediation.sql
-- (caller role gate, request lookup, org_admin cross-org check, both UPDATEs,
-- the SQLERRM-free error envelope) with these additions:
--   1. Elevated roles ('manager','admin','super_admin') may only be granted by
--      a caller whose own role is 'admin' or 'super_admin' — an org_admin can no
--      longer promote an in-org user to manager/admin.
--      Reading note: the pre-existing caller gate already rejects everything
--      outside ('admin','org_admin'), so the effective approver set for an
--      elevated request is 'admin' ALONE today (a super_admin cannot reach this
--      function at all), and requested_role = 'super_admin' is unreachable
--      because permission_requests_requested_role_check restricts the column to
--      ('admin','manager','org_admin','editor','viewer')
--      (database/migrations/add-manager-role.sql:22-24). The allowlist is
--      therefore a guard against future widening, not a new grant.
--   2. A `WHEN insufficient_privilege THEN RAISE` branch so that rejection
--      reaches the caller instead of being swallowed by the WHEN OTHERS handler
--      as "An unexpected error occurred". Nothing else raises 42501 in this
--      path (the protect_sensitive_profile_fields trigger raises P0001).
--   3. NULL-safe authorization gates (adversarial review, BLOCKER 6.1). Both
--      gates were `caller_profile.role NOT IN (...)`; for a caller with NO
--      profile row, role is NULL, `NULL NOT IN (...)` evaluates to NULL, and
--      `IF NULL THEN` is false — so control FELL THROUGH both gates to the
--      `UPDATE profiles SET role = ...`. Combined with the default
--      EXECUTE TO PUBLIC on a SECURITY DEFINER function this was an anon-key
--      self-promotion chain. Every gate now tests `IS NULL OR NOT IN (...)`,
--      the caller lookup asserts it actually found a row, and EXECUTE is
--      revoked from PUBLIC/anon below.
-- Signature and return type are unchanged, so CREATE OR REPLACE is safe and
-- preserves existing GRANTs (which are then tightened explicitly).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_permission_request(request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record permission_requests;
    caller_profile profiles;
BEGIN
    -- Get caller profile
    SELECT * INTO caller_profile
    FROM profiles
    WHERE id = auth.uid();

    -- [BLOCKER 6.1] No profile row for the caller (anon key, deleted user):
    -- caller_profile.role would be NULL and every NOT IN gate below would
    -- evaluate to NULL — i.e. NOT taken — letting the caller reach the
    -- role UPDATE. Fail closed before any gate runs.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: no profile for the calling user'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Verify caller is admin or org_admin (NULL-safe: a NULL role is rejected,
    -- not silently passed through by three-valued logic)
    IF caller_profile.role IS NULL
       OR caller_profile.role NOT IN ('admin', 'org_admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- org_admin can only approve requests from users in the same organization
    IF caller_profile.role = 'org_admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM profiles
            WHERE id = request_record.user_id
            AND organization_id = caller_profile.organization_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: user is not in your organization');
        END IF;
    END IF;

    -- [C2] Elevated-role allowlist: privilege-granting roles may only be
    -- approved by a global administrator. Without this a tenant org_admin could
    -- grant 'manager' (or 'admin') to an in-org user.
    IF request_record.requested_role IN ('manager', 'admin', 'super_admin') THEN
        IF caller_profile.role IS NULL
           OR caller_profile.role NOT IN ('admin', 'super_admin') THEN
            RAISE EXCEPTION
                'Unauthorized: only an admin or super_admin may approve a request for the % role',
                request_record.requested_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- Update the user's role
    UPDATE profiles
    SET role = request_record.requested_role,
        updated_at = NOW()
    WHERE id = request_record.user_id;

    -- Update the request status
    UPDATE permission_requests
    SET status = 'approved',
        approved_by = auth.uid(),
        approved_at = NOW()
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Permission request approved');
EXCEPTION
    WHEN insufficient_privilege THEN
        -- [C2] Surface the allowlist rejection instead of the generic envelope.
        RAISE;
    WHEN OTHERS THEN
        RAISE LOG 'approve_permission_request error: %', SQLERRM;
        RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred');
END;
$$;

-- [BLOCKER 6.1] A SECURITY DEFINER function is EXECUTE-able by PUBLIC by
-- default, so the anon key could call it directly. Only signed-in users (and
-- the service role) may attempt an approval; authorization is still enforced
-- inside the body.
REVOKE EXECUTE ON FUNCTION public.approve_permission_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_permission_request(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- [BLOCKER 6.1] reject_permission_request() — same NULL-safety, nothing else
-- Body reproduced verbatim from 20260224120000_security_audit_remediation.sql
-- (:135-189) with ONLY the NULL-safe caller gate + missing-profile assertion
-- added. This function does not grant a role, so it has no allowlist and no
-- insufficient_privilege re-raise branch; the assertion below is caught by the
-- existing WHEN OTHERS handler and surfaces as the generic envelope, which
-- still fails closed (the status UPDATE is never reached).
-- Signature (UUID, TEXT) and return type unchanged → CREATE OR REPLACE is safe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_permission_request(request_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_record permission_requests;
    caller_profile profiles;
BEGIN
    -- Get caller profile
    SELECT * INTO caller_profile
    FROM profiles
    WHERE id = auth.uid();

    -- [BLOCKER 6.1] Missing caller profile → NULL role → NULL NOT IN (...) →
    -- gate not taken. Fail closed instead.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: no profile for the calling user'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Verify caller is admin or org_admin (NULL-safe)
    IF caller_profile.role IS NULL
       OR caller_profile.role NOT IN ('admin', 'org_admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Get the request
    SELECT * INTO request_record
    FROM permission_requests
    WHERE id = request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- org_admin can only reject requests from users in the same organization
    IF caller_profile.role = 'org_admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM profiles
            WHERE id = request_record.user_id
            AND organization_id = caller_profile.organization_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: user is not in your organization');
        END IF;
    END IF;

    -- Update the request status
    UPDATE permission_requests
    SET status = 'rejected',
        rejected_by = auth.uid(),
        rejected_at = NOW(),
        rejection_reason = reason
    WHERE id = request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Permission request rejected');
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'reject_permission_request error: %', SQLERRM;
        RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_permission_request(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_permission_request(UUID, TEXT) TO authenticated, service_role;
