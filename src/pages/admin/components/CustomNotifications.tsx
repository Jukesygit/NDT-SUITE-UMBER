/**
 * CustomNotifications - Email composition with personnel selection
 */

import { useState, useMemo } from 'react';
import { usePersonnel, useOrganizations } from '../../../hooks/queries/usePersonnel';
import { useSendNotification } from '../../../hooks/mutations/useNotificationMutations';
import { PersonnelSelector } from './PersonnelSelector';
import { FormField, FormTextarea, ConfirmDialog } from '../../../components/ui';
import type { Person } from '../../../hooks/queries/usePersonnel';

interface CustomNotificationsProps {
    onSuccess?: () => void;
}

// Profile Update Reminder HTML Template
const PROFILE_UPDATE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Action Required: Update Your Profile - Matrix Portal</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #e2e8f0;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0a0a0a;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background: linear-gradient(135deg, rgba(23, 23, 23, 0.98) 0%, rgba(15, 15, 15, 0.98) 100%); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden;">
                    <tr>
                        <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%);">
                            <div style="margin: 0 auto 20px;">
                                <svg width="120" height="64" viewBox="0 0 2256 1202" fill="none" style="display: block; margin: 0 auto;">
                                    <defs>
                                        <linearGradient id="logoGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stop-color="#10b981" />
                                            <stop offset="50%" stop-color="#3b82f6" />
                                            <stop offset="100%" stop-color="#8b5cf6" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M36 1199.2 c-17.1 -4.5 -30.8 -18.8 -34 -35.7 -0.8 -4.4 -1 -75 -0.8 -266 l0.3 -260 3.3 -9.5 c4 -11.5 10.6 -22.3 18.1 -29.9 5.6 -5.6 778.3 -585.2 787.1 -590.3 7 -4.1 16.1 -6.1 25 -5.5 19 1.3 34.9 13.6 41.1 31.7 l2.2 6.5 0.8 239.5 c0.5 140.3 1.3 241.8 1.8 245.2 2.3 13.5 12.2 26.1 25.7 32.5 7.8 3.7 8.1 3.8 19.9 3.8 11.4 0 12.3 -0.2 18.5 -3.1 3.8 -1.8 30.2 -20.7 64.5 -46.1 31.9 -23.6 197.5 -146.4 368 -272.9 181 -134.2 312.7 -231.2 316.5 -233.1 14.7 -7.4 31.1 -6.1 45.8 3.5 7 4.6 11.7 10.2 16.1 19.2 l3.6 7.5 0.6 56 c0.4 30.8 1 146 1.3 256 0.5 129.9 1.1 201.9 1.8 205.5 2.4 12.9 12.6 27.8 23.9 35.1 2.8 1.7 8 4.4 11.7 5.8 l6.7 2.6 193 0.5 c182.3 0.5 193.3 0.7 199 2.4 27.8 8.4 47.4 28.1 55.2 55.7 1.7 6.1 1.8 16.8 1.8 241.9 0 264.2 0.7 239.6 -7.4 256.5 -9.3 19.4 -24.4 32.7 -45.6 40.2 l-8 2.8 -186 0 -186 0 -8.8 -3.1 c-28.6 -10.3 -48 -34.1 -51.7 -63.8 -1.6 -12.8 -1.4 -382.3 0.3 -382.9 0.9 -0.4 0.9 -0.6 0 -0.6 -1 -0.1 -1.3 -6.6 -1.3 -28.9 0 -31.8 -0.5 -35.7 -6.2 -46.6 -4.1 -7.7 -14.5 -18.2 -22.3 -22.3 -17 -8.9 -37 -9.1 -53 -0.4 -2.7 1.5 -166.1 124.2 -363 272.6 -196.9 148.5 -360.4 271.4 -363.4 273.2 -7.8 4.7 -18.6 6.9 -27.8 5.6 -20 -2.9 -36.8 -18.3 -40.3 -37.2 -0.7 -3.5 -1 -90 -1 -249 0 -266.9 0.4 -249.6 -5.7 -260.1 -12.5 -21.4 -39.4 -29.9 -60.8 -19.3 -10.9 5.5 -98.7 71.1 -414.5 309.8 -181.2 136.9 -332 250.2 -335 251.7 -9.8 4.9 -19.9 5.9 -31 3z" fill="url(#logoGrad2)" />
                                    <path d="M1515.5 1196.4 c-30.2 -4.3 -51 -11.8 -73.2 -26.6 -13.6 -9 -33.2 -28.3 -42 -41.3 -33.3 -49.4 -37.2 -110.3 -10.2 -162.5 14.9 -28.8 39.1 -53 67.9 -67.9 45.1 -23.3 97.8 -23.8 142.7 -1.3 16.6 8.4 27.6 16.4 41.4 30.1 23.6 23.7 37.6 49.8 44.1 82.6 2.9 14.3 3.1 42.2 0.5 56 -6.3 33.6 -21 61.6 -44.6 85 -23.8 23.6 -51.3 38 -84.3 44.1 -8 1.5 -36.2 2.7 -42.3 1.8z" fill="url(#logoGrad2)" />
                                    <path d="M1983.5 515.5 c-45.6 -7.3 -86.1 -34.1 -110.3 -73 -36.1 -58.2 -30.8 -132.3 13.2 -185 22.7 -27.2 53.8 -45.8 90 -53.7 8.7 -2 13.1 -2.3 31.6 -2.2 18.4 0 22.9 0.3 31.3 2.2 21.9 4.9 42.6 13.9 59.7 26 11.9 8.4 29.6 26 37.7 37.5 12.7 18.1 22.8 42.1 26.9 64.2 2.8 14.9 2.6 42.1 -0.4 57.2 -13 65.1 -64.2 115.3 -128.7 126.3 -13.7 2.3 -38.1 2.6 -51 0.5z" fill="url(#logoGrad2)" />
                                </svg>
                            </div>
                            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">Matrix Portal</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #f8fafc;">Action Required: Update Your Profile</h2>
                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3;">
                                We're reaching out to ensure your Matrix Portal profile is complete and up to date. Keeping your information current helps us maintain accurate records and ensures you receive important notifications about your certifications.
                            </p>
                            <div style="margin: 24px 0; padding: 20px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 12px;">
                                <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #60a5fa;">Please review and update:</h3>
                                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; font-size: 14px; color: #d1d5db;">
                                            <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; background: rgba(16, 185, 129, 0.2); border-radius: 50%; margin-right: 12px; color: #10b981; font-size: 12px;">1</span>
                                            <strong>Personal Details</strong> - Contact info, emergency contacts, address
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-size: 14px; color: #d1d5db;">
                                            <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; background: rgba(16, 185, 129, 0.2); border-radius: 50%; margin-right: 12px; color: #10b981; font-size: 12px;">2</span>
                                            <strong>Certifications</strong> - NDT qualifications, expiry dates, certificates
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-size: 14px; color: #d1d5db;">
                                            <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; background: rgba(16, 185, 129, 0.2); border-radius: 50%; margin-right: 12px; color: #10b981; font-size: 12px;">3</span>
                                            <strong>Training Records</strong> - Completed courses and training history
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-size: 14px; color: #d1d5db;">
                                            <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; background: rgba(16, 185, 129, 0.2); border-radius: 50%; margin-right: 12px; color: #10b981; font-size: 12px;">4</span>
                                            <strong>Documents</strong> - Upload any missing certificate copies
                                        </td>
                                    </tr>
                                </table>
                            </div>
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="https://matrixportal.io" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); border-radius: 10px; text-decoration: none; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);">
                                            Log In to Matrix Portal
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <div style="margin-top: 24px; padding: 16px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 8px;">
                                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #fbbf24;">
                                    <strong>Why is this important?</strong> Accurate records ensure you receive timely reminders before certifications expire and help maintain compliance with industry standards.
                                </p>
                            </div>
                            <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.6; color: #737373;">
                                If you have any questions or need assistance updating your profile, please don't hesitate to reach out to your manager or the admin team.
                            </p>
                            <p style="margin: 16px 0 0; font-size: 13px; line-height: 1.5; color: #525252;">
                                Thank you for keeping your records up to date.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                            <p style="margin: 0 0 8px; font-size: 13px; color: #525252;">
                                Need help? Contact support at
                                <a href="mailto:jonas@matrixinspectionservices.com" style="color: #60a5fa; text-decoration: none;">jonas@matrixinspectionservices.com</a>
                            </p>
                            <p style="margin: 8px 0 0; font-size: 12px; color: #404040;">
                                &copy; Matrix Advanced Inspection Services. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

export function CustomNotifications({ onSuccess }: CustomNotificationsProps) {
    const { data: personnel = [], isLoading: isLoadingPersonnel } = usePersonnel();
    const { data: organizations = [] } = useOrganizations();
    const sendNotification = useSendNotification();

    // Form state
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [useHtmlTemplate, setUseHtmlTemplate] = useState(false);

    // Filter state
    const [filterOrg, setFilterOrg] = useState('all');
    const [filterRole, setFilterRole] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Confirmation modal state
    const [showConfirm, setShowConfirm] = useState(false);

    // Success message state
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Filter personnel
    const filteredPersonnel = useMemo(() => {
        return personnel.filter((person: Person) => {
            // Organization filter
            if (filterOrg !== 'all' && person.organization_id !== filterOrg) return false;
            // Role filter
            if (filterRole !== 'all' && person.role !== filterRole) return false;
            // Search term
            if (searchTerm) {
                const search = searchTerm.toLowerCase();
                const matchesName = person.username.toLowerCase().includes(search);
                const matchesEmail = person.email.toLowerCase().includes(search);
                const matchesOrg = person.organizations?.name?.toLowerCase().includes(search);
                if (!matchesName && !matchesEmail && !matchesOrg) return false;
            }
            return true;
        });
    }, [personnel, filterOrg, filterRole, searchTerm]);

    // Selected recipients (from all personnel, not just filtered)
    const selectedRecipients = useMemo(() => {
        return personnel.filter((p: Person) => selectedIds.includes(p.id));
    }, [personnel, selectedIds]);

    // Validation - HTML template mode only needs subject and recipients
    const isValid = subject.trim() && (useHtmlTemplate || body.trim()) && selectedIds.length > 0;

    // Load profile update template
    const loadProfileUpdateTemplate = () => {
        setSubject('Action Required: Update Your Profile on Matrix Portal');
        setBody(PROFILE_UPDATE_TEMPLATE);
        setUseHtmlTemplate(true);
    };

    // Clear template
    const clearTemplate = () => {
        setSubject('');
        setBody('');
        setUseHtmlTemplate(false);
    };

    // Handle send
    const handleSend = async () => {
        if (!isValid) return;

        try {
            const result = await sendNotification.mutateAsync({
                subject: subject.trim(),
                body: body.trim(),
                recipients: selectedRecipients.map((r: Person) => ({
                    id: r.id,
                    user_id: r.id,
                    username: r.username,
                    email: r.email,
                })),
                filters: {
                    organizationId: filterOrg !== 'all' ? filterOrg : undefined,
                    role: filterRole !== 'all' ? filterRole : undefined,
                    searchTerm: searchTerm || undefined,
                },
                isHtmlTemplate: useHtmlTemplate,
            });

            // Show success message
            setSuccessMessage(
                `Successfully sent ${result.successful} of ${result.totalRecipients} emails${
                    result.failed > 0 ? ` (${result.failed} failed)` : ''
                }`
            );

            // Reset form
            setSubject('');
            setBody('');
            setSelectedIds([]);
            setShowConfirm(false);
            setUseHtmlTemplate(false);

            // Clear success message after 5 seconds
            setTimeout(() => setSuccessMessage(null), 5000);

            onSuccess?.();
        } catch (error) {
            console.error('Failed to send notification:', error);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Personnel Selector */}
            <div className="glass-card" style={{ padding: '24px' }}>
                <h3
                    style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        marginBottom: '16px',
                        color: 'var(--text-primary)',
                    }}
                >
                    Select Recipients
                </h3>

                <PersonnelSelector
                    personnel={filteredPersonnel}
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    organizations={organizations}
                    filterOrg={filterOrg}
                    onFilterOrgChange={setFilterOrg}
                    filterRole={filterRole}
                    onFilterRoleChange={setFilterRole}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    isLoading={isLoadingPersonnel}
                />
            </div>

            {/* Right: Email Compose */}
            <div className="glass-card" style={{ padding: '24px' }}>
                <h3
                    style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        marginBottom: '16px',
                        color: 'var(--text-primary)',
                    }}
                >
                    Compose Email
                </h3>

                {/* Template Selection */}
                <div
                    style={{
                        padding: '16px',
                        background: 'rgba(139, 92, 246, 0.1)',
                        border: '1px solid rgba(139, 92, 246, 0.2)',
                        borderRadius: '8px',
                        marginBottom: '16px',
                    }}
                >
                    <p
                        style={{
                            margin: '0 0 12px',
                            fontSize: '13px',
                            color: 'rgba(255, 255, 255, 0.7)',
                        }}
                    >
                        Quick Templates:
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            onClick={loadProfileUpdateTemplate}
                            disabled={useHtmlTemplate}
                            style={{
                                padding: '8px 16px',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: useHtmlTemplate ? '#a78bfa' : '#fff',
                                background: useHtmlTemplate
                                    ? 'rgba(139, 92, 246, 0.3)'
                                    : 'rgba(139, 92, 246, 0.2)',
                                border: '1px solid rgba(139, 92, 246, 0.4)',
                                borderRadius: '6px',
                                cursor: useHtmlTemplate ? 'default' : 'pointer',
                            }}
                        >
                            {useHtmlTemplate ? 'Profile Update Reminder (Loaded)' : 'Profile Update Reminder'}
                        </button>
                        {useHtmlTemplate && (
                            <button
                                onClick={clearTemplate}
                                style={{
                                    padding: '8px 16px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    color: '#f87171',
                                    background: 'rgba(248, 113, 113, 0.1)',
                                    border: '1px solid rgba(248, 113, 113, 0.3)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                }}
                            >
                                Clear Template
                            </button>
                        )}
                    </div>
                </div>

                {/* Success message */}
                {successMessage && (
                    <div
                        style={{
                            padding: '12px 16px',
                            background: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            borderRadius: '8px',
                            marginBottom: '16px',
                            color: '#22c55e',
                            fontSize: '14px',
                        }}
                    >
                        {successMessage}
                    </div>
                )}

                {/* Selected count */}
                <div
                    style={{
                        padding: '12px 16px',
                        background:
                            selectedIds.length > 0
                                ? 'rgba(59, 130, 246, 0.1)'
                                : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${
                            selectedIds.length > 0
                                ? 'rgba(59, 130, 246, 0.3)'
                                : 'rgba(255, 255, 255, 0.1)'
                        }`,
                        borderRadius: '8px',
                        marginBottom: '16px',
                    }}
                >
                    <span
                        style={{
                            color: selectedIds.length > 0 ? '#60a5fa' : 'rgba(255, 255, 255, 0.5)',
                            fontWeight: 500,
                        }}
                    >
                        {selectedIds.length} recipient{selectedIds.length !== 1 ? 's' : ''} selected
                    </span>
                </div>

                <div className="space-y-4">
                    <FormField
                        label="Subject"
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Enter email subject..."
                        required
                    />

                    {useHtmlTemplate ? (
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    marginBottom: '8px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'var(--text-primary)',
                                }}
                            >
                                Message
                            </label>
                            <div
                                style={{
                                    padding: '16px',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    borderRadius: '8px',
                                }}
                            >
                                <p
                                    style={{
                                        margin: 0,
                                        fontSize: '14px',
                                        color: '#10b981',
                                        fontWeight: 500,
                                    }}
                                >
                                    HTML Template Loaded: Profile Update Reminder
                                </p>
                                <p
                                    style={{
                                        margin: '8px 0 0',
                                        fontSize: '13px',
                                        color: 'rgba(255, 255, 255, 0.6)',
                                    }}
                                >
                                    This will send a professionally designed email prompting users to
                                    log in and update their personal details and certifications.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <FormTextarea
                            label="Message"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Enter your message..."
                            rows={10}
                            required
                            helperText="Plain text message. Line breaks will be preserved."
                        />
                    )}

                    <button
                        onClick={() => setShowConfirm(true)}
                        disabled={!isValid || sendNotification.isPending}
                        className="btn btn-primary w-full"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: !isValid || sendNotification.isPending ? 0.5 : 1,
                            cursor: !isValid || sendNotification.isPending ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {sendNotification.isPending ? (
                            <>
                                <span
                                    style={{
                                        width: '16px',
                                        height: '16px',
                                        border: '2px solid rgba(255,255,255,0.3)',
                                        borderTopColor: '#fff',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite',
                                    }}
                                />
                                Sending...
                            </>
                        ) : (
                            'Send Notification'
                        )}
                    </button>
                </div>
            </div>

            {/* Confirmation Dialog */}
            <ConfirmDialog
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={handleSend}
                title="Send Notification"
                message={
                    <div style={{ textAlign: 'left' }}>
                        <p>Are you sure you want to send this notification?</p>
                        <div
                            style={{
                                marginTop: '12px',
                                padding: '12px',
                                borderRadius: '8px',
                                background: 'rgba(255, 255, 255, 0.05)',
                            }}
                        >
                            <p style={{ marginBottom: '8px' }}>
                                <strong>Subject:</strong> {subject}
                            </p>
                            <p>
                                <strong>Recipients:</strong> {selectedIds.length} people
                            </p>
                        </div>
                        <p
                            style={{
                                marginTop: '12px',
                                fontSize: '13px',
                                color: 'rgba(255, 255, 255, 0.6)',
                            }}
                        >
                            This will send an email to all selected recipients.
                        </p>
                    </div>
                }
                confirmText="Send Email"
                variant="info"
                isLoading={sendNotification.isPending}
            />
        </div>
    );
}

export default CustomNotifications;
