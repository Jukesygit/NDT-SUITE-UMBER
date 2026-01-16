/**
 * NotificationHistory - View sent notification history
 * Shows both custom notification logs and expiry reminder logs
 */

import { useState, useMemo } from 'react';
import { useNotificationLogs } from '../../../hooks/queries/useNotificationLogs';
import { useEmailReminderLogs } from '../../../hooks/queries/useEmailReminderSettings';
import { DataTable, SectionSpinner, ErrorDisplay } from '../../../components/ui';
import type { Column } from '../../../components/ui';
import type { NotificationEmailLog } from '../../../services/notification-email-service';
import type { EmailReminderLog } from '../../../services/email-reminder-service';

type LogType = 'custom' | 'expiry';

interface NotificationHistoryProps {
    onViewDetail: (id: string) => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    completed: { bg: 'rgba(52, 211, 153, 0.15)', text: '#34d399' },
    sending: { bg: 'rgba(251, 191, 36, 0.15)', text: '#fbbf24' },
    pending: { bg: 'rgba(156, 163, 175, 0.15)', text: '#9ca3af' },
    failed: { bg: 'rgba(248, 113, 113, 0.15)', text: '#f87171' },
    sent: { bg: 'rgba(52, 211, 153, 0.15)', text: '#34d399' },
    bounced: { bg: 'rgba(251, 191, 36, 0.15)', text: '#fbbf24' },
};

export function NotificationHistory({ onViewDetail }: NotificationHistoryProps) {
    const [logType, setLogType] = useState<LogType>('custom');
    const [currentPage, setCurrentPage] = useState(1);
    const [filters, setFilters] = useState<{
        status?: string;
        startDate?: string;
        endDate?: string;
    }>({});
    const pageSize = 25;

    // Fetch data based on selected log type
    const {
        data: customLogsData,
        isLoading: customLoading,
        error: customError,
    } = useNotificationLogs(filters, currentPage, pageSize);

    const {
        data: expiryLogs = [],
        isLoading: expiryLoading,
        error: expiryError,
    } = useEmailReminderLogs({ limit: 100 });

    // Custom notification columns
    const customColumns = useMemo<Column<NotificationEmailLog>[]>(
        () => [
            {
                key: 'date',
                header: 'Date',
                width: '150px',
                render: (row) => (
                    <div>
                        <p
                            style={{
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                                fontSize: '14px',
                            }}
                        >
                            {new Date(row.created_at).toLocaleDateString()}
                        </p>
                        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                            {new Date(row.created_at).toLocaleTimeString()}
                        </p>
                    </div>
                ),
            },
            {
                key: 'subject',
                header: 'Subject',
                render: (row) => (
                    <p
                        style={{
                            color: 'var(--text-primary)',
                            fontSize: '14px',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                        title={row.subject}
                    >
                        {row.subject}
                    </p>
                ),
            },
            {
                key: 'sentBy',
                header: 'Sent By',
                width: '150px',
                render: (row) => (
                    <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px' }}>
                        {row.sent_by_name || 'Unknown'}
                    </span>
                ),
            },
            {
                key: 'recipients',
                header: 'Recipients',
                width: '120px',
                align: 'center' as const,
                render: (row) => (
                    <div style={{ fontSize: '14px' }}>
                        <span style={{ color: '#34d399' }}>{row.successful_count}</span>
                        <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}> / </span>
                        <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            {row.recipient_count}
                        </span>
                    </div>
                ),
            },
            {
                key: 'status',
                header: 'Status',
                width: '100px',
                align: 'center' as const,
                render: (row) => {
                    const colors = STATUS_COLORS[row.status] || STATUS_COLORS.pending;
                    return (
                        <span
                            style={{
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 500,
                                backgroundColor: colors.bg,
                                color: colors.text,
                                textTransform: 'capitalize',
                            }}
                        >
                            {row.status}
                        </span>
                    );
                },
            },
            {
                key: 'actions',
                header: 'Actions',
                width: '80px',
                align: 'right' as const,
                render: (row) => (
                    <button
                        onClick={() => onViewDetail(row.id)}
                        style={{
                            padding: '6px 12px',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#60a5fa',
                            background: 'rgba(96, 165, 250, 0.1)',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                        }}
                    >
                        View
                    </button>
                ),
            },
        ],
        [onViewDetail]
    );

    // Expiry reminder columns
    const expiryColumns = useMemo<Column<EmailReminderLog>[]>(
        () => [
            {
                key: 'date',
                header: 'Date',
                width: '150px',
                render: (row) => (
                    <div>
                        <p
                            style={{
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                                fontSize: '14px',
                            }}
                        >
                            {new Date(row.sent_at).toLocaleDateString()}
                        </p>
                        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                            {new Date(row.sent_at).toLocaleTimeString()}
                        </p>
                    </div>
                ),
            },
            {
                key: 'recipient',
                header: 'Recipient',
                render: (row) => (
                    <div>
                        <p style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '14px' }}>
                            {row.profiles?.username || 'Unknown'}
                        </p>
                        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                            {row.email_sent_to}
                        </p>
                    </div>
                ),
            },
            {
                key: 'threshold',
                header: 'Threshold',
                width: '150px',
                render: (row) => (
                    <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px' }}>
                        {row.threshold_months === 0
                            ? 'Expired'
                            : `${row.threshold_months} month${row.threshold_months > 1 ? 's' : ''}`}
                    </span>
                ),
            },
            {
                key: 'competencies',
                header: 'Competencies',
                width: '120px',
                align: 'center' as const,
                render: (row) => (
                    <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px' }}>
                        {row.competency_ids?.length || 0}
                    </span>
                ),
            },
            {
                key: 'status',
                header: 'Status',
                width: '100px',
                align: 'center' as const,
                render: (row) => {
                    const colors = STATUS_COLORS[row.status] || STATUS_COLORS.pending;
                    return (
                        <span
                            style={{
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 500,
                                backgroundColor: colors.bg,
                                color: colors.text,
                                textTransform: 'capitalize',
                            }}
                        >
                            {row.status}
                        </span>
                    );
                },
            },
        ],
        []
    );

    const isLoading = logType === 'custom' ? customLoading : expiryLoading;
    const error = logType === 'custom' ? customError : expiryError;

    if (isLoading && !customLogsData && expiryLogs.length === 0) {
        return <SectionSpinner message="Loading notification history..." />;
    }

    if (error) {
        return <ErrorDisplay error={error} title="Failed to load notification history" />;
    }

    const { data: customLogs = [], count = 0, totalPages = 1 } = customLogsData || {};

    return (
        <div className="space-y-4">
            {/* Log Type Toggle */}
            <div className="flex items-center gap-4">
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setLogType('custom');
                            setCurrentPage(1);
                        }}
                        style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            fontWeight: 500,
                            borderRadius: '6px',
                            border:
                                logType === 'custom'
                                    ? '2px solid #60a5fa'
                                    : '2px solid rgba(255, 255, 255, 0.1)',
                            background:
                                logType === 'custom' ? 'rgba(96, 165, 250, 0.2)' : 'transparent',
                            color: logType === 'custom' ? '#60a5fa' : 'rgba(255, 255, 255, 0.7)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        Custom Notifications
                    </button>
                    <button
                        onClick={() => {
                            setLogType('expiry');
                            setCurrentPage(1);
                        }}
                        style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            fontWeight: 500,
                            borderRadius: '6px',
                            border:
                                logType === 'expiry'
                                    ? '2px solid #60a5fa'
                                    : '2px solid rgba(255, 255, 255, 0.1)',
                            background:
                                logType === 'expiry' ? 'rgba(96, 165, 250, 0.2)' : 'transparent',
                            color: logType === 'expiry' ? '#60a5fa' : 'rgba(255, 255, 255, 0.7)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        Expiry Reminders
                    </button>
                </div>
            </div>

            {/* Filters (only for custom notifications) */}
            {logType === 'custom' && (
                <div className="glass-card" style={{ padding: '16px' }}>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '16px',
                        }}
                    >
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    marginBottom: '6px',
                                    color: 'rgba(255, 255, 255, 0.7)',
                                }}
                            >
                                Status
                            </label>
                            <select
                                value={filters.status || ''}
                                onChange={(e) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        status: e.target.value || undefined,
                                    }))
                                }
                                className="glass-input"
                                style={{ width: '100%' }}
                            >
                                <option value="">All Statuses</option>
                                <option value="completed">Completed</option>
                                <option value="sending">Sending</option>
                                <option value="failed">Failed</option>
                            </select>
                        </div>
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    marginBottom: '6px',
                                    color: 'rgba(255, 255, 255, 0.7)',
                                }}
                            >
                                From Date
                            </label>
                            <input
                                type="date"
                                value={filters.startDate || ''}
                                onChange={(e) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        startDate: e.target.value || undefined,
                                    }))
                                }
                                className="glass-input"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    marginBottom: '6px',
                                    color: 'rgba(255, 255, 255, 0.7)',
                                }}
                            >
                                To Date
                            </label>
                            <input
                                type="date"
                                value={filters.endDate || ''}
                                onChange={(e) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        endDate: e.target.value || undefined,
                                    }))
                                }
                                className="glass-input"
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* DataTable */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                {logType === 'custom' ? (
                    <>
                        <DataTable
                            data={customLogs}
                            columns={customColumns}
                            rowKey={(row) => row.id}
                            emptyState={{
                                title: 'No notifications sent',
                                message:
                                    'Notification history will appear here after you send your first email.',
                                icon: 'document',
                            }}
                        />

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div
                                style={{
                                    padding: '16px 24px',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <div
                                    style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}
                                >
                                    Showing {((currentPage - 1) * pageSize + 1).toLocaleString()} to{' '}
                                    {Math.min(currentPage * pageSize, count).toLocaleString()} of{' '}
                                    {count.toLocaleString()} entries
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="btn btn-secondary"
                                        style={{
                                            padding: '6px 12px',
                                            fontSize: '14px',
                                            opacity: currentPage === 1 ? 0.5 : 1,
                                        }}
                                    >
                                        Previous
                                    </button>
                                    <span
                                        style={{
                                            fontSize: '14px',
                                            color: 'rgba(255, 255, 255, 0.7)',
                                        }}
                                    >
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() =>
                                            setCurrentPage((p) => Math.min(totalPages, p + 1))
                                        }
                                        disabled={currentPage === totalPages}
                                        className="btn btn-secondary"
                                        style={{
                                            padding: '6px 12px',
                                            fontSize: '14px',
                                            opacity: currentPage === totalPages ? 0.5 : 1,
                                        }}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <DataTable
                        data={expiryLogs}
                        columns={expiryColumns}
                        rowKey={(row) => row.id}
                        emptyState={{
                            title: 'No expiry reminders sent',
                            message:
                                'Expiry reminder history will appear here after the system sends reminders.',
                            icon: 'document',
                        }}
                    />
                )}
            </div>
        </div>
    );
}

export default NotificationHistory;
