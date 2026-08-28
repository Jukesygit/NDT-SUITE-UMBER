# Information Security Policy

> **Organisation**: Matrix Advanced Inspection Services
> **Applies to**: the Matrix / NDT Suite platform (matrixportal.io), its supporting Supabase project, and everyone who builds, operates or uses it
> **Version**: 1.0 · **Date**: 2026-08-26 · **Status**: REVIEW (owner): approve
> **Review cycle**: annually, and after any material change or security incident

## 1. Purpose and scope

This policy states how the organisation protects the information held in the Matrix platform — principally personnel records, competency certifications, controlled documents and inspection data belonging to the organisation and to its client organisations. It is deliberately short: it records commitments that are **already implemented**, and points at the document or file that implements each one. A commitment that is not yet real is marked as such rather than claimed.

In scope: the production web application and its Supabase project (`ntrgjqrbewbvwofupphn`, eu-west-2), the source repositories, the third-party processors listed in `docs/third-party-dpa.md`, and all user and administrator access to them. Out of scope: corporate IT (email, laptops, office networks) unless it touches platform credentials.

## 2. Roles and responsibilities

| Who | Responsibility |
|---|---|
| **Owner / accountable person** — REVIEW (owner): name and role | Accountable for information security overall. Approves this policy, signs off risk acceptances in `docs/risk-register.md`, takes breach-notification decisions in `docs/breach-register.md`, holds the supplier relationships and the production credentials, and authorises exceptions. |
| **Engineers** | Build and operate to the controls below. Every schema or policy change goes through adversarial review before deployment. Never commit secrets or personal data. Never weaken an access-control policy to make a feature work — raise it instead. |
| **All users** | Keep credentials to themselves, complete multi-factor enrolment, access only data their role legitimately requires, and report anything suspicious immediately. |

**Acceptable use, in one line:** platform access is granted solely for the performance of your role — do not share credentials, do not attempt to reach data outside your authorisation, and do not use the platform or its data for any purpose other than the organisation's legitimate business.

## 3. Control commitments

Each control below is in force today unless the status column says otherwise.

| # | Commitment | Status | Implemented by |
|---|---|---|---|
| C1 | **Tenant isolation.** Every table holding personal or client data enforces row-level security, scoped by organisation, at the database layer — not merely in the application. | In force | Migrations under `supabase/migrations/`; verified in `docs/security-audit-2026-08-12.md` §"Verified-clean / positive controls" |
| C2 | **Least privilege, six roles.** Access follows a six-role model (`viewer`, `editor`, `org_admin`, `manager`, `admin`, `super_admin`). Privileged operations enforce a strict rank rule: a caller may act only on users below their own rank, and actions on a `super_admin` are reserved to `super_admin`. Role self-escalation is blocked by a database trigger. | In force | `supabase/functions/_shared/role-rank.ts`; `protect_sensitive_profile_fields()` trigger; `docs/dpia.md` §5.1 |
| C3 | **Multi-factor authentication is mandatory.** Every user must enrol a TOTP authenticator. Recovery uses hashed, single-use backup codes; administrator-initiated reset is rank-gated, refuses self-reset, and is written to the audit log. | **Partial** — backend live 2026-08-26; the client gate making enrolment mandatory is complete but ships with the next frontend release. Database-layer enforcement is planned. Tracked as R-M2 in `docs/risk-register.md` | Migration `20260826120000_two_factor_backup_codes.sql`; edge functions `admin-reset-2fa`, `manage-backup-codes`; `src/components/auth/` |
| C4 | **Encryption in transit and at rest.** All traffic is HTTPS with HSTS (`max-age=63072000; includeSubDomains; preload`). Data is encrypted at rest by the platform processor (AES-256) and in transit (TLS 1.2+). | In force | `vercel.json`; `docs/third-party-dpa.md` P1 |
| C5 | **Browser hardening.** A strict Content-Security-Policy (`default-src 'none'; script-src 'self'`) is served on every response, with `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a referrer policy and a restrictive permissions policy. Client-share pages additionally carry `X-Robots-Tag: noindex, nofollow`. | In force | `vercel.json` |
| C6 | **Append-only audit logging.** The activity log is server-authoritative and immutable: application users cannot alter or delete entries, reads are administrator-only, and actions taken by one user on another's record are recorded with an on-behalf-of marker. The only deletion path is the retention purge. | In force | Migrations `20260626150000_activity_log_integrity.sql`, `20260728130000_competency_attribution.sql` |
| C7 | **Personal data is masked by default.** Sensitive personnel fields are masked on shared views and every reveal is audit-logged. Email addresses are masked before being written to any server log. | In force | `src/utils/pii-sanitizer.ts`; `maskEmail` in `supabase/functions/_shared/audit.ts` |
| C8 | **Data-subject rights are served by procedure.** Access, rectification, erasure and portability are implemented as self-service functions; erasure removes both database rows and stored files, and fails loudly rather than reporting a partial deletion as success. | In force | `src/services/gdpr-service.ts`; edge functions `delete-my-account`, `delete-user`; `docs/sar-procedure.md`; rights matrix in `docs/ropa.md` |
| C9 | **Retention is defined and enforced.** Every category of personal data has a documented retention period and a deletion method. | **Partial** — periods are defined and operative; two automated purge jobs are still being scheduled. Tracked as R-M8 | `docs/data-retention-schedule.md` |
| C10 | **Security scanning gates every change.** The CI pipeline runs blocking secret scanning (`gitleaks`), static analysis (`semgrep`, OWASP Top Ten and security-audit rulesets), dependency audit, linting, type-checking and the test suite. The pipeline holds no production database credentials. | In force | `.gitlab-ci.yml` |
| C11 | **Adversarial review for schema and policy changes.** Every database migration is reviewed by an independent reviewer whose brief is to break it, before deployment. This is a standing rule, adopted because the practice has twice caught defects that would have broken production. | In force | Standing rule in `.claude/CLAUDE.md`; evidence in `docs/security-audit-2026-08-12.md` §"Remediation status" |
| C12 | **Secrets never reach the client.** Service keys and API keys are held server-side only; the browser bundle carries only the public anon key. Credentials are never committed; production database dumps are banned from the repositories. | In force | Verified in `docs/security-audit-2026-08-12.md`; `gemini-proxy` key handling; repository policy in `docs/third-party-dpa.md` P4/P5 |
| C13 | **Backups and recovery.** The production database is backed up daily by the platform, with secondary encrypted logical dumps held off-platform and a documented, tested restore procedure. | **Being established** — daily platform backups decided 2026-08-26; backup/restore scripting and the first restore test are outstanding. Tracked as R-A2 | Plan items P0.2 and P3 in `docs/plans/2026-08-26-security-hardening-and-platform-ops-plan.md`; `docs/DEPLOYMENT_CHECKLIST.md` |
| C14 | **Incidents are handled by a plan and recorded.** Every suspected breach follows the response plan and is entered in the breach register — whether or not it is notifiable — with the notification decision and its reasoning recorded. | In force | `docs/data-breach-response-plan.md`; `docs/breach-register.md` |
| C15 | **Suppliers are recorded and assessed.** Every third party that touches personal data is listed with its role, the data it receives, its safeguards and its agreement status. | **Partial** — the register is complete; several agreements are not yet countersigned. Tracked as R-A9 | `docs/third-party-dpa.md` |

## 4. Risk management and exceptions

Security risks — including findings from internal audits — are recorded in `docs/risk-register.md` with an owner, a treatment and a status. A risk may be **accepted** rather than fixed, but only explicitly: an acceptance must be recorded in the register and signed off by the owner. Silent acceptance is not permitted.

Any exception to this policy must be recorded in the risk register, with a reason and a review date, before the exception is taken.

## 5. Enforcement

Access is granted on the least-privilege principle and reviewed when a person's role changes or they leave. Deliberate misuse of platform data, or deliberate circumvention of a control in this policy, is a disciplinary matter — REVIEW (owner): confirm this aligns with the organisation's disciplinary procedure and reference it here.

## 6. Related documents

`docs/data-breach-response-plan.md` · `docs/breach-register.md` · `docs/risk-register.md` · `docs/third-party-dpa.md` · `docs/dpia.md` · `docs/ropa.md` · `docs/data-retention-schedule.md` · `docs/sar-procedure.md` · `docs/dpo-decision.md` · `docs/security-audit-2026-08-12.md`

## Version history

| Version | Date | Author | Change | Approval |
|---|---|---|---|---|
| 1.0 | 2026-08-26 | System | Initial policy — records the controls implemented as at this date, following the 2026-08-12 security audit and the 2026-08-26 posture assessment | **REVIEW (owner): approve** |
