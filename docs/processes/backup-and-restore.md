# Backup and Restore

**Owner:** Jonas · **Last reviewed:** 2026-08-31 · **Scripts:** `scripts/db-backup.ps1`, `scripts/db-restore.ps1`

For the *incident* procedure — "production is gone, what do I do" — see [disaster-recovery.md](disaster-recovery.md).
This document covers the routine: taking backups, knowing what is in them, and scheduling them.

---

## Purpose

Two independent layers protect the production Supabase project (`ntrgjqrbewbvwofupphn`, eu-west-2):

| Layer | What it is | Cadence | Where it lives | Role |
|---|---|---|---|---|
| **Platform backups** | Supabase's own automated daily backups | Daily | Supabase infrastructure | **Primary.** Fastest recovery, restores in place. |
| **Logical dumps** | `scripts/db-backup.ps1` — `supabase db dump` + storage mirror | Weekly | **Company OneDrive (SharePoint) library** (durable) + owner machine (cache) | **Secondary / off-platform.** Survives account loss, provider loss, operator error against the platform console, and loss of the backup machine itself. |

PITR is deliberately **not** enabled (owner decision, 2026-08-26): daily backups plus weekly logical dumps, revisited only if a client contract demands an RPO under 24 hours.

The logical dumps exist because a platform backup is only as available as the platform account holding it. They are the copy you still have when the Supabase organisation itself is the thing that went wrong.

### Local disk is a cache, not the backup

**Owner decision 2026-08-31: the durable copy of a logical set is a file in the Company OneDrive /
SharePoint library.** The AWS S3 destination decided on 2026-08-27 is **dormant** — never commissioned,
kept working as the ready alternative, and documented in [aws-backup-setup.md](aws-backup-setup.md).
The destination is:

```
C:\Users\jonas\OneDrive - Matrix\Matrix IMS - Documents\DB Backup\db\YYYY\ndt-backup-YYYY-MM-DD.7z
                                                                        \ndt-backup-YYYY-MM-DD.manifest.json
```

Override with `-PublishDir` or `$env:NDT_BACKUP_PUBLISH_DIR`. It is a path, not a credential, so no
secrets-file change was needed to turn the stage on. The year subfolder is cheap partitioning: it keeps
a shared library browsable and bounds the children per folder.

What remains on `C:\Users\jonas\ndt-backups\` is a *working cache*: the two most recent sets, kept so an
ordinary recovery does not have to go anywhere. They are pruned automatically once the published copy
for that day is confirmed present.

That changes what a failure means. Before, a backup that ran was a backup you had. Now, **a run that
ends in exit code 4 has produced a set that exists on one laptop only** — the same failure mode the
durable destination was built to remove. Read the exit code; it is the difference between "backed up"
and "copied to the machine most likely to be stolen".

#### The invariant: ciphertext only in the synced folder

**Plaintext dumps never enter a cloud-synced folder — not for a moment, not as a temp file.**

They stage in `C:\Users\jonas\ndt-backups\`, which is not synced, and the script still refuses to start
(exit 2) if the resolved output root is inside the repository or matches `OneDrive`. The publish step
runs only *after* the `.7z` is sealed **and** `7z t`-verified, at which point the plaintext day folder
has already been deleted. So the first and only bytes that ever appear under the publish directory are a
finished AES-256 archive and its metadata sidecar: no temp file, no partial manifest, no in-progress
marker, not even the year folder, which is created inside the same gate.

The invariant matters because **the library is shared**. Other members of the site can see the file and
its name. Confidentiality of production personal data therefore rests **entirely on the archive
passphrase** — the same reason encryption is a precondition and not a finishing touch. Anyone who can
open the file gets an opaque blob; anyone who has the passphrase gets every user's password hash.

Restore respects the invariant from the other end: `-FromPublish` **copies the archive out** of the
library into `C:\Users\jonas\ndt-backups\_from-publish\<date>\` before decrypting anything, because
extraction writes a plaintext folder beside the archive it extracts.

The rest of the rules the script enforces so this cannot go quietly wrong:

- The published archive is **re-hashed at the destination** against the manifest's `archive.sha256`. A
  half-finished copy or a sync-client corruption fails the run (exit 5) instead of passing for a backup.
  This is a real content hash, not the name-and-size check the S3 stage settles for — there the
  write-only identity has no `GetObject`; here the bytes can simply be read back.
- Local pruning happens **only after** a durable copy is verified. A failed publish prunes nothing.
- Destination pruning (keep 8) also runs only after a verified publish.
- A failed publish does **not** delete whatever partial file it left in the library — that is evidence,
  a restore would refuse it on the hash, and a re-run overwrites the same names.

#### What is *not* covered: storage objects

Platform backups cover **the database only**. The ~1.37 GB of storage object bytes — scan data,
certificate documents, images — were to be mirrored to S3, and that stage is dormant, so:

> **The storage objects currently have no second copy anywhere.** Losing the Supabase project loses
> every uploaded file, even though the database rows describing them would restore cleanly.

`rclone` is not installed on this machine, so no object-byte copy is taken at all today. Note the shape
of the trap before installing it: with the S3 stage dormant, storage bytes fall back to *local staging
inside the day folder*, which means they are sealed into the `.7z` and published with it — a ~1.4 GB
archive into the shared library every week. That may be exactly what you want, but decide it
deliberately rather than discovering it. This gap is tracked in `docs/risk-register.md` (R-A2).

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
| `storage/<bucket>/…` | `rclone copy --checksum` | Storage object **bytes**. **Not taken at all today** (rclone absent, S3 dormant) — see *Storage bytes* below and the gap note above. |
| `manifest.json` | script | sha256 + byte size + mtime per artifact, row counts per table, `pg_policies` counts, migration-ledger row count, per-bucket object counts |
| `backup.log` | script | Full run transcript |

Two files are written **beside** the archive rather than inside it:

| File | Purpose |
|---|---|
| `ndt-backup-<date>.7z` | The set, AES-256 with encrypted headers. This is what gets published. |
| `ndt-backup-<date>.manifest.json` | The **manifest sidecar**: the same `manifest.json` that is sealed inside the archive, *plus* an `archive` block carrying the `.7z`'s own sha256, byte size and encryption description. |

The sidecar exists because a manifest sealed inside an archive cannot describe the archive containing
it. It gives three things: the publish step can prove the copy it just made, a set retrieved later can
be proven byte-intact **before** the passphrase is spent on it, and there is a readable index of what any
given day's archive holds without decrypting it. It carries metadata only — table names, counts and
hashes; no rows, no credentials. It is published beside the archive, in the same shared library, so keep
it that way: metadata only.

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
| The OneDrive library **synced locally** | `C:\Users\jonas\OneDrive - Matrix\Matrix IMS - Documents\DB Backup` must exist. If it does not, the publish SKIPs with a banner and the run exits 4. The script never creates it: an absent path means OneDrive is not set up here, not "make a folder". |
| 7-Zip | Installed at `C:\Program Files\7-Zip\7z.exe`. Used for AES-256 archive encryption. **No archive means no publish** — encryption is a precondition of the durable stage, not an optional finish. Doubly so here: the destination is a shared library. |
| `rclone` **1.56+** | **Not installed.** Only needed for storage object bytes and the dormant S3 stage; the database publish does not use it. Read the storage-objects gap above before installing it. |
| AWS bucket + `ndt-aws` rclone remote | **Dormant** — not required. One-time setup, if it is ever re-armed: [aws-backup-setup.md](aws-backup-setup.md). |
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

# AWS DESTINATION for the DORMANT off-site stage. Keys are deliberately absent — see the note below.
# Leave these unset while the stage stays dormant; the run publishes to OneDrive regardless.
$env:NDT_BACKUP_S3_BUCKET  = "<AWS backup bucket name>"
$env:NDT_BACKUP_S3_REGION  = "<AWS bucket region>"

# The publish destination needs NO entry here — the script defaults to the owner's library.
# Set this only to point another machine somewhere else. It is a path, not a credential.
# $env:NDT_BACKUP_PUBLISH_DIR = "<path to the synced library folder>"

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
| **Durable** | `…\OneDrive - Matrix\Matrix IMS - Documents\DB Backup\db\YYYY\` | The backup. Encrypted archive + sidecar, kept 8 sets deep. |
| Cache | `C:\Users\jonas\ndt-backups\` | Two most recent sets, for convenience. Plaintext staging happens here and only here. |
| Dormant | `s3://<bucket>/ndt-backups/db/year=…/month=…/day=…/` | The alternative destination, never commissioned. |
| Dormant | `s3://<bucket>/ndt-backups/storage/<supabase-bucket>/…` | Object-byte mirror. **Not running — see the storage gap above.** |

S3 keys are Hive-partitioned (`year=`/`month=`/`day=`) for lifecycle rules and Athena; the OneDrive
layout uses a plain year folder instead, because the thing navigating it is a person in a browser.

`data.sql` contains production PII and password hashes, and the archive contains `data.sql`. On this
machine `C:\Users\jonas\` is **not** OneDrive-synced, but `C:\Users\jonas\OneDrive - Matrix\` and
`C:\Users\jonas\OneDrive\` are — and the repo itself lives under `OneDrive\Desktop\`. The script
therefore refuses (exit 2) if the resolved output root is inside the repository or matches `OneDrive`,
and refuses to publish if the publish directory overlaps the staging root or the repository. **Synced
means ciphertext; plaintext means unsynced. The two roots may never overlap.**

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
        → encrypt + verify archive → PUBLISH + re-hash at the destination
        → [S3 upload, only if configured] → prune destination → prune local
```

Nothing is deleted anywhere until a durable copy of *this* set has been made and proven.

#### Exit codes

| Code | Meaning | What to do |
|---|---|---|
| `0` | **Fully backed up.** Local set created, archive + manifest published and re-hash verified. | Nothing. |
| `1` | Completed with warnings, **and a durable copy exists**. | Read the warnings; decide whether they matter. |
| `2` | **Refused to start.** Configuration, credentials, or an unsafe output root. | Read the `[FAIL]` lines — they name the problem. Nothing was written. |
| `3` | A dump failed (no file, or an empty file). | Check Docker Desktop is running and the connection string still authenticates. |
| `4` | **Backed up LOCALLY ONLY.** No durable copy was made. | Read the SKIP banner — it lists exactly what is missing. This set exists on one machine. |
| `5` | **Publish (or the dormant S3 upload) FAILED.** The local set is intact and *nothing was pruned*, at either end. | Fix the destination and re-run. A re-run overwrites the same names. |

Codes 4 and 5 both mean "there is no durable copy of this set", and they are separated on purpose:
4 is a configuration state that persists until someone fixes it, 5 is usually transient.

**Exit 4 is now the AND of both durable hops.** A verified publish is a durable copy on its own, so the
S3 stage being dormant and unconfigured no longer makes a run "locally only" — it prints an ordinary
skip line, not a warning, and does not affect the exit code.

#### Useful switches

`-SkipStorage` (database only) · `-SkipPublish` (no durable copy — exits 4 unless S3 is configured) ·
`-NoEncrypt` (leaves plaintext, and therefore **also disables the publish**) ·
`-PublishDir <path>` (override the destination) · `-PublishRetentionCount <n>` (default 8) ·
`-RetentionCount <n>` (default 4 — local sets kept when there is *no* durable copy) ·
`-LocalCacheCount <n>` (default 2 — local sets kept once a durable copy is verified) ·
`-SkipUpload` / `-AwsRemote` / `-AwsBucket` / `-AwsRegion` / `-KeyPrefix` (the dormant S3 stage) ·
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

**rclone is not installed on this machine.** The database publish does not need it, so a run still
reaches exit 0 — but the dumps carry `storage.objects` *metadata rows* and not the files, and with the
S3 mirror dormant **that is the whole storage-object gap described above.** The 2026-08-17 inventory
measured ~1.37 GB across 8 buckets (`scan-data` 1094 MB, `documents` 126 MB, `scan-images` 97 MB).
Fallback for the storage bytes alone: Supabase's official storage-migration Node script, which
re-uploads via the API using service keys on both sides and needs no S3 keys.

Before installing rclone, re-read the gap note: with S3 dormant the bytes stage locally and end up
*inside the published archive*.

### 3b. Publish to the OneDrive library

After the archive is sealed and `7z t`-verified — and only then:

```
copy   C:\Users\jonas\ndt-backups\ndt-backup-<date>.7z
    -> …\DB Backup\db\<YYYY>\ndt-backup-<date>.7z
copy   C:\Users\jonas\ndt-backups\ndt-backup-<date>.manifest.json
    -> …\DB Backup\db\<YYYY>\ndt-backup-<date>.manifest.json
verify Get-FileHash on the PUBLISHED .7z  ==  archive.sha256 in the manifest
```

The verification is the point. A copy that half-finishes, or a sync client that truncates a file, is
indistinguishable from a good backup by size alone; re-reading the published bytes and hashing them is
the only thing that separates "the file is there" from "the file is right". A mismatch is exit 5, and
nothing is pruned at either end.

Then destination retention: **keep 8 published sets** (two months of weeklies), pruned as whole dated
units — archive and sidecar together. The library has no lifecycle rules, so the script owns expiry
there. Deleting is acceptable *because* OneDrive version history and the recycle bin sit underneath it;
that is the same reason the script may never delete in S3, where the write-only identity has no delete
right by design.

### 3c. Off-site upload to S3 — dormant

Kept working, not commissioned (owner decision 2026-08-31). It still runs first-class whenever the
destination is configured, and it still refuses to send anything that is not a sealed, verified archive.
The commands, for the day it is re-armed:

```
rclone copyto <root>\ndt-backup-<date>.7z            ndt-aws,…:<bucket>/ndt-backups/db/year=YYYY/month=MM/day=DD/ndt-backup-<date>.7z            --no-check-dest
rclone copyto <root>\ndt-backup-<date>.manifest.json ndt-aws,…:<bucket>/ndt-backups/db/year=YYYY/month=MM/day=DD/ndt-backup-<date>.manifest.json --no-check-dest
rclone lsjson                                        ndt-aws,…:<bucket>/ndt-backups/db/year=YYYY/month=MM/day=DD
```

The passphrase appears in none of them: it is only ever an argument to the local `7z` process.

**Verification there is a listing check — name and byte size — not a content hash.** That is a
consequence of the write-only credentials, which have no `GetObject` and therefore cannot read the
object back to hash it. Content integrity is proven at the other end: `db-restore.ps1 -FromS3` re-hashes
the fetched archive against `archive.sha256` in the manifest sidecar before using it. Widening the
backup policy to allow `rclone check` would trade a real security control for a redundant one. The
OneDrive publish has no such constraint, which is why it hashes properly.

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

### 5. Retention

Retention depends on whether a durable copy exists, because the answer changes what local disk *is*:

| Situation | Sets kept locally | Sets kept in the library | Reasoning |
|---|---|---|---|
| Publish verified | **2** (`-LocalCacheCount`) | **8** (`-PublishRetentionCount`) | Local is a cache; the history lives in the library. |
| Publish skipped (exit 4) | **4** (`-RetentionCount`) | untouched | Local is the only durable store this run, so keep the historic depth. |
| Publish failed (exit 5) | **everything** | untouched | Never trade a set on disk for a copy that is not there. Pruning is suppressed at both ends. |

A set is identified by its date key, so the `.7z`, the `.manifest.json` sidecar and any plaintext folder
for the same date are pruned together as one unit, in both places. Each deletion is logged.

Eight weekly sets is roughly two months of history. Deletions in the library are recoverable through
**OneDrive version history and the site recycle bin** — check there first if a set disappears
unexpectedly, before assuming it was never published.

**This script never deletes anything in S3.** Objects would age out through the bucket's lifecycle rules
(see [aws-backup-setup.md](aws-backup-setup.md)) if that stage were ever commissioned.

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

1. **Exit code `0`.** Not "it finished" — `0`. A `4` or `5` means there is no durable copy of that set,
   and `1` means warnings you must actually read.
2. **`ndt-backup-<date>.manifest.json` exists** beside the archive and lists 6 artifacts, each with a
   sha256 and a non-zero byte size, plus an `archive` block with the `.7z`'s own sha256.
3. **Row counts look live.** Compare `database.rowCounts` against the previous week's sidecar.
   A table that dropped to zero is an incident, not a backup.
   The 2026-08-17 baseline for scale: 20 `auth.users`, 20 `profiles`, 6 `organizations`,
   708 `employee_competencies`, 6 `inspection_projects`, 528 `activity_log`, 416 `storage.objects`.
4. **`database.policyCounts.storage` is non-zero.** Zero means `storage-policies.sql` did not
   capture and a restore from this set would have no storage RLS.
5. **The file is really in the library, from somewhere that is not this laptop.** Monthly is enough, but
   do it with your own eyes rather than trusting the exit code forever: open the SharePoint site in a
   browser (not the synced folder — that is the same machine that wrote it) and confirm both files under
   `DB Backup/db/<YYYY>/` for a recent date. A sync client that has silently stopped uploading looks
   perfect locally.

A backup is only proven by a restore. The standing DR test is recorded in
[disaster-recovery.md](disaster-recovery.md) — run it after any change to these scripts, and at least
quarterly otherwise.

---

## Escalation

| Symptom | First action |
|---|---|
| Script exits 2 | Configuration, not failure. Read the two `[FAIL]` lines — it names the missing credential or the rejected output path. |
| Script exits 3 | A dump produced no file or an empty file. Check Docker Desktop is running and the connection string still authenticates (DB passwords get rotated). |
| **Script exits 4** | **There is no durable copy of this set.** The SKIP banner names what is missing — usually the publish directory absent (OneDrive not set up or the library not synced), or no verified archive because the passphrase or 7-Zip is missing. Treat a *recurring* 4 as an open risk, not a nuisance. |
| **Script exits 5** | The publish was attempted and failed; the local set is intact and nothing was pruned, at either end. Check the library is synced and has space, then re-run — a re-run overwrites the same names. A **sha256 mismatch** at the destination is not a retry-and-hope: it means the bytes that arrived are not the bytes that were sealed. |
| `rclone` warning every week | Storage object bytes are unprotected — the standing gap described above. Installing rclone folds them into the published archive; read that note first. |
| Plaintext warning | The set is unencrypted on disk **and was therefore not published**. That is the invariant working: plaintext never enters the library. Encrypt manually (above) the same day, then re-run so a durable copy exists. |
| Storage policy count is 0 | Docker/psql path failed. Re-run; a set without `storage-policies.sql` is not restorable to a working app. |
| Scheduled task has not run for two weeks | Machine sleep or a rotated password. Re-run manually, then fix the schedule. |
| Suspected data loss in production | Stop backing up over the evidence — go to [disaster-recovery.md](disaster-recovery.md). Platform backups are the primary path; the logical set is the fallback. |

Related: [aws-backup-setup.md](aws-backup-setup.md) (the dormant S3 alternative) ·
[disaster-recovery.md](disaster-recovery.md) ·
`docs/plans/2026-08-17-supabase-project-migration-runbook.md` (the proven dump/restore sequence
this automates) · `docs/DEPLOYMENT_CHECKLIST.md` (backup strategy checklist) ·
`docs/risk-register.md` (R-A2).
