# NDT Suite - Data Retention Schedule

> **Status**: Draft — requires business sign-off before implementation.
> **Last updated**: 2026-02-20
> **Review frequency**: Annually, or when processing activities change.

## Retention Periods

| Data Category | Retention Period | Justification | Deletion Method |
|---|---|---|---|
| **User Profiles** | Duration of employment + 6 years | Limitation Act 1980 (6-year claim window) | Anonymise on account deletion; auto-purge inactive accounts after 6 years |
| **Employee Competencies** | Expiry date + 6 years | Regulatory compliance evidence for NDT qualifications (PED, ASME, EN ISO 9712) | Soft-delete, then hard-delete after retention period |
| **Competency History** | Same as parent competency | Audit trail for qualification changes | Cascade with competency deletion |
| **Competency Documents** | Same as parent competency | Supporting certificates and evidence | Delete from storage bucket on cascade |
| **Activity Logs** | 3 years from creation | Sufficient for internal audit and incident investigation | Auto-purge entries older than 3 years |
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

## Responsibilities

- **Data Controller**: Organisation administrator
- **Technical Implementation**: Automated via Supabase scheduled functions
- **Review**: Annual review by organisation admin, documented in this schedule

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-02-20 | Initial draft | System |
