# Annual Data Protection Audit Checklist

> **Data Controller**: [YOUR COMPANY NAME]
> **Frequency**: Annually (and after any breach or significant processing change)
> **Next Due**: 2027-02-20

## Instructions

Complete each item. Record the date, findings, and any actions required. File the completed checklist as evidence of ongoing compliance.

---

## 1. Governance

| # | Check | Status | Date | Findings / Actions |
|---|---|---|---|---|
| 1.1 | DPIA is current and reflects actual processing | | | |
| 1.2 | ROPA is current and complete | | | |
| 1.3 | Privacy policy is published and accurate | | | |
| 1.4 | Data retention schedule is current | | | |
| 1.5 | DPO/data protection contact is appointed and documented | | | |
| 1.6 | Breach response plan is current | | | |
| 1.7 | Legitimate interest assessments are current | | | |
| 1.8 | Field justification matrix is current | | | |

## 2. Data Subject Rights

| # | Check | Status | Date | Findings / Actions |
|---|---|---|---|---|
| 2.1 | "Download My Data" feature is functional (test it) | | | |
| 2.2 | "Delete My Account" feature is functional (test with throwaway account) | | | |
| 2.3 | Profile editing works correctly | | | |
| 2.4 | SAR procedure is documented and staff know how to recognise a SAR | | | |
| 2.5 | SAR register is maintained (review any SARs from the past year) | | | |
| 2.6 | Privacy policy is accessible without authentication | | | |

## 3. Data Minimisation & Retention

| # | Check | Status | Date | Findings / Actions |
|---|---|---|---|---|
| 3.1 | Retention automation is running (check last execution) | | | |
| 3.2 | No data is retained beyond the documented retention period | | | |
| 3.3 | All collected fields are still justified (review field matrix) | | | |
| 3.4 | No new data collection has been added without updating the DPIA | | | |

## 4. Security

| # | Check | Status | Date | Findings / Actions |
|---|---|---|---|---|
| 4.1 | Run `npm audit` — no critical or high vulnerabilities | | | |
| 4.2 | Dependencies are up to date (check for major version updates) | | | |
| 4.3 | RLS policies are active on all tables containing personal data | | | |
| 4.4 | PII masking is working on personnel views | | | |
| 4.5 | PII reveal audit logs are being recorded | | | |
| 4.6 | Rate limiting is active on authentication | | | |
| 4.7 | CSP headers are present and strict | | | |
| 4.8 | Error logs in localStorage do not contain PII | | | |
| 4.9 | No credentials, API keys, or secrets in source code | | | |
| 4.10 | Supabase project security settings reviewed | | | |

## 5. Processor Management

| # | Check | Status | Date | Findings / Actions |
|---|---|---|---|---|
| 5.1 | Supabase DPA is on file and current | | | |
| 5.2 | Supabase sub-processor list reviewed for changes | | | |
| 5.3 | Supabase security certifications verified (SOC 2, etc.) | | | |
| 5.4 | No new third-party processors added without a DPA | | | |

## 6. Staff Training

| # | Check | Status | Date | Findings / Actions |
|---|---|---|---|---|
| 6.1 | All staff with data access have completed training | | | |
| 6.2 | Training records are up to date | | | |
| 6.3 | New starters received training within 30 days | | | |
| 6.4 | Refresher training is scheduled | | | |

## 7. Incident Review

| # | Check | Status | Date | Findings / Actions |
|---|---|---|---|---|
| 7.1 | Review breach register — any incidents in the past year? | | | |
| 7.2 | If breaches occurred, were they handled per the response plan? | | | |
| 7.3 | Breach tabletop exercise conducted this year? | | | |
| 7.4 | Lessons learned from any incidents documented? | | | |

---

## Audit Sign-Off

| Field | Detail |
|---|---|
| **Auditor** | [NAME, ROLE] |
| **Date completed** | [DATE] |
| **Overall status** | [Compliant / Partially Compliant / Non-Compliant] |
| **Actions required** | [Summary of remediation items with deadlines] |
| **Next audit due** | [DATE — 12 months from completion] |
