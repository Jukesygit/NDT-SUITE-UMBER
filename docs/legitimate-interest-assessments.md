# Legitimate Interest Assessments (LIAs)

> **Data Controller**: [YOUR COMPANY NAME]
> **Date**: 2026-02-20
> **Review Date**: 2027-02-20 (annual)

Each processing activity that relies on Article 6(1)(f) (legitimate interest) requires a three-part test to confirm it's a valid lawful basis. This document assesses each one.

---

## LIA 1: User Profile Management

**Processing**: Collecting and storing employee contact details (mobile number, home address, nearest UK train station, date of birth, next of kin, emergency contact) for workforce management.

### Part 1: Purpose Test — Is there a legitimate interest?

**Yes.** The employer has a legitimate interest in:
- Maintaining contact details for operational communication (mobilisation, shift changes)
- Holding emergency contact information for workplace safety incidents
- Recording home addresses for travel expense claims and mobilisation planning
- Knowing nearest UK train station for mobilisation logistics (NDT technicians travel to client sites)

This interest is real and current, not speculative.

### Part 2: Necessity Test — Is the processing necessary for that purpose?

**Yes.** There is no less intrusive way to maintain employee contact details for operational purposes. The alternatives are:
- Paper records — less secure, harder to update, no access control
- Asking for details each time — impractical for emergency situations
- Not collecting at all — would prevent effective workforce mobilisation and emergency response

Each field serves a specific operational need (see `docs/field-justification-matrix.md`).

### Part 3: Balancing Test — Do the individual's rights override?

**No.** The balance favours the employer's interest because:
- Data subjects **reasonably expect** their employer to hold contact details
- Access is **restricted** to managers and administrators (elevated access only)
- PII is **masked by default** on personnel views with audit-logged reveals
- Individuals can **view and update** their own data at any time
- Individuals can **export** and **delete** their data via self-service
- The data is **not used for automated decision-making** or profiling
- The data is **not shared** with third parties beyond the data processor (Supabase)

**Outcome**: Legitimate interest is a valid lawful basis for this processing.

---

## LIA 2: Personnel Management (Admin View)

**Processing**: Managers and administrators viewing employee profile data and competency records for workforce oversight.

### Part 1: Purpose Test

**Yes.** Managers need to:
- Verify team members hold current qualifications before assigning work
- Monitor certification expiry dates to prevent compliance gaps
- Manage personnel records as part of standard employer operations

### Part 2: Necessity Test

**Yes.** Managers must be able to view employee records to fulfil their supervisory responsibilities. The system restricts this access to users with elevated permissions (manager/org_admin/admin roles) and masks sensitive PII fields by default.

### Part 3: Balancing Test

**No, individual rights do not override.** Employees reasonably expect their manager to have access to their work-related records. Safeguards include:
- Only users with elevated access can view personnel data
- Sensitive fields (mobile, address, DOB, next of kin) are **masked by default**
- Revealing masked data is **audit-logged** (who, when, which field, which person)
- Employees are informed via the privacy policy

**Outcome**: Legitimate interest is valid.

---

## LIA 3: Activity Logging

**Processing**: Recording user actions (login, data changes, document uploads) for security monitoring and compliance auditing.

### Part 1: Purpose Test

**Yes.** The employer has a legitimate interest in:
- Detecting unauthorised access or suspicious activity
- Maintaining an audit trail for regulatory compliance
- Investigating security incidents
- Demonstrating compliance with data protection obligations

### Part 2: Necessity Test

**Yes.** Without activity logging:
- Security breaches would be undetectable
- Regulatory auditors could not verify qualification management processes
- Data protection compliance could not be evidenced

The logging is proportionate — it captures action type and description, not the content of data being viewed (except for PII reveals, which are specifically logged for GDPR compliance).

### Part 3: Balancing Test

**No, individual rights do not override.** The logging:
- Captures **operational actions**, not private communications or behaviour monitoring
- Is **not used for performance monitoring** or disciplinary purposes
- Has a **3-year retention period** after which logs are automatically deleted
- Is **anonymised** (not deleted) when a user deletes their account, preserving audit integrity
- Access to logs is **restricted to administrators**

**Outcome**: Legitimate interest is valid.

---

## LIA 4: Document Control

**Processing**: Recording author names, reviewer names, and approval records as part of the controlled document management system.

### Part 1: Purpose Test

**Yes.** Quality management systems (ISO 9001, industry-specific standards) require document control with traceable authorship and approval chains. This is a standard business practice in regulated industries.

### Part 2: Necessity Test

**Yes.** Document control without attribution would fail regulatory audit. The alternative (anonymous documents) would violate quality management requirements.

### Part 3: Balancing Test

**No, individual rights do not override.** Employees in regulated industries reasonably expect their name to be associated with documents they author, review, or approve. This is a fundamental part of professional accountability in NDT.

**Outcome**: Legitimate interest is valid.

---

## Summary

| Processing Activity | LIA Result | Safeguards |
|---|---|---|
| Profile management | Valid | PII masking, self-service access, data export/deletion |
| Personnel management | Valid | Elevated access only, PII masking, audit-logged reveals |
| Activity logging | Valid | Admin-only access, 3-year retention, anonymisation on deletion |
| Document control | Valid | Standard professional accountability, regulated industry norm |

All processing activities using legitimate interest have been assessed and found valid. This assessment should be reviewed annually or when processing changes.
