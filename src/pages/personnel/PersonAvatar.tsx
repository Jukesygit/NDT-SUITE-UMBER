/**
 * PersonAvatar - Avatar display component with initials fallback
 * Shows user avatar or initials, clickable to preview larger version
 */

import React, { useState } from 'react';

interface PersonAvatarProps {
    /** URL to the avatar image */
    avatarUrl?: string | null;
    /** Username for generating initials fallback */
    username: string;
    /** Size of the avatar in pixels */
    size?: number;
    /** Whether clicking opens a preview */
    clickable?: boolean;
}

/**
 * Generate initials from a username
 * Examples: "John Doe" -> "JD", "alice" -> "AL", "bob smith jones" -> "BJ"
 */
function getInitials(username: string): string {
    if (!username) return '?';

    const cleaned = username.trim();
    const parts = cleaned.split(/[\s._-]+/).filter(Boolean);

    if (parts.length >= 2) {
        // Multiple parts: use first letter of first and last
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (cleaned.length >= 2) {
        // Single word: use first two letters
        return cleaned.substring(0, 2).toUpperCase();
    } else {
        // Single character
        return cleaned.toUpperCase();
    }
}

/**
 * Generate a consistent color based on the username
 */
function getAvatarColor(username: string): string {
    const colors = [
        '#3b82f6', // blue
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#f97316', // orange
        '#10b981', // emerald
        '#06b6d4', // cyan
        '#6366f1', // indigo
        '#f59e0b', // amber
    ];

    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
}

/**
 * Avatar Preview Modal
 */
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
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                cursor: 'pointer',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {avatarUrl ? (
                    <img
                        src={avatarUrl}
                        alt={`${username}'s avatar`}
                        style={{
                            width: '200px',
                            height: '200px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '4px solid rgba(255, 255, 255, 0.2)',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                        }}
                    />
                ) : (
                    <div
                        style={{
                            width: '200px',
                            height: '200px',
                            borderRadius: '50%',
                            background: bgColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '72px',
                            fontWeight: '600',
                            color: '#ffffff',
                            border: '4px solid rgba(255, 255, 255, 0.2)',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                        }}
                    >
                        {initials}
                    </div>
                )}
                <div
                    style={{
                        color: '#ffffff',
                        fontSize: '18px',
                        fontWeight: '500',
                    }}
                >
                    {username}
                </div>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '-40px',
                        right: '-40px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#ffffff',
                        fontSize: '20px',
                        transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                >
                    ×
                </button>
            </div>
        </div>
    );
}

/**
 * PersonAvatar component
 */
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
        if (clickable) {
            setShowPreview(true);
        }
    };

    const avatarStyle: React.CSSProperties = {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        flexShrink: 0,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'transform 0.2s, box-shadow 0.2s',
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement | HTMLImageElement>) => {
        if (clickable) {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        }
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement | HTMLImageElement>) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = 'none';
    };

    return (
        <>
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt={`${username}'s avatar`}
                    style={{
                        ...avatarStyle,
                        objectFit: 'cover',
                        border: '2px solid rgba(255, 255, 255, 0.1)',
                    }}
                    onClick={handleClick}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                />
            ) : (
                <div
                    style={{
                        ...avatarStyle,
                        background: bgColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: `${size * 0.4}px`,
                        fontWeight: '600',
                        color: '#ffffff',
                        border: '2px solid rgba(255, 255, 255, 0.1)',
                    }}
                    onClick={handleClick}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    {initials}
                </div>
            )}

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
