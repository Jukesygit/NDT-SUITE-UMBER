# Supabase Project Migration Runbook — eu-north-1 → eu-west-2

**Date:** 2026-08-17 · **Status:** ✅✅ **CUTOVER COMPLETE — matrixportal.io live on `ntrgjqrbewbvwofupphn` (eu-west-2)** · **Owner:** Jonas + Fable session

## Cutover result (2026-08-17 evening) — LIVE

Executed same-day after the dry run, ~20-minute read-only window. Sequence as proven, plus cutover-specific deltas: freeze = `ALTER ROLE authenticator SET default_transaction_read_only = true` + backend recycle on the OLD project (user-approved; `VITE_MAINTENANCE_MODE` turned out to be a tools-only PII-lockdown mode, not a site-down switch — DB-level read-only is the real freeze, and it permanently protects the old project from stale-tab writes). Final data dump added `-x storage.buckets -x storage.objects` (buckets were API-pre-created for the storage pre-sync; pre-created `project-files`/`scan-data` without the 100 MB per-file limit because the new project's global upload cap rejected it — **post-cutover task: raise the global storage file-size limit on ntrg, then PATCH those two buckets to 104857600**; biggest real file is 44 MB so nothing current is affected). Storage pre-synced 416/416 before freeze; freeze-time manifest was IDENTICAL → zero delta. Every verification gate passed: all 15 baseline metrics matched (incl. project_vessels 8, vessel_models 13), policies 143+33, history 28, old-host refs 0, cron job active, reminder-fn 401 gate, live bundle references ONLY the new ref. Auth config was copied via Management API (token from owner) incl. SMTP on the NEW Resend key and the 5 hardened repo templates (PS 5.1 trap: cast `Get-Content -Raw` to `[string]` before `ConvertTo-Json`, else ETS properties serialize as objects; rate-limit fields require SMTP fields set first). Vercel flip via REST (env PATCH by id + redeploy of latest prod deployment). Local `.env` updated; repo CLI re-linked to ntrg. **Users must log in again.**

Logical migration of the production Supabase project per the official CLI backup/restore guide, adapted to this repo's actual surface (inventoried 2026-08-17).

## Projects

| Role | Ref | Name | Region | Notes |
|---|---|---|---|---|
| **Source (live prod)** | `cngschckqhfpwjcvsbad` | Jukesygit's Project | eu-north-1 | Currently CLI-linked (`supabase/.temp/project-ref`) |
| **PRODUCTION TARGET** | `ntrgjqrbewbvwofupphn` | Matrix Portal | eu-west-2 | Created 2026-08-17 — decided 2026-08-17 |
| **Dry-run target** | `oxzteqqrhggdodcnngzn` | Matrix Portal | eu-west-2 | Created 2026-08-06 — delete after cutover |

Both source and targets run Postgres 17 — same major version, clean dump/restore.

## Inventory facts this plan is built on (2026-08-17)

- **Tooling:** supabase CLI 2.107.0 (logged in), Docker 29.5.3. **No local psql/pg_dump** — dump runs through the CLI's dockerized pg tools; restore runs psql via the `postgres:17` image.
- **Extensions (verified live, Phase 0):** `pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp` must be enabled on the target before restore (`pg_stat_statements`, `plpgsql`, `supabase_vault` are platform defaults — no action). Repo SQL only declared `uuid-ossp`; the rest were dashboard-enabled. **Vault holds 0 secrets** (verified) — the simple restore path applies, no encryption-key caveat.
- **No** Vault/pgsodium, custom LOGIN roles, DB webhooks, pg_net/http calls, or Realtime subscriptions (`.channel(` has zero hits in src/). Companion app has zero Supabase references.
- **Storage:** 8 buckets — `avatars`, `vessel-annotations`, `3d-models`, `vessel-images`, `scan-images`, `scan-data`, `project-files`, `documents`. `documents` (private, folder-scoped) has no CREATE in repo — dashboard-created. Repo SQL disagrees with itself on public flags (`security-audit-fix-2026-02.sql` flips some private) → capture ACTUAL flags from source, never trust repo SQL. Most storage policies live in ad-hoc `database/*.sql`, not the migration chain — the schema dump is the only faithful carrier.
- **Edge functions:** repo holds 15 (+ `_shared`): admin-update-email, approve-account-request, bulk-create-users, create-user, delete-my-account, delete-user, gemini-proxy, send-email, send-expiration-reminders, send-profile-update-reminder, send-reset-code, submit-account-request, sync-users, update-password-confirm-email, verify-reset-code. No deno.json/import_map anywhere; no `[functions.*]` config — all deploy with defaults; all live functions run `verify_jwt: true`. **Live source has 19 ACTIVE functions** (verified `functions list` 2026-08-17): the repo 15 plus 4 dashboard-created strays NOT in the repo — `transfer-asset` (Data Hub era, last updated ~2026-02-05), `swift-task` + `quick-endpoint` (scratch, 2026-01-19, never updated), `Competency notification` (slug `bright-worker`, 2026-01-23, likely superseded by send-expiration-reminders). Default: **retire — do not migrate** (owner to confirm; grep the frontend for their slugs first if in doubt).
- **Secrets to set on target (verified via `secrets list` 2026-08-17, digests only):** exactly three manual secrets exist on source — `RESEND_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`. `APP_URL` and `ALLOWED_ORIGINS` are read by function code but **not set on source** (in-code fallbacks in use) — mirror that: set only the three, add the others only if the dry run surfaces CORS/link problems. Platform injects `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` automatically. Secret values are write-only on Supabase — plaintext must come from the owner's records, not the old project.
- **Frontend env:** `.env` + Vercel hold `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; `VITE_MAINTENANCE_MODE` already exists → use it as the write-freeze switch. GitLab CI holds no Supabase vars (only `VERCEL_TOKEN`).
- **Security-remediation branch (`worktree-security-audit-remediation`) stays parked:** this is a **parity migration** — copy the live DB exactly as-is; the remediation (migrations `20260812120000..124000` + 12 edge fns + frontend) remains its own coordinated deploy afterwards.

## What the dump carries vs what it doesn't

**Carried by roles+schema+data dump:** all user schema/tables/data, RLS policies (incl. storage.objects policies), functions, triggers, sequences, `auth.*` (users, hashed passwords, 2FA/TOTP factors, identities), `storage.*` metadata rows (buckets config + object rows — not the bytes).

**NOT carried — manual steps:** storage object **bytes**; edge functions + secrets; auth **dashboard config** (SMTP, email templates, site URL, redirect URLs, rate limits, providers); pg_cron **jobs** (cron schema is excluded); `supabase_migrations` history (separate dump); API URL + anon/service keys (new values everywhere); JWT secret (differs → **every user re-logs-in at cutover** — expected, announce it).

## Dump-file security (non-negotiable)

`data.sql` contains production PII and password hashes. Work in a folder **outside the repo and outside OneDrive sync**, e.g. `C:\Users\jonas\supabase-migration\` (plain `C:\Users\jonas\` is not synced; Desktop/Documents are). Never commit dumps; delete them + empty recycle bin once the old project is retired.

## Phase 0 — Capture source config (read-only, no freeze) — **DONE 2026-08-17**

Outputs in `C:\Users\jonas\supabase-migration\phase0\`. Baselines: 20 auth.users / 20 profiles / 6 organizations / 708 employee_competencies / 115 competency_documents / 6 inspection_projects / 14 vessels / 42 scans / 1 documents / 528 **activity_log** (singular — `activity_logs` does not exist) / 416 storage.objects ≈ 1.37 GB (scan-data 1094 MB, documents 126 MB, scan-images 97 MB). Policies: public 143, storage 33, cron 2. Buckets public flags: `avatars`, `vessel-annotations`, `vessel-images` = public; rest private. One cron job: jobid 2 `send-expiration-reminders-daily`, `30 7 * * *`, active — `net.http_post` to the function URL with headers `Authorization: Bearer <anon key>` + `x-cron-secret: <secret>`, body `{}` (full command with secrets in `phase0/cron-jobs-full.txt`, local only).

DB password for the source is required from here on (Dashboard → Project Settings → Database; reset if unknown). Connection strings use the **session pooler, port 5432** (IPv4-safe; URL-encode special chars in the password). Source pooler host verified from `supabase/.temp/pooler-url`:
`postgresql://postgres.cngschckqhfpwjcvsbad:<PW>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`
For the two eu-west-2 projects, copy the exact "Session pooler" string from each project's Connect dialog (host prefix varies, `aws-0`/`aws-1`).

Capture and file alongside the dumps:

1. Buckets + real flags: `select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;`
2. Per-bucket object counts + total: `select bucket_id, count(*), sum((metadata->>'size')::bigint) from storage.objects group by bucket_id;`
3. Live cron jobs: `select jobid, jobname, schedule, command from cron.job;` (expect the 07:30 UTC send-expiration-reminders job; skip any dead/legacy 401 job)
4. Row counts (verification baseline): counts of `auth.users`, `profiles`, `organizations`, `employee_competencies`, `competency_documents`, `inspection_projects`, `vessels`, `scans`, `documents`, `activity_log` (singular); plus `select count(*) from pg_policies;`
5. Dashboard screenshots/copies: Auth → SMTP settings (Resend/SES), email templates (repo `email-templates/` is the source of truth — Engineering Log 2026-07-16 notes live templates were never re-pasted, so paste **repo versions** into the target), site URL + redirect URLs, rate limits, enabled providers; Storage → S3 access keys page (create keys when doing the rclone route).
6. `supabase secrets list --project-ref cngschckqhfpwjcvsbad` (names + digests only).

## Phase 1 — Dump (from `C:\Users\jonas\supabase-migration\`, Docker Desktop running)

```powershell
supabase db dump --db-url "<OLD_DB_URL>" -f roles.sql --role-only
supabase db dump --db-url "<OLD_DB_URL>" -f schema.sql
supabase db dump --db-url "<OLD_DB_URL>" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
supabase db dump --db-url "<OLD_DB_URL>" -f history.sql --schema supabase_migrations
supabase db dump --db-url "<OLD_DB_URL>" -f history-data.sql --use-copy --data-only --schema supabase_migrations
```

Verified 2026-08-17: `history.sql` is DDL-only — the fifth (data-only) dump is REQUIRED or migration history arrives empty. `roles.sql` has no custom roles but does carry per-role `statement_timeout` settings (anon 3s, authenticated 8s) — keep it in the restore. Circular-FK warnings from pg_dump (documents↔document_revisions, vessel_models↔project_vessels) are expected and harmless — replica mode disables FK triggers during restore.

## Phase 2 — Prepare target + restore

1. In the target dashboard: enable extensions `uuid-ossp`, `pg_cron`, `pg_net`, `pgcrypto` (Database → Extensions) **before** restoring. (No webhooks to enable — none exist.)
2. Restore (psql via Docker; target URL = session pooler of the chosen target project):

```powershell
docker run --rm -v "C:\Users\jonas\supabase-migration:/dump" -w /dump postgres:17 psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "<NEW_DB_URL>"
docker run --rm -v "C:\Users\jonas\supabase-migration:/dump" -w /dump postgres:17 psql --variable ON_ERROR_STOP=1 --file history.sql --dbname "<NEW_DB_URL>"
```

3. **Storage policies do NOT survive the dump — confirmed in the 2026-08-17 dry run** (restore landed 143 public policies but **0/33** storage policies; the CLI dump excludes managed-schema DDL). Fix (proven): generate DDL from the source catalog and apply — `C:\Users\jonas\supabase-migration\storage-policies.sql` already holds the generated 33 statements (regenerate at cutover in case policies changed):

```sql
select 'create policy ' || quote_ident(policyname) || ' on storage.' || quote_ident(tablename)
  || case when permissive='RESTRICTIVE' then ' as restrictive' else '' end
  || ' for ' || lower(cmd) || ' to ' || array_to_string(roles, ', ')
  || coalesce(' using (' || qual || ')', '')
  || coalesce(' with check (' || with_check || ')', '') || ';'
from pg_policies where schemaname='storage' order by tablename, policyname;
```

4. Post-restore sanity: row counts vs Phase 0 baseline; buckets exist with correct flags (bucket rows DO come across in data.sql — verified, all 8 with correct public flags, `documents` included); `select count(*) from pg_policies where schemaname='storage';` = 33 after the policy apply; `cron.job` must be EMPTY (cron data doesn't dump — verified).
5. **Persisted-URL rewrite (dry-run discovery, 2026-08-17):** 8 text columns store ABSOLUTE URLs pinned to the old project host (~113 rows): `scans.thumbnail_url/heatmap_url/data_url`, `profiles.avatar_url`, `vessels.model_3d_url`, `vessel_images.image_url`, `employee_competencies.document_url`, `competency_documents.document_url` (last two are single legacy rows — the competency flow normally stores paths). After restore, run `replace(col, 'cngschckqhfpwjcvsbad', '<target-ref>')` updates on each under `session_replication_role = replica` (skips audit triggers), then re-scan to zero with the dynamic all-text-columns query (re-enumerate columns at cutover in case new URL rows appeared; the generator query is in the session history / trivially rebuilt from `information_schema.columns` over text+varchar+jsonb with `col::text like '%cngschckqhfpwjcvsbad%'`). Without this, media breaks the day the old project dies.

## Phase 3 — Storage object bytes

Preferred: **rclone over the S3-compatible endpoints** (path-preserving, incremental, re-runnable at cutover). Create S3 access keys on both projects (Storage → S3 access keys; endpoint `https://<ref>.storage.supabase.co/storage/v1/s3`, region per project), configure two rclone remotes, then per bucket: `rclone copy old:<bucket> new:<bucket> -P --checksum`.

- If uploads conflict with the restored `storage.objects` rows, wipe that bucket's rows first (`delete from storage.objects where bucket_id = '<bucket>';`) and let the sync recreate them — decide once during the dry run and do the same at cutover.
- Fallback: Supabase's official Node migration script (service keys both sides) — re-uploads via API, no S3 keys needed.
- Verify with the Phase 0 per-bucket counts/sizes query on the target.

## Phase 4 — Edge functions + secrets

```powershell
supabase functions deploy --project-ref <target-ref>   # deploys the repo's 15 (master parity versions)
supabase secrets set --project-ref <target-ref> RESEND_API_KEY=... GEMINI_API_KEY=... CRON_SECRET=...
```

- **`GEMINI_API_KEY`: copy the existing key** (owner decision 2026-08-17 — rotation stays an open audit item; do not rotate silently).
- **Mint a fresh `CRON_SECRET`** — it must match the Phase 5 cron job exactly (the dual-location scar in `project_reminder-cron-automation`).
- The 4 dashboard-stray functions are NOT deployed by this step — deliberate (see inventory facts; owner to confirm retirement).

## Phase 5 — Auth config + cron (dashboard/SQL, target)

1. Auth: SMTP (Resend/SES creds), paste the 6 templates from `email-templates/`, site URL, redirect URLs, rate limits, providers, 2FA settings — mirror Phase 0 captures.
2. Recreate the reminder cron on the target — verified source shape (Phase 0):

```sql
select cron.schedule('send-expiration-reminders-daily', '30 7 * * *', $$
  select net.http_post(
    url := 'https://<target-ref>.supabase.co/functions/v1/send-expiration-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <TARGET anon key>',
      'x-cron-secret', '<new CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
$$);
```

**The Authorization bearer must be the TARGET project's anon key** — the function runs `verify_jwt: true`, and a wrong/old-project bearer 401s silently (exactly how legacy job 1 failed for months). `x-cron-secret` must equal the `CRON_SECRET` secret set in Phase 4. There is only this one job to recreate (jobid 1 is long gone).

Dry-run lessons (2026-08-17): run `cron.schedule` as its **own** psql statement — a multi-statement `-c` string is one implicit transaction, and a later failing statement silently rolls the schedule back. Never `update cron.job` directly on a fresh project (permission denied for the postgres role); use `cron.alter_job()` / `cron.unschedule()`. On the production target the job is created active — no deactivation step (the dry-run deliberately keeps NO cron job so nothing emails real users).

## Phase 6 — Verification gate (dry run AND cutover)

- Row counts + `pg_policies` counts match Phase 0 baseline (incl. storage schema count).
- Point a local dev build at the target — no `.env` swap needed: launch a second Vite instance with inline env (`$env:VITE_SUPABASE_URL=...; $env:VITE_SUPABASE_ANON_KEY=...; npm run dev -- --port 5199 --strictPort` — process env beats `.env`, the main dev server stays on production). Login (normal + a 2FA account), personnel → competency **document preview** (signed URL through the storage-RLS scar path), project → vessel 3D model load, document control download, avatar render, admin create-user + delete test user, password-reset email arrives (proves SMTP), GDPR export function.
- **Org-scoping trap (dry-run lesson):** `inspection_projects` (and likely `documents`) SELECT policies are strict `organization_id` scoping with NO super_admin override — a test user outside the **Matrix** org sees a clean, silent `200 []` (zero projects). That is CORRECT behavior, not a migration defect. Any verification account must be in the Matrix org. Related: legacy tables (`assets` 18, `inspections` 3, `vessels.asset_id` linkage) coexist with the current `inspection_projects`/`project_vessels` model in production too — their presence on the target is parity, not drift.
- Known pre-existing breakage (not migration scope): `3d-models` bucket objects return 400 via public URL on BOTH old and new projects (`vessels.model_3d_url` rows are stale).
- `supabase functions list --project-ref <target>` shows all 15; invoke send-expiration-reminders with the new `CRON_SECRET` → 200.
- RLS spot-check with a viewer-role account (sees only its org's data).

## Phase 7 — Cutover

1. Freeze writes: set `VITE_MAINTENANCE_MODE=true` in Vercel → redeploy.
2. Final `data.sql` dump → wipe+re-restore data into target (or full re-restore if anything schema-side changed), re-run rclone (incremental delta), re-verify counts.
3. Flip Vercel `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to the target, `VITE_MAINTENANCE_MODE=false` → redeploy. Update local `.env`. Re-link the repo: `supabase link --project-ref <target-ref>`.
4. Smoke test production (login, one read, one write, one storage download). Announce: **all users must log in again** (new JWT secret).

## Dry-run result (2026-08-17) — PASSED

Executed end-to-end into `oxzteqqrhggdodcnngzn`, production untouched throughout:

- **DB:** roles + schema + data + history restored in one pass; every Phase 0 baseline count matched exactly (20 users / 708 competencies / 528 activity_log / 416 storage rows / 28 migration-history rows / 143 public policies); 33 storage policies regenerated from catalog and applied; cron.job empty as expected.
- **Storage:** 416/416 objects synced, 0 failures; per-bucket counts AND sizes byte-matched the source; signed-URL download of a competency PDF returned HTTP 200 through the policy path.
- **Functions:** all 15 deployed; secrets set (regenerated Resend/Gemini + minted CRON_SECRET); send-expiration-reminders correctly 401s a wrong `x-cron-secret` (no email risk).
- **App (Playwright, test super_admin in Matrix org, port-5199 second Vite instance):** 7/7 — login + header identity, personnel 20 rows, avatar from the NEW host HTTP 200, projects 6/6 ("Showing 6 of 6", all Harbour Energy), documents row visible, project→vessel detail with computed coverage (194.87 m² shell), vessel-modeler canvas. Zero console errors on the backend path (localhost 18923–18932 connection-refused noise = companion-service port probe, expected).
- **False alarm, refuted:** an initial agent diagnosis of "different schema generation / needs data transform" was an RLS artifact — org-scoped SELECT policies with no super_admin override return silent `200 []` for out-of-org users. Do not re-raise. Pre-existing oddities noted, out of migration scope: `3d-models` public URLs 400 on BOTH hosts; `/documents` renders for super_admin despite `tab_visibility_settings.documents.is_visible = false`.
- Dry-run leftovers: test user `migration.verify@example.com` (super_admin, Matrix org) remains on the dry-run project — the whole project is deleted after cutover anyway.

## Rollback

Old project is untouched throughout — revert the three Vercel env vars and redeploy. Keep the old project live ~1–2 weeks post-cutover, then pause (don't delete) for a further window; only then delete dumps.

## Decisions (owner, 2026-08-17)

1. **Production target = `ntrgjqrbewbvwofupphn`** (created 2026-08-17); spare `oxzteqqrhggdodcnngzn` becomes the dry-run target, deleted after cutover.
2. **Dry-run first** into the spare project (no freeze), then real freeze + cutover into the target.
3. ~~`GEMINI_API_KEY` copied, not rotated~~ **Superseded same day: owner regenerated BOTH `GEMINI_API_KEY` and `RESEND_API_KEY`** (new values in `secrets.ps1`). Owner confirmed the new keys were freshly *created* and never applied anywhere — the old keys remain active and live production keeps running on them untouched. Sequence: new projects get new keys; **after cutover, delete the old keys at Resend + Google AI Studio** — that completes the audit's rotation item.

## Still open (owner)

1. Cutover window (low-traffic; downtime ≈ dump + restore + storage delta, likely well under an hour).
2. Fate of the 4 deployed-but-not-in-repo functions (`transfer-asset`, `swift-task`, `quick-endpoint`, `Competency notification`/`bright-worker`) — default is retire (don't migrate).

## Materials needed from owner before Phase 0

Create `C:\Users\jonas\supabase-migration\secrets.ps1` (outside repo + OneDrive, never committed) containing:

```powershell
$env:OLD_DB_URL = "postgresql://postgres.cngschckqhfpwjcvsbad:<PW>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres"
$env:DRY_DB_URL = "<session-pooler string for oxzteqqrhggdodcnngzn, from Connect dialog>"
$env:NEW_DB_URL = "<session-pooler string for ntrgjqrbewbvwofupphn, from Connect dialog>"
$env:RESEND_API_KEY = "<plaintext>"   # for Phase 4 — not readable from the old project
$env:GEMINI_API_KEY = "<plaintext>"   # for Phase 4 — not readable from the old project
```

Each session command dot-sources this file. Docker Desktop must be running for every dump/restore step.

**Status 2026-08-17:** source password received and verified working. Resend + Gemini keys regenerated and stored. The password given for the target does **not** authenticate on either eu-west-2 project (both confirmed on the `aws-0-eu-west-2` pooler; both reject it) — both eu-west-2 passwords still needed. DB passwords transited chat this session → re-reset all of them once migration completes.
