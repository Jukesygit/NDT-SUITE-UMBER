# Support & Continuity

> **Status:** support model operative. Per owner attestation 2026-08-27, the Company has **two
> administrators/maintainers — Jonas Whitehead and David Emery — both holding access to all
> systems.** Outstanding: verify owner/admin level on each service (§4.2), the passphrase/reader-
> key handover (§4.1), and the exercised drill (§4.3).
> Created 2026-08-27 · Review annually or when personnel change.
> Questionnaire-facing summary: §6.

## 1. Support model

Matrix Portal is developed, operated and supported **in-house by its two maintainers, Jonas
Whitehead and David Emery**, on a business-hours, best-effort basis; there is no formal SLA to
internal users and no outsourced support contract. Users report issues directly to either
maintainer.

## 2. Vendor support (the layers beneath us)

| Layer | Vendor | Channel | Notes |
|---|---|---|---|
| Backend platform (DB/auth/storage/functions) | Supabase | Dashboard support + status.supabase.com | Per paid-plan support terms |
| Frontend hosting/CDN | Vercel | Dashboard support + vercel-status.com | Per plan terms |
| Cloud infrastructure | AWS (via Supabase; directly for the backup bucket) | AWS support per account tier | |
| Transactional email | Resend | Support per plan | Deliverability issues: see `docs/` email deliverability notes |

Platform outages are vendor-side: check the status pages before internal diagnosis
(`incident-response.md`).

## 3. Escalation path

1. User → administrator (business hours).
2. Administrator → runbooks (`docs/processes/`) — deploy, backup/restore, disaster recovery,
   incident response, secrets rotation, cron jobs.
3. Administrator → vendor support channel for the failing layer.
4. Administrator unavailable → **continuity mechanism, §4**.
5. Personal-data incidents at any step → `docs/data-breach-response-plan.md` + breach register.

## 4. Continuity (key-person cover)

Support and operations currently depend on a single individual. This is recorded as risk
**R-N2** in `docs/risk-register.md`. The compensating arrangement has three parts:

### 4.1 Access model — **[PENDING owner action]**
**DECIDED (owner, 2026-08-27): direct standing access only — no escrow and no shared credential
vault.** Wherever a service supports it (portal, Supabase organisation, Vercel team,
GitLab/GitHub), the deputy holds their **own** member account at **owner/admin level** — never a
shared login, which breaks 2FA semantics and audit attribution. Owner-level membership is the
point: it removes dependence on the administrator's personal accounts almost entirely.

The two secrets that cannot be memberships — the **backup archive passphrase** and the **S3
restore-reader keys** — are handed to the deputy directly; each individual retains them under
their own personal arrangements. No shared store exists by decision.

Accepted residual (recorded, not hidden): services bound to the administrator personally — the
domain registrar and the Google account holding the Gemini API key — have no second holder.
Fallback is provider account-recovery with company documentation (slow), or replacement (the
Gemini key is replaceable by minting a new one under any Google account and updating the
Supabase secret). Database recoverability does not depend on any of this: the deputy's Supabase
org membership gives direct access to the daily platform backups with no passphrase involved;
the encrypted S3 dumps additionally require the handed-over passphrase.

### 4.2 Designated deputy administrator — **[PENDING owner action]**
**David Emery** (per owner attestation 2026-08-27) holds, alongside Jonas Whitehead: a named
portal account with the `admin` role; owner/admin-level membership of the Supabase organisation,
Vercel team and GitLab/GitHub repositories; and the two directly-handed secrets from §4.1.
**[VERIFY (owner): confirm each membership is at owner/admin level, not merely member — the
continuity value depends on the level.]** Because access is standing and personal, no
break-glass trigger is required, and each individual's actions are attributable in the services'
own audit logs.

### 4.3 Proven operability — **[PENDING; pairs with the P3.4 restore test]**
Documentation is only continuity if a second person has exercised it. The deputy performs,
supervised, at least once: (a) a dev-branch deployment end-to-end, and (b) a database restore
from an off-site backup using `db-restore.ps1 -FromS3` (this run doubles as the outstanding
restore-test evidence in `disaster-recovery.md`). Repeat annually.

### What already exists
The operational knowledge is externalised: nine runbooks in `docs/processes/` written for an
engineer who has never seen the system, the disaster-recovery procedure with scripted
backup/restore, the incident-response guide including the super_admin break-glass (Supabase
dashboard MFA-factor removal), and the breach response plan. The gap is *authorization and
access*, not knowledge — which is what §4.1–4.2 close.

## 5. Out-of-hours and absence

Planned administrator absence: deputy briefed, emergency-access delay optionally shortened for
the period. No formal out-of-hours support is offered; production incidents discovered
out-of-hours follow §3 on a best-effort basis.

## 6. Questionnaire-facing summary

> Support is provided in-house by the system's two maintainers, Jonas Whitehead and David
> Emery, on a business-hours basis, backed by vendor support for the hosting layers (Vercel,
> Supabase/AWS, Resend) under their commercial terms. Operations are fully documented as runbooks covering deployment, backup and restore,
> disaster recovery, incident response and credential rotation. Continuity of support is provided
> by a designated deputy administrator holding standing named-account access to all operational
> systems and shared access to a logged credential vault covering account-recovery material, and
> by an annually exercised restore and deployment drill.
> *(Submit only once §4.1–4.3 are in place; until then, state the single-administrator position
> honestly and reference risk R-N2 with its treatment plan.)*
