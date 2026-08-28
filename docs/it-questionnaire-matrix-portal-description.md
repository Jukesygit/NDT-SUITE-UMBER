# Matrix Portal — System Description for IT Questionnaire

## Submission text (as filled, 2026-08-27)

> **Purpose.** Matrix Portal (www.matrixportal.io) is the Company's internally developed
> operational platform for its non-destructive testing business. It is used to manage inspection
> projects; to model pressure vessels and visualise ultrasonic inspection data (corrosion mapping
> and wall-thickness analysis); to generate inspection reports; to manage personnel competencies,
> qualifications and certification records; and to provide clients with secure, access-controlled
> links to their inspection reports. It is used only by the Company and its engaged contractors;
> clients do not hold user accounts (they receive access-controlled report links only), and the
> system is not a product sold to third parties.
>
> **Hosting arrangements.** The system is fully cloud-hosted; the Company operates no
> on-premises servers. The web application is served by Vercel over HTTPS only, with HSTS and a
> strict Content-Security-Policy. The backend (database, authentication, file storage and
> server-side functions) runs on the Supabase managed platform, hosted on AWS in the eu-west-2
> (London) region, so application data at rest resides in the United Kingdom; Supabase acts as
> data processor with AWS as sub-processor. Transactional email is sent via Resend. Source code
> is held in private repositories with an automated CI pipeline performing secret scanning,
> static security analysis and dependency vulnerability checks on every change. The database is
> backed up automatically every day by the platform, and a secondary regime of weekly encrypted
> backups to Company-controlled AWS S3 storage is in commissioning.
>
> **User base.** Approximately 20 named user accounts, comprising Company inspection,
> engineering and administrative staff together with a small number of engaged contractor
> personnel (limited-company contractors). Clients hold no user accounts. Access is governed by
> a six-tier role model enforced at database level, with row-level security and
> organisation-scoped isolation limiting each account to its own organisation's records.
> Authentication is by individual email and password credentials with
> rate-limited sign-in and TOTP two-factor authentication; enforcement of two-factor
> authentication as mandatory for every account is implemented and in final rollout.
>
> **Support arrangements.** The system is developed, operated and supported in-house by its two
> maintainers, Jonas Whitehead and David Emery, on a business-hours basis; there is no external
> managed-service provider or outsourced support contract. The underlying platforms (Vercel,
> Supabase/AWS, Resend) are supported by their vendors under standard commercial terms.
> Operational procedures covering deployment, backup and restore, disaster recovery, incident
> response and credential rotation are documented as internal runbooks, and personal-data
> incidents are handled under the Company's documented breach response plan and breach register.
>
> **Privileged access.** Privileged access to the Company's systems is held by two named
> individuals only: Jonas Whitehead, the current administrator, and David Emery, who jointly
> administer and maintain the system. Besides the current administrator, David Emery is
> therefore the only other holder of privileged access. Each holds an individual named account
> with no shared logins, and no contractor, supplier or other third party holds any credential;
> the CI/CD system holds no database credentials. Within the application, elevated roles are limited
> to a small number of named staff accounts and are organisation-scoped, and administrative
> actions are recorded in an immutable, admin-only audit log.

*Pre-submission sanity checks: if the 2FA frontend has shipped by submission day, change "in
final rollout" to "enforced for all accounts"; if the S3 backup has had its first verified run,
change "in commissioning" to "operational". The working notes below informed this text.*

---

> Drafted 2026-08-27 from repository and operational records. Items marked **[CONFIRM (owner)]**
> are factual attestations only the administrator can make — verify before submission.
> Companion documents: `docs/dpia.md`, `docs/third-party-dpa.md`, `docs/information-security-policy.md`,
> `docs/risk-register.md`.

## Purpose

Matrix Portal (`www.matrixportal.io`) is the Company's line-of-business platform for
non-destructive testing (NDT) operations. It provides: inspection project management; 3D
pressure-vessel modelling with ultrasonic scan (C-scan/PAUT) data visualisation and wall-loss
analysis; inspection report generation; personnel competency and certification management
(qualifications, expiry tracking, supporting certificates); and controlled, loginless
report-sharing links for clients. It is an internally developed, operational system — not a
product sold to third parties. *(A controlled-document-management module exists in the codebase
but was experimental and is disabled via the tab-visibility feature flag — do not list it as an
active function. Certificate storage for competencies is separate and active.)*

## Hosting arrangements

The system is cloud-hosted with no on-premises server estate:

- **Application frontend** — single-page web application served by **Vercel** (global CDN), HTTPS
  only with HSTS preloading and a strict Content-Security-Policy.
- **Backend** — **Supabase** managed platform (PostgreSQL 17 database, authentication, object
  storage, serverless edge functions), hosted in **AWS eu-west-2 (London, UK)**. All data at rest
  is in the UK region; Supabase Inc. is the processor with AWS as sub-processor (see
  `third-party-dpa.md`). The database enforces row-level security on every table with
  organisation-scoped multi-tenant isolation.
- **Email** — transactional email via **Resend**.
- **Source code and CI** — GitLab (primary, with a 7-stage pipeline including secret scanning,
  static analysis and dependency auditing) plus a GitHub mirror.
- **Backups** — daily automated platform backups (Supabase); a secondary regime of weekly
  AES-256-encrypted logical dumps to a Company-controlled AWS S3 bucket is commissioned and
  awaiting first run **[CONFIRM (owner): state as "in commissioning" or complete depending on
  status at submission]**.

## User base

Users are Company inspection/engineering staff and administrative users, plus a small number of
engaged contractor personnel (limited-company contractors) whose access is limited by tenant
isolation to their own organisation's records. **Clients hold no user accounts** — client access
is exclusively via the loginless, token-controlled report-share links. Approximately **20 active accounts** at the last verified count (2026-08-17)
**[CONFIRM (owner): current count]**. Access control is a six-tier role model (super_admin,
admin, manager, org_admin, editor, viewer) enforced in the database. Authentication is email and
password with rate-limited sign-in and TOTP two-factor authentication; a policy of **mandatory
2FA for all accounts** is implemented and in rollout **[CONFIRM (owner): "deployed" once the
frontend ships]**. Recovery is via single-use hashed backup codes and a rank-gated administrator
reset.

## Support arrangements

The system is developed, operated and supported **in-house by its two maintainers, Jonas
Whitehead and David Emery**; there is no external managed-service provider or outsourced support
contract. The underlying
platforms (Vercel, Supabase, AWS, Resend) are supported by their vendors under their standard
commercial terms. Operational procedures are documented as runbooks (deployment, backup and
restore, disaster recovery, incident response, secrets rotation — `docs/processes/`), and
personal-data incidents follow the documented breach response plan with a maintained breach
register. Support is business-hours/best-effort; there is no formal SLA to internal users. Support and
continuity arrangements — the escalation path, dual-maintainer access, and the restore drill —
are documented in `docs/processes/support-and-continuity.md` (questionnaire-ready summary at its
§6); residual continuity items are tracked as risk R-N2.

## Privileged access

Privileged access exists at two layers:

**1. Application layer.** Elevated roles within the portal are `super_admin` and `admin` (user
and organisation management, audit-log access, two-factor resets), with `manager` and
`org_admin` holding limited elevated rights (personnel/competency management; organisation-scoped
approvals respectively). The definitive roster of elevated accounts is held in the database and
should be read live before answering — Supabase dashboard SQL:

```sql
SELECT username, role, organization_id
FROM profiles
WHERE role IN ('super_admin', 'admin', 'manager', 'org_admin')
ORDER BY role, username;
```

**[CONFIRM (owner): paste/summarise the result — e.g. "besides the administrator, N staff hold
admin/manager roles: …". The repository cannot answer this; only the live database can.]**

**2. Infrastructure layer.** Privileged access to the Company's systems is held by **two named
individuals: Jonas Whitehead and David Emery**, who jointly maintain the system (owner
attestation, 2026-08-27). This covers the Supabase organisation, Vercel account, GitLab/GitHub
repositories, and the operational credentials; deployments and database changes run from the
maintainers' workstations, and the CI system deliberately holds no database credentials (a
single deployment token only). No contractor or third party holds any credential.
**[CONFIRM (owner): the domain registrar, the Google AI Studio console (Gemini API key) and the
AWS backup account — confirm whether these are single-held by Jonas Whitehead or also accessible
to David Emery, and state which in the response.]**

Suggested response wording: *"Privileged access is held by two named individuals — Jonas
Whitehead and David Emery — who jointly administer and maintain the system. No third party,
contractor or service provider holds credentials. Application-level elevated roles are limited
to [result of the query above]."*
