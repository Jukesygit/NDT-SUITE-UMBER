# NDT Suite - Security & Data Protection Audit Document

**Document Reference**: UKAS-SEC-001
**Version**: 1.0
**Date**: 29 January 2026
**Classification**: Internal - Audit Documentation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Document Storage Security](#3-document-storage-security)
4. [Personal Data Protection](#4-personal-data-protection)
5. [Access Control & Authentication](#5-access-control--authentication)
6. [Row-Level Security Policies](#6-row-level-security-policies)
7. [Audit Trail & Activity Logging](#7-audit-trail--activity-logging)
8. [Data Retention Policy](#8-data-retention-policy)
9. [GDPR/UK GDPR Compliance](#9-gdpruk-gdpr-compliance)
10. [Encryption Standards](#10-encryption-standards)
11. [Personnel Competency Data Handling](#11-personnel-competency-data-handling)
12. [Security Testing Procedures](#12-security-testing-procedures)
13. [Incident Response](#13-incident-response)
14. [Appendix: Technical Implementation References](#14-appendix-technical-implementation-references)

---

## 1. Executive Summary

The NDT Suite is a personnel competency and inspection data management platform designed for Non-Destructive Testing organizations. This document provides comprehensive evidence of security controls and data protection measures implemented within the system for UKAS accreditation purposes.

### Key Security Features

| Security Domain | Implementation Status |
|-----------------|----------------------|
| Document Storage Security | ✅ Private bucket with RLS |
| Access Control | ✅ 5-tier RBAC with database enforcement |
| Data Encryption | ✅ At rest and in transit |
| Audit Logging | ✅ Comprehensive with 365+ day retention |
| Multi-Tenant Isolation | ✅ Organization-based separation |
| Authentication | ✅ Secure passwordless + password options |
| GDPR Compliance | ✅ Data subject rights supported |

### Compliance Standards Addressed

- **ISO/IEC 17025** - Testing and Calibration Laboratories
- **ISO/IEC 17020** - Inspection Bodies
- **ISO 9712** - Personnel Certification for NDT
- **UK GDPR** - Data Protection
- **UKAS** - United Kingdom Accreditation Service Requirements

---

## 2. System Architecture Overview

### 2.1 Technology Stack

| Component | Technology | Security Features |
|-----------|------------|-------------------|
| **Frontend** | React 18, TypeScript | XSS protection via JSX escaping |
| **Backend** | Supabase (PostgreSQL) | Row-Level Security (RLS) |
| **Authentication** | Supabase Auth | JWT tokens, bcrypt hashing |
| **File Storage** | Supabase Storage | Private buckets, signed URLs |
| **Email** | Resend API | Verified domain, TLS |
| **Hosting** | Cloud Infrastructure | HTTPS only, TLS 1.3+ |

### 2.2 Data Flow Diagram

```
┌─────────────────┐     HTTPS/TLS      ┌──────────────────┐
│   User Browser  │◄──────────────────►│  React Frontend  │
└─────────────────┘                    └────────┬─────────┘
                                                │
                                                │ Supabase Client
                                                │ (JWT Auth)
                                                ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase Platform                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Auth       │  │  Database   │  │  Storage            │  │
│  │  (JWT/SSO)  │  │  (PostgreSQL│  │  (Private Buckets)  │  │
│  │             │  │   + RLS)    │  │  + Signed URLs      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                           │                                  │
│                    Row-Level Security                        │
│                    Enforced on ALL queries                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Multi-Tenant Architecture

The system implements organisation-based data isolation:

- Each user belongs to an `organization_id`
- All data queries are filtered by organisation at the database level
- Organisation Admins cannot access data from other organisations
- System Admins have cross-organisation access for support purposes

---

## 3. Document Storage Security

### 3.1 Storage Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| **Bucket Name** | `documents` | Stores all competency documents |
| **Visibility** | PRIVATE | No public URL access |
| **Access Method** | Signed URLs | Time-limited, on-demand generation |
| **URL Expiry** | 3600 seconds (1 hour) | Prevents permanent link sharing |
| **Path Structure** | `competency-documents/{user_id}/{filename}` | User isolation |

### 3.2 Document Access Flow

```
1. User requests document view
        ↓
2. Application checks user authentication (JWT valid?)
        ↓
3. Database RLS policy evaluated:
   - Is user the document owner? OR
   - Is user an Org Admin for document owner's org? OR
   - Is user a System Admin?
        ↓
4. If DENIED → Return "Access Denied" error
   If ALLOWED → Generate signed URL (1-hour validity)
        ↓
5. User opens document in new tab
        ↓
6. After 1 hour, URL expires and cannot be reused
```

### 3.3 Storage RLS Policies

**Policy 1: Upload Restriction**
```sql
CREATE POLICY "Users can upload their own competency documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'competency-documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
);
```
*Effect: Users can only upload to their own folder*

**Policy 2: View Restriction**
```sql
CREATE POLICY "Users can view their own competency documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents'
    AND (
        -- User can see their own documents
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        -- Admins can see all documents
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        OR
        -- Org admins can see documents from users in their org
        EXISTS (
            SELECT 1 FROM public.profiles p1
            JOIN public.profiles p2 ON p1.organization_id = p2.organization_id
            WHERE p1.id = auth.uid()
            AND p1.role = 'org_admin'
            AND p2.id::text = (storage.foldername(name))[2]
        )
    )
);
```
*Effect: Hierarchical access control based on role and organisation*

**Policy 3: Update Restriction**
```sql
CREATE POLICY "Users can update their own competency documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = auth.uid()::text
);
```
*Effect: Users can only modify their own documents*

**Policy 4: Delete Restriction**
```sql
CREATE POLICY "Users can delete their own competency documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'documents'
    AND (
        (storage.foldername(name))[2] = auth.uid()::text
        OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'org_admin')
        )
    )
);
```
*Effect: Users delete own; Admins can delete any (for compliance/cleanup)*

### 3.4 Document Types Stored

| Document Type | Examples | Sensitivity |
|--------------|----------|-------------|
| NDT Certifications | PCN, CSWIP, SNT-TC-1A certificates | High |
| Training Records | Induction, H&S, offshore survival | Medium |
| Medical Certificates | Fitness for work, offshore medicals | High |
| Professional Registrations | Engineering council, professional body | Medium |
| Identification | Passport copies, CSCS cards | High |
| Qualifications | Degrees, diplomas, NVQs | Medium |

---

## 4. Personal Data Protection

### 4.1 Personal Data Categories

| Category | Data Fields | Legal Basis |
|----------|-------------|-------------|
| **Identity** | Name, email, username | Contract performance |
| **Contact** | Phone, emergency contact | Legitimate interest (safety) |
| **Employment** | Organisation, role, job title | Contract performance |
| **Competency** | Certifications, expiry dates, issuing bodies | Legal obligation (ISO 9712) |
| **Documents** | Certificate images, training records | Legal obligation |
| **Activity** | Login times, actions performed | Legitimate interest (security) |

### 4.2 Data Minimisation

The system collects only data necessary for:
- Personnel competency tracking (regulatory requirement)
- Access control and security
- Audit trail for compliance
- Communication (expiry reminders)

### 4.3 Profile Data Structure

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY,           -- Unique identifier
    email TEXT UNIQUE NOT NULL,    -- Contact email
    username TEXT,                 -- Display name
    role TEXT DEFAULT 'viewer',    -- Access level
    organization_id UUID,          -- Tenant isolation
    created_at TIMESTAMPTZ,        -- Account creation
    updated_at TIMESTAMPTZ,        -- Last modification
    avatar_url TEXT,               -- Profile picture (optional)
    timezone TEXT                  -- User preference
);
```

### 4.4 Profile Access Control

| Viewer Role | Can See |
|-------------|---------|
| User | Own profile only |
| Editor | Own profile only |
| Org Admin | All profiles in their organisation |
| Manager | All profiles across all organisations |
| Admin | All profiles (system-wide) |

---

## 5. Access Control & Authentication

### 5.1 Authentication Methods

| Method | Implementation | Security Features |
|--------|---------------|-------------------|
| **Magic Link** | Email-based passwordless login | No password storage, time-limited tokens |
| **Email/Password** | Standard credentials | bcrypt hashing, secure storage |
| **Session Management** | JWT tokens | Short expiry, refresh tokens |
| **Password Reset** | Email verification code | Time-limited, single-use codes |

### 5.2 Role-Based Access Control (RBAC)

The system implements a 5-tier role hierarchy:

```
┌─────────────────────────────────────────────────────────────┐
│                         ADMIN                                │
│  • Full system access                                        │
│  • All organisations                                         │
│  • User management                                           │
│  • System configuration                                      │
├─────────────────────────────────────────────────────────────┤
│                        MANAGER                               │
│  • View all personnel (all orgs)                            │
│  • Approve competencies                                      │
│  • Generate reports                                          │
├─────────────────────────────────────────────────────────────┤
│                       ORG_ADMIN                              │
│  • Manage users in own organisation                         │
│  • Approve competencies for org members                     │
│  • View org personnel data                                   │
├─────────────────────────────────────────────────────────────┤
│                        EDITOR                                │
│  • Create/edit own competencies                             │
│  • Upload documents                                          │
│  • View own data                                             │
├─────────────────────────────────────────────────────────────┤
│                        VIEWER                                │
│  • Read-only access                                          │
│  • View own profile                                          │
│  • Export own data                                           │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Permission Matrix

| Action | Admin | Manager | Org Admin | Editor | Viewer |
|--------|:-----:|:-------:|:---------:|:------:|:------:|
| View own profile | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit own profile | ✓ | ✓ | ✓ | ✓ | ✓ |
| View org personnel | ✓ | ✓ | ✓ | ✗ | ✗ |
| View all personnel | ✓ | ✓ | ✗ | ✗ | ✗ |
| Create competencies | ✓ | ✓ | ✓ | ✓ | ✗ |
| Approve competencies | ✓ | ✓ | ✓ | ✗ | ✗ |
| Upload documents | ✓ | ✓ | ✓ | ✓ | ✗ |
| View org documents | ✓ | ✓ | ✓ | ✗ | ✗ |
| Manage users | ✓ | ✓ | ✓ | ✗ | ✗ |
| System configuration | ✓ | ✗ | ✗ | ✗ | ✗ |
| View activity logs | ✓ | ✓ | ✗ | ✗ | ✗ |
| Export data | ✓ | ✓ | ✓ | ✓ | ✓ |

### 5.4 Permission Request Workflow

Users can request role upgrades through a formal approval process:

```
1. User submits permission request with justification
        ↓
2. Request logged in permission_requests table
        ↓
3. Admin/Org Admin reviews pending requests
        ↓
4. Approval: User role updated, action logged
   Rejection: Reason recorded, user notified
        ↓
5. Full audit trail maintained
```

---

## 6. Row-Level Security Policies

### 6.1 What is Row-Level Security?

Row-Level Security (RLS) is a PostgreSQL feature that restricts which rows a user can access based on security policies. Unlike application-level security, RLS is enforced at the database level and cannot be bypassed by the application code.

### 6.2 RLS Implementation Summary

| Table | RLS Enabled | Policies |
|-------|:-----------:|----------|
| `profiles` | ✓ | View by role hierarchy, update own/org |
| `organizations` | ✓ | Admin only for modifications |
| `employee_competencies` | ✓ | Own + org hierarchy |
| `competency_history` | ✓ | Own + admin access |
| `activity_log` | ✓ | Own activity + admin/manager all |
| `permission_requests` | ✓ | Own + admin for approval |
| `assets` | ✓ | Organisation-based + sharing |
| `vessels` | ✓ | Via parent asset |
| `scans` | ✓ | Via parent vessel |
| `storage.objects` | ✓ | User folder isolation |

### 6.3 Key RLS Policies

**Competencies - View Policy**
```sql
CREATE POLICY "Users can view competencies"
ON employee_competencies FOR SELECT
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND (
            p.role = 'admin'
            OR (p.role = 'org_admin' AND p.organization_id IN (
                SELECT organization_id FROM profiles
                WHERE id = employee_competencies.user_id
            ))
        )
    )
);
```

**Activity Log - Admin/Manager Access**
```sql
CREATE POLICY "Admins and managers can view all activity logs"
ON activity_log FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
);
```

### 6.4 RLS Security Guarantees

- **Database-Level Enforcement**: Cannot be bypassed by application code
- **Automatic Filtering**: Every query automatically filtered
- **No Direct SQL Access**: Users cannot execute arbitrary SQL
- **Consistent Application**: Same rules apply to all access paths

---

## 7. Audit Trail & Activity Logging

### 7.1 Activity Log Structure

```sql
CREATE TABLE activity_log (
    id UUID PRIMARY KEY,

    -- Actor Information
    user_id UUID,              -- Who performed the action
    user_email TEXT,           -- Cached (survives user deletion)
    user_name TEXT,            -- Cached (survives user deletion)

    -- Action Information
    action_type TEXT NOT NULL,
    action_category TEXT NOT NULL,
    description TEXT NOT NULL,
    details JSONB,             -- Action-specific data

    -- Target Information
    entity_type TEXT,          -- What type of entity
    entity_id TEXT,            -- Specific entity ID
    entity_name TEXT,          -- Human-readable name

    -- Request Metadata
    ip_address INET,           -- Source IP address
    user_agent TEXT,           -- Browser/device info

    -- Timestamp
    created_at TIMESTAMPTZ     -- When action occurred
);
```

### 7.2 Logged Action Types

| Category | Action Types |
|----------|-------------|
| **Authentication** | `login_success`, `login_failed`, `logout` |
| **Profile** | `profile_updated`, `avatar_changed` |
| **Competency** | `competency_created`, `competency_updated`, `competency_deleted`, `competency_approved`, `competency_rejected`, `document_uploaded` |
| **Admin** | `user_created`, `user_updated`, `user_deleted`, `organization_created`, `organization_updated`, `organization_deleted`, `permission_approved`, `permission_rejected`, `account_approved`, `account_rejected` |
| **Asset** | `asset_created`, `asset_updated`, `asset_deleted`, `asset_transferred`, `vessel_created`, `vessel_updated` |
| **Config** | `config_updated`, `announcement_created`, `announcement_updated` |
| **Sharing** | `share_created`, `share_deleted` |

### 7.3 Competency-Specific Audit Trail

In addition to the general activity log, competency changes have a dedicated history table:

```sql
CREATE TABLE competency_history (
    id UUID PRIMARY KEY,
    competency_id UUID,        -- Original competency
    user_id UUID,              -- Competency owner
    action TEXT,               -- created, updated, deleted, approved, rejected

    -- Change Details
    old_value TEXT,
    new_value TEXT,
    old_expiry_date TIMESTAMPTZ,
    new_expiry_date TIMESTAMPTZ,

    -- Actor Information
    changed_by UUID,           -- Who made the change
    change_reason TEXT,        -- Comment/justification

    -- Timestamp
    created_at TIMESTAMPTZ
);
```

**Automatic Logging**: A database trigger automatically logs all INSERT, UPDATE, and DELETE operations on `employee_competencies`.

### 7.4 Audit Log Access Control

| Role | Access Level |
|------|-------------|
| User | Own activity only |
| Editor | Own activity only |
| Org Admin | Own activity only |
| Manager | All activity logs |
| Admin | All activity logs |

### 7.5 Email Reminder Audit

All certification expiration reminders are logged:

```sql
CREATE TABLE email_reminder_log (
    id UUID PRIMARY KEY,
    user_id UUID,              -- Recipient
    threshold_months INTEGER,  -- Reminder threshold (6, 3, 1, 0)
    competency_ids UUID[],     -- Which competencies triggered
    sent_at TIMESTAMPTZ,       -- When sent
    email_sent_to TEXT,        -- Recipient email
    managers_cc TEXT[],        -- CC'd managers
    status TEXT,               -- 'sent', 'failed', 'bounced'
    error_message TEXT         -- If failed, why
);
```

---

## 8. Data Retention Policy

### 8.1 Retention Periods

| Data Type | Retention Period | Justification |
|-----------|-----------------|---------------|
| **Activity Logs** | 365+ days | Regulatory compliance, security |
| **Competency History** | Permanent | ISO 9712 personnel records |
| **Email Reminder Logs** | Permanent | Proof of notification |
| **Deleted Competencies** | History preserved | Audit trail integrity |
| **User Profiles** | Soft delete | Data recovery, compliance |
| **Documents** | Until replaced/deleted | Current certification only |

### 8.2 Retention Implementation

**Activity Log Cleanup Function**
```sql
CREATE FUNCTION cleanup_old_activity_logs(days_to_keep INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
BEGIN
    DELETE FROM activity_log
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Scheduling**: Can be scheduled via `pg_cron` for automated execution:
```sql
SELECT cron.schedule('cleanup-activity-logs', '0 2 * * *',
    'SELECT cleanup_old_activity_logs(365)');
```

### 8.3 Data Deletion Procedures

| Scenario | Procedure | Audit Trail |
|----------|-----------|-------------|
| User deletion | Soft delete profile, preserve history | `user_deleted` logged |
| Competency removal | Soft delete, history preserved | `competency_deleted` logged |
| Document replacement | Old path preserved in history | `document_uploaded` logged |
| Organisation deletion | Cascade to members, preserve logs | `organization_deleted` logged |

---

## 9. GDPR/UK GDPR Compliance

### 9.1 Data Subject Rights Implementation

| Right | Implementation | How to Exercise |
|-------|---------------|-----------------|
| **Right of Access** | Profile page shows all personal data | Login to account |
| **Right to Rectification** | Users can edit own profile and competencies | Edit profile/competencies |
| **Right to Erasure** | Account deletion with history preservation | Request via admin |
| **Right to Portability** | CSV export of competency data | Export function |
| **Right to Restrict Processing** | Account deactivation available | Request via admin |
| **Right to Object** | Unsubscribe from reminder emails | Email settings |

### 9.2 Lawful Basis for Processing

| Data Category | Lawful Basis | Details |
|--------------|--------------|---------|
| Identity data | Contract performance | Required for account |
| Competency data | Legal obligation | ISO 9712 requirements |
| Activity logs | Legitimate interest | Security and compliance |
| Email communications | Legitimate interest | Safety-critical reminders |

### 9.3 Data Protection Measures

| Measure | Implementation |
|---------|---------------|
| **Privacy by Design** | RLS built into database schema |
| **Data Minimisation** | Only required fields collected |
| **Storage Limitation** | Retention policies enforced |
| **Integrity & Confidentiality** | Encryption + access controls |
| **Accountability** | Comprehensive audit logging |

### 9.4 Consent Management

| Communication Type | Consent Mechanism |
|-------------------|-------------------|
| Expiration reminders | Implied consent (safety-critical) |
| Account notifications | System requirement (no opt-out) |
| Marketing | Not applicable (no marketing emails) |

---

## 10. Encryption Standards

### 10.1 Encryption at Rest

| Data Store | Encryption Method | Key Management |
|------------|------------------|----------------|
| Database (PostgreSQL) | AES-256 | Supabase/AWS managed |
| File Storage | AES-256 | Supabase/AWS managed |
| Backups | AES-256 | Supabase/AWS managed |

### 10.2 Encryption in Transit

| Connection | Protocol | Certificate |
|-----------|----------|-------------|
| User ↔ Frontend | HTTPS (TLS 1.3) | Valid SSL certificate |
| Frontend ↔ Supabase | HTTPS (TLS 1.3) | Supabase certificate |
| Email delivery | TLS | Resend provider |

### 10.3 Password Security

| Aspect | Implementation |
|--------|---------------|
| Hashing algorithm | bcrypt |
| Salt | Unique per password |
| Storage | Supabase Auth (never in application DB) |
| Transmission | HTTPS only, never logged |

---

## 11. Personnel Competency Data Handling

### 11.1 Competency Record Structure

```sql
CREATE TABLE employee_competencies (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,                    -- Owner
    competency_definition_id UUID NOT NULL,   -- Type of certification

    -- Certification Details
    value TEXT,                               -- Certificate number/value
    expiry_date TIMESTAMPTZ,                  -- When it expires
    issuing_body TEXT,                        -- Who issued it
    certification_id TEXT,                    -- Reference number

    -- Document Storage
    document_url TEXT,                        -- Path (not public URL)
    document_name TEXT,                       -- Original filename

    -- Approval Workflow
    status TEXT,                              -- active, pending_approval, rejected, expired
    verified_by UUID,                         -- Approving manager
    verified_at TIMESTAMPTZ,                  -- Approval timestamp
    notes TEXT,                               -- Comments/rejection reason

    -- Witness Verification
    witness_checked BOOLEAN,                  -- Was this witnessed?
    witnessed_by UUID,                        -- Who verified
    witnessed_at TIMESTAMPTZ,                 -- When verified
    witness_notes TEXT,                       -- Verification comments

    -- Timestamps
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

### 11.2 Competency Status Lifecycle

```
┌──────────────┐     Upload      ┌──────────────────┐
│   (Start)    │────────────────►│ pending_approval │
└──────────────┘                 └────────┬─────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
            ┌───────────┐         ┌───────────┐         ┌───────────────────┐
            │  rejected │         │  active   │         │ changes_requested │
            └───────────┘         └─────┬─────┘         └───────────────────┘
                                        │
                                        │ (date passes)
                                        ▼
                                  ┌───────────┐
                                  │  expired  │
                                  └───────────┘
```

### 11.3 Approval Workflow

1. **User uploads** competency document and details
2. **Status set** to `pending_approval`
3. **Manager reviews** document and details
4. **Decision recorded**:
   - Approved: Status → `active`, `verified_by` + `verified_at` set
   - Rejected: Status → `rejected`, reason in `notes`
   - Changes requested: Status → `changes_requested`
5. **All actions logged** to `competency_history` and `activity_log`

### 11.4 Expiration Tracking

**Automatic Detection**:
```sql
CREATE FUNCTION get_expiring_competencies(days_threshold INTEGER DEFAULT 30)
RETURNS TABLE (
    user_id UUID,
    user_name TEXT,
    user_email TEXT,
    competency_name TEXT,
    expiry_date TIMESTAMPTZ,
    days_until_expiry INTEGER
) AS $$ ... $$;
```

**Automated Reminders**:
- 6 months before expiry: Early notification
- 3 months before expiry: Planning reminder
- 1 month before expiry: Urgent action required
- On/after expiry: Critical - certification lapsed

---

## 12. Security Testing Procedures

### 12.1 RLS Policy Testing

| Test Case | Expected Result | How to Verify |
|-----------|----------------|---------------|
| User A views User B's competencies | Access denied | Query returns empty |
| Org Admin views other org's data | Access denied | Query returns empty |
| User uploads to another user's folder | Access denied | Storage error |
| Expired signed URL access | Access denied | 403 response |
| Anonymous API access | Access denied | 401 response |

### 12.2 Authentication Testing

| Test Case | Expected Result |
|-----------|----------------|
| Invalid credentials | Login rejected, failure logged |
| Expired session | Redirect to login |
| Magic link reuse | Link invalidated after use |
| Password reset reuse | Code invalidated after use |

### 12.3 Document Security Testing

| Test | Procedure | Expected Outcome |
|------|-----------|------------------|
| Own document access | View own certificate | Signed URL generated, document opens |
| Other user's document | Attempt direct path access | Access denied |
| Expired URL reuse | Use URL after 1 hour | Access denied, 403 error |
| URL sharing | Share signed URL with another user | Works temporarily (by design for sharing) |
| Org Admin cross-org | Attempt access to other org's docs | Access denied |

### 12.4 Recommended Testing Schedule

| Test Type | Frequency | Responsibility |
|-----------|-----------|----------------|
| RLS policy validation | After schema changes | Development team |
| Authentication flow | Monthly | QA team |
| Document access controls | Monthly | QA team |
| Penetration testing | Annually | External security firm |
| Audit log review | Weekly | System administrator |

---

## 13. Incident Response

### 13.1 Security Incident Categories

| Category | Examples | Severity |
|----------|----------|----------|
| **Critical** | Data breach, unauthorized access | Immediate response |
| **High** | Failed RLS policy, authentication bypass | Same-day response |
| **Medium** | Excessive failed logins, unusual activity | Next business day |
| **Low** | Policy violations, minor misconfigurations | Scheduled review |

### 13.2 Incident Response Procedure

1. **Detection**: Identified via activity logs or monitoring
2. **Containment**: Disable affected accounts/features
3. **Investigation**: Review audit logs for scope
4. **Eradication**: Fix vulnerability/misconfiguration
5. **Recovery**: Restore normal operations
6. **Lessons Learned**: Document and improve

### 13.3 Breach Notification

In accordance with UK GDPR Article 33:
- **ICO notification**: Within 72 hours if personal data affected
- **Data subject notification**: Without undue delay if high risk
- **Documentation**: Full incident record maintained

---

## 14. Appendix: Technical Implementation References

### 14.1 Database Schema Files

| File | Purpose |
|------|---------|
| `database/supabase-schema.sql` | Core tables, profiles, organisations |
| `database/competency-schema.sql` | Competency management + history |
| `database/activity-log-schema.sql` | Activity logging |
| `database/email-reminder-schema.sql` | Reminder configuration + logs |
| `database/storage-policies.sql` | Document storage RLS |
| `database/supabase-profile-schema.sql` | Permission requests |
| `database/supabase-assets-schema.sql` | Asset/inspection data |

### 14.2 Service Layer Files

| File | Purpose |
|------|---------|
| `src/services/competency-service.js` | Competency operations |
| `src/services/activity-log-service.ts` | Activity logging |
| `src/services/personnel-service.js` | Personnel data |
| `src/auth-manager.js` | Authentication + authorisation |

### 14.3 Edge Functions

| Function | Purpose |
|----------|---------|
| `send-expiration-reminders` | Automated email reminders |
| `send-reset-code` | Password/magic link |
| `create-user` | User provisioning |
| `approve-account-request` | Account approval |

### 14.4 Security Documentation

| Document | Location |
|----------|----------|
| Security Implementation Guide | `database/SECURITY_IMPLEMENTATION.md` |
| This Audit Document | `dev-docs/UKAS-SECURITY-DATA-PROTECTION-AUDIT.md` |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 29/01/2026 | NDT Suite Team | Initial document |

---

## Certification Statement

This document accurately represents the security and data protection measures implemented in the NDT Suite application as of the document date. All technical implementations described herein can be verified by examining the referenced source files.

**Prepared for**: UKAS Accreditation Audit
**System**: NDT Suite Personnel & Inspection Management Platform
**Date**: 29 January 2026
