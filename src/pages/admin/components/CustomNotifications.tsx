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

export function CustomNotifications({ onSuccess }: CustomNotificationsProps) {
    const { data: personnel = [], isLoading: isLoadingPersonnel } = usePersonnel();
    const { data: organizations = [] } = useOrganizations();
    const sendNotification = useSendNotification();

    // Form state
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

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

    // Validation
    const isValid = subject.trim() && body.trim() && selectedIds.length > 0;

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

                    <FormTextarea
                        label="Message"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Enter your message..."
                        rows={10}
                        required
                        helperText="Plain text message. Line breaks will be preserved."
                    />

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
