/**
 * PersonAvatar - Avatar display component with initials fallback
 * Shows user avatar or initials, clickable to preview larger version
 *
 * `avatarUrl` is already-resolved and displayable (see
 * hooks/queries/useAvatarUrls) — this component never touches storage. It does
 * own the LAST line of defence: a URL that resolves and then fails to load
 * (expired signature, deleted object, a legacy public URL after the bucket flip)
 * falls back to initials rather than leaving a broken-image icon in the row.
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
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#f97316',
    '#10b981',
    '#06b6d4',
    '#6366f1',
    '#f59e0b',
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
  onImageError,
}: {
  isOpen: boolean;
  onClose: () => void;
  avatarUrl?: string | null;
  username: string;
  onImageError?: () => void;
}) {
  if (!isOpen) return null;

  const initials = getInitials(username);
  const bgColor = getAvatarColor(username);

  return (
    <div className="pm-avatar-preview-overlay" onClick={onClose}>
      <div className="pm-avatar-preview" onClick={(e) => e.stopPropagation()}>
        {avatarUrl ? (
          <div className="pm-avatar-preview-circle">
            <img src={avatarUrl} alt={`${username}'s avatar`} onError={onImageError} />
          </div>
        ) : (
          <div className="pm-avatar-preview-circle" style={{ background: bgColor }}>
            <span className="pm-avatar-initials" style={{ fontSize: '72px' }}>
              {initials}
            </span>
          </div>
        )}
        <div className="pm-avatar-preview-name">{username}</div>
        <button
          className="pm-modal-close"
          onClick={onClose}
          style={{ position: 'absolute', top: '-40px', right: '-40px' }}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
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
  // Tracked as the failing URL rather than a boolean, so a re-signed URL gets a
  // fresh attempt without an effect to clear the flag.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const displayUrl = avatarUrl && avatarUrl !== failedUrl ? avatarUrl : null;
  const handleImageError = () => setFailedUrl(avatarUrl ?? null);

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
        {displayUrl ? (
          <div className="pm-avatar-circle" style={sizeStyle}>
            <img src={displayUrl} alt={`${username}'s avatar`} onError={handleImageError} />
          </div>
        ) : (
          <div className="pm-avatar-circle" style={{ ...sizeStyle, background: bgColor }}>
            <span className="pm-avatar-initials" style={{ fontSize: `${size * 0.4}px` }}>
              {initials}
            </span>
          </div>
        )}
      </div>

      <AvatarPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        avatarUrl={displayUrl}
        username={username}
        onImageError={handleImageError}
      />
    </>
  );
}

export default PersonAvatar;
