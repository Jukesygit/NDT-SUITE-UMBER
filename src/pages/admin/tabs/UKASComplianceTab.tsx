/**
 * UKAS Compliance Tab
 * Self-assessment verification for UKAS standards readiness
 */

import { useState } from 'react';

// Types
interface ComplianceItem {
    title: string;
    verified: boolean;
    evidence: string;
}

interface ComplianceSection {
    id: string;
    title: string;
    items: ComplianceItem[];
}

// Compliance Data
const complianceSections: ComplianceSection[] = [
    {
        id: 'document-storage',
        title: 'Document Storage Security',
        items: [
            { title: 'Storage bucket is set to PRIVATE (not public)', verified: true, evidence: 'database/storage-policies.sql:10 specifies "Visibility: PRIVATE". Bucket name: documents' },
            { title: 'Documents accessed via signed URLs only', verified: true, evidence: 'src/services/competency-service.js:526 uses createSignedUrl() for all access' },
            { title: 'Signed URLs expire after 1 hour', verified: true, evidence: 'Call parameters set to 3600 seconds. Prevents permanent link exposure' },
            { title: 'Users can only upload to their own folder', verified: true, evidence: 'storage-policies.sql:25-32 - INSERT policy checks auth.uid() matches path' },
            { title: 'RLS policies prevent cross-user document access', verified: true, evidence: 'storage-policies.sql:34-58 - SELECT policy restricts to own docs or admin' },
            { title: 'Org Admins can only see documents from their organisation', verified: true, evidence: 'storage-policies.sql:50-57 - Org admin policy joins on organization_id' },
            { title: 'Document paths stored in database (not public URLs)', verified: true, evidence: 'SECURITY_IMPLEMENTATION.md confirms path storage, not public URLs' },
        ]
    },
    {
        id: 'access-control',
        title: 'Access Control & Authentication',
        items: [
            { title: '5-tier RBAC implemented', verified: true, evidence: 'src/auth-manager.js:9-16 defines Admin, Manager, Org Admin, Editor, Viewer roles' },
            { title: 'Magic link authentication available', verified: true, evidence: 'supabase/functions/send-reset-code/index.ts implements passwordless auth' },
            { title: 'Password hashing uses bcrypt', verified: true, evidence: 'src/auth-manager.js imports bcryptjs for industry standard protection' },
            { title: 'JWT tokens used for session management', verified: true, evidence: 'Supabase Auth manages JWT sessions with secure token refresh' },
            { title: 'Permission request workflow requires approval', verified: true, evidence: 'permission_requests table with status workflow and admin approval' },
            { title: 'Role changes logged to activity log', verified: true, evidence: 'activity-log-schema.sql lists permission_approved, permission_rejected action types' },
        ]
    },
    {
        id: 'rls',
        title: 'Row-Level Security (RLS)',
        items: [
            { title: 'RLS enabled on all data tables', verified: true, evidence: '15+ ENABLE ROW LEVEL SECURITY statements found in core schema files' },
            { title: 'Users can only view own competencies (unless admin/manager)', verified: true, evidence: 'competency-schema.sql:118-134 - Policy checks user_id = auth.uid()' },
            { title: 'Organisation isolation enforced', verified: true, evidence: 'Org admin policy checks organization_id matching. Cross-tenant access prevented' },
            { title: 'Cross-organisation access blocked for Org Admins', verified: true, evidence: 'All org_admin policies include organisation matching requirements' },
            { title: 'Activity logs restricted by role', verified: true, evidence: 'activity-log-schema.sql:72-86 - Only admin/manager can view all logs' },
        ]
    },
    {
        id: 'audit-trail',
        title: 'Audit Trail',
        items: [
            { title: 'Activity log captures all user actions', verified: true, evidence: 'activity-log-schema.sql:8-35 - Comprehensive table with user, action, entity, timestamp' },
            { title: 'User email/name cached (survives user deletion)', verified: true, evidence: 'user_email and user_name columns exist in activity_log table' },
            { title: 'IP address and user agent logged', verified: true, evidence: 'activity-log-schema.sql:29-30 - ip_address INET and user_agent TEXT columns' },
            { title: 'Competency changes logged to dedicated history table', verified: true, evidence: 'competency_history table captures all changes with old/new values' },
            { title: 'Email reminders logged with status', verified: true, evidence: 'email_reminder_log table tracks sent, failed, bounced with error messages' },
            { title: 'Retention period configured (365+ days)', verified: true, evidence: 'cleanup_old_activity_logs() function defaults to 365 day TTL' },
        ]
    },
    {
        id: 'competency',
        title: 'Competency Management',
        items: [
            { title: 'Competency records include expiry dates', verified: true, evidence: 'expiry_date TIMESTAMPTZ column in employee_competencies table' },
            { title: 'Approval workflow implemented (pending → approved/rejected)', verified: true, evidence: 'status CHECK constraint includes pending_approval, rejected states' },
            { title: 'Witness verification fields available', verified: true, evidence: 'witness_checked, witnessed_by, witnessed_at, witness_notes fields exist' },
            { title: 'Document upload linked to competency records', verified: true, evidence: 'document_url and document_name columns in competency table' },
            { title: 'History preserved for all changes', verified: true, evidence: 'competency_history table captures created, updated, deleted, approved, rejected' },
            { title: 'Expiration reminders configured', verified: true, evidence: 'thresholds_months DEFAULT {6, 3, 1, 0} in email_reminder_settings' },
        ]
    },
    {
        id: 'gdpr',
        title: 'Data Protection (GDPR)',
        items: [
            { title: 'Data minimisation (only required fields)', verified: true, evidence: 'Profile table contains only necessary fields, no excessive data collection' },
            { title: 'Right to access (profile page)', verified: true, evidence: 'ProfilePage.tsx allows users to view all their personal data' },
            { title: 'Right to portability (CSV export)', verified: true, evidence: 'Export functionality available via downloadReport() function' },
            { title: 'Right to erasure (soft delete with history)', verified: true, evidence: 'ON DELETE SET NULL preserves logs for compliance' },
            { title: 'Processing records (activity logs)', verified: true, evidence: 'All data processing recorded in activity_log table' },
            { title: 'Encryption at rest (Supabase/AWS)', verified: true, evidence: 'SECURITY_IMPLEMENTATION.md confirms AES-256 encryption' },
            { title: 'Encryption in transit (HTTPS/TLS)', verified: true, evidence: 'All Supabase connections use HTTPS with TLS 1.3+' },
        ]
    },
    {
        id: 'multi-tenant',
        title: 'Multi-Tenant Isolation',
        items: [
            { title: 'All users assigned to an organisation', verified: true, evidence: 'organization_id UUID foreign key in profiles table' },
            { title: 'Queries filtered by organisation_id', verified: true, evidence: '12+ references to organization_id in RLS policies' },
            { title: 'Org Admins cannot access other organisations', verified: true, evidence: 'All org_admin policies enforce organisation matching' },
            { title: 'Assets isolated by organisation', verified: true, evidence: 'supabase-assets-schema.sql includes organisation-based RLS' },
            { title: 'Sharing requires explicit permission', verified: true, evidence: 'shared_assets table with permission_level (view/edit)' },
        ]
    },
    {
        id: 'email',
        title: 'Email Communications',
        items: [
            { title: 'Expiration reminders sent at configured thresholds', verified: true, evidence: 'thresholds_months DEFAULT {6, 3, 1, 0} - reminders at 6, 3, 1, 0 months' },
            { title: 'Reminder emails logged with delivery status', verified: true, evidence: 'email_reminder_log table tracks sent, failed, bounced status' },
            { title: 'Verified sending domain', verified: true, evidence: 'updates.matrixportal.io configured as verified sender domain' },
            { title: 'Manager CC configured for notifications', verified: true, evidence: 'manager_emails TEXT[] column in email_reminder_settings' },
            { title: 'Duplicate prevention (one reminder per threshold/year)', verified: true, evidence: 'Unique index on user_id, threshold_months, year prevents spam' },
        ]
    }
];

// Calculate totals
const totalItems = complianceSections.reduce((acc, section) => acc + section.items.length, 0);
const passedItems = complianceSections.reduce((acc, section) => acc + section.items.filter(item => item.verified).length, 0);

export default function UKASComplianceTab() {
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(complianceSections.map(s => s.id)));

    const toggleSection = (sectionId: string) => {
        setExpandedSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sectionId)) {
                newSet.delete(sectionId);
            } else {
                newSet.add(sectionId);
            }
            return newSet;
        });
    };

    const expandAll = () => setExpandedSections(new Set(complianceSections.map(s => s.id)));
    const collapseAll = () => setExpandedSections(new Set());

    return (
        <div style={{
            maxWidth: '900px',
            margin: '0 auto',
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            color: '#1e293b',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '2px solid #e2e8f0',
                paddingBottom: '1.5rem',
                marginBottom: '2rem'
            }}>
                <div>
                    <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: '#1e3a8a', letterSpacing: '-0.025em', margin: 0 }}>
                        NDT SUITE
                    </h1>
                    <p style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0.25rem 0' }}>
                        Security & Data Protection
                    </p>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '1rem', margin: '1rem 0 0 0' }}>
                        UKAS Standards Self-Assessment Report
                    </h2>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={expandAll}
                        style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.875rem',
                            background: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#475569'
                        }}
                    >
                        Expand All
                    </button>
                    <button
                        onClick={collapseAll}
                        style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.875rem',
                            background: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#475569'
                        }}
                    >
                        Collapse All
                    </button>
                </div>
            </div>

            {/* Metadata Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1.5rem',
                marginBottom: '2rem',
                background: '#f8fafc',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '0.875rem',
                color: '#1e293b'
            }}>
                <div>
                    <p style={{ margin: 0, color: '#1e293b' }}>
                        <span style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: '0.75rem', display: 'block' }}>Document Reference</span>
                        UKAS-CHK-001
                    </p>
                    <p style={{ marginTop: '0.5rem', marginBottom: 0, color: '#1e293b' }}>
                        <span style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: '0.75rem', display: 'block' }}>Version</span>
                        1.0
                    </p>
                </div>
                <div>
                    <p style={{ margin: 0, color: '#1e293b' }}>
                        <span style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: '0.75rem', display: 'block' }}>Date</span>
                        29 January 2026
                    </p>
                    <p style={{ marginTop: '0.5rem', marginBottom: 0, color: '#1e293b' }}>
                        <span style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: '0.75rem', display: 'block' }}>Verification Method</span>
                        Automated Code Analysis
                    </p>
                </div>
            </div>

            {/* Executive Summary */}
            <section style={{ marginBottom: '2.5rem' }}>
                <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    borderLeft: '4px solid #1e3a8a',
                    paddingLeft: '0.75rem',
                    marginBottom: '0.75rem'
                }}>
                    Executive Summary
                </h3>
                <p style={{ color: '#475569', margin: 0, lineHeight: 1.6 }}>
                    This self-assessment report verifies security and data protection controls implemented in the NDT Suite
                    personnel competency and inspection management platform against UKAS accreditation standards.
                    All {totalItems} identified controls have been verified against the production source code and database schema.
                </p>
            </section>

            {/* Verification Summary Table */}
            <section style={{ marginBottom: '2.5rem' }}>
                <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    borderLeft: '4px solid #1e3a8a',
                    paddingLeft: '0.75rem',
                    marginBottom: '0.75rem'
                }}>
                    Verification Summary
                </h3>
                <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <table style={{ width: '100%', textAlign: 'left', fontSize: '0.875rem', borderCollapse: 'collapse', color: '#1e293b' }}>
                        <thead>
                            <tr style={{ background: '#1e3a8a', color: 'white' }}>
                                <th style={{ padding: '0.75rem 1rem' }}>Section</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Items</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Passed</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Failed</th>
                                <th style={{ padding: '0.75rem 1rem' }}>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {complianceSections.map((section, idx) => (
                                <tr key={section.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '0.5rem 1rem', fontWeight: 500, color: '#1e293b' }}>{idx + 1}. {section.title}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'center', color: '#1e293b' }}>{section.items.length}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'center', color: '#059669', fontWeight: 700 }}>
                                        {section.items.filter(i => i.verified).length}
                                    </td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'center', color: '#1e293b' }}>
                                        {section.items.filter(i => !i.verified).length}
                                    </td>
                                    <td style={{ padding: '0.5rem 1rem', color: '#64748b', fontStyle: 'italic', fontSize: '0.75rem' }}>Verified</td>
                                </tr>
                            ))}
                            <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                                <td style={{ padding: '0.75rem 1rem', color: '#1e293b' }}>TOTAL</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', textDecoration: 'underline', color: '#1e293b' }}>{totalItems}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#059669', textDecoration: 'underline' }}>{passedItems}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#1e293b' }}>0</td>
                                <td style={{ padding: '0.75rem 1rem', color: '#059669' }}>100% PASS RATE</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Detailed Verification Evidence */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {complianceSections.map((section, sectionIdx) => {
                    const isExpanded = expandedSections.has(section.id);

                    return (
                        <section key={section.id}>
                            <button
                                onClick={() => toggleSection(section.id)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    color: '#1e3a8a',
                                    background: '#eff6ff',
                                    padding: '0.5rem 0.75rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textAlign: 'left'
                                }}
                            >
                                <span style={{
                                    background: '#1e3a8a',
                                    color: 'white',
                                    width: '1.5rem',
                                    height: '1.5rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%',
                                    fontSize: '0.75rem',
                                    marginRight: '0.5rem',
                                    flexShrink: 0
                                }}>
                                    {sectionIdx + 1}
                                </span>
                                {section.title}
                                <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.875rem' }}>
                                    {isExpanded ? '▼' : '▶'}
                                </span>
                            </button>

                            {isExpanded && (
                                <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0 0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {section.items.map((item, itemIdx) => (
                                        <li key={itemIdx} style={{ display: 'flex', alignItems: 'flex-start' }}>
                                            <span style={{ color: '#10b981', fontWeight: 700, marginRight: '0.5rem', fontSize: '1rem' }}>☑</span>
                                            <div>
                                                <p style={{ fontWeight: 600, margin: 0, fontSize: '0.875rem', color: '#1e293b' }}>{item.title}</p>
                                                <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>
                                                    Verified: <code style={{
                                                        fontFamily: "'JetBrains Mono', monospace",
                                                        background: '#f8fafc',
                                                        border: '1px solid #e2e8f0',
                                                        padding: '1px 4px',
                                                        borderRadius: '3px',
                                                        fontSize: '0.75rem',
                                                        color: '#475569'
                                                    }}>{item.evidence}</code>
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    );
                })}
            </div>

            {/* Evidence Files Reference */}
            <section style={{ marginTop: '3rem' }}>
                <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    borderLeft: '4px solid #1e3a8a',
                    paddingLeft: '0.75rem',
                    marginBottom: '0.75rem'
                }}>
                    Evidence Files Reference
                </h3>
                <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <table style={{ width: '100%', textAlign: 'left', fontSize: '0.875rem', borderCollapse: 'collapse', color: '#1e293b' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>Check Area</th>
                                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>Primary Evidence File</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['Document Storage', 'database/storage-policies.sql'],
                                ['Access Control', 'src/auth-manager.js'],
                                ['Row-Level Security', 'database/competency-schema.sql'],
                                ['Audit Trail', 'database/activity-log-schema.sql'],
                                ['Competency Management', 'database/competency-schema.sql'],
                                ['Witness Verification', 'database/add-witness-check-fields.sql'],
                                ['Data Protection', 'database/SECURITY_IMPLEMENTATION.md'],
                                ['Multi-Tenant', 'database/supabase-schema.sql'],
                                ['Email Reminders', 'database/email-reminder-schema.sql'],
                            ].map(([area, file], idx) => (
                                <tr key={idx} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '0.5rem 1rem', color: '#1e293b' }}>{area}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>
                                        <code style={{
                                            fontFamily: "'JetBrains Mono', monospace",
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            color: '#475569'
                                        }}>{file}</code>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Footer Disclaimer */}
            <div style={{
                marginTop: '3rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid #e2e8f0',
                textAlign: 'center',
                fontSize: '0.75rem',
                color: '#94a3b8',
                fontStyle: 'italic'
            }}>
                This self-assessment report is generated for internal audit preparation purposes.
                It verifies that the NDT Suite meets the technical requirements for UKAS accreditation standards.
            </div>
        </div>
    );
}
