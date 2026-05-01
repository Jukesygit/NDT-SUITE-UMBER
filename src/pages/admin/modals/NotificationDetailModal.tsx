/**
 * NotificationDetailModal - View notification details and recipient list
 */

import { Modal, SectionSpinner } from '../../../components/ui';
import { useNotificationDetail } from '../../../hooks/queries/useNotificationLogs';
import type { NotificationRecipient } from '../../../services/notification-email-service';

interface NotificationDetailModalProps {
    notificationId: string | null;
    onClose: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    sent: { bg: 'rgba(53, 160, 88, 0.15)', text: 'var(--green-bright)' },
    pending: { bg: 'rgba(156, 163, 175, 0.15)', text: '#9ca3af' },
    failed: { bg: 'rgba(239, 68, 68, 0.15)', text: 'var(--red)' },
};

export function NotificationDetailModal({
    notificationId,
    onClose,
}: NotificationDetailModalProps) {
    const { data, isLoading } = useNotificationDetail(notificationId);

    if (!notificationId) return null;

    return (
        <Modal isOpen={!!notificationId} onClose={onClose} title="Notification Details" size="large">
            {isLoading ? (
                <SectionSpinner message="Loading details..." />
            ) : data ? (
                <div className="space-y-6">
                    {/* Summary */}
                    <div style={{ padding: '16px', border: '1px solid rgba(53, 160, 88, 0.20)', borderRadius: '8px', background: 'rgba(53, 160, 88, 0.05)' }}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '16px',
                            }}
                        >
                            <div>
                                <p
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(53, 160, 88, 0.45)',
                                        marginBottom: '4px',
                                    }}
                                >
                                    Subject
                                </p>
                                <p style={{ fontWeight: 500, color: 'rgba(53, 160, 88, 0.70)' }}>
                                    {data.notification.subject}
                                </p>
                            </div>
                            <div>
                                <p
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(53, 160, 88, 0.45)',
                                        marginBottom: '4px',
                                    }}
                                >
                                    Sent By
                                </p>
                                <p style={{ color: 'rgba(53, 160, 88, 0.70)' }}>
                                    {data.notification.sent_by_name}
                                </p>
                            </div>
                            <div>
                                <p
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(53, 160, 88, 0.45)',
                                        marginBottom: '4px',
                                    }}
                                >
                                    Date
                                </p>
                                <p style={{ color: 'rgba(53, 160, 88, 0.70)' }}>
                                    {new Date(data.notification.created_at).toLocaleString()}
                                </p>
                            </div>
                            <div>
                                <p
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(53, 160, 88, 0.45)',
                                        marginBottom: '4px',
                                    }}
                                >
                                    Delivery
                                </p>
                                <p style={{ color: 'rgba(53, 160, 88, 0.70)' }}>
                                    <span style={{ color: 'var(--green-bright)' }}>
                                        {data.notification.successful_count} sent
                                    </span>
                                    {data.notification.failed_count > 0 && (
                                        <span style={{ color: 'var(--red)' }}>
                                            {' '}
                                            / {data.notification.failed_count} failed
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Message Preview */}
                    <div>
                        <h4
                            style={{
                                fontSize: '14px',
                                fontWeight: 600,
                                marginBottom: '8px',
                                color: 'var(--green-bright)',
                            }}
                        >
                            Message
                        </h4>
                        <div
                            style={{
                                padding: '16px',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                whiteSpace: 'pre-wrap',
                                color: 'rgba(53, 160, 88, 0.70)',
                                fontSize: '14px',
                                lineHeight: '1.6',
                                border: '1px solid rgba(53, 160, 88, 0.20)',
                                borderRadius: '8px',
                                background: 'rgba(53, 160, 88, 0.05)',
                            }}
                        >
                            {data.notification.body}
                        </div>
                    </div>

                    {/* Recipients List */}
                    <div>
                        <h4
                            style={{
                                fontSize: '14px',
                                fontWeight: 600,
                                marginBottom: '8px',
                                color: 'var(--green-bright)',
                            }}
                        >
                            Recipients ({data.recipients.length})
                        </h4>
                        <div
                            style={{
                                maxHeight: '300px',
                                overflowY: 'auto',
                                border: '1px solid rgba(53, 160, 88, 0.20)',
                                borderRadius: '8px',
                            }}
                        >
                            {data.recipients.map((recipient: NotificationRecipient) => (
                                <div
                                    key={recipient.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 16px',
                                        borderBottom: '1px solid rgba(53, 160, 88, 0.10)',
                                    }}
                                >
                                    <div>
                                        <p
                                            style={{
                                                fontWeight: 500,
                                                color: 'rgba(53, 160, 88, 0.70)',
                                            }}
                                        >
                                            {recipient.recipient_name}
                                        </p>
                                        <p
                                            style={{
                                                fontSize: '13px',
                                                color: 'rgba(53, 160, 88, 0.45)',
                                            }}
                                        >
                                            {recipient.recipient_email}
                                        </p>
                                        {recipient.error_message && (
                                            <p
                                                style={{
                                                    fontSize: '12px',
                                                    color: 'var(--red)',
                                                    marginTop: '4px',
                                                }}
                                            >
                                                Error: {recipient.error_message}
                                            </p>
                                        )}
                                    </div>
                                    <span
                                        style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            background:
                                                STATUS_COLORS[recipient.status]?.bg ||
                                                STATUS_COLORS.pending.bg,
                                            color:
                                                STATUS_COLORS[recipient.status]?.text ||
                                                STATUS_COLORS.pending.text,
                                            textTransform: 'capitalize',
                                        }}
                                    >
                                        {recipient.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}

export default NotificationDetailModal;
