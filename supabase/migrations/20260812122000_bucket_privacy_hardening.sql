-- ============================================================================
-- M11 — Public-bucket contradictions (avatars / vessel-images)
-- Security audit 2026-08-12 (docs/security-audit-2026-08-12.md, finding M11)
-- ============================================================================
-- The effective `public` flag for these two buckets cannot be resolved from the
-- files in this repo — they are set both ways by scripts that are all "run this
-- in the SQL editor" and have no ordering guarantee:
--
--   public = true   database/supabase-storage-setup.sql:24-30  (vessel-images,
--                   ON CONFLICT DO UPDATE SET public = true — re-asserts on
--                   every re-run)
--                   database/create_avatars_bucket.sql:8-18   (avatars, same
--                   ON CONFLICT DO UPDATE SET public = true)
--   public = false  database/migrations/security-audit-fix-2026-02.sql:26-33
--                   (both, the pen-test fix)
--
-- This migration makes the intended state explicit and re-assertable, with ONE
-- deliberate exception (avatars — see below).
--
-- getPublicUrl / createSignedUrl inventory over src/ + supabase/functions/
-- (the flag can only be flipped for a bucket nothing serves publicly):
--   avatars        → getPublicUrl  (src/hooks/mutations/useUploadAvatar.ts:57,
--                    the returned URL is persisted into profiles.avatar_url)
--   vessel-images  → no reference at all in src/ or supabase/functions/
--   documents      → createSignedUrl only (document-control-service.ts:495,
--                    competency-queries.ts:169, competency-mutations.ts:322)
--   vessel-annotations → getPublicUrl (annotation-attachment-service.ts:39) —
--                    audit finding H2, handled separately, not touched here
-- ============================================================================

-- ----------------------------------------------------------------------------
-- vessel-images → PRIVATE
-- ----------------------------------------------------------------------------
-- Safe to flip: no code path serves this bucket via getPublicUrl, so nothing
-- depends on anonymous object URLs. Re-asserts the 2026-02 pen-test fix that
-- database/supabase-storage-setup.sql undoes every time it is re-run.
UPDATE storage.buckets
SET public = false
WHERE id = 'vessel-images'
  AND public IS DISTINCT FROM false;

-- ----------------------------------------------------------------------------
-- avatars → mime types narrowed; `public` flag deliberately NOT changed here
-- ----------------------------------------------------------------------------
-- database/update-avatars-bucket-for-certificates.sql widened this bucket to
-- accept 'application/pdf' "for certificate uploads". Confirmed by the audit and
-- re-verified here: NO code writes certificates to `avatars` — competency
-- certificates go to the private `documents` bucket under
-- 'competency-documents/<userId>/' (competency-mutations.ts). The only writer of
-- `avatars` is useUploadAvatar.ts, which is image-only and whose own error text
-- offers "JPEG, PNG, GIF, or WebP". Accepting PDF here is therefore a pure
-- latent world-readable-certificate vector: remove it.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
    ]
WHERE id = 'avatars';

-- NOT DONE ON PURPOSE: `UPDATE storage.buckets SET public = false WHERE id = 'avatars'`.
-- Avatar URLs are minted with getPublicUrl (useUploadAvatar.ts:57) and the
-- resulting permanent URL is stored in profiles.avatar_url. Making the bucket
-- private from a migration would break every avatar in the app (existing stored
-- URLs would start 400ing) without a matching client change to createSignedUrl.
-- Closing this properly is an app change, not a migration:
--   1. switch useUploadAvatar to store the object PATH, not a public URL,
--   2. sign on read (createSignedUrl) wherever avatar_url is rendered,
--   3. backfill existing profiles.avatar_url values from URL → path,
--   4. only then set public = false.
-- Tracked as the residual half of M11.
--
-- WHEN THAT CHANGE LANDS, step 4 is NOT just the bucket flag: the live
-- storage.objects policy "Anyone can view avatars"
-- (database/create_avatars_bucket.sql:46, restored again by
-- database/restore-rls-from-csv-export.sql:1064) is granted TO public with
-- `USING (bucket_id = 'avatars')`, so flipping the bucket private while that
-- policy exists leaves anonymous reads working through the object API — the
-- bucket flag alone does not close it. Drop that policy in the SAME change and
-- replace it with the authenticated-only equivalent already written as
-- "Authenticated users can view avatars"
-- (database/migrations/security-audit-fix-2026-02.sql:55).

-- ----------------------------------------------------------------------------
-- Report the resulting state (mirrors the check in security-audit-fix-2026-02.sql)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    b RECORD;
BEGIN
    FOR b IN SELECT id, name FROM storage.buckets WHERE public = true LOOP
        RAISE WARNING 'M11: bucket % (%) is PUBLIC — confirm this is intended', b.name, b.id;
    END LOOP;
END $$;
