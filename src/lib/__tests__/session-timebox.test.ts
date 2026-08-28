/**
 * Tests for the session time-box helpers - the client's approximation of the
 * server's 12-hour session cap.
 *
 * Storage round-trips matter here (a start time must survive a reload), so the
 * suite installs real in-memory storage over setup.js's no-op mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMemoryStorage } from '../../test/helpers/memory-storage';

const HOUR_MS = 60 * 60 * 1000;

describe('session time-box tracking', () => {
  useMemoryStorage(); // setup.js's no-op storage mocks can't round-trip

  beforeEach(() => {
    vi.resetModules();
  });

  async function timebox() {
    return import('../session-timebox');
  }

  it('records a session start and reads it back', async () => {
    const { markSessionStart, readSessionStart, SESSION_START_KEY } = await timebox();

    markSessionStart(1_700_000_000_000);

    expect(readSessionStart()).toBe(1_700_000_000_000);
    expect(localStorage.getItem(SESSION_START_KEY)).toBe('1700000000000');
  });

  it('survives a reload: ensureSessionStart keeps an already-recorded start', async () => {
    const { markSessionStart, ensureSessionStart } = await timebox();
    const original = Date.now() - 5 * HOUR_MS;

    markSessionStart(original);
    const kept = ensureSessionStart(Date.now());

    expect(kept).toBe(original);
  });

  it('records now when a restored session has no recorded start (conservative)', async () => {
    const { ensureSessionStart, readSessionStart } = await timebox();

    const now = Date.now();
    const recorded = ensureSessionStart(now);

    expect(recorded).toBe(now);
    expect(readSessionStart()).toBe(now);
  });

  it('resets tracking on sign-out', async () => {
    const { markSessionStart, clearSessionStart, readSessionStart } = await timebox();

    markSessionStart();
    clearSessionStart();

    expect(readSessionStart()).toBeNull();
  });

  it('starts a new clock on the next sign-in', async () => {
    const { markSessionStart, readSessionStart } = await timebox();

    markSessionStart(1_000);
    markSessionStart(2_000);

    expect(readSessionStart()).toBe(2_000);
  });

  it('ignores a corrupt stored value instead of trusting it', async () => {
    const { readSessionStart, SESSION_START_KEY } = await timebox();

    for (const bogus of ['', 'yesterday', '0', '-1', 'NaN']) {
      localStorage.setItem(SESSION_START_KEY, bogus);
      expect(readSessionStart()).toBeNull();
    }
  });

  describe('sessionTimeboxStatus', () => {
    it('does not warn when no session is tracked', async () => {
      const { sessionTimeboxStatus } = await timebox();

      const status = sessionTimeboxStatus();

      expect(status.startedAt).toBeNull();
      expect(status.shouldWarn).toBe(false);
    });

    it('does not warn early in a session', async () => {
      const { markSessionStart, sessionTimeboxStatus } = await timebox();
      const now = Date.now();

      markSessionStart(now - HOUR_MS);

      expect(sessionTimeboxStatus(now).shouldWarn).toBe(false);
    });

    it('does not warn one minute before the warning window opens', async () => {
      const { markSessionStart, sessionTimeboxStatus } = await timebox();
      const now = Date.now();

      // 11h29m in: warning opens at 11h30m (12h box − 30m).
      markSessionStart(now - (11 * HOUR_MS + 29 * 60 * 1000));

      expect(sessionTimeboxStatus(now).shouldWarn).toBe(false);
    });

    it('warns inside the 30-minute window before the box closes', async () => {
      const { markSessionStart, sessionTimeboxStatus } = await timebox();
      const now = Date.now();

      markSessionStart(now - (11 * HOUR_MS + 31 * 60 * 1000));

      const status = sessionTimeboxStatus(now);
      expect(status.shouldWarn).toBe(true);
      expect(status.expiresAt).toBe(status.startedAt! + 12 * HOUR_MS);
      expect(status.warnFrom).toBe(status.expiresAt! - 30 * 60 * 1000);
    });

    it('keeps warning past the nominal expiry (the server cuts off at the next refresh)', async () => {
      const { markSessionStart, sessionTimeboxStatus } = await timebox();
      const now = Date.now();

      markSessionStart(now - 13 * HOUR_MS);

      expect(sessionTimeboxStatus(now).shouldWarn).toBe(true);
    });

    it('does not warn off a start timestamp from the future (clock skew)', async () => {
      const { markSessionStart, sessionTimeboxStatus } = await timebox();
      const now = Date.now();

      markSessionStart(now + 4 * HOUR_MS);

      expect(sessionTimeboxStatus(now).shouldWarn).toBe(false);
    });
  });
});

describe('forced-expiry reason hand-off', () => {
  useMemoryStorage();

  beforeEach(() => {
    vi.resetModules();
  });

  async function timebox() {
    return import('../session-timebox');
  }

  it('reads the reason from the redirect query string', async () => {
    const { hasSessionExpiredReason } = await timebox();

    expect(hasSessionExpiredReason('?reason=session-expired')).toBe(true);
  });

  it('falls back to the storage marker when the query string is bare', async () => {
    const { markSessionEndedByExpiry, hasSessionExpiredReason } = await timebox();

    markSessionEndedByExpiry();

    expect(hasSessionExpiredReason('')).toBe(true);
  });

  it('reports nothing for a deliberate sign-out', async () => {
    const { hasSessionExpiredReason } = await timebox();

    expect(hasSessionExpiredReason('')).toBe(false);
    expect(hasSessionExpiredReason('?reason=logged-out')).toBe(false);
  });

  it('retires the marker on the next sign-in', async () => {
    const { markSessionEndedByExpiry, markSessionStart, hasSessionExpiredReason } = await timebox();

    markSessionEndedByExpiry();
    markSessionStart();

    expect(hasSessionExpiredReason('')).toBe(false);
  });

  it('can be cleared explicitly', async () => {
    const { markSessionEndedByExpiry, clearSessionEndedReason, hasSessionExpiredReason } =
      await timebox();

    markSessionEndedByExpiry();
    clearSessionEndedReason();

    expect(hasSessionExpiredReason('')).toBe(false);
  });
});
