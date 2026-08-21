-- ============================================================================
-- Client sharing — storage DELETE for publishers (delete-link + revision prune)
-- Design: docs/plans/2026-08-17-client-sharing-design.md
-- Amends:  supabase/migrations/20260820120000_client_shares.sql
-- ============================================================================
--
-- WHY THIS EXISTS
-- ----------------------------------------------------------------------------
-- Two owner-approved capabilities need a publishing session to remove objects
-- from the private `client-shares` bucket:
--
--   1. DELETE LINK — permanently removing a share: every object under
--      '<shareId>/…' and then the row itself. The row's DELETE policy already
--      exists ("Publisher or editors can delete client shares") and
--      `client_share_views.share_id` cascades, but with delete-by-admins-only on
--      storage the objects were left behind as unreachable orphans. The token
--      then serves the SAME uniform 404 as a dead link — the edge function finds
--      no row and cannot tell the difference — so no function change is needed.
--
--   2. REVISION PRUNING — a re-publish that flips the row to rev-N deletes
--      rev-(N-2) and older, keeping the live revision and one previous so a
--      mis-publish can be restored quickly by re-publishing the older bundle.
--
-- THE RULE THIS RELAXES (deliberately)
-- ----------------------------------------------------------------------------
-- The original migration's comment read: "Delete: admins only. Revisions are the
-- audit trail — the publish flow never deletes, and routine cleanup is explicitly
-- out of scope in the design." That was the 2026-08-17 design's position (bundle
-- cleanup automation is listed under "Out of scope"). The OWNER decided on
-- 2026-08-21 to relax it: revisions accumulate forever otherwise, every one of
-- them a full-resolution copy of every published grid, and a share the publisher
-- wants gone should actually go. What survives is the part that carries the audit
-- weight: `client_share_views` still records every view of a share for as long as
-- the share exists, and revoking (a reversible flag) remains the non-destructive
-- action a publisher reaches for first. Deleting is the explicit, confirmed,
-- irreversible one.
--
-- SECURITY SHAPE — unchanged from the policies this joins
-- ----------------------------------------------------------------------------
-- * The USING clause is the INSERT policy's WITH CHECK, verbatim in shape: the
--   bucket check, then an EXISTS over `client_shares` keyed on
--   (storage.foldername(name))[1] — the share id, because object paths are
--   '<shareId>/rev-<N>/<file>' — then admin OR (same org AND edit-capable role).
--   Whoever may PUT a bundle there may remove it; nobody else may.
-- * SECURITY DEFINER helpers only (`auth_is_admin`, `auth_user_org_id`,
--   `auth_user_role`). Inline `profiles` sub-selects re-enter RLS on `profiles`
--   and are the recurring scar in this codebase's policy history.
-- * Still nothing for `anon`, deliberately: the loginless path remains the
--   service-role edge function, which bypasses these policies entirely.
-- * Because the EXISTS needs the share ROW to authorise the objects, deletion is
--   ordered objects-first, row-last in `src/services/client-share-service.ts`.
--   Deleting the row first would make its objects permanently undeletable.
--
-- DEPLOY
-- ----------------------------------------------------------------------------
-- `supabase db push` against the eu-west-2 project (`ntrgjqrbewbvwofupphn`) ONLY
-- — the same target as 20260820120000. Never the old eu-north-1 project, and
-- never the abandoned `oxzteqqrhggdodcnngzn`. No edge-function redeploy needed.
-- ============================================================================

BEGIN;

-- Replaced, not widened: the admins-only policy is dropped so the two DELETE
-- policies cannot drift apart (storage policies are permissive — leaving the old
-- one in place would work, but then "who may delete a bundle" has two answers).
-- Admins remain covered by the `auth_is_admin()` branch below.
DROP POLICY IF EXISTS "Admins can delete client share bundles" ON storage.objects;

DROP POLICY IF EXISTS "Publisher or editors can delete client share bundles" ON storage.objects;
CREATE POLICY "Publisher or editors can delete client share bundles"
    ON storage.objects FOR DELETE
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
                      AND (
                          cs.created_by = auth.uid()
                          OR public.auth_user_role() IN ('editor', 'org_admin', 'admin', 'super_admin')
                      )
                  )
              )
        )
    );

COMMIT;
