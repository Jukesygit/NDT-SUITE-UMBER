/**
 * NotificationsTab - Unified notification management
 *
 * Features:
 * - Custom notification emails with personnel selection
 * - Certification expiry reminder settings (migrated from ConfigurationTab)
 * - Notification history (custom + expiry reminders)
 */

import { useState } from 'react';
import { CustomNotifications } from '../components/CustomNotifications';
import { ExpiryRemindersSettings } from '../components/ExpiryRemindersSettings';
import { NotificationHistory } from '../components/NotificationHistory';
import { NotificationDetailModal } from '../modals/NotificationDetailModal';

type ViewMode = 'custom' | 'expiry' | 'history';

export default function NotificationsTab() {
    const [viewMode, setViewMode] = useState<ViewMode>('custom');
    const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);

    const tabs: { id: ViewMode; label: string }[] = [
        { id: 'custom', label: 'Send Notification' },
        { id: 'expiry', label: 'Expiry Reminders' },
        { id: 'history', label: 'History' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Notifications
                </h2>
                <p
                    style={{
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.6)',
                        marginTop: '4px',
                    }}
                >
                    Send custom emails to personnel and manage certification expiry reminders
                </p>
            </div>

            {/* Tab Navigation */}
            <div
                style={{
                    display: 'flex',
                    gap: '4px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    paddingBottom: '0',
                }}
            >
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setViewMode(tab.id)}
                        style={{
                            padding: '12px 20px',
                            fontSize: '14px',
                            fontWeight: 500,
                            color:
                                viewMode === tab.id ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)',
                            background: 'transparent',
                            border: 'none',
                            borderBottom:
                                viewMode === tab.id
                                    ? '2px solid var(--accent-primary)'
                                    : '2px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            marginBottom: '-1px',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div>
                {viewMode === 'custom' && (
                    <CustomNotifications onSuccess={() => setViewMode('history')} />
                )}
                {viewMode === 'expiry' && <ExpiryRemindersSettings />}
                {viewMode === 'history' && (
                    <NotificationHistory onViewDetail={setSelectedNotificationId} />
                )}
            </div>

            {/* Detail Modal */}
            <NotificationDetailModal
                notificationId={selectedNotificationId}
                onClose={() => setSelectedNotificationId(null)}
            />
        </div>
    );
}
