/**
 * NotificationBell - Header notification icon with dropdown
 *
 * Shows count of items needing user attention (e.g., competencies with changes requested)
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserNotifications, type UserNotification } from '../hooks/queries/useUserNotifications';

/**
 * Format relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Bell Icon SVG
 */
function BellIcon({ hasNotifications }: { hasNotifications: boolean }) {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: hasNotifications ? 1 : 0.6 }}
        >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
    );
}

/**
 * Warning Icon SVG
 */
function WarningIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    );
}

/**
 * Notification Item
 */
function NotificationItem({
    notification,
    onClick,
}: {
    notification: UserNotification;
    onClick: () => void;
}) {
    return (
        <div
            onClick={onClick}
            onKeyDown={(e) => e.key === 'Enter' && onClick()}
            role="button"
            tabIndex={0}
            style={{
                padding: '12px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                    style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#f59e0b',
                        flexShrink: 0,
                    }}
                >
                    <WarningIcon />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#ffffff',
                            marginBottom: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {notification.competency?.name || 'Competency'}
                    </div>
                    <div
                        style={{
                            fontSize: '12px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginBottom: '4px',
                        }}
                    >
                        Changes requested
                    </div>
                    {notification.notes && (
                        <div
                            style={{
                                fontSize: '12px',
                                color: 'rgba(255, 255, 255, 0.6)',
                                background: 'rgba(245, 158, 11, 0.1)',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                marginTop: '6px',
                                lineHeight: '1.4',
                            }}
                        >
                            "{notification.notes}"
                        </div>
                    )}
                    <div
                        style={{
                            fontSize: '11px',
                            color: 'rgba(255, 255, 255, 0.4)',
                            marginTop: '6px',
                        }}
                    >
                        {formatRelativeTime(notification.verified_at || notification.updated_at)}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * NotificationBell Component
 */
export function NotificationBell() {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const { data: notifications = [], isLoading } = useUserNotifications();
    const count = notifications.length;

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
        return undefined;
    }, [isOpen]);

    const handleNotificationClick = () => {
        setIsOpen(false);
        navigate('/profile');
    };

    const handleViewAll = () => {
        setIsOpen(false);
        navigate('/profile');
    };

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'relative',
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: isOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: count > 0 ? '#f59e0b' : 'rgba(255, 255, 255, 0.6)',
                    transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                    if (!isOpen) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={(e) => {
                    if (!isOpen) e.currentTarget.style.background = 'transparent';
                }}
                title={count > 0 ? `${count} items need attention` : 'No notifications'}
            >
                <BellIcon hasNotifications={count > 0} />

                {/* Count Badge */}
                {count > 0 && (
                    <span
                        style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            minWidth: '18px',
                            height: '18px',
                            borderRadius: '9px',
                            background: '#f59e0b',
                            color: '#000',
                            fontSize: '11px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 5px',
                        }}
                    >
                        {count > 9 ? '9+' : count}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        width: '320px',
                        maxHeight: '400px',
                        background: 'rgba(23, 23, 23, 0.98)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                        overflow: 'hidden',
                        zIndex: 1000,
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            padding: '14px 16px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>
                            Notifications
                        </span>
                        {count > 0 && (
                            <span
                                style={{
                                    fontSize: '12px',
                                    color: '#f59e0b',
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                }}
                            >
                                {count} action{count !== 1 ? 's' : ''} needed
                            </span>
                        )}
                    </div>

                    {/* Content */}
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {isLoading ? (
                            <div
                                style={{
                                    padding: '24px',
                                    textAlign: 'center',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    fontSize: '13px',
                                }}
                            >
                                Loading...
                            </div>
                        ) : count === 0 ? (
                            <div
                                style={{
                                    padding: '32px 24px',
                                    textAlign: 'center',
                                }}
                            >
                                <div
                                    style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '50%',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto 12px',
                                        color: 'rgba(255, 255, 255, 0.3)',
                                    }}
                                >
                                    <BellIcon hasNotifications={false} />
                                </div>
                                <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '13px' }}>
                                    No notifications
                                </div>
                                <div style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '12px', marginTop: '4px' }}>
                                    You're all caught up!
                                </div>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={notification}
                                    onClick={handleNotificationClick}
                                />
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    {count > 0 && (
                        <div
                            style={{
                                padding: '12px 16px',
                                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                                textAlign: 'center',
                            }}
                        >
                            <button
                                onClick={handleViewAll}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--accent-primary, #60a5fa)',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    padding: '4px 12px',
                                }}
                            >
                                View all in Profile →
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default NotificationBell;
