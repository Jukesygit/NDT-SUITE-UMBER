/**
 * Session Manager - Centralized session refresh coordination
 *
 * This module solves the cascading session refresh problem by:
 * 1. Using a mutex to ensure only ONE refresh happens at a time
 * 2. Deduplicating concurrent refresh requests (they share the same promise)
 * 3. Implementing exponential backoff on failures
 * 4. Providing event-based communication for React components
 */

import authManager from '../auth-manager.js';
// Note: Do NOT import queryClient here - it creates a circular dependency
// Query invalidation is handled by AuthContext which subscribes to session events

// Configuration constants
const SESSION_CONFIG = {
    REFRESH_TIMEOUT_MS: 10000,      // Match auth-manager timeout
    DEBOUNCE_DELAY_MS: 2000,        // Minimum time between refresh attempts
    PROACTIVE_REFRESH_INTERVAL: 3 * 60 * 1000, // 3 minutes (before 5-min token expiry)
    MAX_RETRY_ATTEMPTS: 3,
    BACKOFF_MULTIPLIER: 2,
    INITIAL_BACKOFF_MS: 1000,
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
    reason?: 'refreshed' | 'expired' | 'error' | 'already_refreshing';
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

    constructor() {
        // Don't start proactive refresh until explicitly initialized
    }

    /**
     * Initialize the session manager and start proactive refresh
     * Call this after auth has been established
     */
    initialize(): void {
        if (this.initialized) return;

        this.initialized = true;
        this.startProactiveRefresh();
        console.log('[SessionManager] Initialized');
    }

    /**
     * Stop the session manager (call on logout)
     */
    stop(): void {
        this.stopProactiveRefresh();
        this.initialized = false;
        this.resetBackoff();
        console.log('[SessionManager] Stopped');
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
    async reportAuthError(error: Error): Promise<RefreshResult> {
        console.log('[SessionManager] Auth error reported:', error.message);
        return this.coordinatedRefresh();
    }

    /**
     * Main entry point for session refresh
     * Ensures only one refresh happens at a time with proper deduplication
     */
    async coordinatedRefresh(): Promise<RefreshResult> {
        // If already refreshing, return the existing promise (deduplication)
        if (this.isRefreshing && this.currentRefreshPromise) {
            console.log('[SessionManager] Refresh already in progress, waiting...');
            return this.currentRefreshPromise;
        }

        // Check debounce - don't refresh too frequently
        const timeSinceLastAttempt = Date.now() - this.lastRefreshAttempt;
        if (timeSinceLastAttempt < SESSION_CONFIG.DEBOUNCE_DELAY_MS) {
            console.log('[SessionManager] Debouncing refresh, too soon since last attempt');
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
     * Execute the actual refresh with retry logic
     */
    private async executeRefresh(): Promise<RefreshResult> {
        let attempts = 0;

        while (attempts < SESSION_CONFIG.MAX_RETRY_ATTEMPTS) {
            attempts++;
            console.log(`[SessionManager] Refresh attempt ${attempts}/${SESSION_CONFIG.MAX_RETRY_ATTEMPTS}`);

            try {
                // Call auth-manager's refresh (already has timeout built in)
                const session = await authManager.refreshSession(SESSION_CONFIG.REFRESH_TIMEOUT_MS);

                if (session) {
                    // Success!
                    this.resetBackoff();
                    this.emit({ type: 'refreshed', timestamp: Date.now() });
                    console.log('[SessionManager] Session refreshed successfully');
                    return { success: true, reason: 'refreshed' };
                }

                // No session returned - might be expired
                console.warn('[SessionManager] Refresh returned no session');

            } catch (error) {
                console.error(`[SessionManager] Refresh attempt ${attempts} failed:`, error);
            }

            // If we have more attempts, wait with backoff
            if (attempts < SESSION_CONFIG.MAX_RETRY_ATTEMPTS) {
                await this.waitWithBackoff();
            }
        }

        // All attempts failed
        this.consecutiveFailures++;

        // Check if we still have a valid session (maybe it was refreshed by Supabase internally)
        const existingSession = await authManager.getSession(5000);
        if (existingSession) {
            console.log('[SessionManager] Found valid session despite refresh failures');
            this.resetBackoff();
            this.emit({ type: 'refreshed', timestamp: Date.now() });
            return { success: true, reason: 'refreshed' };
        }

        // Session is truly expired
        console.error('[SessionManager] Session expired after all retry attempts');
        this.emit({ type: 'expired', timestamp: Date.now() });
        return { success: false, reason: 'expired' };
    }

    /**
     * Wait with exponential backoff
     */
    private async waitWithBackoff(): Promise<void> {
        console.log(`[SessionManager] Waiting ${this.currentBackoffMs}ms before retry`);
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
            if (!authManager.isLoggedIn()) return;

            console.log('[SessionManager] Proactive refresh check');
            await this.coordinatedRefresh();
        }, SESSION_CONFIG.PROACTIVE_REFRESH_INTERVAL);

        console.log(`[SessionManager] Proactive refresh started (every ${SESSION_CONFIG.PROACTIVE_REFRESH_INTERVAL / 1000}s)`);
    }

    /**
     * Stop proactive refresh interval
     */
    private stopProactiveRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('[SessionManager] Proactive refresh stopped');
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
