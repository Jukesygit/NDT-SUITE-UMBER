# Field Justification Matrix

> **Purpose**: Documents why each personal data field is collected (Article 5(1)(c) — Data Minimisation).
> **Date**: 2026-02-20
> **Review Date**: 2027-02-20

Every field containing personal data must have a documented business justification. If a field cannot be justified, it should be removed from the system.

## Profile Fields

| Field | Required? | Business Justification | Who Sees It | Could We Operate Without It? |
|---|---|---|---|---|
| **username** | Yes | Unique identifier for login and display throughout the system | All users | No — required for authentication |
| **email** | Yes | Authentication (magic link / password reset), system notifications | Admins, self | No — required for authentication |
| **contact email** | No | Secondary contact for work correspondence (may differ from login email) | Admins, managers, self | Yes — but useful when login email is personal and work email is separate |
| **mobile_number** | No | Operational contact for mobilisation, shift changes, urgent site communications. NDT technicians work on remote client sites where mobile is the primary contact method | Managers (masked), self | Partially — but would impair emergency and mobilisation communication |
| **home_address** | No | Travel expense calculations, mobilisation logistics (distance to client sites), emergency contact for welfare checks | Managers (masked), self | Partially — but required for travel expense policy and mobilisation planning |
| **nearest_uk_train_station** | No | Mobilisation logistics. NDT technicians are deployed to client sites across the UK. Nearest station determines travel routing and cost estimation for client billing | Managers, self | Partially — but would require asking each time a mobilisation is planned |
| **date_of_birth** | No | Age verification for insurance and certification purposes. Some NDT qualifications have minimum age requirements. Required for DBS checks where applicable | Managers (masked), self | Partially — but needed for insurance and certain certification schemes |
| **next_of_kin** | No | Emergency contact in case of workplace accident or incident. NDT work involves hazardous environments (confined spaces, heights, radiation). Health & Safety requirement | Managers (masked), self | No — health and safety obligation for hazardous work environments |
| **emergency_contact_number** | No | Contact number for next of kin in emergencies. Paired with next_of_kin field | Managers (masked), self | No — same as above |
| **vantage_number** | No | Employee reference number in Vantage HR/payroll system. Used for cross-referencing with payroll and HR records | Admins, self | Yes — convenience field for admin cross-referencing |
| **avatar_url** | No | Profile photo for identification within the system. Aids managers in identifying personnel, especially across large teams | All users, self | Yes — purely optional, user-uploaded |
| **role** | Yes | Determines system access level (viewer, editor, org_admin, admin). Controls what data and actions are available | Admins, self | No — required for access control |
| **organization_id** | Yes | Multi-tenant data isolation. Ensures users only see data within their organisation | System | No — required for data isolation |

## Competency Fields

| Field | Required? | Business Justification |
|---|---|---|
| **competency_id** | Yes | Links to qualification type definition |
| **value** | Yes | The qualification value/level held |
| **expiry_date** | Yes | Determines whether qualification is current. Expired qualifications prevent deployment to regulated work |
| **document_url** | No | Supporting evidence (scanned certificate). Required by many clients for verification |
| **document_name** | No | Human-readable name for the uploaded document |
| **status** | Yes | Workflow state (pending, verified, expired) |
| **verified_by** | No | Who verified the qualification. Audit requirement for regulated industries |
| **verified_at** | No | When verification occurred. Audit trail |
| **notes** | No | Free-text notes about the qualification |
| **issuing_body** | No | Organisation that issued the qualification (e.g., BINDT, TWI) |
| **certification_id** | No | Unique ID on the physical certificate for cross-referencing |

## Activity Log Fields

| Field | Required? | Business Justification |
|---|---|---|
| **user_id** | Yes | Identifies who performed the action. Required for security auditing |
| **action_type** | Yes | What action was performed. Required for audit trail |
| **description** | Yes | Human-readable summary of the action |
| **details** | No | Structured metadata about the action (e.g., which fields changed) |
| **entity_type/id/name** | No | What was affected. Enables filtering audit logs by subject |
| **ip_address** | No | Source IP for security investigation of suspicious access |
| **user_agent** | No | Browser information for security investigation |
| **created_at** | Yes | Timestamp. Required for audit chronology |

## Fields Recommended for Review

| Field | Concern | Recommendation |
|---|---|---|
| **vantage_number** | Low utility — only useful if the organisation uses Vantage HR | Consider making it configurable per organisation rather than a fixed field |
| **nearest_uk_train_station** | UK-specific — may not apply to all deployments | Consider making it a custom field if the system expands internationally |
| **ip_address** (activity log) | PII that is automatically collected | Currently not populated (set to null). If enabled in future, ensure retention policy applies |

## Annual Review

During the annual review, for each field ask:
1. Is this field still collected?
2. Is the business justification still valid?
3. Is there a less intrusive alternative?
4. Should access to this field be further restricted?
