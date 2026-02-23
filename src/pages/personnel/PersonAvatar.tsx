/**
 * PersonAvatar - Avatar display component with initials fallback
 * Shows user avatar or initials, clickable to preview larger version
 */

import React, { useState } from 'react';

interface PersonAvatarProps {
    avatarUrl?: string | null;
    username: string;
    size?: number;
    clickable?: boolean;
}

function getInitials(username: string): string {
    if (!username) return '?';
    const cleaned = username.trim();
    const parts = cleaned.split(/[\s._-]+/).filter(Boolean);

    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (cleaned.length >= 2) {
        return cleaned.substring(0, 2).toUpperCase();
    } else {
        return cleaned.toUpperCase();
    }
}

function getAvatarColor(username: string): string {
    const colors = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f97316',
        '#10b981', '#06b6d4', '#6366f1', '#f59e0b',
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

function AvatarPreviewModal({
    isOpen,
    onClose,
    avatarUrl,
    username,
}: {
    isOpen: boolean;
    onClose: () => void;
    avatarUrl?: string | null;
    username: string;
}) {
    if (!isOpen) return null;

    const initials = getInitials(username);
    const bgColor = getAvatarColor(username);

    return (
        <div className="pm-avatar-preview-overlay" onClick={onClose}>
            <div className="pm-avatar-preview" onClick={(e) => e.stopPropagation()}>
                {avatarUrl ? (
                    <div className="pm-avatar-preview-circle">
                        <img src={avatarUrl} alt={`${username}'s avatar`} />
                    </div>
                ) : (
                    <div
                        className="pm-avatar-preview-circle"
                        style={{ background: bgColor }}
                    >
                        <span className="pm-avatar-initials" style={{ fontSize: '72px' }}>
                            {initials}
                        </span>
                    </div>
                )}
                <div className="pm-avatar-preview-name">{username}</div>
                <button className="pm-modal-close" onClick={onClose} style={{ position: 'absolute', top: '-40px', right: '-40px' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

export function PersonAvatar({
    avatarUrl,
    username,
    size = 48,
    clickable = true,
}: PersonAvatarProps) {
    const [showPreview, setShowPreview] = useState(false);

    const initials = getInitials(username);
    const bgColor = getAvatarColor(username);

    const handleClick = () => {
        if (clickable) setShowPreview(true);
    };

    // Size and bgColor are dynamic — must stay inline
    const sizeStyle: React.CSSProperties = {
        width: `${size}px`,
        height: `${size}px`,
        cursor: clickable ? 'pointer' : 'default',
    };

    return (
        <>
            <div className="pm-avatar" onClick={handleClick}>
                {avatarUrl ? (
                    <div className="pm-avatar-circle" style={sizeStyle}>
                        <img src={avatarUrl} alt={`${username}'s avatar`} />
                    </div>
                ) : (
                    <div
                        className="pm-avatar-circle"
                        style={{ ...sizeStyle, background: bgColor }}
                    >
                        <span className="pm-avatar-initials" style={{ fontSize: `${size * 0.4}px` }}>
                            {initials}
                        </span>
                    </div>
                )}
            </div>

            <AvatarPreviewModal
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                avatarUrl={avatarUrl}
                username={username}
            />
        </>
    );
}

export default PersonAvatar;
