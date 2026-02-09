import { QueryClient } from '@tanstack/react-query';
import { isAuthError } from './auth-error-handler.js';
import { sessionManager } from './session-manager';

/**
 * Global error handler for queries
 * Delegates auth errors to the centralized session manager
 * (Session manager handles deduplication internally - no flag needed here)
 */
function handleQueryError(error) {
    if (!isAuthError(error)) return;

    // Delegate to session manager - it handles deduplication and coordination
    sessionManager.reportAuthError(error);
}

/**
 * Global error handler for mutations
 * Delegates auth errors to the centralized session manager
 */
function handleMutationError(error) {
    if (!isAuthError(error)) return;

    // Delegate to session manager - it handles deduplication and coordination
    sessionManager.reportAuthError(error);
}

/**
 * Custom retry function that doesn't retry auth errors
 */
function shouldRetry(failureCount, error) {
    // Never retry auth errors - they won't succeed without re-login
    if (isAuthError(error)) {
        return false;
    }
    // Retry other errors once
    return failureCount < 1;
}

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,      // 5 minutes
            gcTime: 30 * 60 * 1000,        // 30 minutes (formerly cacheTime)
            retry: shouldRetry,             // Custom retry that skips auth errors
            refetchOnWindowFocus: false,   // Corporate app, disable aggressive refetch
        },
        mutations: {
            retry: 0,
            onError: handleMutationError,
        },
    },
});

// Set up global query error handler via query cache
queryClient.getQueryCache().config.onError = handleQueryError;

/**
 * Clear all cached data - call on logout
 */
export function clearQueryCache() {
    queryClient.clear();
}

/**
 * Invalidate stale queries - call when session is refreshed
 * Only invalidates queries that are in error state or have stale data
 * This prevents the "thundering herd" problem of refetching everything at once
 */
export function invalidateStaleQueries() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    queryClient.invalidateQueries({
        predicate: (query) => {
            // Invalidate queries that:
            // 1. Are in error state (likely auth errors)
            // 2. Have stale data (older than 5 minutes)
            const isError = query.state.status === 'error';
            const isStale = query.state.dataUpdatedAt < fiveMinutesAgo;
            return isError || isStale;
        }
    });
}

/**
 * Invalidate all queries - use sparingly, prefer invalidateStaleQueries
 * @deprecated Use invalidateStaleQueries instead for better performance
 */
export function invalidateAllQueries() {
    queryClient.invalidateQueries();
}
