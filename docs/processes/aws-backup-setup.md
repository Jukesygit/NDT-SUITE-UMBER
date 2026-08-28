# AWS Off-Site Backup — One-Time Setup

**Owner:** Jonas · **Last reviewed:** 2026-08-27 · **Scripts:** `scripts/db-backup.ps1`, `scripts/db-restore.ps1`

This is the **one-time console runbook** that turns the off-site stage on. Everything here happens in
the AWS console and in `rclone config` on the owner machine; nothing in it is automated, and nothing in
it belongs in this repository.

Routine operation lives in [backup-and-restore.md](backup-and-restore.md). The incident procedure lives
in [disaster-recovery.md](disaster-recovery.md).

> **No value from this runbook may be committed.** Bucket name, account id, access keys and the archive
> passphrase are placeholders here and stay placeholders. The real values live in the owner's password
> manager, in `C:\Users\jonas\supabase-backup\secrets.ps1`, and in `rclone.conf` — all outside git.

---

## Why this exists

Before this stage, every logical backup existed on exactly one laptop. That is not a backup, it is a
second copy in the same room: one theft, one disk failure, one ransomware run and the off-platform
recovery path is gone at the same moment as everything else.

After this stage the durable copy is an object in the owner's own AWS account, in a different provider
from the one hosting production. **Local disk becomes a cache** — two recent sets kept for convenience,
pruned automatically once the off-site copy for the day is verified.

Three properties are deliberate and interlock; changing one breaks the reasoning behind the others.

| Property | What it means | Why |
|---|---|---|
| **Client-side encryption first** | The `.7z` is AES-256 sealed and `7z t`-verified *before* upload. If it cannot be sealed, it is not uploaded. | The bucket holds `data.sql`: production PII and password hashes. Server-side encryption protects it from someone reading AWS disks; it does not protect it from anyone who obtains the object. Only the passphrase does. |
| **Write-only backup credentials** | The identity used weekly can `PutObject` and `ListBucket`. It cannot read an object back, cannot delete, cannot overwrite-and-verify. | An attacker on the backup machine gets the ability to *add* objects, not to read the archive history or destroy it. This is the control that makes the off-site copy meaningful against ransomware. |
| **Deletion belongs to the server** | The scripts never delete anything in S3. Lifecycle rules expire objects; versioning keeps the previous state. | A compromised backup machine cannot issue a delete it does not have rights for. |

**Consequence, stated plainly:** because the writer cannot read, a restore needs a *second, separate*
identity. Its keys are **kept offline** — not in `rclone.conf`, not in the secrets file, not on the
backup machine. They are configured during an incident and removed afterwards.

---

## Placeholders used below

Substitute your real values as you go. They never come back into this file.

| Placeholder | Meaning |
|---|---|
| `<BUCKET-NAME>` | The backup bucket, globally unique across all of AWS. Something unguessable — not the company name. |
| `<REGION>` | Bucket region, e.g. the same region family as production. |
| `<AWS-ACCOUNT-ID>` | 12-digit account id. |
| `<WRITER-ACCESS-KEY-ID>` / `<WRITER-SECRET-ACCESS-KEY>` | Credentials for the `ndt-backup-writer` IAM user. |
| `<READER-ACCESS-KEY-ID>` / `<READER-SECRET-ACCESS-KEY>` | Credentials for the `ndt-restore-reader` IAM user. **Kept offline.** |

---

## Step 1 — Create the bucket

Console → S3 → **Create bucket**.

| Setting | Value | Why |
|---|---|---|
| Bucket name | `<BUCKET-NAME>` | Names are globally visible in error messages and DNS. Do not encode the client or company name. |
| Region | `<REGION>` | Consider a *different* region from production, so a regional event cannot take both. |
| Object Ownership | **ACLs disabled** (bucket owner enforced) | The modern default. See the ACL troubleshooting row below if uploads complain. |
| **Block Public Access** | **ON — all four boxes** | Non-negotiable. The bucket holds password hashes. |
| **Bucket Versioning** | **Enable** | Two jobs: a repeat upload for the same day adds a version instead of destroying one, and an attacker who somehow gained delete rights still leaves the previous version behind. |
| **Default encryption** | **Enable — SSE-S3 (AES-256)** | This is the *bucket default*, applied server-side. The scripts deliberately send no encryption headers — the archive is already encrypted client-side. SSE-KMS is fine too but adds per-request KMS cost and another key to lose; SSE-S3 is sufficient given client-side encryption. |
| **Object Lock** | Your call — **but it can only be turned on at creation** | See below. |

### Object Lock — decide now or not at all

Object Lock cannot be added to an existing bucket. Enabling it now costs nothing and leaves the option
open; skipping it means a new bucket and a re-upload if you later want it.

- **Governance mode** with a retention period equal to the lifecycle expiry (90 days for the `db` prefix)
  makes backups genuinely immutable: nobody — including the account root — can delete a locked object
  before its retention expires, except an identity holding `s3:BypassGovernanceRetention`.
- **Compliance mode** removes even that escape hatch. Do not choose it without being certain: a
  mis-set retention cannot be undone by anyone, including AWS support, and you pay storage until it
  expires.

**Recommendation:** enable Object Lock at creation, leave the *default retention* unset for now, and
decide on governance-mode retention after the first verified restore test. Enabling the feature is
reversible in effect (no retention = no locking); not enabling it is not.

---

## Step 2 — Lifecycle rules

Console → the bucket → **Management** → **Lifecycle rules**. Two rules, because the two prefixes have
genuinely different jobs.

### Rule 1 — `ndt-backups-db-retention`

Applies to prefix `ndt-backups/db/`. Weekly database archives are **history**: each one is a point in
time, they accumulate, and old ones stop being useful.

```json
{
  "Rules": [
    {
      "ID": "ndt-backups-db-retention",
      "Status": "Enabled",
      "Filter": { "Prefix": "ndt-backups/db/" },
      "Transitions": [
        { "Days": 30, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": { "Days": 90 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

Two consequences to understand before enabling it, neither of which is a reason not to:

- **Deep Archive bills a 180-day minimum.** Expiring at 90 days means every transitioned object is
  charged an early-deletion fee for the unused remainder. At current set sizes that is pennies, so it is
  accepted. If archives grow substantially, either extend `Expiration` to 180 days or transition to
  `GLACIER_IR` instead.
- **Deep Archive is not instantly readable.** Retrieval takes hours (up to 12 for standard, up to 48
  for bulk). Anything older than 30 days therefore cannot serve a fast recovery — which is exactly why
  the fast path is the *recent* sets: 2 on local disk, plus roughly the last four weekly sets still in
  Standard. Restoring a Deep Archive set needs `s3:RestoreObject` first (the reader policy grants it)
  and a wait. Say so out loud during an incident rather than discovering it at hour three.

### Rule 2 — `ndt-backups-storage-mirror`

Applies to prefix `ndt-backups/storage/`. This prefix is a **mirror**, not history: it reflects the
current contents of the Supabase storage buckets.

```json
{
  "Rules": [
    {
      "ID": "ndt-backups-storage-mirror",
      "Status": "Enabled",
      "Filter": { "Prefix": "ndt-backups/storage/" },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 90 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

**Deliberately no `Expiration`.** Expiring current versions here would delete the only off-site copy of
live inspection files while they are still in use in the application. The prefix is not versioned
history to be aged out; it is the current state, and it must persist for as long as the data does.

Noncurrent-version expiry is the right lever instead: when a file is re-uploaded because its contents
changed, the superseded version is kept for 90 days (a recovery window against a bad overwrite) and
then removed so the mirror does not grow without bound.

**Objects deleted in Supabase persist here forever.** That is intentional and follows directly from the
write-only credentials — the backup identity has no `DeleteObject`, so the mirror can only ever grow.
Treat it as history-keeping. If a deletion must be honoured off-site for a data-subject erasure request,
that is a deliberate, logged, console-side action by the owner, not something the weekly job can do.
Note it in `docs/sar-procedure.md` when the situation arises.

**Storage class:** leave the mirror in Standard. The archive tiers charge a 128 KB minimum billable
object size and 90–180 day minimums; with a few hundred mostly-small objects those minimums cost more
than they save.

---

## Step 3 — IAM user `ndt-backup-writer`

Console → IAM → **Users** → Create user. **No console access.** Attach the policy below as an inline
policy, then create an access key of type *Application running outside AWS*.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListOnlyTheBackupPrefix",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": "arn:aws:s3:::<BUCKET-NAME>",
      "Condition": {
        "StringLike": { "s3:prefix": [ "ndt-backups/*" ] }
      }
    },
    {
      "Sid": "LocateBucket",
      "Effect": "Allow",
      "Action": "s3:GetBucketLocation",
      "Resource": "arn:aws:s3:::<BUCKET-NAME>"
    },
    {
      "Sid": "WriteBackupObjectsOnly",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::<BUCKET-NAME>/ndt-backups/*"
    }
  ]
}
```

What is **absent** is the point of the policy: no `s3:GetObject`, no `s3:DeleteObject`, no
`s3:PutBucketPolicy`, no `s3:PutLifecycleConfiguration`. These keys can add objects under one prefix and
list them. Nothing else.

`s3:ListBucket` is needed by the post-upload verification (`rclone lsjson`) and by the incremental
storage mirror, which decides what to transfer from a listing. The multipart actions are needed because
rclone splits large uploads. `s3:GetBucketLocation` is a courtesy for tooling that resolves the region.

---

## Step 4 — IAM user `ndt-restore-reader` (keys kept offline)

Same process, second user, **no console access**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBackups",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:ListBucketVersions"
      ],
      "Resource": "arn:aws:s3:::<BUCKET-NAME>",
      "Condition": {
        "StringLike": { "s3:prefix": [ "ndt-backups/*" ] }
      }
    },
    {
      "Sid": "LocateBucket",
      "Effect": "Allow",
      "Action": "s3:GetBucketLocation",
      "Resource": "arn:aws:s3:::<BUCKET-NAME>"
    },
    {
      "Sid": "ReadBackupObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:RestoreObject"
      ],
      "Resource": "arn:aws:s3:::<BUCKET-NAME>/ndt-backups/*"
    }
  ]
}
```

`s3:RestoreObject` is what thaws a Deep Archive object. Without it, any set older than 30 days is
unreadable no matter how correct the rest of the recovery is.

**Handling of these keys — this is the control, not a formality:**

- Write them into the password manager and **nowhere else**.
- Do **not** put them in `C:\Users\jonas\supabase-backup\secrets.ps1`.
- Do **not** create the `ndt-aws-restore` rclone remote until an incident or a DR drill.
- After a drill or a recovery, remove the remote again:
  ```powershell
  rclone config delete ndt-aws-restore
  ```

If both identities live on the same machine at the same time, the write-only design has bought nothing —
whoever owns the machine owns read *and* write.

---

## Step 5 — Configure rclone

`rclone` is the one tool used for every transfer: Supabase → AWS for storage bytes, local → AWS for
archives, and AWS → local when restoring. One tool, one credential store.

Install it (**as the owner, not from an agent session**), confirm the version, and check where its
config will live:

```powershell
winget install Rclone.Rclone
rclone version          # must be 1.56 or newer - the scripts use connection-string parameters
rclone config file      # expect %APPDATA%\rclone\rclone.conf, which is NOT OneDrive-synced
```

Create the **writer** remote interactively:

```powershell
rclone config
```

- `n` → new remote → name: **`ndt-aws`** (the scripts default to this name)
- Storage: **`s3`** → Provider: **`AWS`**
- `env_auth`: **false** (enter the keys directly)
- `access_key_id`: `<WRITER-ACCESS-KEY-ID>`
- `secret_access_key`: `<WRITER-SECRET-ACCESS-KEY>` — typed at a prompt, not on a command line
- `region` and `location_constraint`: `<REGION>`
- **`server_side_encryption`: leave EMPTY.** The bucket default applies it; sending an explicit header
  is redundant and conflicts if the bucket default is ever changed to KMS.
- **`acl`: leave EMPTY.** With ACLs disabled on the bucket, sending an ACL header is an error.
- Everything else: defaults. Do **not** set a config password — the weekly scheduled task runs
  non-interactively and cannot answer a prompt. The exposure this accepts is one write-only credential
  that cannot read the archives or delete anything.

Use the interactive flow rather than `rclone config create` with the key on the command line: PowerShell
records command lines in `ConsoleHost_history.txt`, and a secret written there outlives the session.

Finally, add the destination to the secrets file **with an editor** — never `Out-File` or `Set-Content`
without an explicit encoding, and never with a BOM:

```powershell
# C:\Users\jonas\supabase-backup\secrets.ps1  — NEVER COMMIT
$env:NDT_BACKUP_S3_BUCKET = "<BUCKET-NAME>"
$env:NDT_BACKUP_S3_REGION = "<REGION>"
```

> **Read the variable names carefully.** `NDT_BACKUP_S3_KEY` / `_SECRET` are the **Supabase source**
> storage keys. `NDT_BACKUP_S3_BUCKET` / `_REGION` describe the **AWS destination**. The AWS keys
> themselves are intentionally absent — they live only in `rclone.conf`.

---

## Step 6 — Verification checklist

Work through all seven. The first five prove the pipeline; the last two prove the *controls*, which is
the part an auditor asks about and the part that silently rots.

- [ ] **1. Remote resolves.** `rclone listremotes` lists `ndt-aws:`.

- [ ] **2. The plan sees the destination.**
      ```powershell
      powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1 -DryRun
      ```
      The *Off-site destination* block shows the bucket, region and both keys, and ends with
      `destination is configured - a real run would upload`. Nothing is written.

- [ ] **3. First real run exits 0.**
      ```powershell
      powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1
      ```
      Exit `0` means uploaded *and* verified. Exit `4` means it ran locally only — read the SKIP banner.
      Exit `5` means the upload failed and nothing was pruned.

- [ ] **4. The object is in the right partition.** In the console, navigate
      `<BUCKET-NAME>` → `ndt-backups/` → `db/` → `year=YYYY/` → `month=MM/` → `day=DD/` and confirm
      **both** files are present:
      `ndt-backup-YYYY-MM-DD.7z` and `ndt-backup-YYYY-MM-DD.manifest.json`.
      Open the archive's properties: **Server-side encryption = Enabled (SSE-S3)** and
      **Storage class = Standard**.

- [ ] **5. Lifecycle rules are live.** Management → Lifecycle rules shows both rules as **Enabled**,
      scoped to `ndt-backups/db/` and `ndt-backups/storage/` respectively. A rule with an empty or
      wrong prefix silently applies to the whole bucket — check the scope, not just the status.

- [ ] **6. The writer really is write-only.** This is the control test. With the writer remote:
      ```powershell
      # this must SUCCEED (a small throwaway object under the db prefix)
      "permission test" | Out-File -FilePath "$env:TEMP\_permission-test.txt" -Encoding utf8
      rclone copyto "$env:TEMP\_permission-test.txt" "ndt-aws,no_check_bucket=true,no_head=true:<BUCKET-NAME>/ndt-backups/db/_permission-test.txt" --no-check-dest

      # both of these must FAIL with AccessDenied
      rclone cat        "ndt-aws:<BUCKET-NAME>/ndt-backups/db/_permission-test.txt"
      rclone deletefile "ndt-aws:<BUCKET-NAME>/ndt-backups/db/_permission-test.txt"
      ```
      If either of the last two succeeds, the policy is wider than intended — fix it before relying on
      this as a ransomware control. The test object cannot be removed with these keys; the `db` prefix
      lifecycle rule expires it in 90 days.

- [ ] **7. The reader works, then goes away again.** Configure `ndt-aws-restore` from the offline keys
      and prove a real recovery read end to end:
      ```powershell
      powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-restore.ps1 -FromS3 <YYYY-MM-DD> -DryRun
      powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-restore.ps1 -FromS3 <YYYY-MM-DD> -LocalDocker -ContinueOnError
      ```
      The fetch must report `GATE PASS s3-archive-integrity`. Record the gate summary in the
      **Restore test record** in [disaster-recovery.md](disaster-recovery.md) — that table is the
      evidence, not this checklist. Then:
      ```powershell
      rclone config delete ndt-aws-restore
      Remove-Item -LiteralPath C:\Users\jonas\ndt-backups\_from-s3 -Recurse -Force
      ```
      The second command matters: a fetched set is decrypted PII on local disk.

---

## Cost

Indicative only — confirm against the AWS pricing calculator for `<REGION>` before relying on it.

At present volumes (roughly 1.4 GB of storage mirror, plus weekly database archives well under a
gigabyte each, with a 90-day window) the whole thing is a **small fraction of a pound per month**:
storage dominates, requests are negligible at weekly cadence, and there is no egress unless you restore.

The costs that would actually bite are the ones to watch for, not the baseline:

- **Egress on a full restore** — downloading the storage mirror is charged at internet egress rates.
- **Deep Archive early deletion** — see Rule 1 above.
- **Deep Archive retrieval** — charged per GB, and slow.

Set a **billing alarm** at a threshold that would be surprising (a few pounds). An unexpected bill is
usually the first sign that something is uploading far more than it should.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `AccessControlListNotSupported` on upload | rclone is sending an ACL header at a bucket with ACLs disabled. Clear it: `rclone config update ndt-aws acl ""`. |
| `403 Forbidden` on a `HEAD` right after a successful upload | The `no_head=true` connection-string parameter is missing. The scripts always set it; a manual `rclone` command must too. |
| `AccessDenied` on the *first* upload of the day | Check the policy's `Resource` really is `arn:aws:s3:::<BUCKET-NAME>/ndt-backups/*` and that the key prefix in the plan output matches. |
| `AccessDenied` only when the day's object already exists | A destination existence probe. The scripts pass `--no-check-dest`; a manual command must too. |
| Upload succeeds, verification fails | The `s3:prefix` condition on `s3:ListBucket` does not cover the partition being listed. Confirm it is `ndt-backups/*`, not a narrower path. |
| `NoSuchBucket` or an attempt to create the bucket | `no_check_bucket=true` missing, or the region on the remote does not match the bucket. |
| Backup exits 4 every week | The destination is not configured. Read the SKIP banner — it names exactly what is missing. Do not let this become the normal state; it means there is no off-site copy at all. |
| Restore cannot find the reader remote | Expected between incidents — the keys are kept offline on purpose. Recreate `ndt-aws-restore` from the password manager, then delete it again afterwards. |
| A set older than 30 days will not download | It is in Deep Archive. Issue a restore/thaw request and wait hours before retrying. |

---

## Maintenance

| When | Do |
|---|---|
| Quarterly, with the DR test | Confirm the writer still cannot read or delete (checklist item 6). Permissions drift when someone "just fixes" a failing job by widening a policy. |
| Annually | Rotate both access keys. The writer is easy: create a new key, `rclone config update ndt-aws access_key_id … secret_access_key …`, run a backup, then delete the old key. The reader is rotated in the password manager only. |
| After any change to `db-backup.ps1` / `db-restore.ps1` | Run a restore test and record it in [disaster-recovery.md](disaster-recovery.md). |
| If the bucket region or name changes | Update `secrets.ps1`, the rclone remote, **and both IAM policies** — the ARNs are bucket-specific. |

Once the two IAM users exist they are owner-held credentials like any other, and belong in the standing
inventory in [secrets-and-rotation.md](secrets-and-rotation.md) — add them there alongside the other
owner-held items, noting that the reader's keys are intentionally offline.

Related: [backup-and-restore.md](backup-and-restore.md) · [disaster-recovery.md](disaster-recovery.md) ·
[secrets-and-rotation.md](secrets-and-rotation.md) ·
`docs/risk-register.md` (R-A2) · `docs/DEPLOYMENT_CHECKLIST.md`.
