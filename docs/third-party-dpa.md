# Third-Party Processor Register & Data Processing Agreements

> **Data Controller**: Matrix Advanced Inspection Services
> **Statutory basis**: UK GDPR Article 28 (processor obligations) and Article 30(1)(d) (record of recipients)
> **Last updated**: 2026-08-26
> **Review frequency**: annually, and whenever a service is added, removed, or changes sub-processors
> **REVIEW (owner): review cadence.** The per-service review dates below are set to an annual cadence with a recommended next-due date of 2027-08-26. Confirm the cadence and the dates, or set your own.

> **Change note (2026-08-26).** This document previously asserted "No Other Third-Party Processors". That statement was **false** — the platform's frontend is hosted by Vercel, transactional email is delivered by Resend, source code is hosted by GitLab and GitHub, and engineering drawings are sent to Google's Gemini API for extraction. The claim has been removed and replaced by the register below. This correction was raised by the ISO 27001-style posture assessment recorded in `docs/plans/2026-08-26-security-hardening-and-platform-ops-plan.md` (finding A9).

## Register at a glance

| # | Service | Role | Personal data touched | DPA / terms | Review date |
|---|---|---|---|---|---|
| P1 | Supabase Inc. | Processor — database, authentication, storage, edge functions | All application personal data | https://supabase.com/legal/dpa — **REVIEW (owner): countersign pending** | Annual, next 2027-08-26 |
| P2 | Vercel Inc. | Processor — frontend hosting and edge delivery | Request metadata only (IP address, user agent) | **REVIEW (owner): attach link** | Annual, next 2027-08-26 |
| P3 | Resend | Processor — transactional email delivery | Recipient email address, message content | **REVIEW (owner): attach link** | Annual, next 2027-08-26 |
| P4 | GitLab Inc. | Processor — source code hosting (primary) | Contributor commit metadata only; no data-subject data by policy | **REVIEW (owner): attach link** | Annual, next 2027-08-26 |
| P5 | GitHub, Inc. | Processor — source code hosting (mirror) | Contributor commit metadata only; no data-subject data by policy | **REVIEW (owner): attach link** | Annual, next 2027-08-26 |
| P6 | Google (Gemini API) | Processor — engineering drawing extraction | None by design (engineering drawings only) | **REVIEW (owner): attach link** | Annual, next 2027-08-26 |

Detailed records follow. Every entry states what the service actually receives, not what it is capable of receiving.

---

## P1 — Supabase Inc.

| Field | Detail |
|---|---|
| **Processor** | Supabase Inc. |
| **Services** | Database hosting (PostgreSQL), user authentication, file storage (S3-compatible), Edge Functions |
| **DPA location** | https://supabase.com/legal/dpa |
| **DPA status** | **REVIEW (owner): countersign pending** — download, review against Articles 28 and 32, countersign, and file with the organisation's records. This is the single most material outstanding supplier action, because Supabase processes all application personal data. |
| **Data processed** | All application data: user profiles (name, contact details, home address, date of birth, next of kin), employee competencies and their supporting certificate documents, controlled documents, activity logs, and authentication credentials |
| **Sub-processors** | Amazon Web Services (underlying infrastructure), per Supabase's published sub-processor list. AWS is the sub-processor on which the eu-west-2 region below is operated. |
| **Data location** | **eu-west-2 (London)** — production project `ntrgjqrbewbvwofupphn`. The platform was migrated to this region on 2026-08-17; the migration record is `docs/plans/2026-08-17-supabase-project-migration-runbook.md`. UK-based processing on UK infrastructure. |
| **Transfers** | Supabase Inc. is US-incorporated, so the controller-to-processor relationship may involve access from outside the UK even though the data is stored in eu-west-2. Standard Contractual Clauses apply per the Supabase DPA — which is precisely why the countersignature above matters. |
| **Encryption** | At rest (AES-256), in transit (TLS 1.2+) |
| **Access controls the controller applies** | Row-Level Security on every table holding personal or tenant data; organisation-scoped isolation; six-role RBAC; private storage buckets served by short-lived signed URLs for certificate documents. See `docs/security-audit-2026-08-12.md` §"Verified-clean / positive controls". |
| **Deletion** | Data deleted within 30 days of project deletion per Supabase terms. Within the running project, erasure is performed by the platform's own account-deletion functions, which remove database rows **and** storage objects. |
| **Outstanding actions** | 1. Countersign the DPA. 2. Verify the current sub-processor list is acceptable and re-verify at each annual review. 3. Confirm the backup configuration on the production project (tracked as risk R-A2 in `docs/risk-register.md`). |

---

## P2 — Vercel Inc.

| Field | Detail |
|---|---|
| **Processor** | Vercel Inc. |
| **Services** | Hosting and edge delivery of the frontend single-page application at matrixportal.io; enforcement of the HTTP security response headers; storage of build-time environment variables |
| **DPA / terms location** | **REVIEW (owner): attach link** — obtain Vercel's data processing addendum, review against Articles 28 and 32, and record its status here. |
| **DPA status** | **REVIEW (owner): not yet established** |
| **Data processed** | **Request metadata only** — IP addresses and user agents inherent in serving HTTP requests, plus any access logging Vercel performs as hosting provider. Application personal data does **not** transit Vercel: the browser client calls Supabase directly, so profile, competency and document data never passes through the hosting layer. |
| **Environment variables held** | Frontend build configuration, including the Supabase project URL and the **anon** (public) API key. No service-role key, and no secret that grants privileged data access, is held by Vercel — verified in the security audit, which confirmed the shipped browser bundle contains only the anon key. |
| **Safeguards** | All traffic is HTTPS with HSTS `max-age=63072000; includeSubDomains; preload`. A strict Content-Security-Policy (`default-src 'none'; script-src 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a restrictive `Permissions-Policy` are served on every response; `/share/*` additionally carries `X-Robots-Tag: noindex, nofollow`. All are defined in `vercel.json`. |
| **Sub-processors** | Per Vercel's published sub-processor list — **REVIEW (owner): obtain and record** |
| **Data location** | **REVIEW (owner): confirm the deployment region** and record it, together with the transfer mechanism Vercel relies on. |
| **Notes** | HSTS `preload` is a one-way commitment already live across all matrixportal.io subdomains. It constrains any future subdomain to HTTPS from day one. |

---

## P3 — Resend

| Field | Detail |
|---|---|
| **Processor** | Resend |
| **Services** | Transactional email delivery from the platform's verified brand domain — competency expiry reminders, account and permission workflow notifications, and administrator-composed messages |
| **DPA / terms location** | **REVIEW (owner): attach link** |
| **DPA status** | **REVIEW (owner): not yet established** |
| **Data processed** | **Recipient email addresses transit this service**, together with the subject line and message body, which may name the recipient and reference their certifications (for example, an expiry reminder identifying the qualification that is lapsing). This is personal data and makes Resend a processor. |
| **Safeguards** | Recipients are validated server-side before dispatch: the `send-email` edge function requires every recipient to resolve to a profile within the caller's own organisation (administrators may address any profile), caps a send at 50 recipients and 200 KB, and permits only an allow-list of message headers — closing the arbitrary-recipient relay identified as audit finding M5. Recipient addresses are **masked in all function logs** via the shared `maskEmail` helper, closing the log-exposure half of audit finding L8. The API key is held as a server-side edge function secret and is never exposed to the browser. |
| **Sub-processors** | Per Resend's published sub-processor list — **REVIEW (owner): obtain and record** |
| **Data location** | **REVIEW (owner): confirm the processing region** and the transfer mechanism relied on. |
| **Retention at the processor** | **REVIEW (owner): confirm Resend's log/message retention period** and record it, so it can be reconciled with `docs/data-retention-schedule.md`. |

---

## P4 / P5 — GitLab Inc. and GitHub, Inc.

Both services host the same source repository; GitLab is the primary (and carries the CI pipeline), GitHub is a mirror. They are recorded together because the data position is identical.

| Field | Detail |
|---|---|
| **Processors** | GitLab Inc. (primary, also runs the CI pipeline) · GitHub, Inc. (mirror) |
| **Services** | Source code hosting, version control, issue tracking, and — on GitLab — the CI pipeline that runs secret scanning, static analysis, dependency audit, linting, type-checking and the test suite |
| **DPA / terms location** | **REVIEW (owner): attach link** (one for each provider) |
| **DPA status** | **REVIEW (owner): not yet established** |
| **Data processed** | **Application source code only — no data-subject personal data, by policy.** The one category of personal data inherently present is **contributor commit metadata**: the name and email address recorded against each commit by version control, which is personal data of the development team rather than of platform data subjects. |
| **Standing policy — database dumps are banned from the repository** | Production database dumps contain personal data and password hashes and must **never** be committed, and must be held outside both the repository and any cloud-sync folder. This rule was set during the 2026-08-17 project migration and is reasserted in the backup design: backup archives are written encrypted, outside the repository and outside OneDrive. |
| **Safeguards** | No secrets are committed; `.env` is untracked; the CI pipeline runs a blocking `gitleaks` secret scan and a blocking `semgrep` static analysis pass (OWASP Top Ten and security-audit rulesets) on every run, so an accidental credential or a known-insecure pattern fails the build rather than landing silently. The pipeline holds **no Supabase credentials** — a deliberate control that keeps the blast radius of a CI compromise away from production data. |
| **Data location** | **REVIEW (owner): confirm the hosting region for each provider** and the transfer mechanism relied on. |

---

## P6 — Google (Gemini API, via the `gemini-proxy` edge function)

| Field | Detail |
|---|---|
| **Processor** | Google (Gemini API) |
| **Services** | Vision-language extraction of vessel geometry from general-arrangement engineering drawings, used by the Vessel Modeler's drawing import feature |
| **DPA / terms location** | **REVIEW (owner): attach link** — record which Google API terms apply to the account in use. |
| **DPA status** | **REVIEW (owner): not yet established** |
| **Data processed** | **No personnel personal data, by design.** What is sent is an image crop of an engineering drawing — vessel dimensions, nozzle schedules, tag numbers — together with the extraction prompt. Drawings are engineering documents about equipment, not about people. |
| **Residual data risk to manage** | A general-arrangement drawing's title block may incidentally carry a draughtsman's or approver's **name and signature**. This is incidental personal data that could be transmitted with a crop. **REVIEW (owner): recommended** — record this as an accepted, low-risk incidental transfer, or instruct users to crop away the title block before import. |
| **Safeguards** | The API key is held **server-side only**. The `gemini-proxy` edge function attaches `GEMINI_API_KEY` as an `x-goog-api-key` request header and forwards Google's response; it never returns the key to the browser. This closed audit finding **C1**, under which the function had previously vended the live key to every authenticated user — including `viewer` accounts — and the key had travelled in outbound URL query strings. The function additionally enforces a model allow-list. The key was rotated on 2026-08-17 during the platform migration. |
| **Sub-processors** | Per Google's published terms — **REVIEW (owner): obtain and record** |
| **Data location** | **REVIEW (owner): confirm the processing region.** |
| **Model-training position** | **REVIEW (owner): confirm** whether the API tier in use excludes submitted content from model training, and record the answer. This determines whether drawing content — which is commercially confidential client engineering data even when it holds no personal data — is retained by the processor. |

---

## Services deliberately **not** used

Recorded so their absence is verifiable rather than assumed. Each was re-confirmed against the source tree during the 2026-08-12 security audit:

- **No analytics or product telemetry** — no Google Analytics, no Mixpanel, no equivalent.
- **No advertising or tracking pixels.**
- **No third-party error-tracking or session-replay service** — client error logs stay in the browser's local storage under a 7-day time-to-live and are sanitised of component stacks and URL query parameters.
- **No third-party CDN for user-uploaded content** — avatars, certificate documents and scan data are served from Supabase storage.
- **No payment processor** — the platform takes no payments.

## Adding a new processor

Before any new third-party service receives personal data:

1. Add a row and a detail record to this register.
2. Obtain and countersign the provider's DPA; record its location and status.
3. Record the processing region and the transfer mechanism.
4. Add the service to `docs/ropa.md` under "Recipients" for every affected processing activity.
5. If the service introduces a new category of risk, add it to `docs/risk-register.md`.
6. If it materially changes the processing, review `docs/dpia.md`.
