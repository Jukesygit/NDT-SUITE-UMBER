/**
 * SessionRestoredBanner - slim, dismissible "not you?" banner.
 *
 * Shown only when the current session was silently restored from persistence at
 * app boot (H3), never after an explicit sign-in. It is a mistake-catcher for
 * shared machines: near-zero friction, never blocks interaction (banner, not
 * modal). Dismissal is remembered per-tab via sessionStorage.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const DISMISSED_KEY = 'sessionRestoredBannerDismissed';

export function SessionRestoredBanner() {
    const { sessionWasRestored, user, logout } = useAuth();
    const navigate = useNavigate();
    const [dismissed, setDismissed] = useState(
        () => sessionStorage.getItem(DISMISSED_KEY) === '1',
    );

    if (!sessionWasRestored || dismissed || !user) return null;

    const name = user.username || user.email || 'your account';

    const handleSignOut = () => {
        // Navigate immediately for instant feedback, then clean up in the
        // background via the shared logout path (stops session manager + clears
        // the React Query cache).
        navigate('/login', { replace: true });
        void logout();
    };

    const handleDismiss = () => {
        try {
            sessionStorage.setItem(DISMISSED_KEY, '1');
        } catch {
            /* storage unavailable — dismiss for this render only */
        }
        setDismissed(true);
    };

    return (
        <div
            className="glass-panel flex items-center gap-3 text-sm mx-4 mt-3 px-4 py-2"
            role="status"
        >
            <svg
                className="btn__icon text-tertiary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
            </svg>
            <span className="flex-1 text-secondary">
                Signed in as <span className="text-primary font-medium">{name}</span> — Not you?
            </span>
            <button className="btn btn--ghost btn--sm" onClick={handleSignOut}>
                Sign out
            </button>
            <button
                className="btn btn--ghost btn--sm"
                onClick={handleDismiss}
                title="Dismiss"
                aria-label="Dismiss"
            >
                <svg className="btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

export default SessionRestoredBanner;
