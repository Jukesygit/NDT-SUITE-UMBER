# Secrets and Rotation

**Owner:** Jonas · **Last reviewed:** 2026-08-26

---

## Purpose

Where every credential this system uses actually lives, and how to rotate each one without breaking
production. **No secret value appears in this document, in the repository, or in any other document in
`docs/`.** This page tells you the *store* and the *procedure*; the values come from the owner or the
relevant dashboard.

---

## Prerequisites

- Supabase dashboard access to `ntrgjqrbewbvwofupphn` (eu-west-2) — owner.
- Vercel dashboard access — owner.
- Provider consoles: Resend, Google AI Studio — owner.
- Supabase CLI 2.107.0+ logged in, for `supabase secrets set`.
- A `.env` with **no UTF-8 BOM** — a BOM makes every CLI call fail with `unexpected character '»'`.
  See `local-dev-setup.md`.

---

## The inventory

Four stores. Nothing lives anywhere else, and that is a control, not an accident.

### 1. Supabase function secrets — manually set

Exactly **three** manual secrets exist on the project (verified against `supabase secrets list` at the
2026-08-17 migration, plus one added for client sharing):

| Secret | Consumed by | Purpose |
|---|---|---|
| `RESEND_API_KEY` | `send-email`, `send-expiration-reminders`, `send-profile-update-reminder`, `send-reset-code` | Transactional email (Resend) |
| `GEMINI_API_KEY` | `gemini-proxy` only | GA drawing import. **Server-side only** — the function is a true relay, the key never reaches a client |
| `CRON_SECRET` | `send-expiration-reminders` and the shared helper `_shared/auth.ts` | Shared secret authorising scheduled invocations |
| `CLIENT_SHARE_IP_SALT` | `serve-client-share` | Salts view-log IP hashes so raw addresses are never stored |

Set with:

```bash
supabase secrets set --project-ref ntrgjqrbewbvwofupphn <NAME>=<value>
```

**Supabase function secrets are write-only.** You can list names and digests, never plaintext:

```bash
supabase secrets list --project-ref ntrgjqrbewbvwofupphn
```

If a value is lost it must be re-minted, not recovered. Keep authoritative copies in the owner's own
password store — **not** in the repo, not in chat, not in OneDrive.

### 2. Supabase platform-injected — never set by hand

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected into every function
automatically. Do not create them as secrets; do not attempt to rotate them independently of the
project.

`APP_URL` and `ALLOWED_ORIGINS` are read by function code but are **deliberately not set** — the
in-code fallbacks are in use, mirroring the old project. Set them only if a real CORS or email-link
problem surfaces. `ALLOWED_ORIGINS` becomes mandatory the day a second subdomain app exists.

### 3. Vercel environment variables — the frontend

| Variable | Notes |
|---|---|
| `VITE_SUPABASE_URL` | Public by design — it is in the bundle |
| `VITE_SUPABASE_ANON_KEY` | Public by design. The **only** JWT in the whole production build; the 2026-08-26 exposure review decoded it and confirmed `role: "anon"` |
| `VITE_MAINTENANCE_MODE` | Tools-only PII lockdown. **Not** a site-down switch |

> Anything prefixed `VITE_` is **inlined into the client bundle** and is public. Never put a server
> secret behind a `VITE_` name — `.env.example:12-15` says this explicitly about `GEMINI_API_KEY`, and
> it is the reason `gemini-proxy` exists at all.

Changing a Vercel env var requires a **redeploy** to take effect.

### 4. GitLab CI — `VERCEL_TOKEN` only

`.gitlab-ci.yml` references exactly one credential: `$VERCEL_TOKEN`, in the `deploy` job.

> **This is a deliberate control: GitLab CI holds no Supabase credentials.** Backup automation, migration
> pushes and function deploys all run from the owner's machine precisely to keep it that way. **Never
> add a Supabase URL, anon key, service-role key, or database password to CI variables** — doing so
> widens the blast radius of a CI compromise from "can deploy a frontend" to "owns the database".
>
> Ironically the `deploy` job never runs at all: its rule is `$CI_COMMIT_BRANCH == "main"` and no `main`
> branch exists (`deploy.md`). `VERCEL_TOKEN` is therefore currently unused — a candidate for revocation
> in its own right.

### Also credentials, also owner-held

- **Database passwords** — Supabase dashboard → Project Settings → Database. Needed for
  dump/restore (`backup-and-restore.md`).
- **Storage S3 access keys** — Storage → S3 access keys. Used by `rclone` for object sync.
- **Management API token / Vercel REST token** — session tokens minted for the 2026-08-17 cutover.
  Both are on the teardown list.
- **AWS backup IAM users (two, added 2026-08-27 — setup: `aws-backup-setup.md`):**
  `ndt-backup-writer` — write-only (Put/List, no Get, no Delete) keys used by the weekly
  `db-backup.ps1` off-site upload; lives in the local rclone config on the backup machine. A
  compromise of these keys can add objects but cannot read or destroy backup history.
  `ndt-restore-reader` — read-only keys for `-FromS3` restores; **kept offline** (password manager /
  printed), never on the backup machine. Rotation for either: mint a new access key on the IAM user
  in the AWS console, update the rclone config (writer) or the offline store (reader), deactivate the
  old key, delete it after one verified run.

---

## Rotation procedures

General shape, every time: **mint new → install everywhere it is read → verify → revoke old.** Revoking
before installing causes an outage; installing without revoking is not a rotation.

### `RESEND_API_KEY`

1. Resend dashboard → API keys → create a new key.
2. `supabase secrets set --project-ref ntrgjqrbewbvwofupphn RESEND_API_KEY=<new>`
3. Redeploy the four consuming functions — `send-email`, `send-expiration-reminders`,
   `send-profile-update-reminder`, `send-reset-code` (`deploy.md`). **Never a bare
   `supabase functions deploy` with no name** — it would redeploy `serve-client-share` without
   `--no-verify-jwt` and break every share link.
4. Verify: trigger a password-reset email and confirm it arrives.
5. **If SMTP in Auth settings uses the same Resend credentials, update it too** — see the ordering scar
   below.
6. Delete the old key at Resend.

### `GEMINI_API_KEY`

1. Google AI Studio → create a new key.
2. `supabase secrets set --project-ref ntrgjqrbewbvwofupphn GEMINI_API_KEY=<new>`
3. Redeploy `gemini-proxy` only.
4. Verify: run a GA drawing import end-to-end; confirm the unauthenticated probe still 401s:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
     https://ntrgjqrbewbvwofupphn.supabase.co/functions/v1/gemini-proxy    # expect 401
   ```
5. Delete the old key in Google AI Studio.

> Current state: both Resend and Gemini keys were **regenerated** on 2026-08-17 for the new project, and
> the **old keys are still live** on the retired project. Deleting them is teardown items 1 — see below.

### `CRON_SECRET` — TWO locations, one sitting

> ### ⚠ SCAR
> `CRON_SECRET` exists in the **function secret** *and* in the **cron job definition's `x-cron-secret`
> header**. Rotating one and not the other breaks the scheduled job — and because `net.http_post` is
> fire-and-forget, that break is **silent**: `cron.job_run_details` still shows a successful dispatch.
> Full explanation: `cron-jobs.md`.

1. Mint a strong random value.
   > On PowerShell 5.1 use `RNGCryptoServiceProvider`. `RandomNumberGenerator::Fill` **does not exist**
   > there and a first attempt at generating `CLIENT_SHARE_IP_SALT` produced **all-zero bytes** —
   > a salt that was not a salt.
2. `supabase secrets set --project-ref ntrgjqrbewbvwofupphn CRON_SECRET=<new>`
3. **Immediately** re-schedule the job with the matching header (dashboard SQL editor):
   ```sql
   select cron.unschedule('send-expiration-reminders-daily');
   select cron.schedule('send-expiration-reminders-daily', '30 7 * * *', $$ ... $$);
   ```
   Run each as its own statement — a multi-statement transaction can silently roll the schedule back.
4. Verify by manual invoke with the **new** secret (expect 200) and with a **wrong** secret (expect
   rejection). Command in `cron-jobs.md`.

### `CLIENT_SHARE_IP_SALT`

Rotating it means past and future view-log IP hashes no longer correlate. That is acceptable — it is a
privacy salt, not a key. Set it, redeploy `serve-client-share` **with `--no-verify-jwt`**, then confirm a
live share link still serves unauthenticated.

### Supabase anon / service-role keys

Not independently rotatable — they are project-level. Rotating the project's JWT secret invalidates
**every** session and forces all users to log in again. If it happens: update `VITE_SUPABASE_ANON_KEY`
in Vercel **and** the `Authorization` bearer in every HTTP-calling cron job (`cron-jobs.md`), redeploy,
and announce the re-login.

### Database passwords

Supabase dashboard → Project Settings → Database → reset. Then update any local `secrets.ps1` used for
dumps (kept **outside the repo and outside OneDrive** — it holds credentials to production data).

---

## ⚠ SCAR — Auth config pushes need SMTP fields first

When pushing Supabase Auth configuration via the Management API (the method used at cutover), the
**rate-limit fields are rejected unless the SMTP fields are set in the same payload, first**. Push
rate limits alone and the call fails or silently no-ops.

Companion PowerShell 5.1 trap from the same session: cast `Get-Content -Raw` output to `[string]`
before `ConvertTo-Json`, or ETS properties serialise as objects and the payload is malformed.

Full sequence: `docs/plans/2026-08-17-supabase-project-migration-runbook.md` Phase 5.

---

## Standing rules

1. **A credential that transited chat, email, or a shared document is compromised** and must be
   re-minted. This rule produced teardown item 4 ("re-reset ALL DB passwords — they transited chat
   during the migration session").
2. **Never commit a secret.** CI runs `gitleaks` on every branch. If a secret does land in history,
   rotating it is the fix — history rewriting alone is not.
3. **Never write `.env` with PowerShell `Out-File`** — the BOM breaks the Supabase CLI.
4. **Dump files are secrets.** `data.sql` contains production PII and password hashes. It lives outside
   the repo and outside OneDrive sync, and is deleted when no longer needed
   (`backup-and-restore.md`).
5. **No Supabase credential in CI.** See store 4 above.
6. **Rotation is complete only when the old value is dead.** Prove it by probing, not by assuming.

---

## ⏳ Outstanding: migration teardown (was due ~2026-08-31)

Old credentials from the 2026-08-17 cutover are **still live**. The itemised checklist is
`docs/plans/2026-08-17-supabase-project-migration-runbook.md` § *Teardown checklist*; the
credential-bearing items are:

1. Delete the **old provider keys** at Resend and Google AI Studio — this also closes the security
   audit's key-rotation item.
2. Delete the dry-run project `oxzteqqrhggdodcnngzn`.
3. Pause, then delete, the old project `cngschckqhfpwjcvsbad`.
4. **Re-reset ALL database passwords** — they transited chat during the migration session.
5. **Revoke the two session tokens** used for cutover (Supabase Management API owner token, Vercel REST
   token).
6. Delete `C:\Users\jonas\supabase-migration` (holds `data.sql`: production PII + password hashes) and
   empty the recycle bin.
7. Raise the ntrg global storage upload limit, then re-add the 100 MB per-file caps on `project-files`
   and `scan-data`.

Tick each off in `docs/Engineering Log.md` with a date and evidence as it completes. These are
dashboard/provider actions — **owner only**.

---

## Verification

**Names and digests present (never plaintext):**

```bash
supabase secrets list --project-ref ntrgjqrbewbvwofupphn
```
Expect `RESEND_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`, `CLIENT_SHARE_IP_SALT`.

**Each secret is actually working:**

| Secret | Check |
|---|---|
| `RESEND_API_KEY` | Trigger a password-reset email; it arrives |
| `GEMINI_API_KEY` | GA drawing import completes; unauthenticated `gemini-proxy` probe returns 401 |
| `CRON_SECRET` | Manual invoke with the correct secret → 200; with a wrong one → rejected (`cron-jobs.md`) |
| `CLIENT_SHARE_IP_SALT` | A live share link still serves unauthenticated (`client-share-links.md`) |

**Old values are dead:** repeat each check with the *previous* value and confirm it fails. An
un-revoked old key is not a rotation.

**Nothing leaked into the repo:**

```bash
git log --oneline -1                  # note the commit
# CI runs gitleaks on every branch — check the pipeline's security stage is green
```

**Frontend bundle carries only the anon key:** the 2026-08-26 exposure review
(`docs/plans/2026-08-26-share-exposure-report.md`) found exactly one JWT in the entire build, decoded as
`role: "anon"`. Re-run that check after any change to how the client reads configuration.

---

## Escalation / when it goes wrong

| Symptom | Cause | Action |
|---|---|---|
| Emails stop arriving | `RESEND_API_KEY` rotated in one place only, or old key deleted before the new one was installed | Re-set the secret, redeploy the 4 email functions, verify with a real send |
| Scheduled reminders silently stop | `CRON_SECRET` rotated in one location only | Rotate in **both**; verify by manual invoke (`cron-jobs.md`) |
| Drawing import fails; proxy returns 500 | `GEMINI_API_KEY` missing or revoked | Re-set and redeploy `gemini-proxy` |
| Every share link 401s | `serve-client-share` redeployed without `--no-verify-jwt` during a secret update | Redeploy with the flag (`client-share-links.md`) |
| All users logged out unexpectedly | Project JWT secret changed | Update Vercel anon key + every cron bearer, redeploy, announce |
| CLI: `unexpected character '»'` | BOM in `.env` | Rewrite without a BOM |
| A secret appears in a commit or a chat log | Compromised | Rotate immediately, then run `incident-response.md` § A and record it in `docs/breach-register.md` |
| A salt looks like all zeros | PS 5.1 `RandomNumberGenerator::Fill` does not exist | Re-mint with `RNGCryptoServiceProvider` and verify the bytes |

Every item on this page that touches a provider console, a dashboard, or a plaintext value is
**owner-only**. Related: `deploy.md` · `cron-jobs.md` · `incident-response.md` ·
`local-dev-setup.md` · `backup-and-restore.md`.
