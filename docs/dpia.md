# Data Protection Impact Assessment (DPIA)

> **Data Controller**: Matrix Advanced Inspection Services
> **System**: Matrix — Workforce Competency Management Platform
> **Assessment Date**: 2026-02-20
> **Assessor**: [YOUR NAME / ROLE]
> **Review Date**: 2027-02-20 (annual)

## 1. Why This DPIA Is Required

Under ICO guidance, a DPIA is required when processing is likely to result in a high risk to individuals. The following screening criteria are met:

- **Employee data processed at scale**: NDT Suite manages personal data (contact details, qualifications, employment records) for multiple organisations across the NDT industry
- **Data affects livelihoods**: Competency records directly determine whether a technician is permitted to work. An inaccurate or missing record could prevent employment
- **Multi-tenant architecture**: Data isolation failure between organisations could expose personal data to unauthorised parties
- **Special category adjacent**: While not strictly special category data, employment qualifications and certifications are closely linked to professional standing and livelihood

## 2. Description of Processing

### 2.1 What data is processed?

| Category | Fields | Source |
|---|---|---|
| **Identity** | Username, email address | User registration |
| **Contact** | Mobile number, contact email, home address, nearest UK train station | User/admin input |
| **Personal** | Date of birth, profile photo | User/admin input |
| **Emergency** | Next of kin name, emergency contact number | User/admin input |
| **Employment** | Organisation, role, Vantage number | Admin assignment |
| **Qualifications** | Certification type, issuing body, certification ID, expiry date, supporting documents, verification records | User/admin input, document upload |
| **Audit** | Login timestamps, actions performed, IP address, user agent | System generated |

### 2.2 Who are the data subjects?

- NDT technicians and inspectors
- Organisation administrators and managers
- Contractors and temporary personnel

### 2.3 How is data collected?

- Direct input by the individual (profile, competencies)
- Input by administrators on behalf of the individual (personnel management)
- Automatically generated (activity logs, authentication events)
- Document upload (competency certificates, qualification evidence)

### 2.4 What is the lawful basis?

| Processing Activity | Lawful Basis | Justification |
|---|---|---|
| Authentication | Art. 6(1)(b) Contract | Necessary to provide the service |
| Profile management | Art. 6(1)(f) Legitimate interest | Employer workforce management (see LIA) |
| Competency tracking | Art. 6(1)(c) Legal obligation | Industry regulations (PED 2014/68/EU, EN ISO 9712, ASME) |
| Personnel management | Art. 6(1)(f) Legitimate interest | Employer operational management (see LIA) |
| Activity logging | Art. 6(1)(f) Legitimate interest | Security monitoring, compliance auditing (see LIA) |
| Document control | Art. 6(1)(f) Legitimate interest | Quality management system maintenance (see LIA) |

### 2.5 Who has access?

| Role | Access Level | Justification |
|---|---|---|
| Individual user | Own profile, own competencies | Self-management |
| Manager (org_admin) | Personnel in their organisation | Operational management |
| System admin | All data across organisations | System administration |
| Supabase (processor) | All data (infrastructure) | Hosting and storage (DPA in place) |

### 2.6 Data retention

See `docs/data-retention-schedule.md` for full retention periods. Summary:
- Profiles: employment + 6 years
- Competencies: expiry + 6 years
- Activity logs: 3 years
- Resolved requests: 90 days

### 2.7 International transfers

Data is processed by Supabase Inc. Hosting region is configurable per project. Where data is stored outside the UK, Standard Contractual Clauses apply per the Supabase DPA.

## 3. Necessity and Proportionality

### 3.1 Is the processing necessary?

**Yes.** NDT industry regulations legally require employers to maintain verifiable records of technician qualifications. There is no less intrusive way to comply with PED 2014/68/EU, EN ISO 9712, and ASME requirements than maintaining a structured competency management system.

### 3.2 Is the data minimised?

**Yes.** Each field collected serves a documented business purpose (see `docs/field-justification-matrix.md`). The system does not use `SELECT *` queries, does not collect analytics data, and does not use tracking technologies.

### 3.3 Is data quality maintained?

**Yes.** Users can update their own profile data (Article 16 — Right to Rectification). Competency records include verification workflows. Change history is maintained for audit purposes.

### 3.4 Are data subjects informed?

**Yes.** Privacy policy is publicly accessible at `/privacy` (no authentication required). It covers all Article 13/14 requirements including: data collected, lawful basis, retention periods, user rights, and complaint procedures.

## 4. Risk Assessment

### 4.1 Risks to individuals

| Risk | Likelihood | Severity | Overall | Mitigation |
|---|---|---|---|---|
| **Unauthorised access to PII** (address, DOB, emergency contacts) | Low | High | Medium | Row-Level Security, PII masking with audit-logged reveals, role-based access control |
| **Cross-tenant data exposure** (Organisation A sees Organisation B's data) | Very Low | Critical | Medium | RLS enforces organisation_id isolation on every query, tested with multiple roles |
| **Incorrect competency record prevents employment** | Low | High | Medium | Change history audit trail, verification workflow, user can view own records |
| **Data breach exposing employee data** | Low | High | Medium | Bcrypt password hashing, rate limiting, CSP headers, TLS encryption, no third-party tracking |
| **Inability to exercise GDPR rights** | Very Low | Medium | Low | Self-service data export, self-service account deletion, profile editing |
| **Excessive data retention** | Low | Medium | Low | Automated retention policies, documented retention schedule |
| **Processor non-compliance** (Supabase) | Very Low | High | Low | DPA in place, SOC 2 certified, annual processor review |

### 4.2 Risk scoring methodology

- **Likelihood**: Very Low / Low / Medium / High
- **Severity**: Low / Medium / High / Critical
- **Overall**: Combination score determining required mitigation level

## 5. Mitigation Measures

### 5.1 Technical measures (implemented)

| Measure | Status | Detail |
|---|---|---|
| Row-Level Security | Active | Multi-tenant data isolation enforced at database level |
| Role-based access control | Active | 5 roles: viewer, editor, org_admin, admin, with cascading permissions |
| Password hashing | Active | bcrypt with salt |
| Rate limiting | Active | 5 login attempts per 15 minutes per email |
| Content Security Policy | Active | Strict CSP preventing XSS, clickjacking, code injection |
| PII masking | Active | Sensitive fields masked by default on personnel views, reveals audit-logged |
| Data export | Active | Self-service "Download My Data" (HTML report + JSON) |
| Account deletion | Active | Self-service "Delete My Account" with activity log anonymisation |
| Error log sanitisation | Active | No component stacks or URL query params in localStorage error logs |
| Dependency monitoring | Active | Automated npm audit in CI pipeline |
| Input validation | Active | SQL injection prevention, XSS protection, file upload validation |

### 5.2 Organisational measures (required)

| Measure | Status | Detail |
|---|---|---|
| Privacy policy | Published | Publicly accessible at `/privacy` |
| Data retention schedule | Documented | `docs/data-retention-schedule.md` |
| ROPA | Documented | `docs/ropa.md` |
| Breach response plan | Documented | `docs/data-breach-response-plan.md` |
| Supabase DPA | [PENDING] | Download and countersign from supabase.com/legal/dpa |
| Staff training | [PENDING] | See `docs/training-records.md` |
| Annual audit | [PENDING] | See `docs/annual-audit-checklist.md` |
| DPO decision | Documented | `docs/dpo-decision.md` |

## 6. Consultation

### 6.1 Data subjects

Data subjects are informed of processing via the privacy policy. The self-service data export and deletion features were implemented to address user rights without requiring manual intervention.

### 6.2 ICO consultation

Prior consultation with the ICO (Article 36) is not required because the residual risks identified in Section 4 have been mitigated to an acceptable level through the measures described in Section 5.

## 7. Decision

Based on this assessment:

- The processing is **necessary** for compliance with NDT industry regulations
- The processing is **proportionate** — only data required for workforce management is collected
- **Technical and organisational measures** adequately mitigate identified risks
- **Residual risk** to individuals is **acceptable**

**Decision**: Processing may proceed.

**Signed**: [YOUR NAME, ROLE, DATE]

## 8. Review

This DPIA must be reviewed:
- Annually (next review: 2027-02-20)
- When processing activities change significantly
- When a data breach occurs
- When new data categories are introduced

| Review Date | Reviewer | Changes Made | Outcome |
|---|---|---|---|
| 2026-02-20 | [YOUR NAME] | Initial assessment | Approved |
