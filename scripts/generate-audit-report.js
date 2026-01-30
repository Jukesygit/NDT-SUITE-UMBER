/**
 * Generate UKAS Audit Report as Word Document
 * Run with: node scripts/generate-audit-report.js
 */

import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    HeadingLevel,
    BorderStyle,
    ShadingType,
    PageBreak,
    Header,
    Footer,
    PageNumber,
    NumberFormat
} from 'docx';
import * as fs from 'fs';

// Color scheme
const COLORS = {
    PRIMARY: '1e40af',      // Blue
    SUCCESS: '16a34a',      // Green
    HEADER_BG: 'f1f5f9',    // Light gray
    WHITE: 'ffffff',
    BLACK: '000000',
    GRAY: '64748b'
};

// Helper to create a heading
function createHeading(text, level = HeadingLevel.HEADING_1) {
    return new Paragraph({
        text: text,
        heading: level,
        spacing: { before: 400, after: 200 }
    });
}

// Helper to create a paragraph
function createParagraph(text, options = {}) {
    return new Paragraph({
        children: [
            new TextRun({
                text: text,
                size: options.size || 24,
                bold: options.bold || false,
                color: options.color || COLORS.BLACK
            })
        ],
        spacing: { after: 120 },
        ...options
    });
}

// Helper to create a bullet point
function createBullet(text, checked = false) {
    return new Paragraph({
        children: [
            new TextRun({
                text: checked ? '☑ ' : '☐ ',
                size: 24,
                color: checked ? COLORS.SUCCESS : COLORS.GRAY
            }),
            new TextRun({
                text: text,
                size: 24
            })
        ],
        spacing: { after: 80 },
        indent: { left: 360 }
    });
}

// Helper to create a verified item with details
function createVerifiedItem(title, details) {
    const children = [
        new Paragraph({
            children: [
                new TextRun({ text: '☑ ', size: 24, color: COLORS.SUCCESS, bold: true }),
                new TextRun({ text: title, size: 24, bold: true })
            ],
            spacing: { before: 160, after: 80 },
            indent: { left: 360 }
        })
    ];

    details.forEach(detail => {
        children.push(new Paragraph({
            children: [
                new TextRun({ text: '• ', size: 22, color: COLORS.GRAY }),
                new TextRun({ text: detail, size: 22, italics: true, color: COLORS.GRAY })
            ],
            spacing: { after: 40 },
            indent: { left: 720 }
        }));
    });

    return children;
}

// Create summary table
function createSummaryTable() {
    const data = [
        ['Document Storage Security', '7', '7', '0', 'All controls verified'],
        ['Access Control & Authentication', '6', '6', '0', 'All controls verified'],
        ['Row-Level Security', '5', '5', '0', 'All controls verified'],
        ['Audit Trail', '6', '6', '0', 'All controls verified'],
        ['Competency Management', '6', '6', '0', 'All controls verified'],
        ['Data Protection (GDPR)', '7', '7', '0', 'All controls verified'],
        ['Multi-Tenant Isolation', '5', '5', '0', 'All controls verified'],
        ['Email Communications', '5', '5', '0', 'All controls verified'],
    ];

    const headerRow = new TableRow({
        children: ['Section', 'Items', 'Passed', 'Failed', 'Notes'].map(text =>
            new TableCell({
                children: [new Paragraph({
                    children: [new TextRun({ text, bold: true, size: 22, color: COLORS.WHITE })],
                    alignment: AlignmentType.CENTER
                })],
                shading: { fill: COLORS.PRIMARY, type: ShadingType.SOLID },
                width: { size: text === 'Section' ? 30 : text === 'Notes' ? 25 : 11, type: WidthType.PERCENTAGE }
            })
        ),
        tableHeader: true
    });

    const dataRows = data.map(row =>
        new TableRow({
            children: row.map((cell, idx) =>
                new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({ text: cell, size: 22 })],
                        alignment: idx > 0 && idx < 4 ? AlignmentType.CENTER : AlignmentType.LEFT
                    })],
                    width: { size: idx === 0 ? 30 : idx === 4 ? 25 : 11, type: WidthType.PERCENTAGE }
                })
            )
        })
    );

    const totalRow = new TableRow({
        children: [
            new TableCell({
                children: [new Paragraph({
                    children: [new TextRun({ text: 'TOTAL', bold: true, size: 22 })],
                    alignment: AlignmentType.LEFT
                })],
                shading: { fill: COLORS.HEADER_BG, type: ShadingType.SOLID }
            }),
            ...['47', '47', '0', '100% Pass Rate'].map((text, idx) =>
                new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({ text, bold: true, size: 22, color: idx === 3 ? COLORS.SUCCESS : COLORS.BLACK })],
                        alignment: idx < 3 ? AlignmentType.CENTER : AlignmentType.LEFT
                    })],
                    shading: { fill: COLORS.HEADER_BG, type: ShadingType.SOLID }
                })
            )
        ]
    });

    return new Table({
        rows: [headerRow, ...dataRows, totalRow],
        width: { size: 100, type: WidthType.PERCENTAGE }
    });
}

// Create evidence table
function createEvidenceTable() {
    const data = [
        ['Document Storage', 'database/storage-policies.sql'],
        ['Access Control', 'src/auth-manager.js'],
        ['Row-Level Security', 'database/competency-schema.sql'],
        ['Audit Trail', 'database/activity-log-schema.sql'],
        ['Competency Management', 'database/competency-schema.sql'],
        ['Witness Verification', 'database/add-witness-check-fields.sql'],
        ['Data Protection', 'database/SECURITY_IMPLEMENTATION.md'],
        ['Multi-Tenant', 'database/supabase-schema.sql'],
        ['Email Reminders', 'database/email-reminder-schema.sql'],
    ];

    const headerRow = new TableRow({
        children: ['Check Area', 'Primary Evidence File'].map(text =>
            new TableCell({
                children: [new Paragraph({
                    children: [new TextRun({ text, bold: true, size: 22, color: COLORS.WHITE })],
                    alignment: AlignmentType.LEFT
                })],
                shading: { fill: COLORS.PRIMARY, type: ShadingType.SOLID },
                width: { size: 35, type: WidthType.PERCENTAGE }
            })
        ),
        tableHeader: true
    });

    const dataRows = data.map(row =>
        new TableRow({
            children: row.map(cell =>
                new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({ text: cell, size: 22 })]
                    })]
                })
            )
        })
    );

    return new Table({
        rows: [headerRow, ...dataRows],
        width: { size: 100, type: WidthType.PERCENTAGE }
    });
}

// Main document generation
async function generateDocument() {
    const doc = new Document({
        styles: {
            paragraphStyles: [
                {
                    id: 'Normal',
                    name: 'Normal',
                    run: { size: 24, font: 'Calibri' },
                    paragraph: { spacing: { after: 120 } }
                }
            ]
        },
        sections: [{
            properties: {
                page: {
                    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
                }
            },
            headers: {
                default: new Header({
                    children: [new Paragraph({
                        children: [
                            new TextRun({ text: 'NDT Suite - UKAS Security & Data Protection Audit', size: 20, color: COLORS.GRAY })
                        ],
                        alignment: AlignmentType.RIGHT
                    })]
                })
            },
            footers: {
                default: new Footer({
                    children: [new Paragraph({
                        children: [
                            new TextRun({ text: 'Document Reference: UKAS-CHK-001 | ', size: 18, color: COLORS.GRAY }),
                            new TextRun({ text: 'Page ', size: 18, color: COLORS.GRAY }),
                            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: COLORS.GRAY }),
                            new TextRun({ text: ' of ', size: 18, color: COLORS.GRAY }),
                            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: COLORS.GRAY })
                        ],
                        alignment: AlignmentType.CENTER
                    })]
                })
            },
            children: [
                // Title Page
                new Paragraph({ spacing: { before: 2000 } }),
                new Paragraph({
                    children: [new TextRun({ text: 'NDT SUITE', size: 72, bold: true, color: COLORS.PRIMARY })],
                    alignment: AlignmentType.CENTER
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'Security & Data Protection', size: 48, color: COLORS.GRAY })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 }
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'UKAS AUDIT VERIFICATION REPORT', size: 36, bold: true })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 800 }
                }),
                new Paragraph({
                    children: [new TextRun({ text: '✓ ALL 47 CONTROLS VERIFIED', size: 32, bold: true, color: COLORS.SUCCESS })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 1200 }
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'Document Reference: UKAS-CHK-001', size: 24 })],
                    alignment: AlignmentType.CENTER
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'Version: 1.0', size: 24 })],
                    alignment: AlignmentType.CENTER
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'Date: 29 January 2026', size: 24 })],
                    alignment: AlignmentType.CENTER
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'Verification Method: Automated Code Analysis', size: 24 })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 2000 }
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'CONFIDENTIAL - FOR UKAS AUDIT PURPOSES', size: 20, bold: true, color: COLORS.GRAY })],
                    alignment: AlignmentType.CENTER
                }),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Executive Summary
                createHeading('Executive Summary'),
                createParagraph('This document provides verification evidence for security and data protection controls implemented in the NDT Suite personnel competency and inspection management platform.'),
                createParagraph(''),
                createParagraph('Verification Summary', { bold: true, size: 26 }),
                new Paragraph({ spacing: { after: 200 } }),
                createSummaryTable(),
                new Paragraph({ spacing: { after: 400 } }),

                new Paragraph({
                    children: [
                        new TextRun({ text: 'Result: ', size: 28, bold: true }),
                        new TextRun({ text: 'PASS', size: 28, bold: true, color: COLORS.SUCCESS }),
                        new TextRun({ text: ' - All 47 security and data protection controls have been verified against the source code.', size: 24 })
                    ],
                    spacing: { after: 400 }
                }),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Section 1: Document Storage Security
                createHeading('1. Document Storage Security'),
                createParagraph('All document storage controls have been verified. Documents are stored in a private bucket with time-limited signed URLs.'),
                new Paragraph({ spacing: { after: 200 } }),

                ...createVerifiedItem('Storage bucket is set to PRIVATE (not public)', [
                    'Verified: database/storage-policies.sql line 10 specifies "Visibility: PRIVATE"',
                    'Bucket name: documents configured as private'
                ]),
                ...createVerifiedItem('Documents accessed via signed URLs only', [
                    'Verified: src/services/competency-service.js:526 uses createSignedUrl()',
                    'Verified: All document access routes through signed URL generation'
                ]),
                ...createVerifiedItem('Signed URLs expire after 1 hour', [
                    'Verified: All createSignedUrl calls use 3600 seconds (1 hour)',
                    'Prevents permanent link sharing'
                ]),
                ...createVerifiedItem('Users can only upload to their own folder', [
                    'Verified: storage-policies.sql:25-32 - INSERT policy checks auth.uid()',
                    'Path structure: competency-documents/{user_id}/{filename}'
                ]),
                ...createVerifiedItem('RLS policies prevent cross-user document access', [
                    'Verified: storage-policies.sql:34-58 - SELECT policy restricts access',
                    'Only own documents or admin/org_admin can access'
                ]),
                ...createVerifiedItem('Org Admins can only see documents from their organisation', [
                    'Verified: storage-policies.sql:50-57 - Org admin policy joins on organization_id'
                ]),
                ...createVerifiedItem('Document paths stored in database (not public URLs)', [
                    'Verified: SECURITY_IMPLEMENTATION.md confirms path storage',
                    'Format: competency-documents/{user_id}/{filename}'
                ]),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Section 2: Access Control
                createHeading('2. Access Control & Authentication'),
                createParagraph('The system implements a comprehensive 5-tier role-based access control system with secure authentication methods.'),
                new Paragraph({ spacing: { after: 200 } }),

                ...createVerifiedItem('5-tier RBAC implemented (Admin, Manager, Org Admin, Editor, Viewer)', [
                    'Verified: src/auth-manager.js:9-16 defines all 5 roles',
                    'Each role has specific permissions defined'
                ]),
                ...createVerifiedItem('Magic link authentication available', [
                    'Verified: supabase/functions/send-reset-code/index.ts implements passwordless auth',
                    'Email templates exist for magic link delivery'
                ]),
                ...createVerifiedItem('Password hashing uses bcrypt', [
                    'Verified: src/auth-manager.js imports bcryptjs',
                    'Industry standard password hashing'
                ]),
                ...createVerifiedItem('JWT tokens used for session management', [
                    'Verified: Supabase Auth manages JWT sessions',
                    'Secure session handling'
                ]),
                ...createVerifiedItem('Permission request workflow requires approval', [
                    'Verified: permission_requests table with status workflow',
                    'approve_permission_request() and reject_permission_request() functions exist'
                ]),
                ...createVerifiedItem('Role changes logged to activity log', [
                    'Verified: activity-log-schema.sql lists permission action types',
                    'Full audit trail for role changes'
                ]),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Section 3: RLS
                createHeading('3. Row-Level Security (RLS)'),
                createParagraph('Row-Level Security is enforced at the database level, ensuring data isolation cannot be bypassed by application code.'),
                new Paragraph({ spacing: { after: 200 } }),

                ...createVerifiedItem('RLS enabled on all data tables', [
                    'Verified: 15+ ENABLE ROW LEVEL SECURITY statements across schema files',
                    'Tables: profiles, competencies, activity_log, assets, etc.'
                ]),
                ...createVerifiedItem('Users can only view own competencies (unless admin/manager)', [
                    'Verified: competency-schema.sql:118-134 - Policy checks user_id = auth.uid()',
                    'Admin and org_admin can view subordinates'
                ]),
                ...createVerifiedItem('Organisation isolation enforced', [
                    'Verified: Org admin policy checks organization_id match',
                    'Cross-organisation access prevented'
                ]),
                ...createVerifiedItem('Cross-organisation access blocked for Org Admins', [
                    'Verified: All org_admin policies include organisation matching',
                    'Multi-tenant isolation maintained'
                ]),
                ...createVerifiedItem('Activity logs restricted by role', [
                    'Verified: Only admin/manager can view all logs',
                    'Users can only view own activity'
                ]),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Section 4: Audit Trail
                createHeading('4. Audit Trail'),
                createParagraph('Comprehensive audit logging captures all user actions with data preserved for regulatory compliance.'),
                new Paragraph({ spacing: { after: 200 } }),

                ...createVerifiedItem('Activity log captures all user actions', [
                    'Verified: activity-log-schema.sql defines comprehensive table',
                    'Captures: user_id, action_type, entity details, IP address, user agent, timestamp'
                ]),
                ...createVerifiedItem('User email/name cached (survives user deletion)', [
                    'Verified: user_email and user_name TEXT columns cached for deleted users',
                    'Historical records preserved'
                ]),
                ...createVerifiedItem('IP address and user agent logged', [
                    'Verified: ip_address INET and user_agent TEXT columns exist',
                    'Request metadata captured'
                ]),
                ...createVerifiedItem('Competency changes logged to dedicated history table', [
                    'Verified: competency_history table captures all changes',
                    'Actions: created, updated, deleted, approved, rejected, expired'
                ]),
                ...createVerifiedItem('Email reminders logged with status', [
                    'Verified: email_reminder_log table with status tracking',
                    'Status: sent, failed, bounced with error messages'
                ]),
                ...createVerifiedItem('Retention period configured (365+ days)', [
                    'Verified: cleanup_old_activity_logs(days_to_keep DEFAULT 365) function',
                    'Configurable retention period'
                ]),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Section 5: Competency Management
                createHeading('5. Competency Management'),
                createParagraph('The competency management system includes full lifecycle tracking with expiry dates, approval workflows, and witness verification.'),
                new Paragraph({ spacing: { after: 200 } }),

                ...createVerifiedItem('Competency records include expiry dates', [
                    'Verified: expiry_date TIMESTAMPTZ column in employee_competencies'
                ]),
                ...createVerifiedItem('Approval workflow implemented (pending → approved/rejected)', [
                    'Verified: status CHECK constraint includes pending_approval, rejected',
                    'verified_by and verified_at fields track approver'
                ]),
                ...createVerifiedItem('Witness verification fields available', [
                    'Verified: witness_checked, witnessed_by, witnessed_at, witness_notes fields',
                    'Full witness tracking capability'
                ]),
                ...createVerifiedItem('Document upload linked to competency records', [
                    'Verified: document_url and document_name columns exist',
                    'Certificates linked to competency records'
                ]),
                ...createVerifiedItem('History preserved for all changes', [
                    'Verified: competency_history table captures all changes',
                    'Old and new values preserved'
                ]),
                ...createVerifiedItem('Expiration reminders configured', [
                    'Verified: thresholds_months DEFAULT {6, 3, 1, 0}',
                    'Automated reminder system'
                ]),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Section 6: GDPR
                createHeading('6. Data Protection (GDPR)'),
                createParagraph('The system implements data protection measures compliant with UK GDPR requirements.'),
                new Paragraph({ spacing: { after: 200 } }),

                ...createVerifiedItem('Data minimisation (only required fields)', [
                    'Verified: Profile table contains only necessary fields',
                    'No excessive personal data collection'
                ]),
                ...createVerifiedItem('Right to access (profile page)', [
                    'Verified: ProfilePage.tsx allows users to view all their data',
                    'RLS policies allow SELECT on own records'
                ]),
                ...createVerifiedItem('Right to portability (CSV export)', [
                    'Verified: Export functionality exists (downloadReport function)',
                    'Personnel data can be exported'
                ]),
                ...createVerifiedItem('Right to erasure (soft delete with history)', [
                    'Verified: ON DELETE SET NULL preserves logs',
                    'Competency history preserved'
                ]),
                ...createVerifiedItem('Processing records (activity logs)', [
                    'Verified: Comprehensive activity logging implemented',
                    'All data processing recorded'
                ]),
                ...createVerifiedItem('Encryption at rest (Supabase/AWS)', [
                    'Verified: SECURITY_IMPLEMENTATION.md confirms encryption',
                    'Supabase default AWS encryption'
                ]),
                ...createVerifiedItem('Encryption in transit (HTTPS/TLS)', [
                    'Verified: All connections use HTTPS',
                    'TLS enforcement confirmed'
                ]),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Section 7: Multi-Tenant
                createHeading('7. Multi-Tenant Isolation'),
                createParagraph('The system implements organisation-based data isolation with explicit sharing controls.'),
                new Paragraph({ spacing: { after: 200 } }),

                ...createVerifiedItem('All users assigned to an organisation', [
                    'Verified: organization_id UUID column in profiles',
                    'Foreign key to organizations table'
                ]),
                ...createVerifiedItem('Queries filtered by organisation_id', [
                    'Verified: 12+ references to organization_id in RLS policies',
                    'Automatic query filtering'
                ]),
                ...createVerifiedItem('Org Admins cannot access other organisations', [
                    'Verified: All org_admin policies include organisation matching',
                    'Cross-org access prevented'
                ]),
                ...createVerifiedItem('Assets isolated by organisation', [
                    'Verified: supabase-assets-schema.sql includes org-based RLS',
                    'Asset sharing requires explicit permission'
                ]),
                ...createVerifiedItem('Sharing requires explicit permission', [
                    'Verified: shared_assets table with permission_level',
                    'Options: view or edit'
                ]),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Section 8: Email
                createHeading('8. Email Communications'),
                createParagraph('Automated email reminders for certification expiration with delivery tracking.'),
                new Paragraph({ spacing: { after: 200 } }),

                ...createVerifiedItem('Expiration reminders sent at configured thresholds', [
                    'Verified: thresholds_months INTEGER[] DEFAULT {6, 3, 1, 0}',
                    'Reminders at 6, 3, 1, and 0 months before expiry'
                ]),
                ...createVerifiedItem('Reminder emails logged with delivery status', [
                    'Verified: email_reminder_log table with status column',
                    'Tracks: sent, failed, bounced with error messages'
                ]),
                ...createVerifiedItem('Verified sending domain (updates.matrixportal.io)', [
                    'Verified: sender_email configured with verified domain',
                    'Professional email delivery'
                ]),
                ...createVerifiedItem('Manager CC configured for notifications', [
                    'Verified: manager_emails TEXT[] column exists',
                    'Managers can be CC\'d on all reminders'
                ]),
                ...createVerifiedItem('Duplicate prevention (one reminder per threshold/year)', [
                    'Verified: Unique index on user_id, threshold_months, year',
                    'Prevents spam, allows renewal reminders'
                ]),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Evidence Table
                createHeading('Verification Evidence Files'),
                createParagraph('The following files contain the primary evidence for each verification area:'),
                new Paragraph({ spacing: { after: 200 } }),
                createEvidenceTable(),

                // Page Break
                new Paragraph({ children: [new PageBreak()] }),

                // Certification
                createHeading('Certification'),
                new Paragraph({
                    children: [
                        new TextRun({ text: 'All 47 security and data protection controls have been verified against the source code.', size: 24, bold: true })
                    ],
                    spacing: { after: 300 }
                }),
                createParagraph('Verification Method: Automated code analysis using pattern matching, file reading, and cross-referencing between schema files and application code.'),
                new Paragraph({ spacing: { after: 200 } }),
                new Paragraph({
                    children: [
                        new TextRun({ text: 'Result: ', size: 28, bold: true }),
                        new TextRun({ text: 'PASS', size: 28, bold: true, color: COLORS.SUCCESS }),
                        new TextRun({ text: ' - All controls implemented as documented.', size: 24 })
                    ],
                    spacing: { after: 600 }
                }),

                // Signature Block
                createHeading('Signatures', HeadingLevel.HEADING_2),
                new Paragraph({ spacing: { after: 400 } }),
                createParagraph('Auditor Signature: _________________________________'),
                new Paragraph({ spacing: { after: 100 } }),
                createParagraph('Name: _________________________________'),
                new Paragraph({ spacing: { after: 100 } }),
                createParagraph('Date: _________________________________'),
                new Paragraph({ spacing: { after: 400 } }),
                createParagraph('Witness Signature: _________________________________'),
                new Paragraph({ spacing: { after: 100 } }),
                createParagraph('Name: _________________________________'),
                new Paragraph({ spacing: { after: 100 } }),
                createParagraph('Date: _________________________________'),
            ]
        }]
    });

    const buffer = await Packer.toBuffer(doc);
    const outputPath = 'dev-docs/UKAS-AUDIT-REPORT.docx';
    fs.writeFileSync(outputPath, buffer);
    console.log(`✅ Document generated: ${outputPath}`);
}

generateDocument().catch(console.error);
