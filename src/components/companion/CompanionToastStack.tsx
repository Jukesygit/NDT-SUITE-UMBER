/**
 * CompanionToastStack
 *
 * Fixed top-right toast stack for companion notifications.
 * Rendered by CompanionNotificationProvider; reads from context directly
 * so it never needs to be placed in the component tree by consumers.
 *
 * UX rules:
 *  - 'error' and 'critical' are persistent (user must dismiss)
 *  - 'info' and 'warning' auto-dismiss after 8 s
 *  - Max 1 action button per toast
 *  - Full ARIA live-region support (assertive for error/critical, polite for others)
 */

import { useEffect, useRef } from 'react';
import { useCompanionNotificationContext } from '../../contexts/CompanionNotificationContext';
import type { CompanionNotification } from '../../contexts/CompanionNotificationContext';
import type { CompanionErrorSeverity } from '../../types/companion';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_DISMISS_MS = 8_000;

// ---------------------------------------------------------------------------
// Severity → visual config
// ---------------------------------------------------------------------------

interface SeverityStyle {
  borderColor: string;
  iconColor: string;
  labelColor: string;
  badgeClass: string;
  icon: string;
}

const SEVERITY_STYLES: Record<CompanionErrorSeverity, SeverityStyle> = {
  info: {
    borderColor: 'var(--accent-primary)',
    iconColor: 'var(--accent-blue-bright)',
    labelColor: 'var(--accent-blue-bright)',
    badgeClass: 'badge badge--primary',
    icon: 'ℹ',
  },
  warning: {
    borderColor: '#f59e0b',
    iconColor: '#fbbf24',
    labelColor: '#fbbf24',
    badgeClass: 'badge badge--warning',
    icon: '⚠',
  },
  error: {
    borderColor: '#ef4444',
    iconColor: '#f87171',
    labelColor: '#f87171',
    badgeClass: 'badge badge--danger',
    icon: '✕',
  },
  critical: {
    borderColor: '#dc2626',
    iconColor: '#fca5a5',
    labelColor: '#fca5a5',
    badgeClass: 'badge badge--danger',
    icon: '!!',
  },
};

// ---------------------------------------------------------------------------
// Single toast
// ---------------------------------------------------------------------------

interface ToastItemProps {
  notification: CompanionNotification;
  onDismiss: (id: string) => void;
}

function ToastItem({ notification, onDismiss }: ToastItemProps) {
  const { id, title, message, severity, recovery, actionLabel, onAction } = notification;
  const style = SEVERITY_STYLES[severity];
  const autoDismiss = severity === 'info' || severity === 'warning';
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!autoDismiss) return;
    dismissTimerRef.current = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS);
    return () => {
      if (dismissTimerRef.current !== null) clearTimeout(dismissTimerRef.current);
    };
  }, [id, autoDismiss, onDismiss]);

  const recoveryLabel: string =
    actionLabel ??
    (recovery === 'retry' ? 'Retry'
      : recovery === 'refresh-index' ? 'Refresh'
      : recovery === 'restart-companion' ? 'How to restart'
      : recovery === 'report' ? 'Report issue'
      : '');

  const hasAction = !!recovery && recovery !== null;

  return (
    <div
      role="alert"
      aria-live={severity === 'error' || severity === 'critical' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className="glass-card"
      style={{
        borderLeft: `3px solid ${style.borderColor}`,
        padding: 'var(--spacing-md)',
        minWidth: 280,
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-sm)',
        fontSize: 15,
        position: 'relative',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
        <span
          aria-hidden="true"
          style={{
            color: style.iconColor,
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
            width: 18,
            textAlign: 'center',
          }}
        >
          {style.icon}
        </span>
        <span
          style={{
            color: 'var(--text-primary)',
            fontWeight: 'var(--font-semibold)' as never,
            fontSize: 15,
            flex: 1,
          }}
        >
          {title}
        </span>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(id)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            padding: '2px 4px',
            lineHeight: 1,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Message */}
      <p
        style={{
          margin: 0,
          color: 'var(--text-secondary)',
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>

      {/* Action button — at most 1 */}
      {hasAction && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          style={{ alignSelf: 'flex-start', fontSize: 13 }}
          onClick={() => {
            onAction?.();
            if (recovery !== 'restart-companion') onDismiss(id);
          }}
        >
          {recoveryLabel}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------

export function CompanionToastStack() {
  const ctx = useCompanionNotificationContext();
  if (!ctx || ctx.notifications.length === 0) return null;

  return (
    <div
      aria-label="Companion notifications"
      style={{
        position: 'fixed',
        top: 'calc(var(--header-height, 4rem) + 12px)',
        right: 16,
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-sm)',
        pointerEvents: 'none',
      }}
    >
      {ctx.notifications.map((n) => (
        <div key={n.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem notification={n} onDismiss={ctx.dismiss} />
        </div>
      ))}
    </div>
  );
}
