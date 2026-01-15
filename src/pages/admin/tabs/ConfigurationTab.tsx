/**
 * ConfigurationTab - Admin dashboard configuration management
 *
 * Manages:
 * - System announcements (global messages for all users)
 * - Report field configuration lists (procedure numbers, equipment models, etc.)
 */

import { useState, useRef, KeyboardEvent, FormEvent } from 'react';
import { useAdminConfig, useConfigMetadata } from '../../../hooks/queries/useAdminConfig';
import {
    useAddConfigItem,
    useUpdateConfigItem,
    useRemoveConfigItem,
    useResetConfigList,
    useResetAllConfig,
    useImportConfig,
} from '../../../hooks/mutations/useConfigMutations';
import { useAnnouncement } from '../../../hooks/queries/useAnnouncement';
import { useUpdateAnnouncement, useClearAnnouncement } from '../../../hooks/mutations/useAnnouncementMutations';
import { useEmailReminderSettings } from '../../../hooks/queries/useEmailReminderSettings';
import { useUpdateEmailReminderSettings, useTriggerExpirationReminders } from '../../../hooks/mutations/useEmailReminderMutations';
import { adminService } from '../../../services/admin-service';
import type { UpdateAnnouncementData } from '../../../services/admin-service';
import { SectionSpinner, ErrorDisplay, EmptyState, ConfirmDialog } from '../../../components/ui';

// Type for configuration list names
type ConfigListName =
    | 'procedureNumbers'
    | 'equipmentModels'
    | 'probes'
    | 'calibrationBlocks'
    | 'couplants'
    | 'scannerFrames'
    | 'coatingTypes'
    | 'materials'
    | 'acceptanceCriteria'
    | 'clients'
    | 'locations';

// State type for editing/deleting items
interface ItemAction {
    list: ConfigListName;
    item: string;
    index?: number;
}

/**
 * Helper function to download JSON content
 */
function downloadJson(content: string, filename: string) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Announcement type options
const announcementTypes = [
    { value: 'info', label: 'Info', color: '#60a5fa' },
    { value: 'warning', label: 'Warning', color: '#fbbf24' },
    { value: 'success', label: 'Success', color: '#22c55e' },
    { value: 'error', label: 'Error', color: '#ef4444' },
] as const;

export default function ConfigurationTab() {
    // Data hooks
    const { data: config, isLoading, error } = useAdminConfig();
    const metadata = useConfigMetadata();
    const { data: announcement, isLoading: announcementLoading } = useAnnouncement();
    const { data: reminderSettings, isLoading: reminderSettingsLoading } = useEmailReminderSettings();

    // Mutation hooks
    const addItemMutation = useAddConfigItem();
    const updateItemMutation = useUpdateConfigItem();
    const removeItemMutation = useRemoveConfigItem();
    const resetListMutation = useResetConfigList();
    const resetAllMutation = useResetAllConfig();
    const importMutation = useImportConfig();
    const updateAnnouncementMutation = useUpdateAnnouncement();
    const clearAnnouncementMutation = useClearAnnouncement();
    const updateReminderSettingsMutation = useUpdateEmailReminderSettings();
    const triggerRemindersMutation = useTriggerExpirationReminders();

    // Local state - Config lists
    const [addingToList, setAddingToList] = useState<ConfigListName | null>(null);
    const [addItemValue, setAddItemValue] = useState('');
    const [editingItem, setEditingItem] = useState<ItemAction & { index: number } | null>(null);
    const [editItemValue, setEditItemValue] = useState('');
    const [deletingItem, setDeletingItem] = useState<ItemAction | null>(null);
    const [resettingList, setResettingList] = useState<ConfigListName | null>(null);
    const [resetAllOpen, setResetAllOpen] = useState(false);

    // Local state - Announcement editor
    const [announcementTitle, setAnnouncementTitle] = useState('');
    const [announcementMessage, setAnnouncementMessage] = useState('');
    const [announcementType, setAnnouncementType] = useState<'info' | 'warning' | 'success' | 'error'>('info');
    const [announcementActive, setAnnouncementActive] = useState(true);
    const [announcementDismissible, setAnnouncementDismissible] = useState(true);
    const [announcementEditing, setAnnouncementEditing] = useState(false);
    const [clearAnnouncementOpen, setClearAnnouncementOpen] = useState(false);

    // Local state - Email reminder settings
    const [reminderEditing, setReminderEditing] = useState(false);
    const [reminderEnabled, setReminderEnabled] = useState(true);
    const [reminderThresholds, setReminderThresholds] = useState<number[]>([6, 3, 1, 0]);
    const [managerEmails, setManagerEmails] = useState<string[]>([]);
    const [newManagerEmail, setNewManagerEmail] = useState('');
    const [triggerConfirmOpen, setTriggerConfirmOpen] = useState(false);

    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load announcement data into form when it changes
    const loadAnnouncementToForm = () => {
        if (announcement) {
            setAnnouncementTitle(announcement.title || '');
            setAnnouncementMessage(announcement.message || '');
            setAnnouncementType(announcement.type);
            setAnnouncementActive(announcement.is_active);
            setAnnouncementDismissible(announcement.is_dismissible);
        } else {
            setAnnouncementTitle('');
            setAnnouncementMessage('');
            setAnnouncementType('info');
            setAnnouncementActive(true);
            setAnnouncementDismissible(true);
        }
        setAnnouncementEditing(true);
    };

    // Handle announcement save
    const handleSaveAnnouncement = async (e: FormEvent) => {
        e.preventDefault();
        if (!announcementMessage.trim()) return;

        const data: UpdateAnnouncementData = {
            title: announcementTitle.trim() || null,
            message: announcementMessage.trim(),
            type: announcementType,
            is_active: announcementActive,
            is_dismissible: announcementDismissible,
        };

        await updateAnnouncementMutation.mutateAsync(data);
        setAnnouncementEditing(false);
    };

    // Handle announcement clear
    const handleClearAnnouncement = async () => {
        await clearAnnouncementMutation.mutateAsync();
        setClearAnnouncementOpen(false);
        setAnnouncementEditing(false);
    };

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
        setManagerEmails(managerEmails.filter(e => e !== email));
    };

    // Handle threshold toggle
    const handleThresholdToggle = (months: number) => {
        if (reminderThresholds.includes(months)) {
            setReminderThresholds(reminderThresholds.filter(t => t !== months));
        } else {
            setReminderThresholds([...reminderThresholds, months].sort((a, b) => b - a));
        }
    };

    // Handle manual trigger
    const handleTriggerReminders = async () => {
        await triggerRemindersMutation.mutateAsync();
        setTriggerConfirmOpen(false);
    };

    // Loading states
    if (isLoading) {
        return <SectionSpinner message="Loading configuration..." />;
    }

    // Error states
    if (error) {
        return <ErrorDisplay error={error} />;
    }

    // Handler functions
    const handleAddItem = async (listName: ConfigListName) => {
        const trimmedValue = addItemValue.trim();
        if (!trimmedValue) return;

        await addItemMutation.mutateAsync({
            listName,
            item: trimmedValue,
        });

        setAddItemValue('');
        setAddingToList(null);
    };

    const handleUpdateItem = async () => {
        if (!editingItem) return;
        const trimmedValue = editItemValue.trim();
        if (!trimmedValue || trimmedValue === editingItem.item) {
            setEditingItem(null);
            setEditItemValue('');
            return;
        }

        await updateItemMutation.mutateAsync({
            listName: editingItem.list,
            oldItem: editingItem.item,
            newItem: trimmedValue,
        });

        setEditingItem(null);
        setEditItemValue('');
    };

    const handleDeleteItem = async () => {
        if (!deletingItem) return;

        await removeItemMutation.mutateAsync({
            listName: deletingItem.list,
            item: deletingItem.item,
        });

        setDeletingItem(null);
    };

    const handleResetList = async () => {
        if (!resettingList) return;

        await resetListMutation.mutateAsync(resettingList);
        setResettingList(null);
    };

    const handleResetAll = async () => {
        await resetAllMutation.mutateAsync();
        setResetAllOpen(false);
    };

    const handleExport = () => {
        const configJson = adminService.exportConfig();
        const timestamp = new Date().toISOString().slice(0, 10);
        downloadJson(configJson, `ndt-config-${timestamp}.json`);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const content = await file.text();
            await importMutation.mutateAsync(content);

            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error('Error reading import file:', error);
        }
    };

    // Keyboard handlers for inline forms
    const handleAddKeyDown = (e: KeyboardEvent<HTMLInputElement>, listName: ConfigListName) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddItem(listName);
        } else if (e.key === 'Escape') {
            setAddingToList(null);
            setAddItemValue('');
        }
    };

    const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleUpdateItem();
        } else if (e.key === 'Escape') {
            setEditingItem(null);
            setEditItemValue('');
        }
    };

    // Get list of config list names
    const listNames = Object.keys(metadata) as ConfigListName[];

    return (
        <div className="space-y-8">
            {/* Email Reminder Settings Section */}
            <div className="glass-card" style={{ padding: '24px' }}>
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Certification Expiry Reminders
                        </h2>
                        <p style={{ marginTop: '4px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
                            Automatically notify personnel when certifications are expiring
                        </p>
                    </div>
                    {!reminderEditing && (
                        <button
                            onClick={loadReminderSettingsToForm}
                            className="btn btn-primary"
                        >
                            Configure
                        </button>
                    )}
                </div>

                {reminderSettingsLoading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.6)' }}>
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
                                <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)' }}>
                                    Enable automatic email reminders
                                </span>
                            </label>
                        </div>

                        {/* Threshold Configuration */}
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.8)', marginBottom: '8px' }}>
                                Reminder Thresholds
                            </label>
                            <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '12px' }}>
                                Send reminders when certifications are expiring within these time periods
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
                                                ? '2px solid #60a5fa'
                                                : '2px solid rgba(255, 255, 255, 0.1)',
                                            background: reminderThresholds.includes(months)
                                                ? 'rgba(96, 165, 250, 0.2)'
                                                : 'transparent',
                                            color: reminderThresholds.includes(months)
                                                ? '#60a5fa'
                                                : 'rgba(255, 255, 255, 0.7)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {months === 0 ? 'Expired / This Month' : `${months} month${months > 1 ? 's' : ''}`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Manager Emails */}
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.8)', marginBottom: '8px' }}>
                                Manager Emails (CC)
                            </label>
                            <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '12px' }}>
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
                                    disabled={!newManagerEmail.trim() || !newManagerEmail.includes('@')}
                                    className="btn btn-secondary"
                                    style={{ opacity: !newManagerEmail.trim() || !newManagerEmail.includes('@') ? 0.5 : 1 }}
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
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: '6px',
                                                fontSize: '13px',
                                                color: 'rgba(255, 255, 255, 0.8)',
                                            }}
                                        >
                                            <span>{email}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveManagerEmail(email)}
                                                style={{
                                                    padding: '2px 6px',
                                                    fontSize: '12px',
                                                    color: '#f87171',
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
                                <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.4)', fontStyle: 'italic' }}>
                                    No manager emails configured. Reminders will be sent to employees only.
                                </p>
                            )}
                        </div>

                        {/* Form actions */}
                        <div className="flex gap-2 pt-2">
                            <button
                                type="submit"
                                disabled={updateReminderSettingsMutation.isPending}
                                className="btn btn-primary"
                            >
                                {updateReminderSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setReminderEditing(false)}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => setTriggerConfirmOpen(true)}
                                className="btn btn-secondary"
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
                                ? 'rgba(34, 197, 94, 0.1)'
                                : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${reminderSettings?.is_enabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
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
                                        ? 'rgba(34, 197, 94, 0.2)'
                                        : 'rgba(239, 68, 68, 0.2)',
                                    color: reminderSettings?.is_enabled ? '#22c55e' : '#ef4444',
                                    textTransform: 'uppercase',
                                }}
                            >
                                {reminderSettings?.is_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                        <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)' }}>
                            <p style={{ marginBottom: '8px' }}>
                                <strong>Thresholds:</strong>{' '}
                                {reminderSettings?.thresholds_months?.length
                                    ? reminderSettings.thresholds_months
                                          .map(m => m === 0 ? 'Expired' : `${m} month${m > 1 ? 's' : ''}`)
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

            {/* System Announcement Section */}
            <div className="glass-card" style={{ padding: '24px' }}>
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            System Announcement
                        </h2>
                        <p style={{ marginTop: '4px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
                            Display a message to all users below the header
                        </p>
                    </div>
                    {!announcementEditing && (
                        <button
                            onClick={loadAnnouncementToForm}
                            className="btn btn-primary"
                        >
                            {announcement?.is_active ? 'Edit Announcement' : 'Create Announcement'}
                        </button>
                    )}
                </div>

                {announcementLoading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.6)' }}>
                        Loading...
                    </div>
                ) : announcementEditing ? (
                    <form onSubmit={handleSaveAnnouncement} className="space-y-4">
                        {/* Title (optional) */}
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.8)', marginBottom: '6px' }}>
                                Title (optional)
                            </label>
                            <input
                                type="text"
                                value={announcementTitle}
                                onChange={(e) => setAnnouncementTitle(e.target.value)}
                                placeholder="e.g., System Maintenance"
                                className="glass-input"
                                style={{ width: '100%' }}
                            />
                        </div>

                        {/* Message (required) */}
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.8)', marginBottom: '6px' }}>
                                Message *
                            </label>
                            <textarea
                                value={announcementMessage}
                                onChange={(e) => setAnnouncementMessage(e.target.value)}
                                placeholder="Enter your announcement message..."
                                required
                                rows={3}
                                className="glass-input"
                                style={{ width: '100%', resize: 'vertical' }}
                            />
                        </div>

                        {/* Type selector */}
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.8)', marginBottom: '6px' }}>
                                Type
                            </label>
                            <div className="flex gap-2">
                                {announcementTypes.map((type) => (
                                    <button
                                        key={type.value}
                                        type="button"
                                        onClick={() => setAnnouncementType(type.value)}
                                        style={{
                                            padding: '8px 16px',
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            borderRadius: '6px',
                                            border: announcementType === type.value ? `2px solid ${type.color}` : '2px solid rgba(255, 255, 255, 0.1)',
                                            background: announcementType === type.value ? `${type.color}20` : 'transparent',
                                            color: announcementType === type.value ? type.color : 'rgba(255, 255, 255, 0.7)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Options */}
                        <div className="flex gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={announcementActive}
                                    onChange={(e) => setAnnouncementActive(e.target.checked)}
                                    style={{ width: '18px', height: '18px' }}
                                />
                                <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)' }}>
                                    Active (visible to users)
                                </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={announcementDismissible}
                                    onChange={(e) => setAnnouncementDismissible(e.target.checked)}
                                    style={{ width: '18px', height: '18px' }}
                                />
                                <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)' }}>
                                    Dismissible (users can hide)
                                </span>
                            </label>
                        </div>

                        {/* Form actions */}
                        <div className="flex gap-2 pt-2">
                            <button
                                type="submit"
                                disabled={!announcementMessage.trim() || updateAnnouncementMutation.isPending}
                                className="btn btn-primary"
                            >
                                {updateAnnouncementMutation.isPending ? 'Saving...' : 'Save Announcement'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setAnnouncementEditing(false)}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            {announcement?.is_active && (
                                <button
                                    type="button"
                                    onClick={() => setClearAnnouncementOpen(true)}
                                    className="btn btn-danger"
                                    style={{ marginLeft: 'auto' }}
                                >
                                    Clear Announcement
                                </button>
                            )}
                        </div>
                    </form>
                ) : announcement?.is_active ? (
                    /* Current announcement preview */
                    <div
                        style={{
                            padding: '16px',
                            borderRadius: '8px',
                            background: announcementTypes.find(t => t.value === announcement.type)?.color + '15',
                            border: `1px solid ${announcementTypes.find(t => t.value === announcement.type)?.color}40`,
                        }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span
                                style={{
                                    padding: '2px 8px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    borderRadius: '4px',
                                    background: announcementTypes.find(t => t.value === announcement.type)?.color + '30',
                                    color: announcementTypes.find(t => t.value === announcement.type)?.color,
                                    textTransform: 'uppercase',
                                }}
                            >
                                {announcement.type}
                            </span>
                            {announcement.is_dismissible && (
                                <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                    Dismissible
                                </span>
                            )}
                        </div>
                        {announcement.title && (
                            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                {announcement.title}
                            </div>
                        )}
                        <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)' }}>
                            {announcement.message}
                        </div>
                    </div>
                ) : (
                    <EmptyState
                        title="No active announcement"
                        message="Create an announcement to display a message to all users"
                        icon="default"
                        className="py-6"
                    />
                )}
            </div>

            {/* Report Field Configuration Section */}
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Report Field Configuration
                        </h2>
                        <p style={{ marginTop: '4px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
                            Manage suggested values for report fields across the system
                        </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            className="btn btn-secondary"
                        >
                            Export Config
                        </button>
                        <button
                            onClick={handleImportClick}
                            className="btn btn-secondary"
                        >
                            Import Config
                        </button>
                        <button
                            onClick={() => setResetAllOpen(true)}
                            className="btn btn-danger"
                        >
                            Reset All
                        </button>
                    </div>
                </div>

            {/* Hidden file input for import */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelected}
                className="hidden"
            />

            {/* Config lists grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {listNames.map((listName) => {
                    const listData = config?.[listName] || [];
                    const listMeta = metadata[listName];
                    const isAdding = addingToList === listName;
                    const isPending =
                        addItemMutation.isPending ||
                        updateItemMutation.isPending ||
                        removeItemMutation.isPending ||
                        resetListMutation.isPending;

                    return (
                        <div
                            key={listName}
                            className="glass-card"
                            style={{ padding: 0, overflow: 'hidden' }}
                        >
                            {/* Card header */}
                            <div style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                background: 'rgba(255, 255, 255, 0.03)'
                            }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span style={{ fontSize: '18px' }}>{listMeta.icon}</span>
                                        <div>
                                            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {listMeta.label}
                                            </h3>
                                            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                                {listData.length} {listData.length === 1 ? 'item' : 'items'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setAddingToList(listName);
                                                setAddItemValue('');
                                            }}
                                            disabled={isPending || isAdding}
                                            style={{
                                                padding: '4px 12px',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                color: '#fff',
                                                background: 'var(--accent-primary)',
                                                borderRadius: '4px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                opacity: isPending || isAdding ? 0.5 : 1
                                            }}
                                        >
                                            + Add
                                        </button>
                                        <button
                                            onClick={() => setResettingList(listName)}
                                            disabled={isPending}
                                            style={{
                                                padding: '4px 12px',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                color: '#fff',
                                                background: '#d97706',
                                                borderRadius: '4px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                opacity: isPending ? 0.5 : 1
                                            }}
                                        >
                                            Reset
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* List items */}
                            <div className="max-h-80 overflow-y-auto glass-scrollbar">
                                {/* Add item form */}
                                {isAdding && (
                                    <div style={{
                                        padding: '8px 16px',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                        background: 'rgba(96, 165, 250, 0.1)'
                                    }}>
                                        <input
                                            type="text"
                                            value={addItemValue}
                                            onChange={(e) => setAddItemValue(e.target.value)}
                                            onKeyDown={(e) => handleAddKeyDown(e, listName)}
                                            onBlur={() => {
                                                if (!addItemValue.trim()) {
                                                    setAddingToList(null);
                                                }
                                            }}
                                            placeholder="Enter value and press Enter"
                                            autoFocus
                                            className="glass-input"
                                            style={{ height: '32px', fontSize: '14px' }}
                                        />
                                    </div>
                                )}

                                {/* Existing items */}
                                {listData.length === 0 && !isAdding ? (
                                    <div style={{ padding: '32px 16px' }}>
                                        <EmptyState
                                            title="No items"
                                            message="Add items to this list using the + Add button"
                                            icon="document"
                                            className="py-4"
                                        />
                                    </div>
                                ) : (
                                    <div style={{ borderTop: 'none' }}>
                                        {listData.map((item, index) => {
                                            const isEditing =
                                                editingItem?.list === listName &&
                                                editingItem?.index === index;

                                            return (
                                                <div
                                                    key={`${item}-${index}`}
                                                    style={{
                                                        padding: '8px 16px',
                                                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                        transition: 'background 0.2s'
                                                    }}
                                                    className="group"
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    {isEditing ? (
                                                        <input
                                                            type="text"
                                                            value={editItemValue}
                                                            onChange={(e) => setEditItemValue(e.target.value)}
                                                            onKeyDown={handleEditKeyDown}
                                                            onBlur={handleUpdateItem}
                                                            autoFocus
                                                            className="glass-input"
                                                            style={{ height: '32px', fontSize: '14px' }}
                                                        />
                                                    ) : (
                                                        <div className="flex items-center justify-between">
                                                            <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                                                                {item}
                                                            </span>

                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingItem({ list: listName, item, index });
                                                                        setEditItemValue(item);
                                                                    }}
                                                                    disabled={isPending}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        fontSize: '12px',
                                                                        color: '#60a5fa',
                                                                        background: 'rgba(96, 165, 250, 0.1)',
                                                                        borderRadius: '4px',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        opacity: isPending ? 0.5 : 1
                                                                    }}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => setDeletingItem({ list: listName, item })}
                                                                    disabled={isPending}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        fontSize: '12px',
                                                                        color: '#f87171',
                                                                        background: 'rgba(248, 113, 113, 0.1)',
                                                                        borderRadius: '4px',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        opacity: isPending ? 0.5 : 1
                                                                    }}
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Delete confirmation dialog */}
            <ConfirmDialog
                isOpen={!!deletingItem}
                onClose={() => setDeletingItem(null)}
                onConfirm={handleDeleteItem}
                title="Delete Item"
                message={
                    <>
                        Are you sure you want to delete <strong>{deletingItem?.item}</strong>?
                        <br />
                        This item will be removed from the configuration list.
                    </>
                }
                confirmText="Delete"
                variant="danger"
                isLoading={removeItemMutation.isPending}
            />

            {/* Reset list confirmation dialog */}
            <ConfirmDialog
                isOpen={!!resettingList}
                onClose={() => setResettingList(null)}
                onConfirm={handleResetList}
                title="Reset List"
                message={
                    <>
                        Are you sure you want to reset <strong>{resettingList ? metadata[resettingList].label : ''}</strong> to default values?
                        <br />
                        All custom items will be removed and defaults will be restored.
                    </>
                }
                confirmText="Reset List"
                variant="warning"
                isLoading={resetListMutation.isPending}
            />

            {/* Reset all confirmation dialog */}
            <ConfirmDialog
                isOpen={resetAllOpen}
                onClose={() => setResetAllOpen(false)}
                onConfirm={handleResetAll}
                title="Reset All Configuration"
                message={
                    <>
                        <strong className="text-red-400">Warning: This is a destructive action!</strong>
                        <br />
                        <br />
                        Are you sure you want to reset ALL configuration lists to default values?
                        <br />
                        All custom items across all lists will be permanently removed.
                    </>
                }
                confirmText="Reset All Lists"
                variant="danger"
                isLoading={resetAllMutation.isPending}
            />

            {/* Clear announcement confirmation dialog */}
            <ConfirmDialog
                isOpen={clearAnnouncementOpen}
                onClose={() => setClearAnnouncementOpen(false)}
                onConfirm={handleClearAnnouncement}
                title="Clear Announcement"
                message="Are you sure you want to clear the current announcement? It will no longer be visible to users."
                confirmText="Clear"
                variant="danger"
                isLoading={clearAnnouncementMutation.isPending}
            />

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
                        <br /><br />
                        <strong>Note:</strong> Users who have already received a reminder for a
                        specific threshold this year will not receive another one.
                    </>
                }
                confirmText="Send Reminders"
                variant="warning"
                isLoading={triggerRemindersMutation.isPending}
            />
            </div>
        </div>
    );
}
