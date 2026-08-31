# Disaster Recovery

**Owner:** Jonas · **Last reviewed:** 2026-08-31 · **Scripts:** `scripts/db-restore.ps1`, `scripts/db-backup.ps1`

This is the incident procedure: production data is lost, corrupted, or the project is gone, and it has to
come back. For routine backup operation see [backup-and-restore.md](backup-and-restore.md).

> **This document satisfies the "Document backup recovery steps" item in `docs/DEPLOYMENT_CHECKLIST.md`.**

---

## Purpose

Restore the NDT Suite production database, storage objects and application access after data loss, with a
verified, evidenced result rather than a hopeful one. Recovery is only complete when the verification gate
passes and the outcome is recorded in the [Restore test record](#restore-test-record) below.

---

## Recovery objectives — stated honestly

| | Value | Basis |
|---|---|---|
| **RPO (platform path)** | **up to 24 hours** | Supabase daily automated backups. PITR is deliberately not enabled (owner decision 2026-08-26; revisit only if a client contract demands RPO < 24h). |
| **RPO (off-platform path)** | **up to 7 days** | Weekly logical dumps from `scripts/db-backup.ps1`, published to the Company OneDrive (SharePoint) library. This is the copy that survives losing the Supabase account *and* losing the backup machine. |
| **RTO (platform restore)** | ~1 hour, mostly platform-side | Restore-in-place from the dashboard; no app reconfiguration. |
| **RTO (full rebuild into a new project)** | **half a day, realistically** | Restore is minutes; the long poles are storage bytes (~1.4 GB), edge-function redeploy, auth dashboard config, cron recreation, and the Vercel env flip. The 2026-08-17 migration ran this end-to-end in a ~20-minute *write freeze*, but that was a planned move with everything pre-staged. |

**Every full rebuild invalidates the JWT secret: all users must log in again.** Announce it.

### Rollback via the old project — expiring

Until teardown, the pre-migration eu-north-1 project (ref in
`docs/plans/2026-08-17-supabase-project-migration-runbook.md`) still exists, deliberately left
**read-only** (`ALTER ROLE authenticator SET default_transaction_read_only = true`). It holds production
data as of 2026-08-17 and has served as a cheap rollback target since cutover.

**This is not a recovery layer and it is going away.** Teardown was due ~2026-08-31 and includes pausing
then deleting that project. Once it is gone — and once
`C:\Users\jonas\supabase-migration` is deleted with it — the only recovery paths are the platform
backups and the weekly logical sets. Do not plan around the old project.

### What the published copy does and does not protect against

The durable copy of a logical set is a file in the Company OneDrive / SharePoint library (owner decision
2026-08-31). Be clear-eyed about the shape of that protection.

**It protects against:** losing the Supabase account or organisation, losing the laptop, a provider-side
failure at Supabase, and operator error against the platform console. Those are the failures the
off-platform layer exists for, and a synced library covers all of them.

**It does not protect against sync itself.** A folder that syncs deletions propagates them. Ransomware
that encrypts the backup folder, or a mistaken `Remove-Item` under it, reaches the library within
minutes — this is the one respect in which it is weaker than the write-only S3 identity it replaced,
which could not delete at all. What stands underneath it instead:

| Layer | Where to look | Window |
|---|---|---|
| **Version history** | SharePoint web → the file → ⋯ → **Version history**. Restores an earlier version of *this* file, which is what an encrypt-in-place attack leaves behind. | Per library settings — **REVIEW (owner): confirm the retained version count.** |
| **Site recycle bin** | SharePoint site → **Recycle bin** (then the *second-stage* recycle bin, site settings → Recycle bin → "Deleted from end user Recycle Bin"). Recovers a deleted file. | 93 days total across both stages, Microsoft 365 default — **REVIEW (owner): confirm for this tenant.** |
| **Files Restore** | SharePoint library → ⋯ → **Restore this library**. Rolls the whole library back to a point in time; built for exactly the mass-encryption case. | 30 days |

If backups are found encrypted or missing, do **not** re-run `db-backup.ps1` first — a fresh publish
writes over the same names and burns a version. Recover from version history or Files Restore, then take
a new backup.

---

## Prerequisites

Before starting, have all of these. Hunting for them mid-incident is how a 1-hour recovery becomes a day.

- [ ] **A backup set.** Either a platform backup visible in the dashboard, or a logical set. Logical sets live in the **Company OneDrive / SharePoint library** (`…\OneDrive - Matrix\Matrix IMS - Documents\DB Backup\db\<YYYY>\`, eight sets deep); the two most recent are usually also cached at `C:\Users\jonas\ndt-backups\`, but do not assume it — local is a cache and may not have survived whatever caused the incident.
- [ ] **Access to the library from the machine you are recovering on.** If OneDrive is not signed in there, sign in and let the folder sync — or download the two files from the SharePoint site in a browser and use `-BackupPath` against the downloaded `.7z` instead.
- [ ] **The archive passphrase** (`NDT_BACKUP_PASSPHRASE`) if using a logical set. **This is the only thing protecting the archive** — the library is shared, so anyone with site access holds the ciphertext.
- [ ] **The restore-reader AWS keys** — only if recovering a set from the **dormant** S3 stage (sets published there while it was live). They are *deliberately not on this machine*; configure the reader remote from the password manager:
      ```powershell
      rclone config     # new remote named "ndt-aws-restore", type s3, provider AWS, the READER keys
      ```
      Full walkthrough and the exact policy in [aws-backup-setup.md](aws-backup-setup.md). Delete the remote again when recovery is signed off.
- [ ] **Time, if you are pulling an S3 set older than 30 days.** Those transition to Deep Archive and take **hours** to thaw (up to 12 standard, up to 48 bulk). Issue the restore/thaw request first, then continue with everything else while it runs. Published sets in the library have no such tier — they are immediately readable.
- [ ] **Docker Desktop running.** There is no local `psql`; restores run through the `postgres:17` image.
- [ ] **A restore target.** A scratch/replacement Supabase project with its session-pooler connection string, or `-LocalDocker` for a smoke test.
- [ ] **Extensions enabled on the target before restoring:** `uuid-ossp`, `pg_cron`, `pg_net`, `pgcrypto` (Database → Extensions). The first three are dashboard-enabled only — repo SQL declares just `uuid-ossp`.
- [ ] **Edge-function secret plaintext:** `RESEND_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`. Write-only on Supabase; these come from the owner's records, never from the old project.
- [ ] **Vercel access** to flip `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

---

## Decide the scenario first

| Scenario | Path |
|---|---|
| **A — Bad data, project healthy** (bad migration, mass delete, corrupt table) | Platform backup, restore in place from the dashboard. Fastest, no app reconfiguration. Go to Step 1 only if the platform backup is unusable or older than the damage. |
| **B — Project lost or unrecoverable** (deleted, suspended, region failure) | Full rebuild into a new project from the newest logical set. Steps 1–8 below. |
| **C — Verification / DR drill** | Steps 1–5 into a scratch project or `-LocalDocker`, then record the result in the table at the bottom. Never point a drill at production. |

**Before touching anything in scenario A or B: stop the weekly backup task** so a scheduled run cannot
overwrite good evidence with a dump of the damaged state.

```
schtasks /End /TN "NDT Suite weekly DB backup"
schtasks /Change /TN "NDT Suite weekly DB backup" /DISABLE
```

Re-enable it (`/ENABLE`) once recovery is signed off.

---

## Steps

### 1. Choose the backup set

**Prefer the published copy.** It is the authoritative one; the local cache holds only the last two sets
and shares a fate with the machine.

```powershell
# what is published (eight sets deep)
Get-ChildItem "C:\Users\jonas\OneDrive - Matrix\Matrix IMS - Documents\DB Backup\db" -Recurse -Filter *.7z |
    Sort-Object Name -Descending

# what happens to be cached locally
Get-ChildItem C:\Users\jonas\ndt-backups | Sort-Object Name -Descending
```

Take the newest set whose date precedes the damage, and note its date — that is the `-FromPublish`
argument. `-FromPublish latest` picks the newest for you, which is right for a drill and for most
incidents, but *not* when the damage predates the last backup.

`db-restore.ps1` accepts four forms: `-FromPublish <yyyy-MM-dd | latest>` (the normal path), a local
`.7z` which it decrypts using the secrets-file passphrase, an already-extracted day folder, or
`-FromS3 <yyyy-MM-dd>` for a set that reached the dormant bucket while it was live.

> `-FromPublish` takes `latest` rather than nothing-at-all because Windows PowerShell 5.1 binds the next
> token as the value of a string parameter: a bare `-FromPublish -DryRun` would silently set it to
> `"-DryRun"`. `latest` is explicit and cannot misfire.

### 2. Dry-run the restore

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-restore.ps1 `
    -FromPublish latest -DryRun
```

Prints the plan — including the exact `rclone` commands and the key it will pull — and exits 0 without
changing anything. Connection strings are masked. Confirm the target shown is the one you intend.

### 3. Restore

Into a scratch or replacement project (the authoritative path), from the published set:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-restore.ps1 `
    -FromPublish <yyyy-MM-dd> `
    -TargetDbUrl "postgresql://postgres.<target-ref>:<password>@<session-pooler-host>:5432/postgres"
```

`-FromPublish` **copies** the archive and its manifest sidecar *out* of the library into
`C:\Users\jonas\ndt-backups\_from-publish\<date>\`, re-hashes the archive against `archive.sha256` in
that manifest (**Gate P**), and only then continues down the ordinary restore path — extract, Gate 0,
the four steps, Gate 1. Two independent integrity checks, because the sidecar proves the archive and the
sealed manifest proves the dumps inside it.

The copy is not a convenience. Extraction writes a plaintext folder beside the archive it extracts, and
the library must never hold plaintext — it is shared. That is the same ciphertext-only invariant the
backup script enforces when publishing, read from the restore end. **Nothing in a restore is ever
written into the library.**

For a set that reached the dormant S3 bucket, `-FromS3 <yyyy-MM-dd>` behaves identically via **Gate S3**,
caching into `_from-s3\<date>\` instead.

If the set is already cached locally, skip the fetch:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-restore.ps1 `
    -BackupPath C:\Users\jonas\ndt-backups\ndt-backup-<date>.7z `
    -TargetDbUrl "postgresql://postgres.<target-ref>:<password>@<session-pooler-host>:5432/postgres"
```

Or as a local smoke test of dump integrity:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-restore.ps1 `
    -FromPublish latest -LocalDocker -ContinueOnError
```

> `-LocalDocker` starts a throwaway `postgres:17` container. A stock Postgres image is **not** a Supabase
> project: it has no `pg_cron`/`pg_net` and none of the platform-managed service roles, so parts of
> `schema.sql` will error even on a perfect backup. The script bootstraps Supabase-shaped roles first, but
> read the result as *"the dumps parse and the data loads"*, not *"the platform is reproducible locally"*.
> A scratch Supabase project is the target that proves recovery.

What the script does, in order:

- **Gate P — archive integrity** (`-FromPublish` only). The copied `.7z` is re-hashed against `archive.sha256` in the manifest sidecar. A mismatch aborts before the passphrase is used, and means sync corruption, an interrupted publish, or a file modified in the library — earlier versions of that same file are in OneDrive version history.
- **Gate S3 — archive integrity** (`-FromS3` only). The same check against a set fetched from the dormant bucket. A mismatch means transfer corruption or an object modified in the bucket — treat the second as an incident.
- **Gate 0 — integrity.** Every artifact re-hashed against `manifest.json`. A mismatch aborts before anything is written.
- **Step 1 — core.** One psql invocation, `--single-transaction --variable ON_ERROR_STOP=1`, applying `roles.sql` → `schema.sql` → `SET session_replication_role = replica` → `data.sql`. Replica mode disables FK triggers, which is why the circular-FK warnings from `pg_dump` (documents↔document_revisions, vessel_models↔project_vessels) are expected and harmless. Because it is one transaction, a failure commits nothing.
- **Step 2 — migration ledger.** `history.sql` then `history-data.sql`. Both are required; the DDL alone leaves an empty ledger.
- **Step 3 — storage policies.** Replays `storage-policies.sql`. Storage RLS does not survive a dump (0/33 in the 2026-08-17 dry run), so it is captured at backup time and replayed here.
- **Step 4 — storage bytes** (optional, `-RestoreStorage` with `-TargetProjectRef` and target S3 keys).
- **Gate 1 — verification.** Row counts, `pg_policies` counts, migration-ledger rows, all compared against the manifest.

**Restoring over production requires `-IAcceptProductionRestore` *and* typing `RESTORE PRODUCTION` at a
prompt.** Without the switch the script refuses and exits 2. This is intentional friction: a restore over
a live project destroys everything written since the dump.

### 4. Read the gate summary

The script ends with a PASS/FAIL line per gate and exits non-zero if any failed. Do not proceed on a FAIL —
diagnose it. A failed `policy-counts` gate showing `storage=0` means the app will authenticate fine and
then fail every file download.

### 5. Persisted-URL rewrite (new project only)

Eight text columns store absolute URLs pinned to the old project host (~113 rows at migration time):
`scans.thumbnail_url` / `heatmap_url` / `data_url`, `profiles.avatar_url`, `vessels.model_3d_url`,
`vessel_images.image_url`, `employee_competencies.document_url`, `competency_documents.document_url`.

Under `session_replication_role = replica` (to skip audit triggers), rewrite each:

```sql
set session_replication_role = replica;
update <table> set <col> = replace(<col>, '<old-ref>', '<new-ref>') where <col> like '%<old-ref>%';
```

Then re-scan to zero by enumerating text/varchar/jsonb columns from `information_schema.columns` and
checking for the old ref. Skip this and media breaks the day the old project dies.

### 6. Rebuild what dumps do not carry

1. **Edge functions:** `supabase functions deploy --project-ref <target-ref>` (15 functions from the repo).
2. **Secrets:** `supabase secrets set --project-ref <target-ref> RESEND_API_KEY=… GEMINI_API_KEY=… CRON_SECRET=…`. Mint a **fresh** `CRON_SECRET`.
3. **Auth config:** SMTP, the templates from `email-templates/`, site URL, redirect URLs, rate limits, providers. Rate-limit fields only accept values once SMTP is set.
4. **Cron:** recreate `send-expiration-reminders-daily` (`30 7 * * *`). Run `cron.schedule` as its **own** statement — a multi-statement `-c` is one implicit transaction and a later failure silently rolls the schedule back. The `Authorization` bearer must be the **target** project's anon key and `x-cron-secret` must equal the new `CRON_SECRET`; a mismatched bearer 401s silently, which is exactly how a legacy job failed unnoticed for months.
5. **Storage buckets:** bucket rows come across in `data.sql` with their public flags. Confirm `avatars`, `vessel-annotations`, `vessel-images` are public and the rest private.

### 7. Point the app at the new project

Flip `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel → redeploy. Update local `.env` with an
editor — **never** write `.env` via `Out-File`/`Set-Content` without explicit encoding; a BOM breaks the
Supabase CLI.

### 8. Announce

All users must log in again (new JWT secret). Say so before they discover it.

---

## Verification

Automated (Gate 1 in the script): row counts per table vs manifest · `pg_policies` public and storage
counts · migration-ledger row count · non-zero storage policies.

Manual smoke test — run against a dev build pointed at the target, without touching the main dev server:

```powershell
$env:VITE_SUPABASE_URL='<target url>'; $env:VITE_SUPABASE_ANON_KEY='<target anon key>'
npm run dev -- --port 5199 --strictPort   # process env beats .env
```

| # | Check | Proves |
|---|---|---|
| 1 | Login, including one 2FA account | `auth.users`, factors, JWT config |
| 2 | Personnel → competency **document preview** | Storage RLS + signed URLs — the policy path that silently breaks |
| 3 | Project → vessel detail, coverage computes | Application data integrity |
| 4 | Document control download | The private `documents` bucket |
| 5 | Avatar renders from the new host | Persisted-URL rewrite (Step 5) |
| 6 | Admin create-user, then delete that user | Edge functions + service role |
| 7 | Password-reset email arrives | SMTP config |
| 8 | `supabase functions list --project-ref <target>` shows 15 | Function deploy |
| 9 | Invoke `send-expiration-reminders` with a wrong `x-cron-secret` → 401 | Cron secret wired, no accidental mailout |

**Known non-defects — do not chase these:**

- A verification account outside the **Matrix** organisation sees a clean, silent `200 []` on projects and documents. `inspection_projects` SELECT policies are strict `organization_id` scoping with no super_admin override. That is correct behaviour. Any test account must be in the Matrix org.
- `3d-models` bucket objects return 400 via public URL. Pre-existing on both old and new projects; `vessels.model_3d_url` rows are stale.
- Legacy tables (`assets`, `inspections`, `vessels.asset_id`) coexist with the current `inspection_projects` model. Parity, not drift.

---

## Restore test record

**A restore test must be executed and recorded here.** It is the artifact an auditor asks for, and the
only thing that converts "we take backups" into "we can recover". Run one after any change to
`db-backup.ps1` / `db-restore.ps1`, and at least quarterly otherwise.

Procedure: take the newest backup set **via `-FromPublish`, not from the local cache**, run scenario **C**
above into a scratch project or `-LocalDocker`, and record the gate summary verbatim. Going through the
library is the point — it exercises the published layout, the copy-out step and Gate P at the same time,
and those are exactly the parts that are never touched by a normal week and therefore rot silently.
Delete the copied set from `_from-publish\` afterwards.

| Date | Backup set | Source | Target | Gates | Row counts match | Storage policies | Notes / outcome |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  | _(pending — first test not yet executed)_ |

---

## Escalation

| Situation | Action |
|---|---|
| Unsure whether data is actually lost | **Do not restore.** Stop the backup task, take a fresh dump of the current state as evidence, then investigate. A restore over a merely-suspected problem creates a real one. |
| Gate 0 fails (sha256 mismatch) | The backup set is corrupt or was tampered with. Fall back to the next-oldest set and treat the corrupt one as an incident. |
| Gate 1 row counts do not match | Do not go live. Re-run the restore into a clean target; if it reproduces, the dump is at fault — use an older set. |
| `storage=0` policies after restore | `storage-policies.sql` was missing or failed. The app will look fine and every download will fail. Regenerate policies from any surviving source and re-apply before going live. |
| Gate P fails (archive sha256 mismatch) | The published file does not match its manifest. Re-copy once in case the sync was mid-flight; if it reproduces, open **version history** on that file in SharePoint and take the previous version, or fall back to the previous published date. A mismatch that is not explained by an interrupted publish is an incident. |
| `-FromPublish` says the publish directory does not exist | OneDrive is not signed in on this machine, or the library is not synced here. Sign in and let it sync, or download the `.7z` and its `.manifest.json` from the SharePoint site in a browser and use `-BackupPath` against the downloaded archive. |
| Published sets are missing or encrypted | Do **not** run a backup first — that overwrites the same names. Use SharePoint **version history**, the **site recycle bin** (both stages, 93 days), or **Restore this library** (30 days). See "What the published copy does and does not protect against" above. |
| Gate S3 fails (archive sha256 mismatch) | The fetched object does not match its manifest. Re-fetch once in case the transfer was truncated; if it reproduces, treat it as an incident — the object may have been modified — and fall back to the previous partition or to a bucket **version** of the same key (`rclone lsf --s3-versions`). |
| `-FromS3` says the reader remote is not configured | Expected. The reader keys are kept offline on purpose, and the stage is dormant. Create `ndt-aws-restore` from the password manager ([aws-backup-setup.md](aws-backup-setup.md)), and delete it again once recovery is signed off. |
| The S3 object will not download (`InvalidObjectState`) | It is in Deep Archive. Issue a restore/thaw (`rclone backend restore`, or the console) and wait — hours, not minutes. Meanwhile check whether a newer set is still in Standard. |
| No usable backup set at all | Platform daily backups become the only path. If those are also gone, this is a data-loss incident: engage `docs/data-breach-response-plan.md` and the breach register — availability loss is a reportable event under GDPR Art. 32/33, not just a technical failure. |
| Recovery involves personal data exposure | Follow `docs/data-breach-response-plan.md`; the 72-hour clock runs from awareness, not from resolution. |
| Decrypted plaintext left on disk after a restore | Delete it and empty the recycle bin the same day. `data.sql` holds PII and password hashes. This includes `C:\Users\jonas\ndt-backups\_from-publish\<date>\` (or `_from-s3\<date>\`) — the script names the path in its closing warning. Check nothing plaintext ended up under a synced folder. |

Related: [backup-and-restore.md](backup-and-restore.md) · [aws-backup-setup.md](aws-backup-setup.md) ·
`docs/plans/2026-08-17-supabase-project-migration-runbook.md` (the proven sequence these scripts automate) ·
`docs/DEPLOYMENT_CHECKLIST.md` · `docs/data-breach-response-plan.md` · `docs/risk-register.md` (R-A2).
