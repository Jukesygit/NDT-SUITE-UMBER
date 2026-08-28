# NDT Suite - Data Retention Schedule

> **Status**: **Operative pending sign-off — REVIEW (owner)**. These periods are the ones the platform is being operated to; formal business sign-off is outstanding.
> **Last updated**: 2026-08-26
> **Review frequency**: Annually, or when processing activities change.

## Retention Periods

| Data Category | Retention Period | Justification | Deletion Method |
|---|---|---|---|
| **User Profiles** | Duration of employment + 6 years | Limitation Act 1980 (6-year claim window) | Anonymise on account deletion; auto-purge inactive accounts after 6 years |
| **Employee Competencies** | Expiry date + 6 years | Regulatory compliance evidence for NDT qualifications (PED, ASME, EN ISO 9712) | Soft-delete, then hard-delete after retention period |
| **Competency History** | Same as parent competency | Audit trail for qualification changes | Cascade with competency deletion |
| **Competency Documents** | Same as parent competency | Supporting certificates and evidence | Delete from storage bucket on cascade |
| **Activity Logs** | **730 days (24 months) from creation** | Sufficient for internal audit and incident investigation | Automated nightly purge — `scheduled_purge_activity_logs(730)`, run by the pg_cron job **`activity-log-retention-nightly`** at 03:43 UTC (migration `20260826150000` also unschedules the never-activated legacy name `activity-log-retention` so two purges can never coexist) |
| **Account Requests** | 90 days after resolution (approved/rejected) | No ongoing need after decision is made | Auto-delete resolved requests |
| **Permission Requests** | 90 days after resolution | No ongoing need after decision is made | Auto-delete resolved requests |
| **System Announcements** | 1 year after creation | Operational communications, not personal data | Auto-delete |
| **Avatar Images** | Deleted with user profile | Personal data, no independent retention need | Delete from storage bucket |
| **Error Logs (localStorage)** | 7 days | Debugging only, may contain incidental PII | Client-side TTL on read |

## Lawful Basis for Retention

All retention periods are justified under:
- **Article 6(1)(c)** — Legal obligation: NDT qualification records required by industry regulations
- **Article 6(1)(f)** — Legitimate interest: employer's need to manage workforce competency and safety compliance
- **Limitation Act 1980** — 6-year statutory limitation period for contractual and tortious claims

## Inactive Account Policy

- Accounts with no login activity for **2 years** will be flagged for review
- Accounts with no login activity for **3 years** will be deactivated (soft-delete)
- Deactivated accounts will be permanently deleted after the 6-year retention window

## Automation status

Retention periods are only as real as the jobs that enforce them. Current position, recorded honestly so the gap between policy and enforcement is visible:

| Purge | Implementing function | Scheduled job | Status |
|---|---|---|---|
| Activity logs (730 days) | `public.scheduled_purge_activity_logs(p_older_than_days DEFAULT 730)` — migration `20260626170000_activity_log_retention.sql` | `activity-log-retention-nightly`, nightly 03:43 UTC | **Scheduled by migration `20260826150000_db_state_ledger.sql` (2026-08-27).** The function is deployed and is the only permitted deletion path into the append-only activity log. Until the first run is confirmed firing (check `cron.job_run_details`), log entries persist beyond 730 days |
| Account and permission requests (90 days), inactive-profile sweep | `public.run_data_retention()` — `database/data-retention.sql` | `data-retention`, weekly Sunday 03:11 UTC (documented example) | **Not yet scheduled.** The function exists; the schedule is commented out |

This is the substance of finding **M8** in `docs/security-audit-2026-08-12.md` ("retention-purge functions exist but pg_cron schedules are commented out — PII may be retained indefinitely"), tracked as risk **R-M8** in `docs/risk-register.md`. Note the operational history: a previous cron job on this platform failed silently for months, so "scheduled" is not the same as "verified firing" — confirm the first successful run and re-check at each annual review.

**Window single-sourcing.** The activity-log window is **730 days**, now single-sourced: `database/data-retention.sql` was aligned 2026-08-27 — its 3-year figure removed along with the resurrected `cleanup_old_activity_logs()` function (a security-dropped deleter that script would have restored; see Decision Log). `scheduled_purge_activity_logs(730)` is the single deletion path.

## Responsibilities

- **Data Controller**: Matrix Advanced Inspection Services — REVIEW (owner): name the accountable individual
- **Technical Implementation**: Automated via pg_cron jobs in the Supabase project (see *Automation status* above)
- **Review**: Annual review by the organisation administrator, documented in this schedule

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-20 | Initial draft | System |
| 2026-08-26 | Status moved from Draft to operative-pending-sign-off; activity-log retention aligned to the ratified 730-day window and the automated purge job named; automation status recorded, including the unscheduled jobs behind audit finding M8 | System |
