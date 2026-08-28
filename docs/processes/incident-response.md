# Incident Response

**Owner:** Jonas · **Last reviewed:** 2026-08-26

---

## Purpose

What to do in the first hour, for the incident classes this system actually produces. This is the
**engineering** procedure.

> **If personal data may have been exposed, lost, altered or accessed without authorisation, the
> statutory procedure in [`docs/data-breach-response-plan.md`](../data-breach-response-plan.md) governs
> and it starts a 72-hour ICO clock.** Run the containment steps here *and* open that document
> immediately — they are concurrent, not sequential. Every incident is recorded in
> [`docs/breach-register.md`](../breach-register.md), notifiable or not: UK GDPR Art. 33(5) requires the
> record either way, and a decision of "no notification required" is itself a field that must be
> written down.

Data loss or corruption — the "production is gone" case — is **not** this document. See
[`disaster-recovery.md`](disaster-recovery.md).

---

## Prerequisites

Have these to hand before you need them:

- Supabase dashboard access to `ntrgjqrbewbvwofupphn` (eu-west-2) — owner.
- Vercel dashboard access — owner.
- Provider consoles: Resend, Google AI Studio, GitLab.
- An `admin` or `super_admin` app account for the Activity Log.
- `docs/data-breach-response-plan.md` (severity table, ICO template, response-team roles).
- `docs/breach-register.md` (the evidence trail).

---

## Step 0 — Always, before anything else

1. **Write down the time you became aware.** The 72-hour ICO clock runs from awareness, not from
   occurrence, and the register has a field for each.
2. **Preserve evidence. Do not delete anything.** Screenshot dashboards. Export the relevant activity
   log. The log is deliberately immutable (below) — keep it that way.
3. **Do not "tidy up" the affected data** before it is captured. A corrected record with no snapshot of
   the incorrect state is a lost forensic trail.
4. **Note who you told and when.**

---

## First-hour actions by incident class

### A. Suspected credential or API-key leak

Includes: a key in a commit or chat, a leaked `.env`, a compromised provider account, a
gitleaks/semgrep hit on a real secret.

1. **Rotate at the provider first, not in the repo.** Revoking the live credential is the containment
   step; updating our copy is housekeeping. Per-secret steps: `secrets-and-rotation.md`.
2. **Revoke sessions.** If a Supabase key or an account is implicated: dashboard → Authentication →
   the affected user → sign out / revoke sessions. If the project JWT secret changes, **every user
   re-authenticates** — announce it.
3. **Rotate the dependent copy** (Supabase function secret or Vercel env var) and redeploy the surface
   that reads it.
4. **Check for use.** Provider-side usage logs, plus the Activity Log for anything the credential could
   have driven.
5. Note the standing constraint: **GitLab CI holds only `VERCEL_TOKEN`** by design. If someone reports
   a leaked Supabase credential "from CI", that is a misdiagnosis — no Supabase credential is in CI.

> A credential that transited chat, email, or a shared document is compromised. That is the rule that
> produced teardown item 4 of the migration runbook ("re-reset ALL DB passwords — they transited chat").

### B. Wrong-person data entry / cross-account data appearing

The 2026-07-28 precedent: a certification for one employee was filed under a different employee's
profile. Full investigation: `docs/plans/2026-07-28-competency-attribution-and-session-hardening-design.md`.

**The discriminator is the Activity Log actor.** Human error and a session/RLS defect look identical
from the data alone; the actor tells you which it was.

1. Admin → **Activity Log**. Filter to the affected record's `created_at` and the relevant
   `action_type` (e.g. `competency_created`).
2. Compare the **actor** against the row's owner. `audit_row_change()` appends
   `details.on_behalf_of` when the actor differs from the row's `user_id`, and the UI renders it as
   "for {name}" with an on-behalf filter (`src/pages/admin/tabs/ActivityLogTab.tsx`).
3. Interpret:
   - **Actor is a legitimate admin acting deliberately** → human error. Correct the record, keep the
     evidence, record it in the breach register (the 2026-07-28 incident resolved this way — RLS was
     confirmed sound by a three-agent forensic sweep, no policy, session or edge-function defect).
   - **Actor is the wrong user, or unexpected** → treat as a session or authorisation defect. Escalate,
     revoke that user's sessions, and do **not** correct the data until it is captured.
4. Server-side attribution is tamper-proof: `employee_competencies.created_by` and
   `competency_documents.created_by` are set by a `BEFORE INSERT` trigger (migration
   `20260728130000`), never supplied by the client. A client claiming otherwise is not evidence.

### C. Site down / degraded

1. **Establish which layer.** Frontend (Vercel) or backend (Supabase)?
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://www.matrixportal.io
   curl -s -o /dev/null -w "%{http_code}\n" https://www.matrixportal.io/login
   curl -s -o /dev/null -w "%{http_code}\n" https://ntrgjqrbewbvwofupphn.supabase.co/rest/v1/
   ```
2. Check provider status: **https://www.vercel-status.com** and **https://status.supabase.com**. A
   provider incident is a wait-and-communicate, not a deploy.
3. If the site broke at a deploy: **Vercel dashboard → Deployments → promote the previous production
   deployment.** That is the fastest rollback and it needs no build.
4. If the backend is up but the app 401s everywhere, suspect an env/key change rather than an outage.
5. If a database migration is implicated, there is no automatic rollback — forward-fix (`deploy.md`),
   or if data is lost, go to `disaster-recovery.md`.

### D. Every client share link broken (401)

Near-certainly `serve-client-share` redeployed without `--no-verify-jwt`. Fix and verification:
`client-share-links.md`. Not a security incident — a config regression — but treat a share serving the
**wrong** content as one.

### E. Suspected unauthorised access to another organisation's data

1. Capture the exact request and the account before changing anything.
2. **Do not relax a policy to reproduce it.**
3. First check the benign explanation: several tables are org-scoped with **no `super_admin`
   override**, so an out-of-org account sees a silent `200 []`. That is correct behaviour and has been
   misdiagnosed before. The incident is the *reverse* — seeing data that should be invisible.
4. If real: this is a cross-tenant exposure, **Critical** in the severity table of the breach response
   plan. ICO clock is running. Contain by suspending the account, then dump the effective policy set
   (`select * from pg_policies where schemaname in ('public','storage');`) and diff it against source.

---

## Where the evidence lives

| Evidence | Location | Properties |
|---|---|---|
| **Application audit trail** | `public.activity_log` (singular — `activity_logs` does not exist), surfaced at Admin → Activity Log | **Immutable and admin-only.** `INSERT/UPDATE/DELETE` are `REVOKE`d from `authenticated` and `anon` (migration `20260626150000:90-91`) and no policy grants them. Read access is `super_admin` + `admin` only (`:101-108`). Only a `super_admin`-gated purge function may delete, and it **audits itself** (`:138-179`) |
| Server-set attribution | `created_by` columns, `details.on_behalf_of` | Trigger-set, not client-supplied (migration `20260728130000`) |
| PII masking | `src/utils/pii-sanitizer.ts`, `supabase/functions/_shared/pii-sanitizer.ts` | Logs are masked by design — expect redaction, it is not evidence tampering |
| Auth events, session list, MFA factors | Supabase dashboard → Authentication | Retention is the platform's |
| Frontend deploy history | Vercel dashboard | Also the rollback mechanism |
| CI security scans | GitLab pipelines (gitleaks, semgrep, npm audit) | Per-branch |
| Database state over time | `db_state_snapshots` (nightly ledger, landing 2026-08-26) | Row counts, policy-set md5, storage counts — makes RLS drift historically provable |
| Backups | See `backup-and-restore.md` | |

**Do not run the purge.** `purge_activity_logs()` is super_admin-gated and self-auditing, but during an
incident the log is evidence. Retention purging is routine housekeeping (`cron-jobs.md`), not an
incident action.

---

## Recording the incident

Every incident, regardless of severity or notifiability:

1. Add a one-line row to the **Index** in `docs/breach-register.md`.
2. Add the **full 13-field entry** below it — the schema is `docs/data-breach-response-plan.md` §4:
   Breach ID · Date discovered · Date occurred · Description · Data affected · Individuals affected ·
   Severity · Containment actions · Root cause · ICO notified (Y/N + date) · Individuals notified
   (Y/N + date) · Remediation · Status.
3. Record the **notification decision and its reasoning**, including when the decision is "not
   notifiable". An unrecorded correct decision is still a compliance gap.
4. Add an entry to `docs/Engineering Log.md` for the engineering trail.
5. If the incident revealed a control gap, raise it in `docs/risk-register.md`.

Severity thresholds, the ICO notification template, the data-subject notification template, and the
response-team roles are all in `docs/data-breach-response-plan.md` — do not paraphrase them here.

---

## Verification

You have contained an incident when:

- The credential, session or account used is demonstrably dead (re-probe it, do not assume).
- The affected surface has been redeployed with the new value where applicable.
- You can state what was accessed, by whom, and when — from the Activity Log, not from inference.
- The breach register carries a complete entry with a recorded notification decision.
- A regression test or monitoring check exists for the class of defect, where one is possible.

Spot-checks:

```bash
# The rotated key is dead
curl -s -o /dev/null -w "%{http_code}\n" https://ntrgjqrbewbvwofupphn.supabase.co/functions/v1/gemini-proxy   # 401

# The site is back
curl -s -o /dev/null -w "%{http_code}\n" https://www.matrixportal.io                                          # 200

# Security headers intact after any emergency deploy
curl -sI https://www.matrixportal.io | grep -iE "content-security-policy|strict-transport"
```

---

## Escalation / when it goes wrong

| Situation | Escalate to | Why |
|---|---|---|
| Any personal data may be involved | Owner + the DPO/Data Protection Contact, **immediately** | 72-hour ICO clock from awareness |
| Cross-tenant data exposure | Owner, immediately | **Critical** severity — notification presumed required |
| Credential compromise | Owner (holds provider consoles) | Rotation is owner-only |
| super_admin account lockout or takeover | Owner | Break-glass is dashboard-only — `auth-and-roles.md` |
| Data loss or corruption | `disaster-recovery.md` | Different procedure entirely |
| Provider outage | Nobody — communicate and wait | Nothing to fix on our side |
| Unsure whether it is notifiable | Owner + DPO | The decision is theirs and must be recorded either way |

**Contacts.** ICO helpline **0303 123 1113**; breach reporting at https://ico.org.uk/make-a-complaint/.
Incident-response team roles (Incident Lead, Technical Lead, DPO, Communications) are defined in
`docs/data-breach-response-plan.md` §5.

Related: `auth-and-roles.md` · `secrets-and-rotation.md` · `deploy.md` · `disaster-recovery.md` ·
`client-share-links.md`.
