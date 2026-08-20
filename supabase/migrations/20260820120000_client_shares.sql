-- ============================================================================
-- Client sharing — loginless published snapshots (schema + storage + RLS)
-- Design: docs/plans/2026-08-17-client-sharing-design.md
-- ============================================================================
--
-- DEPLOY CHECKLIST — DO NOT APPLY YET
-- ----------------------------------------------------------------------------
-- This migration is repository code only. Applying it is BLOCKED on the Supabase
-- region cutover (memory note `project_supabase-region-migration`): it must be
-- applied to the eu-west-2 target project, per that runbook, and never to the
-- old project. When the cutover is done, in this order:
--
--   1. `supabase link` the eu-west-2 project, then `supabase db push`.
--   2. Verify the bucket is PRIVATE:
--        select id, public from storage.buckets where id = 'client-shares';
--      `public` must be false. A public bucket defeats the entire security model.
--   3. Verify no anonymous grants leaked in:
--        select grantee, privilege_type from information_schema.role_table_grants
--        where table_name in ('client_shares','client_share_views');
--      `anon` must not appear.
--   4. Deploy the serving function WITHOUT JWT verification — it is the one
--      deliberately anonymous entry point:
--        supabase functions deploy serve-client-share --no-verify-jwt
--   5. Set its secrets: CLIENT_SHARE_IP_SALT (32+ random bytes) and confirm
--      SUPABASE_SERVICE_ROLE_KEY is present in the function environment.
--   6. Smoke-test: a nonexistent token, a revoked share and an expired share must
--      return byte-identical responses.
--
-- SECURITY MODEL (the parts that are load-bearing)
-- ----------------------------------------------------------------------------
-- * `serve-client-share` (service role) is the ONLY unauthenticated path to this
--   data. There are no `anon` grants and no `anon` policies anywhere below —
--   deliberately, not by omission.
-- * Every authenticated policy routes through the SECURITY DEFINER helpers
--   (`auth_is_admin`, `auth_user_org_id`) rather than an inline `profiles`
--   sub-select. Inline self-subqueries re-enter RLS on `profiles` and are the
--   recurring scar in this codebase's policy history.
-- * `organization_id` is denormalised onto the share row so a policy never has to
--   join `inspection_projects` to answer "is this mine", and `bundle_path` is the
--   storage prefix the edge function serves from. BOTH are derived by a trigger
--   from fields the policies already constrain, so neither can be spoofed: a
--   caller's values for them are discarded, not validated.
-- * The view-audit table is append-only from the service role alone: no INSERT
--   policy exists for `authenticated`, and none for `anon`. Service role bypasses
--   RLS, which is exactly the one writer we want.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Phase 0 — helper functions this migration's policies depend on.
--
-- `auth_is_admin` / `auth_user_org_id` / `auth_user_role` were introduced by the
-- 2026-02 RLS restore script (database/restore-rls-from-csv-export.sql), which is
-- a manual script rather than a migration — so on a freshly provisioned project
-- they may not exist yet. Created here ONLY if absent: an existing definition is
-- left strictly alone, because a later migration may have widened it (e.g.
-- 20260618120000 added super_admin to auth_is_admin) and a blind CREATE OR
-- REPLACE here would silently roll that back.
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

    IF to_regprocedure('public.auth_is_admin()') IS NULL THEN
        EXECUTE $fn$
            CREATE FUNCTION public.auth_is_admin()
            RETURNS BOOLEAN
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = public
            AS 'SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''super_admin'', ''admin''))';
        $fn$;
    END IF;
END
$phase0$;

-- ----------------------------------------------------------------------------
-- client_shares — one row per published share link
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The URL token: 128 bits of CSPRNG entropy, base64url-encoded (22 chars).
    -- Minted by the publish flow, never derived from the project or the id.
    token TEXT NOT NULL UNIQUE
        CONSTRAINT client_shares_token_length CHECK (char_length(token) BETWEEN 22 AND 64),

    project_id UUID NOT NULL REFERENCES public.inspection_projects(id) ON DELETE CASCADE,

    -- Denormalised from the project so RLS never joins. Kept true by
    -- client_shares_sync_org() below — callers must not rely on their own value.
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Storage prefix of the CURRENT revision: '<shareId>/rev-<N>' in the
    -- 'client-shares' bucket. DERIVED by the trigger below from id + revision —
    -- never accepted from a caller, so it cannot be pointed at another share's
    -- objects. Re-publishing bumps revision and this follows; older prefixes stay
    -- in the bucket as the audit trail.
    bundle_path TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),

    -- NULL = never expires (the "none" option in the publish dialog).
    expires_at TIMESTAMPTZ,
    -- Non-NULL = revoked. Revocation is a state change, never a delete, so the
    -- audit trail and the view log survive it.
    revoked_at TIMESTAMPTZ,

    -- NULL = no passcode. Hashed, never stored or logged in the clear.
    passcode_hash TEXT,

    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.client_shares IS
    'Published client-share links. Read anonymously ONLY through the serve-client-share edge function (service role); no anon grants exist.';
COMMENT ON COLUMN public.client_shares.token IS
    '128-bit CSPRNG URL token. Compared timing-safely in the edge function.';
COMMENT ON COLUMN public.client_shares.organization_id IS
    'Denormalised from inspection_projects for RLS. Maintained by trigger — do not trust client-supplied values.';

-- (token already has a unique index from its UNIQUE constraint.)
CREATE INDEX IF NOT EXISTS idx_client_shares_project ON public.client_shares(project_id);
CREATE INDEX IF NOT EXISTS idx_client_shares_org ON public.client_shares(organization_id);

-- ----------------------------------------------------------------------------
-- Derive the two fields a caller must never choose: organization_id and
-- bundle_path.
--
-- Runs BEFORE INSERT OR UPDATE so a caller cannot plant someone else's org id
-- (which would otherwise hand their whole organisation management rights on this
-- share). Postgres evaluates a policy's WITH CHECK on the row AS MODIFIED BY
-- BEFORE triggers, so pointing a share at another org's project resolves that
-- org here and is then rejected by the INSERT/UPDATE policies below.
--
-- Known, accepted: an authenticated user can distinguish "no such project" from
-- "someone else's project" by the error they get back. That oracle is inherent to
-- the foreign key on project_id — it exists with or without this trigger — and
-- costs an attacker a guessed UUID per bit of information.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_shares_derive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    SELECT organization_id INTO NEW.organization_id
    FROM public.inspection_projects
    WHERE id = NEW.project_id;

    IF NEW.organization_id IS NULL THEN
        RAISE EXCEPTION 'client_shares.project_id % does not resolve to an organization', NEW.project_id;
    END IF;

    -- The bundle prefix is a FUNCTION of the row, not an input. Whatever the
    -- caller sent is discarded, so no share can ever address another's objects
    -- and the edge function's own prefix check is pure belt-and-braces.
    NEW.bundle_path = NEW.id::text || '/rev-' || NEW.revision::text;

    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_shares_sync_org_trigger ON public.client_shares;
DROP TRIGGER IF EXISTS client_shares_derive_fields_trigger ON public.client_shares;
CREATE TRIGGER client_shares_derive_fields_trigger
    BEFORE INSERT OR UPDATE ON public.client_shares
    FOR EACH ROW EXECUTE FUNCTION public.client_shares_derive_fields();

-- ----------------------------------------------------------------------------
-- client_share_views — successful anonymous views, PII-free
-- ----------------------------------------------------------------------------
-- "Viewed 3× this week" without harvesting anything about the viewer: the IP is
-- salted-hashed (the salt lives only in the function environment, so the table
-- alone cannot be reversed even against a small address space) and the
-- user-agent is reduced to a coarse family string before it ever arrives here.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_share_views (
    id BIGSERIAL PRIMARY KEY,
    share_id UUID NOT NULL REFERENCES public.client_shares(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- e.g. 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'Other'. Never a raw UA.
    user_agent_family TEXT,
    -- sha256(ip || CLIENT_SHARE_IP_SALT), hex. Never a raw address.
    ip_hash TEXT
);

COMMENT ON TABLE public.client_share_views IS
    'Append-only view audit for client shares. Written ONLY by the serve-client-share edge function (service role); no INSERT policy exists for any role.';

CREATE INDEX IF NOT EXISTS idx_client_share_views_share ON public.client_share_views(share_id, viewed_at DESC);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.client_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_share_views ENABLE ROW LEVEL SECURITY;

-- Belt and braces: PostgREST exposes `anon` by default, so the grant is revoked
-- explicitly rather than left to "there is no policy" (a future policy written
-- without a TO clause would otherwise apply to anon too).
REVOKE ALL ON public.client_shares FROM anon;
REVOKE ALL ON public.client_share_views FROM anon;
REVOKE ALL ON SEQUENCE public.client_share_views_id_seq FROM anon;

-- ---- client_shares -------------------------------------------------------
-- Read: anyone in the owning organisation, plus platform admins.
DROP POLICY IF EXISTS "Org members can view client shares" ON public.client_shares;
CREATE POLICY "Org members can view client shares"
    ON public.client_shares FOR SELECT
    TO authenticated
    USING (
        public.auth_is_admin()
        OR organization_id = public.auth_user_org_id()
    );

-- Publish: same org, and only roles that may edit the project. `created_by` is
-- pinned to the caller so a share always has a real, attributable publisher.
DROP POLICY IF EXISTS "Editors can publish client shares" ON public.client_shares;
CREATE POLICY "Editors can publish client shares"
    ON public.client_shares FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND (
            public.auth_is_admin()
            OR (
                organization_id = public.auth_user_org_id()
                AND public.auth_user_role() IN ('editor', 'org_admin', 'admin', 'super_admin')
            )
        )
    );

-- Revoke / re-publish. USING and WITH CHECK are both constrained so a row can
-- never be moved into another organisation by an UPDATE.
DROP POLICY IF EXISTS "Publisher or editors can update client shares" ON public.client_shares;
CREATE POLICY "Publisher or editors can update client shares"
    ON public.client_shares FOR UPDATE
    TO authenticated
    USING (
        public.auth_is_admin()
        OR (
            organization_id = public.auth_user_org_id()
            AND (
                created_by = auth.uid()
                OR public.auth_user_role() IN ('editor', 'org_admin', 'admin', 'super_admin')
            )
        )
    )
    WITH CHECK (
        public.auth_is_admin()
        OR organization_id = public.auth_user_org_id()
    );

DROP POLICY IF EXISTS "Publisher or editors can delete client shares" ON public.client_shares;
CREATE POLICY "Publisher or editors can delete client shares"
    ON public.client_shares FOR DELETE
    TO authenticated
    USING (
        public.auth_is_admin()
        OR (
            organization_id = public.auth_user_org_id()
            AND (
                created_by = auth.uid()
                OR public.auth_user_role() IN ('editor', 'org_admin', 'admin', 'super_admin')
            )
        )
    );

-- ---- client_share_views --------------------------------------------------
-- Read only, and only inside the owning organisation. There is deliberately NO
-- INSERT/UPDATE/DELETE policy: the edge function writes with the service role,
-- which bypasses RLS, and nobody else may write or rewrite the audit trail.
DROP POLICY IF EXISTS "Org members can view share view logs" ON public.client_share_views;
CREATE POLICY "Org members can view share view logs"
    ON public.client_share_views FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.client_shares cs
            WHERE cs.id = client_share_views.share_id
              AND (public.auth_is_admin() OR cs.organization_id = public.auth_user_org_id())
        )
    );

-- ============================================================================
-- Storage — the private 'client-shares' bucket
-- ============================================================================
-- Object paths are '<shareId>/rev-<N>/<file>', so (storage.foldername(name))[1]
-- is the share id and one join answers every policy.
--
-- The bucket is PRIVATE. Nothing below grants `anon` anything: the only way a
-- logged-out client reads a bundle is the serve-client-share edge function,
-- which uses the service role and therefore bypasses these policies entirely.
-- Authenticated policies exist purely so the publishing session can write the
-- bundle and re-read what it wrote.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-shares', 'client-shares', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Read: org members of the share (and platform admins). Publishers verifying a
-- bundle, not clients — clients never touch storage directly.
DROP POLICY IF EXISTS "Org members can read client share bundles" ON storage.objects;
CREATE POLICY "Org members can read client share bundles"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'client-shares'
        AND EXISTS (
            SELECT 1 FROM public.client_shares cs
            WHERE cs.id::text = (storage.foldername(name))[1]
              AND (public.auth_is_admin() OR cs.organization_id = public.auth_user_org_id())
        )
    );

-- Write: the publish flow. Same org, same edit-capable roles as publishing a
-- share row, and the share row must already exist — so an object can never be
-- parked under a share id nobody owns.
DROP POLICY IF EXISTS "Editors can upload client share bundles" ON storage.objects;
CREATE POLICY "Editors can upload client share bundles"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'client-shares'
        AND EXISTS (
            SELECT 1 FROM public.client_shares cs
            WHERE cs.id::text = (storage.foldername(name))[1]
              AND (
                  public.auth_is_admin()
                  OR (
                      cs.organization_id = public.auth_user_org_id()
                      AND public.auth_user_role() IN ('editor', 'org_admin', 'admin', 'super_admin')
                  )
              )
        )
    );

DROP POLICY IF EXISTS "Editors can replace client share bundles" ON storage.objects;
CREATE POLICY "Editors can replace client share bundles"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'client-shares'
        AND EXISTS (
            SELECT 1 FROM public.client_shares cs
            WHERE cs.id::text = (storage.foldername(name))[1]
              AND (
                  public.auth_is_admin()
                  OR (
                      cs.organization_id = public.auth_user_org_id()
                      AND public.auth_user_role() IN ('editor', 'org_admin', 'admin', 'super_admin')
                  )
              )
        )
    );

-- Delete: admins only. Revisions are the audit trail — the publish flow never
-- deletes, and routine cleanup is explicitly out of scope in the design.
DROP POLICY IF EXISTS "Admins can delete client share bundles" ON storage.objects;
CREATE POLICY "Admins can delete client share bundles"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'client-shares' AND public.auth_is_admin());

COMMIT;
