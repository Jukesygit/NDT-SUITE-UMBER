-- ############################################################################
-- ##                                                                        ##
-- ##   PARKED — DO NOT APPLY BEFORE THE FRONTEND DEPLOY.                     ##
-- ##   DO NOT MOVE INTO supabase/migrations/ YET.                            ##
-- ##                                                                        ##
-- ##   This file makes the `avatars` bucket PRIVATE and rewrites every       ##
-- ##   stored public avatar URL down to a bare object path. A frontend that  ##
-- ##   has not yet learned to sign avatar paths renders a bare path as an    ##
-- ##   <img src> — every avatar in the app breaks at once, for everyone.     ##
-- ##                                                                        ##
-- ##   APPLY WITH OR AFTER the deploy containing the avatar signed-URL       ##
-- ##   refactor (src/services/avatar-service.ts +                            ##
-- ##   src/hooks/queries/useAvatarUrls.ts). NEVER BEFORE.                    ##
-- ##                                                                        ##
-- ##   This file lives OUTSIDE supabase/migrations/ deliberately: anything   ##
-- ##   in that directory is applied by the next `supabase db push`, and an   ##
-- ##   accidental push of this file is every avatar in the product going     ##
-- ##   dark until the frontend catches up.                                   ##
-- ##                                                                        ##
-- ############################################################################
--
-- Closes: audit finding M11 (docs/security-audit-2026-08-12.md) — the residual
--   half. supabase/migrations/20260812122000_bucket_privacy_hardening.sql:62-83
--   flipped `vessel-images` private and narrowed the avatar MIME list, but left
--   `avatars` public on purpose and wrote the four-step plan for closing it:
--
--     1. switch useUploadAvatar to store the object PATH, not a public URL,  ✅
--     2. sign on read (createSignedUrl) wherever avatar_url is rendered,     ✅
--     3. backfill existing profiles.avatar_url values from URL → path,       ← this file
--     4. only then set public = false.                                        ← this file
--
--   Steps 1-2 are the frontend change this file is sequenced behind:
--     src/hooks/mutations/useUploadAvatar.ts   — persists `<userId>/avatar-<ts>.<ext>`
--     src/services/avatar-service.ts           — the both-shapes reader
--     src/hooks/queries/useAvatarUrls.ts       — batched signing, React Query
--
--   That reader is TOLERANT BY DESIGN: it renders a legacy public URL as-is and
--   signs a bare path. So the frontend is safe with or without this file. This
--   file is what is NOT safe without the frontend.
--
--   Step 4 is NOT just the bucket flag. The live storage.objects policy
--   "Anyone can view avatars" (database/create_avatars_bucket.sql:46, restored
--   again by database/restore-rls-from-csv-export.sql:1064) is granted TO public
--   with `USING (bucket_id = 'avatars')`, so flipping the bucket private while
--   that policy exists leaves anonymous reads working through the object API.
--   Both are done here, in one transaction.
--
-- ============================================================================
-- HOW TO SHIP THIS
-- ============================================================================
--   1. Deploy the frontend containing avatar-service.ts / useAvatarUrls.ts.
--      Confirm in the live app that avatars still render (they will be legacy
--      public URLs at this point, passed through untouched).
--   2. Run GATE 1 below. Read the report. Every row it lists as UNPARSEABLE is a
--      row this file will NOT touch, and whose avatar will stop rendering the
--      moment the bucket goes private (it degrades to initials, not a broken
--      image — but decide consciously rather than discovering it).
--   3. Move this file to
--      supabase/migrations/<fresh timestamp>_avatars_private.sql.
--   4. Re-run adversarial SQL review on the moved file (standing repo rule).
--   5. Push, then run the POST-APPLY VERIFICATION at the bottom.
--   6. Smoke the two render surfaces while signed in: /profile (own avatar) and
--      /personnel (the table — many avatars, one signing round trip).
--
-- ROLLBACK: the bucket flag and the policy are trivially reversible:
--
--     UPDATE storage.buckets SET public = true WHERE id = 'avatars';
--     DROP POLICY IF EXISTS "Authenticated users can view avatars" ON storage.objects;
--     CREATE POLICY "Anyone can view avatars" ON storage.objects
--       FOR SELECT TO public USING (bucket_id = 'avatars');
--
--   The BACKFILL is not reversible from this file — it discards the host prefix
--   of each URL. It does not need to be: the shipped frontend reads paths, and a
--   path can be turned back into a public URL by `getPublicUrl` at any time.
--   Snapshot the column first anyway if you want an undo (GATE 1 shows how).
--
-- ============================================================================
-- GATE 1 — pre-apply report (run in the SQL editor; READ-ONLY, changes nothing)
-- ============================================================================
-- Classifies every non-null profiles.avatar_url so nothing is a surprise:
--
--   SELECT CASE
--            WHEN avatar_url ~ '^https?://[^/]+/storage/v1/object/public/avatars/.+'
--              THEN 'public-url  → will be rewritten to a path'
--            WHEN avatar_url ~* '^https?://'
--              THEN 'FOREIGN URL → SKIPPED (not this bucket)'
--            WHEN avatar_url ~* '^[a-z][a-z0-9+.-]*:'
--              THEN 'UNPARSEABLE → SKIPPED (unexpected scheme)'
--            ELSE 'bare path   → already correct, left alone'
--          END                                             AS classification,
--          count(*)                                        AS rows,
--          count(*) FILTER (WHERE avatar_url ILIKE '%.pdf') AS pdf_valued
--     FROM public.profiles
--    WHERE avatar_url IS NOT NULL AND btrim(avatar_url) <> ''
--    GROUP BY 1
--    ORDER BY 1;
--
-- The `pdf_valued` column is deliberate. The audit flagged that this bucket had
-- been widened to accept 'application/pdf' "for certificate uploads"
-- (database/update-avatars-bucket-for-certificates.sql) before
-- 20260812122000 narrowed it back to images. No code path ever wrote a
-- certificate to `avatars` — competency certificates go to the private
-- `documents` bucket — but if any row's avatar_url points at a PDF, look at it
-- before running this: it is either junk or a misfiled document, and neither
-- should be silently rewritten into an avatar path.
--
-- Optional undo snapshot (drop it once you are satisfied):
--
--   CREATE TABLE IF NOT EXISTS public._avatar_url_backfill_backup AS
--     SELECT id, avatar_url, now() AS captured_at
--       FROM public.profiles
--      WHERE avatar_url IS NOT NULL;
--
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Phase 1 — backfill profiles.avatar_url: public URL → bare object path
--
-- CONSERVATIVE BY CONSTRUCTION. The WHERE clause admits exactly one shape —
-- a public object URL for THIS bucket — and the same expression that selects a
-- row also produces its replacement, so a row that cannot be confidently parsed
-- is not touched at all:
--
--   * NULL / blank             → not matched (a NULL never satisfies `~`)
--   * bare path (new uploads)  → not matched, already correct
--   * URL for another bucket   → not matched, left as-is and reported
--   * any other scheme / junk  → not matched, left as-is and reported
--
-- `split_part(…, '?', 1)` drops any cache-busting query string before the path
-- is extracted. The final guard rejects an empty or traversal-bearing capture,
-- so a malformed URL can never write a garbage path over a real value.
--
-- BOTH TRIGGERS ON public.profiles WERE CHECKED against a NULL-actor (migration)
-- context, because an UPDATE here fires them for every rewritten row:
--   * protect_sensitive_profile_fields (20260205143953:12-15) returns NEW
--     immediately when auth.uid() IS NULL — no exception, nothing coerced.
--   * audit_row_change (20260626160000:64-65) returns NULL when auth.uid() IS
--     NULL — system writes are skipped, so this does not flood activity_log with
--     one actorless row per profile.
-- ----------------------------------------------------------------------------
DO $backfill$
DECLARE
    c_public_url_re CONSTANT TEXT :=
        '^https?://[^/]+/storage/v1/object/public/avatars/(.+)$';
    v_rewritten INTEGER := 0;
    v_skipped   INTEGER := 0;
    r           RECORD;
BEGIN
    WITH candidate AS (
        -- regexp_match (not substring(… FROM …)) so the capture is unambiguously
        -- the regex form, whatever the planner infers about the variable's type.
        SELECT id,
               (regexp_match(split_part(avatar_url, '?', 1), c_public_url_re))[1] AS new_path
          FROM public.profiles
         WHERE avatar_url ~ c_public_url_re
    ), usable AS (
        SELECT id, new_path
          FROM candidate
         WHERE new_path IS NOT NULL
           AND btrim(new_path) <> ''
           AND position('..' IN new_path) = 0
    )
    UPDATE public.profiles p
       SET avatar_url = u.new_path
      FROM usable u
     WHERE p.id = u.id
       AND p.avatar_url IS DISTINCT FROM u.new_path;

    GET DIAGNOSTICS v_rewritten = ROW_COUNT;

    -- Report — never rewrite — anything left holding a value that is not a bare
    -- path. These are the rows whose avatars stop resolving once the bucket is
    -- private; the client degrades them to initials rather than a broken image.
    FOR r IN
        SELECT id, username, avatar_url
          FROM public.profiles
         WHERE avatar_url IS NOT NULL
           AND btrim(avatar_url) <> ''
           AND avatar_url ~* '^[a-z][a-z0-9+.-]*:'   -- still carries a scheme
         ORDER BY username
    LOOP
        v_skipped := v_skipped + 1;
        RAISE WARNING 'M11 backfill SKIPPED (unparseable avatar_url, left untouched): profile % (%) = %',
            r.id, COALESCE(r.username, '?'), r.avatar_url;
    END LOOP;

    RAISE NOTICE 'M11 backfill: % row(s) rewritten to bare paths, % row(s) skipped and reported.',
        v_rewritten, v_skipped;
END
$backfill$;

-- ----------------------------------------------------------------------------
-- Phase 2 — close the anonymous read path on storage.objects
--
-- The bucket flag alone does NOT close this: "Anyone can view avatars" is
-- granted TO public, so anonymous reads keep working through the object API
-- while it exists. Replace it with the authenticated-only equivalent already
-- written in database/migrations/security-audit-fix-2026-02.sql:55.
--
-- Idempotent: both statements are safe to re-run, and re-running is how this
-- survives another accidental execution of create_avatars_bucket.sql, which
-- re-creates the public policy every time it runs.
--
-- SCOPE, STATED SO IT IS NOT MISREAD AS AN OVERSIGHT: the replacement is
-- authenticated-wide, not org-scoped — any signed-in user can read any avatar.
-- That is deliberate and is the exact policy the 2026-02 pen-test fix prescribes.
-- Avatars are stored under `<userId>/`, not `<orgId>/`, so org scoping would need
-- a profiles join in the storage policy, and the personnel table legitimately
-- shows colleagues' photos. M11 is about ANONYMOUS world-readability; narrowing
-- avatar reads to one organisation is a separate decision with its own surface.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view avatars" ON storage.objects;

CREATE POLICY "Authenticated users can view avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- ----------------------------------------------------------------------------
-- Phase 3 — flip the bucket private
--
-- Step 4 of the plan, and last on purpose: it is only safe once the column holds
-- paths (phase 1) and the public SELECT policy is gone (phase 2).
--
-- Note this also re-asserts the 2026-02 pen-test fix
-- (database/migrations/security-audit-fix-2026-02.sql:26-28) that
-- database/create_avatars_bucket.sql:16 undoes every time it is re-run.
-- ----------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE id = 'avatars'
  AND public IS DISTINCT FROM false;

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION
-- ============================================================================
-- 1. The bucket is private, and no other bucket regressed to public:
--
--      SELECT id, name, public, allowed_mime_types
--        FROM storage.buckets
--       ORDER BY id;
--      -- expect: avatars.public = false; nothing else newly true
--
-- 2. No stored avatar value still carries a scheme. This must return ZERO rows;
--    any row it returns is a skipped/unparseable value (phase 1 warned about it)
--    and that person now renders as initials:
--
--      SELECT id, username, avatar_url
--        FROM public.profiles
--       WHERE avatar_url IS NOT NULL
--         AND btrim(avatar_url) <> ''
--         AND avatar_url ~* '^[a-z][a-z0-9+.-]*:'
--       ORDER BY username;
--
-- 3. Every surviving value looks like an in-bucket object path, and each one
--    actually exists in the bucket. A mismatch here means the backfill parsed a
--    URL whose object had already been deleted — cosmetic (initials), but worth
--    knowing before someone reports it as a bug:
--
--      SELECT p.id, p.username, p.avatar_url,
--             (o.name IS NOT NULL) AS object_exists
--        FROM public.profiles p
--        LEFT JOIN storage.objects o
--               ON o.bucket_id = 'avatars' AND o.name = p.avatar_url
--       WHERE p.avatar_url IS NOT NULL AND btrim(p.avatar_url) <> ''
--       ORDER BY object_exists, p.username;
--
-- 4. The public read policy is gone and only the authenticated one remains.
--    A row with roles = {public} here means the anonymous read path is still
--    open and the bucket flag is doing nothing:
--
--      SELECT policyname, roles, cmd, qual
--        FROM pg_policies
--       WHERE schemaname = 'storage' AND tablename = 'objects'
--         AND qual LIKE '%avatars%'
--       ORDER BY policyname;
--
-- 5. Live probe, signed OUT (curl, no Authorization header) against a known
--    avatar object path — must NOT return the image:
--
--      https://<project>.supabase.co/storage/v1/object/public/avatars/<path>
--      -- expect 400/404, not 200
--
-- 6. Live probe, signed IN: /profile and /personnel render avatars. The network
--    tab should show ONE `/storage/v1/object/sign/avatars` request for the whole
--    personnel table (batched), and image URLs carrying a `token=` query param.
-- ============================================================================
