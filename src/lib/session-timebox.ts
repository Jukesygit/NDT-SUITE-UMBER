/**
 * Session time-box - the CLIENT half of the server's 12-hour session cap.
 *
 * Supabase Auth time-boxes sessions server-side; the client cannot read that
 * deadline, so it approximates it from the moment the session started. That
 * start time must survive reloads - a field engineer refreshing the page at
 * hour 11 must not reset the clock - so it lives in localStorage beside the
 * Supabase auth key ('ndt-suite-auth').
 *
 * Enforcement happens at the next TOKEN REFRESH, so the real cut-off is
 * ~timebox + access-token TTL. Everything here is deliberately approximate: it
 * drives a "save your work" nudge and an honest message on the login page, not
 * a countdown.
 *
 * Kept separate from session-manager.ts on purpose: that module keeps a session
 * alive (refresh mutex, backoff, events) and pulls in auth-manager/supabase;
 * this one is pure storage + arithmetic, so the banner and the login page can
 * use it without dragging the auth stack behind them.
 */

import { SESSION_TIMEBOX } from '../config/security';

/** localStorage key holding the epoch-ms start of the current session. */
export const SESSION_START_KEY = 'ndt-suite-session-started-at';

/** sessionStorage key set when a session ended WITHOUT the user asking. */
export const SESSION_END_REASON_KEY = 'ndt-suite-session-end-reason';

/** The single reason string shared by the redirect URL and the login page. */
export const SESSION_EXPIRED_REASON = 'session-expired';

/** The one copy of the expiry message the user sees on /login. */
export const SESSION_EXPIRED_NOTICE = 'Your session has expired — please sign in again.';

export interface SessionTimeboxStatus {
  /** Epoch ms the session started, or null when nothing is tracked. */
  startedAt: number | null;
  /** Epoch ms the server is expected to stop refreshing this session. */
  expiresAt: number | null;
  /** Epoch ms from which the pre-expiry warning should show. */
  warnFrom: number | null;
  /** True once `now` has reached `warnFrom` (stays true past expiry). */
  shouldWarn: boolean;
}

/** Read the tracked session start. Returns null if absent/corrupt/unusable. */
export function readSessionStart(): number | null {
  try {
    const raw = localStorage.getItem(SESSION_START_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  } catch {
    return null; // storage unavailable (private mode, quota, SSR)
  }
}

/**
 * Record `now` as the start of a brand-new session (overwrites any previous).
 *
 * Also retires the "your last session expired" marker: a new session is exactly
 * the moment that explanation stops being current, and clearing it here means
 * the login page never has to (which would race React StrictMode's double mount).
 */
export function markSessionStart(now: number = Date.now()): number {
  try {
    localStorage.setItem(SESSION_START_KEY, String(now));
  } catch {
    /* storage unavailable — the warning simply won't fire */
  }
  clearSessionEndedReason();
  return now;
}

/**
 * Ensure a start time exists for an already-running session.
 *
 * Called at app boot when a session was restored from persistence but no start
 * was recorded (first load after this feature shipped, cleared storage, another
 * tab). Recording `now` is the CONSERVATIVE choice: it can only push the
 * warning later, never make it fire spuriously on a session that just began.
 */
export function ensureSessionStart(now: number = Date.now()): number {
  const existing = readSessionStart();
  if (existing !== null) return existing;
  return markSessionStart(now);
}

/** Forget the tracked start — deliberate sign-out or forced expiry. */
export function clearSessionStart(): void {
  try {
    localStorage.removeItem(SESSION_START_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Where the session stands against the client's copy of the server time-box.
 *
 * `shouldWarn` deliberately stays true after the nominal expiry: enforcement is
 * at the next refresh, so past the deadline the user is on borrowed time and
 * the nudge is more relevant, not less.
 */
export function sessionTimeboxStatus(now: number = Date.now()): SessionTimeboxStatus {
  const startedAt = readSessionStart();
  if (!SESSION_TIMEBOX.enabled || startedAt === null) {
    return { startedAt, expiresAt: null, warnFrom: null, shouldWarn: false };
  }

  // A start in the future means the clock moved (or another tab wrote a newer
  // value); clamp so we never warn early off a bogus timestamp.
  const effectiveStart = Math.min(startedAt, now);
  const expiresAt = effectiveStart + SESSION_TIMEBOX.hours * 60 * 60 * 1000;
  const warnFrom = expiresAt - SESSION_TIMEBOX.warningMinutes * 60 * 1000;

  return { startedAt, expiresAt, warnFrom, shouldWarn: now >= warnFrom };
}

// ── Forced-expiry hand-off to the login page ───────────────────────────────

/**
 * Record that this session ended on its own, without the user asking.
 *
 * The reason reaches the login page by TWO carriers, deliberately. The query
 * string that `redirectToExpiredLogin` appends is the primary one; this storage
 * marker is the fallback for when that hard navigation never happens — a dirty
 * scan viewer's `beforeunload` prompt can cancel it, leaving ProtectedRoute's
 * in-router redirect to land the user on a bare /login. Either way they are
 * told why they are looking at a login form.
 */
export function markSessionEndedByExpiry(): void {
  try {
    sessionStorage.setItem(SESSION_END_REASON_KEY, SESSION_EXPIRED_REASON);
  } catch {
    /* storage unavailable — the query string still carries the reason */
  }
}

/** True when this page load / URL was reached because the session expired. */
export function hasSessionExpiredReason(search: string = ''): boolean {
  try {
    if (new URLSearchParams(search).get('reason') === SESSION_EXPIRED_REASON) return true;
  } catch {
    /* malformed search string — fall through to the storage marker */
  }
  try {
    return sessionStorage.getItem(SESSION_END_REASON_KEY) === SESSION_EXPIRED_REASON;
  } catch {
    return false;
  }
}

/** Clear the marker so a later manual visit to /login is not mislabelled. */
export function clearSessionEndedReason(): void {
  try {
    sessionStorage.removeItem(SESSION_END_REASON_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Send an expired session to the login page.
 *
 * A full document navigation, not a router push: the session is already dead,
 * every in-flight query is about to 401, and a fresh load is the one thing that
 * cannot leave a half-rendered app behind. Never fires on /login (already
 * there) or on the loginless share page (no session to lose).
 */
export function redirectToExpiredLogin(): void {
  if (typeof window === 'undefined') return;
  const { pathname } = window.location;
  if (pathname === '/login' || pathname.startsWith('/share/')) return;
  window.location.replace(`/login?reason=${SESSION_EXPIRED_REASON}`);
}
