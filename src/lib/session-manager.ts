/**
 * Session Manager - Centralized session refresh coordination
 *
 * This module coordinates session refresh by:
 * 1. Using a mutex to ensure only ONE refresh happens at a time
 * 2. Deduplicating concurrent refresh requests (they share the same promise)
 * 3. Implementing exponential backoff on failures
 * 4. Providing event-based communication for React components
 *
 * IMPORTANT: This manager does NOT force logout on refresh failure.
 * Supabase's built-in auto-refresh also rotates tokens, and our refresh
 * can race with it (stale refresh token). Only Supabase's SIGNED_OUT event
 * should trigger logout (handled in auth-supabase.ts).
 */

import authManager from '../auth-manager.js';
// Note: Do NOT import queryClient here - it creates a circular dependency
// Query invalidation is handled by AuthContext which subscribes to session events

// Configuration constants
const SESSION_CONFIG = {
    REFRESH_TIMEOUT_MS: 10000,      // Match auth-manager timeout
    DEBOUNCE_DELAY_MS: 2000,        // Minimum time between refresh attempts
    PROACTIVE_REFRESH_INTERVAL: 4 * 60 * 1000, // 4 minutes
    MAX_RETRY_ATTEMPTS: 2,
    BACKOFF_MULTIPLIER: 2,
    INITIAL_BACKOFF_MS: 1000,
    // If we saw a Supabase auth event within this window, skip proactive refresh
    RECENT_AUTH_EVENT_WINDOW_MS: 30 * 1000, // 30 seconds
};

// Event types
export type SessionEventType = 'refreshing' | 'refreshed' | 'expired' | 'error';

export interface SessionEvent {
    type: SessionEventType;
    timestamp: number;
    error?: Error;
}

export interface RefreshResult {
    success: boolean;
    reason?: 'refreshed' | 'expired' | 'error' | 'already_refreshing' | 'skipped_recent_event';
    error?: Error;
}

type SessionEventCallback = (event: SessionEvent) => void;

class SessionManager {
    // Mutex state
    private isRefreshing = false;
    private currentRefreshPromise: Promise<RefreshResult> | null = null;
    private lastRefreshAttempt = 0;

    // Backoff state
    private consecutiveFailures = 0;
    private currentBackoffMs = SESSION_CONFIG.INITIAL_BACKOFF_MS;

    // Proactive refresh interval
    private refreshInterval: ReturnType<typeof setInterval> | null = null;

    // Event subscribers
    private subscribers: Set<SessionEventCallback> = new Set();

    // Initialization state
    private initialized = false;

    // Track last successful Supabase auth event (SIGNED_IN, TOKEN_REFRESHED)
    // to avoid racing with Supabase's built-in auto-refresh
    private lastAuthEventTimestamp = 0;

    constructor() {
        // Listen for Supabase auth events dispatched by auth-supabase.ts
        // These indicate Supabase already handled the token refresh
        window.addEventListener('authStateChanged', () => {
            this.lastAuthEventTimestamp = Date.now();
        });
        window.addEventListener('userLoggedIn', () => {
            this.lastAuthEventTimestamp = Date.now();
        });
    }

    /**
     * Initialize the session manager and start proactive refresh
     * Call this after auth has been established
     */
    initialize(): void {
        if (this.initialized) return;

        this.initialized = true;
        this.lastAuthEventTimestamp = Date.now();
        this.startProactiveRefresh();
    }

    /**
     * Stop the session manager (call on logout)
     */
    stop(): void {
        this.stopProactiveRefresh();
        this.initialized = false;
        this.resetBackoff();
    }

    /**
     * Subscribe to session events
     * @returns Unsubscribe function
     */
    onSessionChange(callback: SessionEventCallback): () => void {
        this.subscribers.add(callback);
        return () => {
            this.subscribers.delete(callback);
        };
    }

    /**
     * Report an auth error from a query/mutation
     * This will trigger a coordinated refresh attempt
     */
    async reportAuthError(_error: Error): Promise<RefreshResult> {
        return this.coordinatedRefresh();
    }

    /**
     * Check if a recent Supabase auth event makes proactive refresh unnecessary
     */
    private hadRecentAuthEvent(): boolean {
        return (Date.now() - this.lastAuthEventTimestamp) < SESSION_CONFIG.RECENT_AUTH_EVENT_WINDOW_MS;
    }

    /**
     * Main entry point for session refresh
     * Ensures only one refresh happens at a time with proper deduplication
     */
    async coordinatedRefresh(): Promise<RefreshResult> {
        // If already refreshing, return the existing promise (deduplication)
        if (this.isRefreshing && this.currentRefreshPromise) {
            return this.currentRefreshPromise;
        }

        // Check debounce - don't refresh too frequently
        const timeSinceLastAttempt = Date.now() - this.lastRefreshAttempt;
        if (timeSinceLastAttempt < SESSION_CONFIG.DEBOUNCE_DELAY_MS) {
            return { success: true, reason: 'refreshed' }; // Assume recent refresh is still valid
        }

        // Start the refresh
        this.isRefreshing = true;
        this.lastRefreshAttempt = Date.now();
        this.emit({ type: 'refreshing', timestamp: Date.now() });

        // Create and store the promise so concurrent requests can share it
        this.currentRefreshPromise = this.executeRefresh();

        try {
            const result = await this.currentRefreshPromise;
            return result;
        } finally {
            this.isRefreshing = false;
            this.currentRefreshPromise = null;
        }
    }

    /**
     * Execute the actual refresh with retry logic.
     *
     * On failure: emits 'error' NOT 'expired'. Supabase's SIGNED_OUT event
     * is the authoritative signal for session expiry. Refresh failures are
     * often caused by racing with Supabase's built-in auto-refresh (which
     * consumes the refresh token before we can use it).
     */
    private async executeRefresh(): Promise<RefreshResult> {
        let attempts = 0;

        while (attempts < SESSION_CONFIG.MAX_RETRY_ATTEMPTS) {
            attempts++;

            try {
                // Call auth-manager's refresh (already has timeout built in)
                const session = await authManager.refreshSession(SESSION_CONFIG.REFRESH_TIMEOUT_MS);

                if (session) {
                    // Success!
                    this.resetBackoff();
                    this.emit({ type: 'refreshed', timestamp: Date.now() });
                    return { success: true, reason: 'refreshed' };
                }

            } catch (error) {
                // Refresh attempt failed, will retry if attempts remain
            }

            // If we have more attempts, wait with backoff
            if (attempts < SESSION_CONFIG.MAX_RETRY_ATTEMPTS) {
                await this.waitWithBackoff();
            }
        }

        // All attempts failed - but do NOT force logout.
        // Refresh failure does not mean the session is expired. Common causes:
        // - Supabase's auto-refresh already consumed the refresh token (race condition)
        // - Transient network issue
        // - Server temporarily unavailable
        // The SIGNED_OUT event handler in auth-supabase.ts is the authoritative
        // signal for true session expiry.
        this.consecutiveFailures++;
        console.log(`[AUTH-DEBUG] SessionManager: refresh failed (attempt ${this.consecutiveFailures}), NOT forcing logout - waiting for next cycle`);

        this.emit({ type: 'error', timestamp: Date.now() });
        return { success: false, reason: 'error' };
    }

    /**
     * Wait with exponential backoff
     */
    private async waitWithBackoff(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, this.currentBackoffMs));
        this.currentBackoffMs = Math.min(
            this.currentBackoffMs * SESSION_CONFIG.BACKOFF_MULTIPLIER,
            10000 // Cap at 10 seconds
        );
    }

    /**
     * Reset backoff state after successful refresh
     */
    private resetBackoff(): void {
        this.consecutiveFailures = 0;
        this.currentBackoffMs = SESSION_CONFIG.INITIAL_BACKOFF_MS;
    }

    /**
     * Start proactive session refresh interval
     */
    private startProactiveRefresh(): void {
        if (this.refreshInterval) return;

        this.refreshInterval = setInterval(async () => {
            // Only refresh if user is logged in
            if (!authManager.isLoggedIn()) {
                return;
            }

            // Skip if Supabase already refreshed the token recently
            if (this.hadRecentAuthEvent()) {
                console.log('[AUTH-DEBUG] SessionManager: skipping proactive refresh - recent auth event detected');
                return;
            }

            console.log('[AUTH-DEBUG] SessionManager: starting proactive refresh');
            const result = await this.coordinatedRefresh();
            console.log(`[AUTH-DEBUG] SessionManager: proactive refresh result: ${result.reason || 'unknown'}`);
        }, SESSION_CONFIG.PROACTIVE_REFRESH_INTERVAL);
    }

    /**
     * Stop proactive refresh interval
     */
    private stopProactiveRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Emit an event to all subscribers
     */
    private emit(event: SessionEvent): void {
        this.subscribers.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('[SessionManager] Subscriber error:', error);
            }
        });
    }

    /**
     * Check if currently refreshing
     */
    isCurrentlyRefreshing(): boolean {
        return this.isRefreshing;
    }
}

// Export singleton instance
export const sessionManager = new SessionManager();

export default sessionManager;
