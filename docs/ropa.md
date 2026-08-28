# Records of Processing Activities (ROPA)

> **Data Controller**: Matrix Advanced Inspection Services
> **Last updated**: 2026-08-26
> **Legal basis reference**: UK GDPR Article 30
> **Controller contact for data protection matters**: REVIEW (owner): name, role and email of the Designated Data Protection Contact appointed in `docs/dpo-decision.md`

## Processing Activities

### 1. User Authentication

| Field | Detail |
|---|---|
| **Purpose** | Verify user identity and manage access to the NDT Suite platform |
| **Lawful Basis** | Article 6(1)(b) — Performance of contract (employment/service agreement) |
| **Data Subjects** | Employees, contractors |
| **Data Categories** | Email address, hashed password, login timestamps, IP address |
| **Recipients** | Supabase (data processor), organisation administrators |
| **Retention** | Duration of employment + 6 years |
| **International Transfers** | Stored and processed by Supabase in **eu-west-2 (London, UK)**; infrastructure sub-processed to AWS. Supabase Inc. is US-incorporated, so Standard Contractual Clauses apply per the Supabase DPA (see `docs/third-party-dpa.md`) |
| **Security Measures** | Bcrypt hashing, rate limiting, account lockout, TLS encryption |

### 2. User Profile Management

| Field | Detail |
|---|---|
| **Purpose** | Store employee contact and identification information for workforce management |
| **Lawful Basis** | Article 6(1)(f) — Legitimate interest (employer workforce management) |
| **Data Subjects** | Employees, contractors |
| **Data Categories** | Name, email, mobile number, home address, date of birth, next of kin, emergency contact, profile photo |
| **Recipients** | Organisation administrators, managers (elevated access only) |
| **Retention** | Duration of employment + 6 years |
| **International Transfers** | Stored and processed by Supabase in **eu-west-2 (London, UK)**; infrastructure sub-processed to AWS. Supabase Inc. is US-incorporated, so Standard Contractual Clauses apply per the Supabase DPA (see `docs/third-party-dpa.md`) |
| **Security Measures** | Row-Level Security, role-based access control, PII masking on personnel views |

### 3. Competency & Certification Tracking

| Field | Detail |
|---|---|
| **Purpose** | Track NDT qualifications, certifications, and training records for regulatory compliance |
| **Lawful Basis** | Article 6(1)(c) — Legal obligation (industry safety regulations: PED 2014/68/EU, EN ISO 9712, ASME) |
| **Data Subjects** | NDT technicians, inspectors |
| **Data Categories** | Qualification type, issuing body, certification ID, expiry date, supporting documents, verification records |
| **Recipients** | Organisation administrators, competency verifiers, regulatory auditors (on request) |
| **Retention** | Expiry date + 6 years |
| **International Transfers** | Stored and processed by Supabase in **eu-west-2 (London, UK)**; infrastructure sub-processed to AWS. Supabase Inc. is US-incorporated, so Standard Contractual Clauses apply per the Supabase DPA (see `docs/third-party-dpa.md`) |
| **Security Measures** | Row-Level Security, audit trail for all changes, document access logging |

### 4. Document Control

| Field | Detail |
|---|---|
| **Purpose** | Manage controlled documents with version tracking and approval workflows |
| **Lawful Basis** | Article 6(1)(f) — Legitimate interest (quality management system) |
| **Data Subjects** | Document authors, reviewers, approvers |
| **Data Categories** | Document metadata, author name, reviewer name, approval records, revision history |
| **Recipients** | Organisation members (per document access rules) |
| **Retention** | Per document control policy (typically lifetime of quality system) |
| **International Transfers** | Stored and processed by Supabase in **eu-west-2 (London, UK)**; infrastructure sub-processed to AWS. Supabase Inc. is US-incorporated, so Standard Contractual Clauses apply per the Supabase DPA (see `docs/third-party-dpa.md`) |
| **Security Measures** | Row-Level Security, version control, approval workflow enforcement |

### 5. Activity Logging

| Field | Detail |
|---|---|
| **Purpose** | Maintain audit trail of system actions for security monitoring and compliance |
| **Lawful Basis** | Article 6(1)(f) — Legitimate interest (security, compliance auditing) |
| **Data Subjects** | All system users |
| **Data Categories** | User ID, action type, timestamp, entity affected, IP address, user agent |
| **Recipients** | System administrators |
| **Retention** | 730 days (24 months) — see `docs/data-retention-schedule.md` |
| **International Transfers** | Stored and processed by Supabase in **eu-west-2 (London, UK)**; infrastructure sub-processed to AWS. Supabase Inc. is US-incorporated, so Standard Contractual Clauses apply per the Supabase DPA (see `docs/third-party-dpa.md`) |
| **Security Measures** | Append-only logging, admin-only access, anonymisation on account deletion |

### 6. Personnel Management

| Field | Detail |
|---|---|
| **Purpose** | Enable managers and administrators to view and manage employee records |
| **Lawful Basis** | Article 6(1)(f) — Legitimate interest (employer workforce management) |
| **Data Subjects** | Employees, contractors |
| **Data Categories** | All profile fields, competency records, organisation membership |
| **Recipients** | Managers, organisation administrators (elevated access only) |
| **Retention** | Same as user profile |
| **International Transfers** | Stored and processed by Supabase in **eu-west-2 (London, UK)**; infrastructure sub-processed to AWS. Supabase Inc. is US-incorporated, so Standard Contractual Clauses apply per the Supabase DPA (see `docs/third-party-dpa.md`) |
| **Security Measures** | Elevated access requirement, PII masking with audit-logged reveals |

## Data Processors

Full records — including sub-processors, safeguards and outstanding actions — are held in `docs/third-party-dpa.md`.

| Processor | Purpose | DPA Status | Location |
|---|---|---|---|
| Supabase Inc. | Database hosting, authentication, file storage, edge functions | REVIEW (owner): countersign pending | eu-west-2 (London, UK); infrastructure sub-processed to AWS |
| Vercel Inc. | Frontend hosting and edge delivery | REVIEW (owner): not yet established | REVIEW (owner): confirm region |
| Resend | Transactional email delivery (recipient addresses and message content transit this service) | REVIEW (owner): not yet established | REVIEW (owner): confirm region |
| GitLab Inc. / GitHub, Inc. | Source code hosting (no data-subject personal data by policy; contributor commit metadata only) | REVIEW (owner): not yet established | REVIEW (owner): confirm region |
| Google (Gemini API) | Engineering drawing extraction (no personnel personal data by design) | REVIEW (owner): not yet established | REVIEW (owner): confirm region |

## Data Subject Rights

The following rights are implemented in the NDT Suite platform:

| Right | Implementation | Location |
|---|---|---|
| Right of Access (Art. 15) | "Download My Data" feature | Profile page |
| Right to Rectification (Art. 16) | Profile editing, competency editing | Profile page, personnel page |
| Right to Erasure (Art. 17) | "Delete My Account" feature | Profile page |
| Right to Data Portability (Art. 20) | JSON/CSV data export | Profile page |
| Right to Object (Art. 21) | Contact data controller | Privacy policy |
| Right to Restrict Processing (Art. 18) | Contact data controller | Privacy policy |
