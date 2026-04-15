/**
 * Tests for the login flow including 2FA.
 *
 * Covers: loginSupabase, AuthManager.login, AuthManager.complete2FALogin,
 * and the SIGNED_IN event handler in initializeSupabase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.mock factories are hoisted — no top-level variable refs) ─────

vi.mock('../../supabase-client', () => {
    const sb = {
        auth: {
            signInWithPassword: vi.fn(),
            signOut: vi.fn().mockResolvedValue({}),
            mfa: { listFactors: vi.fn() },
            getSession: vi.fn(),
            onAuthStateChange: vi.fn().mockReturnValue({
                data: { subscription: { unsubscribe: vi.fn() } },
            }),
        },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
                }),
            }),
        }),
    };
    return {
        default: sb,
        isSupabaseConfigured: () => true,
        getSupabase: () => sb,
    };
});

vi.mock('../../services/activity-log-service.ts', () => ({
    logActivity: vi.fn(),
}));

vi.mock('../../config/security.js', () => ({
    loginRateLimiter: {
        isAllowed: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }),
        reset: vi.fn(),
        cleanup: vi.fn(),
    },
}));

// ── Imports (after vi.mock) ────────────────────────────────────────────────

import supabaseMod from '../../supabase-client';
import { loginSupabase, initializeSupabase } from '../auth-supabase';
import authManager from '../auth-manager';

// Grab the mock supabase instance — same object returned by the factory
const sb = supabaseMod as any;

// Stub window.dispatchEvent
const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'editor',
        organizationId: 'org-1',
        isActive: true,
        ...overrides,
    };
}

function makeProfile(overrides: Record<string, unknown> = {}) {
    return {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'editor',
        organization_id: 'org-1',
        is_active: true,
        avatar_url: null,
        ...overrides,
    };
}

/** Wire up the supabase `from('profiles')` mock so loadUserProfile succeeds. */
function stubProfileLookup(profile = makeProfile()) {
    sb.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: profile, error: null }),
            }),
        }),
    });
}

/** Build a simple rate-limiter stub. */
function makeRateLimiter(allowed = true, retryAfter = 0) {
    return {
        isAllowed: vi.fn().mockReturnValue({ allowed, retryAfter }),
        reset: vi.fn(),
    };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('loginSupabase', () => {
    const email = 'test@example.com';
    const password = 'Secret123!';
    let rateLimiter: ReturnType<typeof makeRateLimiter>;

    beforeEach(() => {
        vi.clearAllMocks();
        dispatchEventSpy.mockClear();
        authManager.currentUser = null;
        authManager.currentProfile = null;
        rateLimiter = makeRateLimiter();
    });

    // 1. Successful login without 2FA
    it('should dispatch userLoggedIn and return { success: true } when no TOTP factors', async () => {
        stubProfileLookup();
        sb.auth.signInWithPassword.mockResolvedValue({
            data: { user: { id: 'user-1' } },
            error: null,
        });
        sb.auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] } });

        const result = await loginSupabase.call(authManager, email, password, rateLimiter);

        expect(result.success).toBe(true);
        expect(result.requires2FA).toBeUndefined();
        expect(rateLimiter.reset).toHaveBeenCalledWith(email.toLowerCase());

        // userLoggedIn event should have been dispatched
        const loginEvent = dispatchEventSpy.mock.calls.find(
            ([e]) => (e as CustomEvent).type === 'userLoggedIn',
        );
        expect(loginEvent).toBeTruthy();
        expect((loginEvent![0] as CustomEvent).detail.user).toMatchObject({ id: 'user-1' });
    });

    // 2. Login with 2FA required
    it('should return { requires2FA: true } and NOT dispatch userLoggedIn when TOTP factor is verified', async () => {
        stubProfileLookup();
        sb.auth.signInWithPassword.mockResolvedValue({
            data: { user: { id: 'user-1' } },
            error: null,
        });
        sb.auth.mfa.listFactors.mockResolvedValue({
            data: { totp: [{ id: 'f1', status: 'verified' }] },
        });

        const result = await loginSupabase.call(authManager, email, password, rateLimiter);

        expect(result.success).toBe(true);
        expect(result.requires2FA).toBe(true);
        expect(result.user).toMatchObject({ id: 'user-1' });

        // userLoggedIn must NOT be dispatched — 2FA is still pending
        const loginEvent = dispatchEventSpy.mock.calls.find(
            ([e]) => (e as CustomEvent).type === 'userLoggedIn',
        );
        expect(loginEvent).toBeUndefined();
    });

    // 3. Invalid credentials
    it('should return { success: false, error } on invalid credentials', async () => {
        sb.auth.signInWithPassword.mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid login credentials' },
        });

        const result = await loginSupabase.call(authManager, email, password, rateLimiter);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid email or password');
    });

    // 4. Inactive user — should sign out and return error
    it('should sign out and return error when user is inactive', async () => {
        stubProfileLookup(makeProfile({ is_active: false }));
        sb.auth.signInWithPassword.mockResolvedValue({
            data: { user: { id: 'user-1' } },
            error: null,
        });

        const result = await loginSupabase.call(authManager, email, password, rateLimiter);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid email or password');
        expect(sb.auth.signOut).toHaveBeenCalled();
    });

    // Network / fetch error
    it('should return connection error when signInWithPassword throws', async () => {
        sb.auth.signInWithPassword.mockRejectedValue(new Error('Failed to fetch'));

        const result = await loginSupabase.call(authManager, email, password, rateLimiter);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/unable to connect/i);
    });
});

// 5. Rate-limited login
describe('AuthManager.login — rate limiting', () => {
    const email = 'test@example.com';
    const password = 'Secret123!';

    beforeEach(async () => {
        vi.clearAllMocks();
        dispatchEventSpy.mockClear();
        authManager.currentUser = null;
        authManager.currentProfile = null;
        authManager.initPromise = Promise.resolve();
        authManager.useSupabase = true;
    });

    it('should return rateLimited: true when rate limiter blocks the attempt', async () => {
        // Override the mocked loginRateLimiter.isAllowed for this test
        const { loginRateLimiter } = await import('../../config/security.js') as any;
        loginRateLimiter.isAllowed.mockReturnValueOnce({ allowed: false, retryAfter: 120000 });

        const result = await authManager.login(email, password);

        expect(result.success).toBe(false);
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfter).toBe(120000);
        expect(result.error).toMatch(/too many login attempts/i);

        // signInWithPassword should never have been called
        expect(sb.auth.signInWithPassword).not.toHaveBeenCalled();
    });
});

// 6. complete2FALogin
describe('AuthManager.complete2FALogin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dispatchEventSpy.mockClear();
    });

    it('should dispatch userLoggedIn with the current user', () => {
        const user = makeUser();
        authManager.currentUser = user as any;

        authManager.complete2FALogin();

        const loginEvent = dispatchEventSpy.mock.calls.find(
            ([e]) => (e as CustomEvent).type === 'userLoggedIn',
        );
        expect(loginEvent).toBeTruthy();
        expect((loginEvent![0] as CustomEvent).detail.user).toEqual(user);
    });
});

// 7. SIGNED_IN event handler
describe('SIGNED_IN event handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dispatchEventSpy.mockClear();
        authManager.currentUser = null;
        authManager.currentProfile = null;
    });

    it('should NOT dispatch userLoggedIn when SIGNED_IN fires (defers to loginSupabase)', async () => {
        // Capture the callback registered via onAuthStateChange
        let authChangeCallback: (event: string, session: any) => Promise<void>;
        sb.auth.onAuthStateChange.mockImplementation((cb: any) => {
            authChangeCallback = cb;
            return { data: { subscription: { unsubscribe: vi.fn() } } };
        });
        sb.auth.getSession.mockResolvedValue({ data: { session: null } });

        // initializeSupabase registers the listener
        await initializeSupabase.call(authManager);

        // Simulate Supabase firing a SIGNED_IN event
        await authChangeCallback!('SIGNED_IN', { user: { id: 'user-1' } });

        // userLoggedIn should NOT have been dispatched — loginSupabase handles it
        const loginEvent = dispatchEventSpy.mock.calls.find(
            ([e]) => (e as CustomEvent).type === 'userLoggedIn',
        );
        expect(loginEvent).toBeUndefined();
    });
});
