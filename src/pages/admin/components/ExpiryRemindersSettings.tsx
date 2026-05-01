/**
 * ExpiryRemindersSettings - Certification expiry reminder configuration
 * Migrated from ConfigurationTab for the unified Notifications tab
 */

import { useState, FormEvent, useMemo } from 'react';
import { useEmailReminderSettings } from '../../../hooks/queries/useEmailReminderSettings';
import {
    useUpdateEmailReminderSettings,
    useTriggerExpirationReminders,
    useSendExpiryReminderToUser,
} from '../../../hooks/mutations/useEmailReminderMutations';
import { useExpiringCompetencies } from '../../../hooks/queries/useCompetencies';
import { ConfirmDialog } from '../../../components/ui';

export function ExpiryRemindersSettings() {
    // Data hooks
    const { data: reminderSettings, isLoading: reminderSettingsLoading } =
        useEmailReminderSettings();
    const { data: expiringCompetencies, isLoading: expiringLoading } =
        useExpiringCompetencies(180); // 6 months

    // Mutation hooks
    const updateReminderSettingsMutation = useUpdateEmailReminderSettings();
    const triggerRemindersMutation = useTriggerExpirationReminders();
    const sendToUserMutation = useSendExpiryReminderToUser();

    // Local state - Email reminder settings
    const [reminderEditing, setReminderEditing] = useState(false);
    const [reminderEnabled, setReminderEnabled] = useState(true);
    const [reminderThresholds, setReminderThresholds] = useState<number[]>([6, 3, 1, 0]);
    const [managerEmails, setManagerEmails] = useState<string[]>([]);
    const [newManagerEmail, setNewManagerEmail] = useState('');
    const [triggerConfirmOpen, setTriggerConfirmOpen] = useState(false);

    // Local state - Single user send
    const [selectedUserId, setSelectedUserId] = useState('');
    const [singleUserConfirmOpen, setSingleUserConfirmOpen] = useState(false);

    // Get unique users with expiring competencies
    const usersWithExpiring = useMemo(() => {
        if (!expiringCompetencies) return [];
        const userMap = new Map<string, { id: string; username: string; email: string; count: number }>();
        for (const comp of expiringCompetencies) {
            if (!userMap.has(comp.user_id)) {
                userMap.set(comp.user_id, {
                    id: comp.user_id,
                    username: comp.username || 'Unknown',
                    email: comp.email || '',
                    count: 1,
                });
            } else {
                const user = userMap.get(comp.user_id)!;
                user.count++;
            }
        }
        return Array.from(userMap.values()).sort((a, b) => a.username.localeCompare(b.username));
    }, [expiringCompetencies]);

    // Get selected user details for confirmation dialog
    const selectedUser = useMemo(() => {
        return usersWithExpiring.find((u) => u.id === selectedUserId);
    }, [usersWithExpiring, selectedUserId]);

    // Load reminder settings into form
    const loadReminderSettingsToForm = () => {
        if (reminderSettings) {
            setReminderEnabled(reminderSettings.is_enabled);
            setReminderThresholds(reminderSettings.thresholds_months || [6, 3, 1, 0]);
            setManagerEmails(reminderSettings.manager_emails || []);
        }
        setReminderEditing(true);
    };

    // Handle reminder settings save
    const handleSaveReminderSettings = async (e: FormEvent) => {
        e.preventDefault();
        await updateReminderSettingsMutation.mutateAsync({
            is_enabled: reminderEnabled,
            thresholds_months: reminderThresholds,
            manager_emails: managerEmails,
        });
        setReminderEditing(false);
    };

    // Handle adding manager email
    const handleAddManagerEmail = () => {
        const email = newManagerEmail.trim().toLowerCase();
        if (email && !managerEmails.includes(email) && email.includes('@')) {
            setManagerEmails([...managerEmails, email]);
            setNewManagerEmail('');
        }
    };

    // Handle removing manager email
    const handleRemoveManagerEmail = (email: string) => {
        setManagerEmails(managerEmails.filter((e) => e !== email));
    };

    // Handle threshold toggle
    const handleThresholdToggle = (months: number) => {
        if (reminderThresholds.includes(months)) {
            setReminderThresholds(reminderThresholds.filter((t) => t !== months));
        } else {
            setReminderThresholds([...reminderThresholds, months].sort((a, b) => b - a));
        }
    };

    // Handle manual trigger
    const handleTriggerReminders = async () => {
        await triggerRemindersMutation.mutateAsync();
        setTriggerConfirmOpen(false);
    };

    // Handle single-user send
    const handleSendToUser = async () => {
        if (!selectedUserId) return;
        try {
            const result = await sendToUserMutation.mutateAsync(selectedUserId);
            alert(`Result: ${JSON.stringify(result, null, 2)}`);
            setSingleUserConfirmOpen(false);
            setSelectedUserId('');
        } catch (error) {
            alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    return (
        <>
            <div style={{ padding: '24px', border: '1px solid rgba(53, 160, 88, 0.20)', borderRadius: '8px', background: 'rgba(53, 160, 88, 0.05)' }}>
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--green-bright)' }}>
                            Certification Expiry Reminders
                        </h2>
                        <p
                            style={{
                                marginTop: '4px',
                                fontSize: '14px',
                                color: 'rgba(53, 160, 88, 0.45)',
                            }}
                        >
                            Automatically notify personnel when certifications are expiring
                        </p>
                    </div>
                    {!reminderEditing && (
                        <button onClick={loadReminderSettingsToForm} className="ad-btn primary">
                            Configure
                        </button>
                    )}
                </div>

                {reminderSettingsLoading ? (
                    <div
                        style={{
                            padding: '20px',
                            textAlign: 'center',
                            color: 'rgba(53, 160, 88, 0.45)',
                        }}
                    >
                        Loading...
                    </div>
                ) : reminderEditing ? (
                    <form onSubmit={handleSaveReminderSettings} className="space-y-6">
                        {/* Enable/Disable Toggle */}
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={reminderEnabled}
                                    onChange={(e) => setReminderEnabled(e.target.checked)}
                                    style={{ width: '18px', height: '18px' }}
                                />
                                <span
                                    style={{
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        color: 'rgba(53, 160, 88, 0.70)',
                                    }}
                                >
                                    Enable automatic email reminders
                                </span>
                            </label>
                        </div>

                        {/* Threshold Configuration */}
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'rgba(53, 160, 88, 0.55)',
                                    marginBottom: '8px',
                                }}
                            >
                                Reminder Thresholds
                            </label>
                            <p
                                style={{
                                    fontSize: '13px',
                                    color: 'rgba(53, 160, 88, 0.35)',
                                    marginBottom: '12px',
                                }}
                            >
                                Send reminders when certifications are expiring within these time
                                periods
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {[6, 3, 1, 0].map((months) => (
                                    <button
                                        key={months}
                                        type="button"
                                        onClick={() => handleThresholdToggle(months)}
                                        style={{
                                            padding: '8px 16px',
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            borderRadius: '6px',
                                            border: reminderThresholds.includes(months)
                                                ? '2px solid rgba(53, 160, 88, 0.60)'
                                                : '2px solid rgba(53, 160, 88, 0.15)',
                                            background: reminderThresholds.includes(months)
                                                ? 'rgba(53, 160, 88, 0.15)'
                                                : 'transparent',
                                            color: reminderThresholds.includes(months)
                                                ? 'var(--green-bright)'
                                                : 'rgba(53, 160, 88, 0.45)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {months === 0
                                            ? 'Expired / This Month'
                                            : `${months} month${months > 1 ? 's' : ''}`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Manager Emails */}
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'rgba(53, 160, 88, 0.55)',
                                    marginBottom: '8px',
                                }}
                            >
                                Manager Emails (CC)
                            </label>
                            <p
                                style={{
                                    fontSize: '13px',
                                    color: 'rgba(53, 160, 88, 0.35)',
                                    marginBottom: '12px',
                                }}
                            >
                                These emails will be CC'd on all reminder notifications
                            </p>

                            {/* Email input */}
                            <div className="flex gap-2 mb-3">
                                <input
                                    type="email"
                                    value={newManagerEmail}
                                    onChange={(e) => setNewManagerEmail(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddManagerEmail();
                                        }
                                    }}
                                    placeholder="Enter manager email address"
                                    className="glass-input flex-1"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddManagerEmail}
                                    disabled={
                                        !newManagerEmail.trim() || !newManagerEmail.includes('@')
                                    }
                                    className="ad-btn"
                                    style={{
                                        opacity:
                                            !newManagerEmail.trim() ||
                                            !newManagerEmail.includes('@')
                                                ? 0.5
                                                : 1,
                                    }}
                                >
                                    Add
                                </button>
                            </div>

                            {/* Email list */}
                            {managerEmails.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {managerEmails.map((email) => (
                                        <div
                                            key={email}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '6px 12px',
                                                background: 'rgba(53, 160, 88, 0.05)',
                                                border: '1px solid rgba(53, 160, 88, 0.15)',
                                                borderRadius: '6px',
                                                fontSize: '13px',
                                                color: 'rgba(53, 160, 88, 0.55)',
                                            }}
                                        >
                                            <span>{email}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveManagerEmail(email)}
                                                style={{
                                                    padding: '2px 6px',
                                                    fontSize: '12px',
                                                    color: 'var(--red)',
                                                    background: 'rgba(248, 113, 113, 0.1)',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p
                                    style={{
                                        fontSize: '13px',
                                        color: 'rgba(53, 160, 88, 0.30)',
                                        fontStyle: 'italic',
                                    }}
                                >
                                    No manager emails configured. Reminders will be sent to
                                    employees only.
                                </p>
                            )}
                        </div>

                        {/* Form actions */}
                        <div className="flex gap-2 pt-2">
                            <button
                                type="submit"
                                disabled={updateReminderSettingsMutation.isPending}
                                className="ad-btn primary"
                            >
                                {updateReminderSettingsMutation.isPending
                                    ? 'Saving...'
                                    : 'Save Settings'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setReminderEditing(false)}
                                className="ad-btn"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => setTriggerConfirmOpen(true)}
                                className="ad-btn"
                                style={{ marginLeft: 'auto' }}
                            >
                                Send Reminders Now
                            </button>
                        </div>
                    </form>
                ) : (
                    /* Current settings preview */
                    <div
                        style={{
                            padding: '16px',
                            borderRadius: '8px',
                            background: reminderSettings?.is_enabled
                                ? 'rgba(53, 160, 88, 0.10)'
                                : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${
                                reminderSettings?.is_enabled
                                    ? 'rgba(53, 160, 88, 0.25)'
                                    : 'rgba(239, 68, 68, 0.3)'
                            }`,
                        }}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <span
                                style={{
                                    padding: '2px 8px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    borderRadius: '4px',
                                    background: reminderSettings?.is_enabled
                                        ? 'rgba(53, 160, 88, 0.15)'
                                        : 'rgba(239, 68, 68, 0.2)',
                                    color: reminderSettings?.is_enabled ? 'var(--green-bright)' : 'var(--red)',
                                    textTransform: 'uppercase',
                                }}
                            >
                                {reminderSettings?.is_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                        <div style={{ fontSize: '14px', color: 'rgba(53, 160, 88, 0.70)' }}>
                            <p style={{ marginBottom: '8px' }}>
                                <strong>Thresholds:</strong>{' '}
                                {reminderSettings?.thresholds_months?.length
                                    ? reminderSettings.thresholds_months
                                          .map((m: number) =>
                                              m === 0 ? 'Expired' : `${m} month${m > 1 ? 's' : ''}`
                                          )
                                          .join(', ')
                                    : 'None configured'}
                            </p>
                            <p>
                                <strong>Manager CC:</strong>{' '}
                                {reminderSettings?.manager_emails?.length
                                    ? reminderSettings.manager_emails.join(', ')
                                    : 'None configured'}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Send to Individual Section */}
            <div style={{ padding: '24px', marginTop: '16px', border: '1px solid rgba(53, 160, 88, 0.20)', borderRadius: '8px', background: 'rgba(53, 160, 88, 0.05)' }}>
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--green-bright)' }}>
                            Send to Individual
                        </h2>
                        <p
                            style={{
                                marginTop: '4px',
                                fontSize: '14px',
                                color: 'rgba(53, 160, 88, 0.45)',
                            }}
                        >
                            Send expiry reminder to a specific user (useful for testing)
                        </p>
                    </div>
                </div>

                {expiringLoading ? (
                    <div
                        style={{
                            padding: '20px',
                            textAlign: 'center',
                            color: 'rgba(53, 160, 88, 0.45)',
                        }}
                    >
                        Loading users...
                    </div>
                ) : usersWithExpiring.length === 0 ? (
                    <div
                        style={{
                            padding: '16px',
                            borderRadius: '8px',
                            background: 'rgba(53, 160, 88, 0.10)',
                            border: '1px solid rgba(53, 160, 88, 0.25)',
                            textAlign: 'center',
                        }}
                    >
                        <p style={{ fontSize: '14px', color: 'rgba(53, 160, 88, 0.55)' }}>
                            No users with expiring certifications found
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: 'rgba(53, 160, 88, 0.55)',
                                    marginBottom: '8px',
                                }}
                            >
                                Select User
                            </label>
                            <select
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                                className="glass-input"
                                style={{ width: '100%' }}
                            >
                                <option value="">-- Select a user --</option>
                                {usersWithExpiring.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.username} - {user.email} ({user.count} expiring)
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={() => setSingleUserConfirmOpen(true)}
                            disabled={!selectedUserId || sendToUserMutation.isPending}
                            className="ad-btn primary"
                            style={{
                                opacity: !selectedUserId ? 0.5 : 1,
                            }}
                        >
                            {sendToUserMutation.isPending ? 'Sending...' : 'Send Expiry Reminder'}
                        </button>

                        {sendToUserMutation.isSuccess && (
                            <div
                                style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    background:
                                        sendToUserMutation.data?.sent > 0
                                            ? 'rgba(53, 160, 88, 0.10)'
                                            : 'rgba(251, 191, 36, 0.1)',
                                    border:
                                        sendToUserMutation.data?.sent > 0
                                            ? '1px solid rgba(53, 160, 88, 0.25)'
                                            : '1px solid rgba(251, 191, 36, 0.3)',
                                }}
                            >
                                <p
                                    style={{
                                        fontSize: '14px',
                                        color:
                                            sendToUserMutation.data?.sent > 0
                                                ? 'var(--green-bright)'
                                                : 'var(--amber)',
                                    }}
                                >
                                    {sendToUserMutation.data?.message ||
                                        (sendToUserMutation.data?.sent > 0
                                            ? 'Reminder sent successfully!'
                                            : 'No email sent')}
                                </p>
                            </div>
                        )}

                        {sendToUserMutation.isError && (
                            <div
                                style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                }}
                            >
                                <p style={{ fontSize: '14px', color: 'var(--red)' }}>
                                    Failed to send: {sendToUserMutation.error?.message}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Trigger reminders confirmation dialog */}
            <ConfirmDialog
                isOpen={triggerConfirmOpen}
                onClose={() => setTriggerConfirmOpen(false)}
                onConfirm={handleTriggerReminders}
                title="Send Reminders Now"
                message={
                    <>
                        This will send certification expiry reminder emails to all personnel with
                        expiring certifications based on the configured thresholds.
                        <br />
                        <br />
                        <strong>Note:</strong> Users who have already received a reminder for a
                        specific threshold this year will not receive another one.
                    </>
                }
                confirmText="Send Reminders"
                variant="warning"
                isLoading={triggerRemindersMutation.isPending}
            />

            {/* Single user send confirmation dialog */}
            <ConfirmDialog
                isOpen={singleUserConfirmOpen}
                onClose={() => setSingleUserConfirmOpen(false)}
                onConfirm={handleSendToUser}
                title="Send Expiry Reminder"
                message={
                    selectedUser ? (
                        <>
                            Send expiry reminder to <strong>{selectedUser.username}</strong> (
                            {selectedUser.email})?
                            <br />
                            <br />
                            They have <strong>{selectedUser.count}</strong> certification
                            {selectedUser.count > 1 ? 's' : ''} expiring within 6 months.
                            <br />
                            <br />
                            <span style={{ fontSize: '13px', color: 'rgba(53, 160, 88, 0.45)' }}>
                                This uses the same professional email template as automatic reminders.
                            </span>
                        </>
                    ) : (
                        'Send reminder to selected user?'
                    )
                }
                confirmText="Send Reminder"
                variant="warning"
                isLoading={sendToUserMutation.isPending}
            />
        </>
    );
}

export default ExpiryRemindersSettings;
