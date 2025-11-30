/**
 * AnnouncementBanner - Global announcement display component
 *
 * Displays system announcements below the header for all authenticated users.
 * Supports different announcement types (info, warning, success, error) with
 * corresponding colors. Dismissible per-session (stored in sessionStorage).
 */

import { useState, useEffect } from 'react';
import { useAnnouncement } from '../hooks/queries/useAnnouncement';

// Icons for different announcement types
const typeIcons = {
  info: (
    <svg style={{ width: '20px', height: '20px' }} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg style={{ width: '20px', height: '20px' }} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  success: (
    <svg style={{ width: '20px', height: '20px' }} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg style={{ width: '20px', height: '20px' }} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
};

// Styles for different announcement types - more vibrant and distinct
const typeStyles = {
  info: {
    background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.1) 100%)',
    borderLeft: '#3b82f6',
    text: '#93c5fd',
    icon: '#60a5fa',
    label: 'ANNOUNCEMENT',
  },
  warning: {
    background: 'linear-gradient(90deg, rgba(251, 191, 36, 0.25) 0%, rgba(251, 191, 36, 0.1) 100%)',
    borderLeft: '#f59e0b',
    text: '#fde047',
    icon: '#fbbf24',
    label: 'WARNING',
  },
  success: {
    background: 'linear-gradient(90deg, rgba(34, 197, 94, 0.25) 0%, rgba(34, 197, 94, 0.1) 100%)',
    borderLeft: '#22c55e',
    text: '#86efac',
    icon: '#22c55e',
    label: 'NOTICE',
  },
  error: {
    background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.25) 0%, rgba(239, 68, 68, 0.1) 100%)',
    borderLeft: '#ef4444',
    text: '#fca5a5',
    icon: '#ef4444',
    label: 'ALERT',
  },
};

export function AnnouncementBanner() {
  const { data: announcement, isLoading } = useAnnouncement();
  const [isDismissed, setIsDismissed] = useState(false);

  // Check sessionStorage for dismissed state on mount
  useEffect(() => {
    if (announcement?.id) {
      const dismissedId = sessionStorage.getItem('dismissedAnnouncementId');
      setIsDismissed(dismissedId === announcement.id);
    }
  }, [announcement?.id]);

  // Don't render if loading, no announcement, not active, or dismissed
  if (isLoading || !announcement || !announcement.is_active || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    sessionStorage.setItem('dismissedAnnouncementId', announcement.id);
    setIsDismissed(true);
  };

  const styles = typeStyles[announcement.type] || typeStyles.info;

  return (
    <div
      style={{
        background: styles.background,
        borderLeft: `4px solid ${styles.borderLeft}`,
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '12px 20px',
        position: 'relative',
      }}
    >
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {/* Icon */}
        <div
          style={{
            color: styles.icon,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: `${styles.borderLeft}20`,
          }}
        >
          {typeIcons[announcement.type]}
        </div>

        {/* Label badge */}
        <div
          style={{
            padding: '2px 8px',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            color: styles.borderLeft,
            background: `${styles.borderLeft}25`,
            borderRadius: '4px',
            flexShrink: 0,
          }}
        >
          {styles.label}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {announcement.title && (
            <span
              style={{
                fontWeight: 600,
                fontSize: '14px',
                color: '#fff',
                marginRight: '8px',
              }}
            >
              {announcement.title}:
            </span>
          )}
          <span
            style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.9)',
            }}
          >
            {announcement.message}
          </span>
        </div>

        {/* Dismiss button - always visible */}
        <button
          onClick={handleDismiss}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: 'rgba(255, 255, 255, 0.7)',
            cursor: 'pointer',
            padding: '6px 12px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            flexShrink: 0,
            transition: 'all 0.2s',
            fontSize: '12px',
            fontWeight: 500,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          }}
          title="Dismiss announcement"
        >
          <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default AnnouncementBanner;
