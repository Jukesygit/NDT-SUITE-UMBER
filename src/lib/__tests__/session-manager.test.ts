import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth-manager before importing session-manager
const mockAuthManager = {
    refreshSession: vi.fn(),
    isLoggedIn: vi.fn(() => true),
};

vi.mock('../../auth-manager.js', () => ({
    default: mockAuthManager,
}));

// Mock window event listeners so the constructor doesn't throw
const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

// We need a fresh SessionManager for each test (the module exports a singleton).
// Import the class indirectly by re-importing the module with isolation.
async function createSessionManager() {
    // Dynamic import + resetModules gives us a fresh instance each time
    const mod = await import('../session-manager');
    return mod.sessionManager;
}

describe('SessionManager', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockAuthManager.refreshSession.mockReset();
        mockAuthManager.isLoggedIn.mockReturnValue(true);
        addEventListenerSpy.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // Because the module exports a singleton we need to reset modules between tests
    // to get a clean SessionManager instance.
    beforeEach(() => {
        vi.resetModules();
    });

    describe('initialize()', () => {
        it('should start the proactive refresh interval', async () => {
            const sm = await createSessionManager();
            const setIntervalSpy = vi.spyOn(global, 'setInterval');

            sm.initialize();

            expect(setIntervalSpy).toHaveBeenCalledTimes(1);
            // Interval should be 4 minutes (240000 ms)
            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 4 * 60 * 1000);

            sm.stop();
            setIntervalSpy.mockRestore();
        });
    });

    describe('stop()', () => {
        it('should clear the refresh interval', async () => {
            const sm = await createSessionManager();
            const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

            sm.initialize();
            sm.stop();

            expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
            clearIntervalSpy.mockRestore();
        });

        it('should allow re-initialization after stop', async () => {
            const sm = await createSessionManager();
            const setIntervalSpy = vi.spyOn(global, 'setInterval');

            sm.initialize();
            sm.stop();
            sm.initialize();

            // Should have called setInterval twice (once per initialize)
            expect(setIntervalSpy).toHaveBeenCalledTimes(2);

            sm.stop();
            setIntervalSpy.mockRestore();
        });
    });

    describe('onSessionChange', () => {
        it('should call callback on refresh events', async () => {
            const sm = await createSessionManager();
            const callback = vi.fn();
            sm.onSessionChange(callback);

            // Trigger a refresh that succeeds
            mockAuthManager.refreshSession.mockResolvedValueOnce({ user: {}, access_token: 'token' });

            await sm.coordinatedRefresh();

            // Should have received 'refreshing' and 'refreshed' events
            expect(callback).toHaveBeenCalledTimes(2);
            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'refreshing' }),
            );
            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'refreshed' }),
            );

            sm.stop();
        });

        it('should return an unsubscribe function', async () => {
            const sm = await createSessionManager();
            const callback = vi.fn();
            const unsub = sm.onSessionChange(callback);

            unsub();

            mockAuthManager.refreshSession.mockResolvedValueOnce({ user: {} });
            await sm.coordinatedRefresh();

            expect(callback).not.toHaveBeenCalled();
            sm.stop();
        });

        it('should emit error event when all refresh attempts fail', async () => {
            const sm = await createSessionManager();
            const callback = vi.fn();
            sm.onSessionChange(callback);

            mockAuthManager.refreshSession.mockResolvedValue(null);

            // Need to advance timers for backoff waits within executeRefresh
            const refreshPromise = sm.coordinatedRefresh();
            // Advance past backoff delays
            await vi.advanceTimersByTimeAsync(20000);
            await refreshPromise;

            const eventTypes = callback.mock.calls.map((c: any) => c[0].type);
            expect(eventTypes).toContain('refreshing');
            expect(eventTypes).toContain('error');

            sm.stop();
        });
    });

    describe('reportAuthError', () => {
        it('should handle auth errors gracefully and trigger coordinated refresh', async () => {
            const sm = await createSessionManager();
            mockAuthManager.refreshSession.mockResolvedValueOnce({ user: {}, access_token: 'tok' });

            const result = await sm.reportAuthError(new Error('401 Unauthorized'));

            expect(result.success).toBe(true);
            expect(result.reason).toBe('refreshed');
            expect(mockAuthManager.refreshSession).toHaveBeenCalled();

            sm.stop();
        });

        it('should return error result when refresh fails', async () => {
            const sm = await createSessionManager();
            mockAuthManager.refreshSession.mockResolvedValue(null);

            const resultPromise = sm.reportAuthError(new Error('token expired'));
            await vi.advanceTimersByTimeAsync(20000);
            const result = await resultPromise;

            expect(result.success).toBe(false);
            expect(result.reason).toBe('error');

            sm.stop();
        });
    });

    describe('multiple initialize() calls', () => {
        it('should not create duplicate intervals', async () => {
            const sm = await createSessionManager();
            const setIntervalSpy = vi.spyOn(global, 'setInterval');

            sm.initialize();
            sm.initialize();
            sm.initialize();

            // Only one interval should be created due to the `initialized` guard
            expect(setIntervalSpy).toHaveBeenCalledTimes(1);

            sm.stop();
            setIntervalSpy.mockRestore();
        });
    });

    describe('proactive refresh', () => {
        it('should call refreshSession when the interval fires', async () => {
            const sm = await createSessionManager();
            mockAuthManager.refreshSession.mockResolvedValue({ user: {}, access_token: 'tok' });

            sm.initialize();

            // Advance past the RECENT_AUTH_EVENT_WINDOW (30s) so hadRecentAuthEvent returns false
            await vi.advanceTimersByTimeAsync(30_000);

            // Now advance to the proactive refresh interval (4 minutes)
            // We already advanced 30s, so we need another 210s
            await vi.advanceTimersByTimeAsync(4 * 60 * 1000 - 30_000);

            expect(mockAuthManager.refreshSession).toHaveBeenCalled();

            sm.stop();
        });

        it('should skip refresh when not logged in', async () => {
            const sm = await createSessionManager();
            mockAuthManager.isLoggedIn.mockReturnValue(false);

            sm.initialize();

            // Advance past the recent auth event window + full interval
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

            expect(mockAuthManager.refreshSession).not.toHaveBeenCalled();

            sm.stop();
        });

        it('should skip refresh when a recent auth event was detected', async () => {
            const sm = await createSessionManager();

            sm.initialize();

            // The initialize() call sets lastAuthEventTimestamp = Date.now(),
            // so within 30s the proactive refresh should be skipped.
            // Advance to just before the 30s window closes, then trigger interval.
            // The interval fires at 4 min, which is well past 30s, so we need to
            // simulate a recent auth event right before the interval fires.

            // Advance to just before the interval
            await vi.advanceTimersByTimeAsync(4 * 60 * 1000 - 5000);

            // Simulate a Supabase auth event by dispatching the window event
            window.dispatchEvent(new Event('authStateChanged'));

            // Now advance past the interval trigger
            await vi.advanceTimersByTimeAsync(5000);

            // refreshSession should NOT have been called because of the recent auth event
            expect(mockAuthManager.refreshSession).not.toHaveBeenCalled();

            sm.stop();
        });
    });

    describe('deduplication', () => {
        it('should deduplicate concurrent refresh requests', async () => {
            const sm = await createSessionManager();
            let resolveRefresh: (v: any) => void;
            mockAuthManager.refreshSession.mockReturnValue(
                new Promise((resolve) => { resolveRefresh = resolve; }),
            );

            // Fire two concurrent refreshes
            const p1 = sm.coordinatedRefresh();
            const p2 = sm.coordinatedRefresh();

            // Both should share the same underlying promise
            expect(sm.isCurrentlyRefreshing()).toBe(true);

            resolveRefresh!({ user: {}, access_token: 'tok' });
            const [r1, r2] = await Promise.all([p1, p2]);

            expect(r1.success).toBe(true);
            expect(r2.success).toBe(true);
            // refreshSession should only have been called once
            expect(mockAuthManager.refreshSession).toHaveBeenCalledTimes(1);

            sm.stop();
        });
    });
});
