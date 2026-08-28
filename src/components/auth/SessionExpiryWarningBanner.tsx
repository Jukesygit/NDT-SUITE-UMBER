/**
 * SessionExpiryWarningBanner - slim, dismissible "save your work" warning.
 *
 * The server time-boxes sessions (Supabase Auth setting); when it expires the
 * user is signed out mid-task, which for a field engineer can mean losing
 * unsaved vessel or scan work. This banner is the warning shot: it appears
 * `SESSION_TIMEBOX.warningMinutes` before the client's estimate of that
 * deadline and never blocks interaction (banner, not modal), matching the
 * SessionRestoredBanner pattern above it.
 *
 * DELIBERATELY VAGUE. The server enforces the time-box at the next token
 * refresh, so the true cut-off is later than the nominal one by up to an
 * access-token TTL. The copy therefore says "soon" and shows no countdown — a
 * countdown would be a precision the server does not offer.
 *
 * Dismissal is remembered per session (keyed by the session's start time), so
 * dismissing at hour 11.5 keeps it gone for the rest of that session but a
 * fresh sign-in in the same tab starts clean.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { sessionTimeboxStatus } from '../../lib/session-timebox';

const DISMISSED_KEY = 'sessionExpiryWarningDismissedFor';

/**
 * How often the deadline is re-checked. One minute is far finer than needed for
 * a 30-minute warning window and costs one localStorage read; `visibilitychange`
 * covers the case where the tab was backgrounded and its timers throttled.
 */
const CHECK_INTERVAL_MS = 60 * 1000;

function readDismissedFor(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null; // storage unavailable — banner stays dismissible per render
  }
}

export function SessionExpiryWarningBanner() {
  const { user } = useAuth();
  const [shouldWarn, setShouldWarn] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(readDismissedFor);

  // Primitive state + React's bail-out means the once-a-minute check only
  // re-renders on the tick where the answer actually changes.
  const check = useCallback(() => {
    const status = sessionTimeboxStatus();
    setShouldWarn(status.shouldWarn);
    setStartedAt(status.startedAt);
  }, []);

  useEffect(() => {
    if (!user) {
      setShouldWarn(false);
      return;
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, check]);

  const isDismissed = startedAt !== null && dismissedFor === String(startedAt);
  if (!user || !shouldWarn || isDismissed) return null;

  const handleDismiss = () => {
    const key = String(startedAt);
    try {
      sessionStorage.setItem(DISMISSED_KEY, key);
    } catch {
      /* storage unavailable — dismiss for this mount only */
    }
    setDismissedFor(key);
  };

  return (
    <div className="alert alert--warning flex items-center gap-3 text-sm mx-4 mt-3" role="status">
      <svg
        className="btn__icon"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="flex-1">
        Your session will expire soon. Save your work — you&apos;ll be asked to sign in again.
      </span>
      <button
        className="btn btn--ghost btn--sm"
        onClick={handleDismiss}
        title="Dismiss"
        aria-label="Dismiss"
      >
        <svg className="btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

export default SessionExpiryWarningBanner;
