/**
 * Tests for SessionExpiryWarningBanner — the pre-expiry "save your work" nudge.
 *
 * Covers the threshold (silent early in a session, visible inside the warning
 * window), the sign-out case, dismissal persistence, and the two re-checks that
 * let it appear without a reload: the interval and `visibilitychange`.
 *
 * The time-box helpers are NOT mocked — they are the behaviour under test, and
 * they only touch localStorage. Only auth is stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Only auth is stubbed: session-timebox is pure storage + arithmetic, which is
// exactly why it does not live in session-manager (no supabase in this graph).
const mockUseAuth = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import { SessionExpiryWarningBanner } from './SessionExpiryWarningBanner';
import { markSessionStart, clearSessionStart } from '../../lib/session-timebox';
import { useMemoryStorage } from '../../test/helpers/memory-storage';

const HOUR_MS = 60 * 60 * 1000;
const WARNING_TEXT = /Your session will expire soon/i;

/**
 * Start a session old enough that the 30-minute warning window has opened.
 * `extraAgeMs` distinguishes one session from the next — dismissal is keyed on
 * the start timestamp, so two sessions started in the same millisecond would
 * share a dismissal.
 */
function startSessionInsideWarningWindow(extraAgeMs = 0): number {
  const startedAt = Date.now() - (11 * HOUR_MS + 31 * 60 * 1000 + extraAgeMs);
  markSessionStart(startedAt);
  return startedAt;
}

describe('SessionExpiryWarningBanner', () => {
  useMemoryStorage(); // setup.js's no-op storage mocks can't round-trip

  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1', username: 'jonas' } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays silent early in a session', () => {
    markSessionStart(Date.now() - HOUR_MS);

    render(<SessionExpiryWarningBanner />);

    expect(screen.queryByText(WARNING_TEXT)).toBeNull();
  });

  it('stays silent when no session start is tracked', () => {
    clearSessionStart();

    render(<SessionExpiryWarningBanner />);

    expect(screen.queryByText(WARNING_TEXT)).toBeNull();
  });

  it('warns once the session reaches the warning threshold', () => {
    startSessionInsideWarningWindow();

    render(<SessionExpiryWarningBanner />);

    expect(screen.getByText(WARNING_TEXT)).toBeInTheDocument();
  });

  it('says "soon" rather than promising a countdown', () => {
    startSessionInsideWarningWindow();

    render(<SessionExpiryWarningBanner />);

    expect(screen.getByText(WARNING_TEXT).textContent).toBe(
      "Your session will expire soon. Save your work — you'll be asked to sign in again."
    );
  });

  it('shows nothing to a signed-out visitor even with a stale start time', () => {
    startSessionInsideWarningWindow();
    mockUseAuth.mockReturnValue({ user: null });

    render(<SessionExpiryWarningBanner />);

    expect(screen.queryByText(WARNING_TEXT)).toBeNull();
  });

  it('hides on dismiss', async () => {
    const user = userEvent.setup();
    startSessionInsideWarningWindow();

    render(<SessionExpiryWarningBanner />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText(WARNING_TEXT)).toBeNull();
  });

  it('stays dismissed for the rest of that session', async () => {
    const user = userEvent.setup();
    startSessionInsideWarningWindow();

    const first = render(<SessionExpiryWarningBanner />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    first.unmount();

    render(<SessionExpiryWarningBanner />);

    expect(screen.queryByText(WARNING_TEXT)).toBeNull();
  });

  it('warns again for a new session after a dismissal', async () => {
    const user = userEvent.setup();
    startSessionInsideWarningWindow();

    const first = render(<SessionExpiryWarningBanner />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    first.unmount();

    // Sign out, sign back in, work another 11.5 hours (a different session).
    startSessionInsideWarningWindow(60 * 1000);
    render(<SessionExpiryWarningBanner />);

    expect(screen.getByText(WARNING_TEXT)).toBeInTheDocument();
  });

  it('appears on the polling interval without a reload', async () => {
    vi.useFakeTimers();
    markSessionStart(Date.now() - HOUR_MS);

    render(<SessionExpiryWarningBanner />);
    expect(screen.queryByText(WARNING_TEXT)).toBeNull();

    // The clock moves on (simulated by ageing the recorded start).
    startSessionInsideWarningWindow();
    await act(async () => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(screen.getByText(WARNING_TEXT)).toBeInTheDocument();
  });

  it('re-checks when a backgrounded tab becomes visible again', async () => {
    markSessionStart(Date.now() - HOUR_MS);

    render(<SessionExpiryWarningBanner />);
    expect(screen.queryByText(WARNING_TEXT)).toBeNull();

    startSessionInsideWarningWindow();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByText(WARNING_TEXT)).toBeInTheDocument();
  });
});
