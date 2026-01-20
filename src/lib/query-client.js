import { QueryClient } from '@tanstack/react-query';
import { isAuthError, handleAuthError } from './auth-error-handler.js';

// Track if we're currently handling an auth error to prevent loops
let isHandlingAuthError = false;

/**
 * Global error handler for queries
 * Detects auth errors and triggers logout flow
 */
function handleQueryError(error) {
    if (isHandlingAuthError) return;

    if (isAuthError(error)) {
        isHandlingAuthError = true;
        console.warn('[QueryClient] Auth error detected in query:', error.message || error);
        handleAuthError();

        // Reset flag after delay
        setTimeout(() => {
            isHandlingAuthError = false;
        }, 5000);
    }
}

/**
 * Global error handler for mutations
 */
function handleMutationError(error) {
    if (isHandlingAuthError) return;

    if (isAuthError(error)) {
        isHandlingAuthError = true;
        console.warn('[QueryClient] Auth error detected in mutation:', error.message || error);
        handleAuthError();

        setTimeout(() => {
            isHandlingAuthError = false;
        }, 5000);
    }
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
    console.log('[QueryClient] Cache cleared');
}

/**
 * Invalidate all queries - call when session is refreshed
 */
export function invalidateAllQueries() {
    queryClient.invalidateQueries();
    console.log('[QueryClient] All queries invalidated');
}
