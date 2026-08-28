# Backup and Restore

**Owner:** Jonas · **Last reviewed:** 2026-08-27 · **Scripts:** `scripts/db-backup.ps1`, `scripts/db-restore.ps1`

For the *incident* procedure — "production is gone, what do I do" — see [disaster-recovery.md](disaster-recovery.md).
This document covers the routine: taking backups, knowing what is in them, and scheduling them.

---

## Purpose

Two independent layers protect the production Supabase project (`ntrgjqrbewbvwofupphn`, eu-west-2):

| Layer | What it is | Cadence | Where it lives | Role |
|---|---|---|---|---|
| **Platform backups** | Supabase's own automated daily backups | Daily | Supabase infrastructure | **Primary.** Fastest recovery, restores in place. |
| **Logical dumps** | `scripts/db-backup.ps1` — `supabase db dump` + storage mirror | Weekly | **AWS S3, owner's account** (durable) + owner machine (cache) | **Secondary / off-platform.** Survives account loss, provider loss, operator error against the platform console, and loss of the backup machine itself. |

PITR is deliberately **not** enabled (owner decision, 2026-08-26): daily backups plus weekly logical dumps, revisited only if a client contract demands an RPO under 24 hours.

The logical dumps exist because a platform backup is only as available as the platform account holding it. They are the copy you still have when the Supabase organisation itself is the thing that went wrong.

### Local disk is a cache, not the backup

**Since 2026-08-27 the durable copy of a logical set is an object in an S3 bucket in the owner's own AWS
account.** What remains on `C:\Users\jonas\ndt-backups\` is a *working cache*: the two most recent sets,
kept so an ordinary recovery does not have to go to the network. They are pruned automatically once the
off-site copy for that day is confirmed present.

That changes what a failure means. Before, a backup that ran was a backup you had. Now, **a run that
ends in exit code 4 has produced a set that exists on one laptop only** — the same failure mode the
off-site stage was built to remove. Read the exit code; it is the difference between "backed up" and
"copied to the machine most likely to be stolen".

The rules the script enforces so this cannot go quietly wrong:

- The `.7z` is sealed and verified **before** anything is uploaded. A set that cannot be encrypted is
  never uploaded — plaintext PII does not go to a bucket, ever.
- Local pruning happens **only after** the upload is verified. A failed upload prunes nothing.
- The backup credentials are **write-only** (`PutObject` + `ListBucket`). The script issues no deletes
  and no overwrites; expiry is done server-side by lifecycle rules.
- Restoring uses a **different, offline** set of read credentials.

One-time console setup — bucket, lifecycle rules, both IAM policies, rclone — is in
[aws-backup-setup.md](aws-backup-setup.md).

---

## What a backup set contains

`scripts/db-backup.ps1` produces one dated set. The five dumps are the sequence proven end-to-end
during the 2026-08-17 project migration (see `docs/plans/2026-08-17-supabase-project-migration-runbook.md`).

| Artifact | Produced by | Carries |
|---|---|---|
| `roles.sql` | `supabase db dump --role-only` | Role grants and per-role settings (`statement_timeout`: anon 3s, authenticated 8s) |
| `schema.sql` | `supabase db dump` | Tables, functions, triggers, sequences, **RLS policies on `public`** |
| `data.sql` | `supabase db dump --use-copy --data-only` | All rows, including `auth.users`, password hashes, 2FA factors, and `storage.objects` metadata |
| `history.sql` | `supabase db dump --schema supabase_migrations` | Migration-ledger **DDL only** |
| `history-data.sql` | `... --use-copy --data-only --schema supabase_migrations` | Migration-ledger **rows** |
| `storage-policies.sql` | catalog query (see below) | `storage.*` RLS policies |
| `storage/<bucket>/…` | `rclone copy --checksum` | Storage object **bytes**. Goes **straight to S3** when the off-site stage is configured, so it is *not* inside the archive — see *Storage bytes* below. |
| `manifest.json` | script | sha256 + byte size + mtime per artifact, row counts per table, `pg_policies` counts, migration-ledger row count, per-bucket object counts |
| `backup.log` | script | Full run transcript |

Two files are written **beside** the archive rather than inside it:

| File | Purpose |
|---|---|
| `ndt-backup-<date>.7z` | The set, AES-256 with encrypted headers. This is what goes off-site. |
| `ndt-backup-<date>.manifest.json` | The **manifest sidecar**: the same `manifest.json` that is sealed inside the archive, *plus* an `archive` block carrying the `.7z`'s own sha256, byte size and encryption description. |

The sidecar exists because a manifest sealed inside an archive cannot describe the archive containing
it. It gives two things: a set fetched from S3 can be proven byte-intact **before** the passphrase is
spent on it, and there is a readable index of what any given day's archive holds without decrypting it.
It carries metadata only — table names, counts and hashes; no rows, no credentials.

### Two facts the script exists to protect

1. **`history-data.sql` is not optional.** `history.sql` is DDL-only. Restoring it alone gives you a migration ledger with zero rows, and the next `supabase db push` will try to replay every migration ever written. Verified 2026-08-17.

2. **Storage policies do not survive a CLI dump.** The 2026-08-17 dry run restored 143 `public` policies and **0 of 33** `storage` policies — the CLI excludes managed-schema DDL. During the migration this was fixed by regenerating the DDL from the still-live source project. In a real disaster there is no live source to regenerate from, so `db-backup.ps1` captures it **at backup time** into `storage-policies.sql`, using the runbook's catalog query:

   ```sql
   select 'create policy ' || quote_ident(policyname) || ' on storage.' || quote_ident(tablename)
     || case when permissive = 'RESTRICTIVE' then ' as restrictive' else '' end
     || ' for ' || lower(cmd) || ' to ' || array_to_string(roles, ', ')
     || coalesce(' using (' || qual || ')', '')
     || coalesce(' with check (' || with_check || ')', '') || ';'
   from pg_policies where schemaname = 'storage' order by tablename, policyname;
   ```

   Without this file, a restored project has no storage RLS at all and every signed-URL path in the app breaks.

### What a backup set does **not** contain

These are recreated by hand or from the repo. They are listed here so nobody discovers the gap mid-incident.

- **Edge functions** — deploy from the repo (`supabase/functions/`, 15 functions).
- **Edge-function secrets** — `RESEND_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`. Write-only on Supabase; plaintext lives only in the owner's records.
- **Auth dashboard config** — SMTP, email templates (repo `email-templates/` is the source of truth), site URL, redirect URLs, rate limits, providers.
- **pg_cron jobs** — the `cron` schema is excluded from dumps. One job exists: `send-expiration-reminders-daily`, `30 7 * * *`.
- **API keys and JWT secret** — new project means new values everywhere, and **every user must log in again**.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Windows PowerShell 5.1 | The scripts are 5.1-compatible: no `&&`/`\|\|` chains, no ternary, explicit encoding on every file write. |
| Supabase CLI | On PATH. Used with `--db-url` only — the scripts never `link`, `push` or `deploy`. |
| Docker Desktop **running** | There is no local `psql`. Dumps use the CLI's dockerized pg tools; queries and restores use the `postgres:17` image. First run pulls that image. |
| `rclone` **1.56+** | **Not currently installed — this is now the blocker for the whole off-site stage, not just storage bytes.** Without it the run backs up locally only and exits 4. 1.56 is the minimum because the scripts use connection-string parameters. |
| 7-Zip | Installed at `C:\Program Files\7-Zip\7z.exe`. Used for AES-256 archive encryption. **No archive means no upload** — encryption is a precondition of the off-site stage, not an optional finish. |
| AWS bucket + `ndt-aws` rclone remote | One-time setup: [aws-backup-setup.md](aws-backup-setup.md). Until it exists, every run exits 4. |
| Secrets file | Outside the repo. See below. |

### Secrets file

Credentials are **never** stored in this repository and never read from it. `db-backup.ps1` dot-sources
`C:\Users\jonas\supabase-backup\secrets.ps1` (override with `-SecretsFile`), mirroring the pattern the
migration used. If neither the file nor the equivalent parameters supply a connection string, the script
refuses to start and exits 2.

Create it with an editor — **never** with `Out-File`/`Set-Content` without an explicit encoding, and never
as UTF-8-with-BOM; a BOM has broken a CLI in this repo before.

```powershell
# C:\Users\jonas\supabase-backup\secrets.ps1  — NEVER COMMIT
$env:NDT_BACKUP_DB_URL     = "postgresql://postgres.<project-ref>:<url-encoded-password>@<session-pooler-host>:5432/postgres"
$env:NDT_BACKUP_S3_KEY     = "<SUPABASE Storage S3 access key id>"
$env:NDT_BACKUP_S3_SECRET  = "<SUPABASE Storage S3 secret access key>"
$env:NDT_BACKUP_PASSPHRASE = "<archive passphrase>"

# AWS DESTINATION for the off-site stage. Keys are deliberately absent — see the note below.
$env:NDT_BACKUP_S3_BUCKET  = "<AWS backup bucket name>"
$env:NDT_BACKUP_S3_REGION  = "<AWS bucket region>"

# Restore targets (used by db-restore.ps1) — a SCRATCH project, not production
$env:NDT_RESTORE_TARGET_DB_URL = "postgresql://postgres.<scratch-ref>:<password>@<session-pooler-host>:5432/postgres"
$env:NDT_RESTORE_S3_KEY        = "<scratch project S3 access key id>"
$env:NDT_RESTORE_S3_SECRET     = "<scratch project S3 secret access key>"
```

- Use the **session pooler string, port 5432** (IPv4-safe) from the project's Connect dialog. URL-encode special characters in the password.
- Supabase S3 access keys: Dashboard → Storage → S3 access keys.
- The archive passphrase is what stands between a stolen laptop and every user's password hash. Store it in the password manager, not on the machine.

> **The `NDT_BACKUP_S3_*` names span two different services — read them carefully.**
> `_KEY` / `_SECRET` are the **Supabase source** storage keys. `_BUCKET` / `_REGION` describe the
> **AWS destination**. The AWS access keys are *not* in this file at all: they live only in the
> `ndt-aws` rclone remote, so there is exactly one credential store for the off-site stage. The
> **restore-reader** AWS keys are not on this machine at all — see
> [aws-backup-setup.md](aws-backup-setup.md).

### Where backups live, and why

| | Path / location | Role |
|---|---|---|
| Durable | `s3://<bucket>/ndt-backups/db/year=YYYY/month=MM/day=DD/` | The backup. Versioned, server-side encrypted, lifecycle-managed. |
| Durable | `s3://<bucket>/ndt-backups/storage/<supabase-bucket>/…` | Object-byte mirror of Supabase storage. |
| Cache | `C:\Users\jonas\ndt-backups\` | Two most recent sets, for convenience. |

Keys are Hive-partitioned (`year=`/`month=`/`day=`) so a lifecycle rule, an inventory report or an
Athena query can address one day without scanning the bucket, and so a human can navigate to a date in
the console without searching.

`data.sql` contains production PII and password hashes. The local cache must stay off cloud sync and out
of git. On this machine `C:\Users\jonas\` is **not** OneDrive-synced, but `C:\Users\jonas\OneDrive - Matrix\`
and `C:\Users\jonas\OneDrive\` are — and the repo itself lives under `OneDrive\Desktop\`. The script
therefore refuses (exit 2) if the resolved output root is inside the repository or matches `OneDrive`.

---

## Steps

### 1. Dry run first

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1 -DryRun
```

Prints the resolved plan — paths, detected tooling, every command it would run, what retention would
prune — and exits 0 **without creating, writing or deleting anything**. Connection strings are masked.
Missing credentials are reported as blockers rather than crashing, so the plan is reviewable on a machine
that holds no secrets.

### 2. Real run

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1
```

Order of operations, and the ordering is load-bearing:

```
5 dumps → storage-policy capture → state capture → storage bytes → manifest
        → encrypt + verify archive → UPLOAD + verify remote → prune local
```

Nothing is deleted locally until the off-site copy has been confirmed present.

#### Exit codes

| Code | Meaning | What to do |
|---|---|---|
| `0` | **Fully backed up.** Local set created, archive + manifest uploaded and verified. | Nothing. |
| `1` | Completed with warnings, **and the off-site copy exists**. | Read the warnings; decide whether they matter. |
| `2` | **Refused to start.** Configuration, credentials, or an unsafe output root. | Read the two `[FAIL]` lines — they name the problem. Nothing was written. |
| `3` | A dump failed (no file, or an empty file). | Check Docker Desktop is running and the connection string still authenticates. |
| `4` | **Backed up LOCALLY ONLY.** The off-site stage was skipped. | Read the SKIP banner — it lists exactly what is missing. This set exists on one machine. |
| `5` | **Off-site upload FAILED.** The local set is intact and *nothing was pruned*. | Fix the destination and re-run. A re-run writes the same keys; versioning absorbs the repeat. |

Codes 4 and 5 both mean "there is no off-site copy of this set", and they are separated on purpose:
4 is a configuration state that persists until someone fixes it, 5 is usually transient.

#### Useful switches

`-SkipStorage` (database only) · `-SkipUpload` (local only — deliberately exits 4) ·
`-NoEncrypt` (leaves plaintext, and therefore **also disables the upload**) ·
`-RetentionCount <n>` (default 4 — local sets kept when there is *no* off-site copy) ·
`-LocalCacheCount <n>` (default 2 — local sets kept once the off-site copy is verified) ·
`-AwsRemote` / `-AwsBucket` / `-AwsRegion` / `-KeyPrefix` (override the destination) ·
`-DbUrl` / `-S3AccessKey` / `-S3SecretKey` (bypass the secrets file) · `-OutputRoot <path>`.

### 3. Storage bytes

Objects are copied per bucket from the Supabase S3-compatible endpoint. When the off-site destination is
configured this is a **direct remote-to-remote transfer** — the ~1.37 GB never lands on local disk:

```
rclone copy ndtsupa:<bucket> ndt-aws,no_check_bucket=true,no_head=true,region=<region>:<bucket>/ndt-backups/storage/<bucket> --checksum
```

Without the destination configured (or with `-SkipUpload`) it falls back to the historic local copy into
`<set>\storage\<bucket>`.

Supabase credentials are passed through `RCLONE_CONFIG_NDTSUPA_*` environment variables and cleared
afterwards, so they never appear on a command line or in an `rclone.conf`. The endpoint is
`https://<project-ref>.storage.supabase.co/storage/v1/s3`, region `eu-west-2`.

> **Why `RCLONE_CONFIG_NDTSUPA_*` and not the simpler `RCLONE_S3_*`.** `RCLONE_S3_*` are *backend*
> variables: they outrank the rclone config file for **every** S3 remote in the process. The direct
> transfer names two S3 remotes at once, so `RCLONE_S3_ACCESS_KEY_ID` would silently override the AWS
> remote's stored credentials and the upload would authenticate to AWS with Supabase keys. The
> `RCLONE_CONFIG_<REMOTE>_*` form is scoped to one remote and cannot leak across. Do not "simplify"
> this back.

**`copy`, never `sync`.** An object deleted in Supabase persists in the S3 mirror indefinitely. That is
intentional: the backup credentials have no delete rights, and an off-site backup that mirrors deletions
is one `DELETE` away from being useless. See [aws-backup-setup.md](aws-backup-setup.md) for how erasure
requests are handled against the mirror.

**rclone is not installed on this machine yet.** Until it is, the off-site stage cannot run at all —
every run exits 4, and the dumps carry `storage.objects` *metadata rows* but not the files. The
2026-08-17 inventory measured ~1.37 GB across 8 buckets (`scan-data` 1094 MB, `documents` 126 MB,
`scan-images` 97 MB). Fallback for the storage bytes alone, if rclone stays unavailable: Supabase's
official storage-migration Node script, which re-uploads via the API using service keys on both sides
and needs no S3 keys — but it does not solve the off-site problem, only the object-bytes one.

### 3b. Off-site upload

After the archive is sealed and verified:

```
rclone copyto <root>\ndt-backup-<date>.7z            ndt-aws,…:<bucket>/ndt-backups/db/year=YYYY/month=MM/day=DD/ndt-backup-<date>.7z            --no-check-dest
rclone copyto <root>\ndt-backup-<date>.manifest.json ndt-aws,…:<bucket>/ndt-backups/db/year=YYYY/month=MM/day=DD/ndt-backup-<date>.manifest.json --no-check-dest
rclone lsjson                                        ndt-aws,…:<bucket>/ndt-backups/db/year=YYYY/month=MM/day=DD
```

The passphrase appears in none of them: it is only ever an argument to the local `7z` process.

**Verification is a listing check — name and byte size — not a content hash.** That is a consequence of
the write-only credentials, which have no `GetObject` and therefore cannot read the object back to hash
it. Content integrity is proven at the other end: `db-restore.ps1 -FromS3` re-hashes the fetched archive
against `archive.sha256` in the manifest sidecar before using it. Widening the backup policy to allow
`rclone check` would trade a real security control for a redundant one.

Three rclone options are required rather than preferred, and a manual command must set them too:
`no_check_bucket=true` (no `HeadBucket`/`CreateBucket` rights), `no_head=true` (rclone's default
post-upload `HEAD` would 403), and `--no-check-dest` (the destination-exists probe 403s once the key is
present, which would break every same-day re-run).

### 4. Encryption

If 7-Zip is present and `NDT_BACKUP_PASSPHRASE` is set, the day's folder is compressed to
`ndt-backup-<date>.7z` with AES-256 and encrypted headers (`-mhe=on`, so filenames are hidden too). The
archive is **verified** (`7z t`) before the plaintext folder is deleted.

If 7-Zip is missing, or the passphrase is unset, the script **does not install anything and does not
encrypt with an empty password**. It leaves the plaintext set in place and prints a loud banner. The
manual step in that case:

```powershell
& 'C:\Program Files\7-Zip\7z.exe' a -t7z -mhe=on -p"<passphrase>" `
    'C:\Users\jonas\ndt-backups\ndt-backup-<date>.7z' 'C:\Users\jonas\ndt-backups\<date>\*'
& 'C:\Program Files\7-Zip\7z.exe' t -p"<passphrase>" 'C:\Users\jonas\ndt-backups\ndt-backup-<date>.7z'
# only after the test passes:
Remove-Item -LiteralPath 'C:\Users\jonas\ndt-backups\<date>' -Recurse -Force
```

Do not leave a plaintext set sitting on disk over a weekend.

### 5. Local retention

Retention now depends on whether a durable copy exists off-site, because the answer changes what local
disk *is*:

| Situation | Sets kept locally | Reasoning |
|---|---|---|
| Upload verified | **2** (`-LocalCacheCount`) | Local is a cache. The history lives in S3 under lifecycle management. |
| Upload skipped (exit 4) | **4** (`-RetentionCount`) | Local is the only durable store this run, so keep the historic depth. |
| Upload failed (exit 5) | **everything** | Never trade a local set for a remote copy that is not there. Pruning is suppressed entirely. |

A set is identified by its date key, so the `.7z`, the `.manifest.json` sidecar and any plaintext folder
for the same date are pruned together as one unit. Each deletion is logged.

**This script never deletes anything in S3.** Objects age out through the lifecycle rules on the bucket
(see [aws-backup-setup.md](aws-backup-setup.md)): the `db` prefix transitions to Deep Archive at 30 days
and expires at 90; the `storage` mirror prefix has no expiry at all.

---

## Scheduling

Weekly, off-peak, on an off-minute so the run does not collide with anything else that fires on the hour.
**Do not register this from an agent session** — run it yourself, in an elevated `cmd`:

```
schtasks /Create /TN "NDT Suite weekly DB backup" /SC WEEKLY /D SUN /ST 02:47 /RL HIGHEST /F ^
  /TR "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"C:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\scripts\db-backup.ps1\""
```

Then confirm and test:

```
schtasks /Query /TN "NDT Suite weekly DB backup" /V /FO LIST
schtasks /Run   /TN "NDT Suite weekly DB backup"
```

Honest constraints:

- **The machine must be awake and Docker Desktop must be running at 02:47.** If it sleeps, the run is
  missed silently. Check `manifest.json`'s `createdAtUtc` weekly, or add `/RU` + stored credentials and
  wake timers if that proves unreliable.
- The task runs as the logged-on owner, because it needs the secrets file and the Docker context.
- **Backup automation deliberately stays off GitLab CI.** CI holds no Supabase credentials, and that is a
  control worth keeping — running from the owner machine leaves the blast radius unchanged.

---

## Verification

After any run — scheduled or manual — check all five. The sidecar manifest makes checks 2–4 possible
without decrypting anything.

1. **Exit code `0`.** Not "it finished" — `0`. A `4` or `5` means there is no off-site copy of that set,
   and `1` means warnings you must actually read.
2. **`ndt-backup-<date>.manifest.json` exists** beside the archive and lists 6 artifacts, each with a
   sha256 and a non-zero byte size, plus an `archive` block with the `.7z`'s own sha256.
3. **Row counts look live.** Compare `database.rowCounts` against the previous week's sidecar.
   A table that dropped to zero is an incident, not a backup.
   The 2026-08-17 baseline for scale: 20 `auth.users`, 20 `profiles`, 6 `organizations`,
   708 `employee_competencies`, 6 `inspection_projects`, 528 `activity_log`, 416 `storage.objects`.
4. **`database.policyCounts.storage` is non-zero.** Zero means `storage-policies.sql` did not
   capture and a restore from this set would have no storage RLS.
5. **The object is really in the bucket.** Monthly is enough, but do it with your own eyes rather than
   trusting the exit code forever: open the console at
   `ndt-backups/db/year=YYYY/month=MM/day=DD/` and confirm both files for a recent date.

A backup is only proven by a restore. The standing DR test is recorded in
[disaster-recovery.md](disaster-recovery.md) — run it after any change to these scripts, and at least
quarterly otherwise.

---

## Escalation

| Symptom | First action |
|---|---|
| Script exits 2 | Configuration, not failure. Read the two `[FAIL]` lines — it names the missing credential or the rejected output path. |
| Script exits 3 | A dump produced no file or an empty file. Check Docker Desktop is running and the connection string still authenticates (DB passwords get rotated). |
| **Script exits 4** | **There is no off-site copy of this set.** The SKIP banner names what is missing — usually rclone absent, the `ndt-aws` remote not configured, or `NDT_BACKUP_S3_BUCKET` unset. Work through [aws-backup-setup.md](aws-backup-setup.md). Treat a *recurring* 4 as an open risk, not a nuisance. |
| **Script exits 5** | The upload was attempted and failed; the local set is intact and nothing was pruned. Re-run once the destination is reachable. If it fails on `AccessDenied`, check the IAM policy against the troubleshooting table in [aws-backup-setup.md](aws-backup-setup.md). |
| `rclone` warning every week | Storage bytes are unprotected **and** the whole off-site stage is down. Install rclone (1.56+); do not let this become the normal state. |
| Plaintext warning | The set is unencrypted on disk **and was therefore not uploaded**. Encrypt manually (above) the same day, then re-run so an off-site copy exists. |
| Storage policy count is 0 | Docker/psql path failed. Re-run; a set without `storage-policies.sql` is not restorable to a working app. |
| Scheduled task has not run for two weeks | Machine sleep or a rotated password. Re-run manually, then fix the schedule. |
| Suspected data loss in production | Stop backing up over the evidence — go to [disaster-recovery.md](disaster-recovery.md). Platform backups are the primary path; the logical set is the fallback. |

Related: [aws-backup-setup.md](aws-backup-setup.md) (one-time off-site setup) ·
[disaster-recovery.md](disaster-recovery.md) ·
`docs/plans/2026-08-17-supabase-project-migration-runbook.md` (the proven dump/restore sequence
this automates) · `docs/DEPLOYMENT_CHECKLIST.md` (backup strategy checklist) ·
`docs/risk-register.md` (R-A2).
