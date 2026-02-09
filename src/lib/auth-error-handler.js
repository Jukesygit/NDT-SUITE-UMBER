/**
 * Auth Error Handler
 * Detects authentication-related errors and triggers appropriate actions
 */

// Error codes/messages that indicate auth failure
const AUTH_ERROR_PATTERNS = [
    // Supabase/PostgREST error codes
    'PGRST301', // JWT expired
    'PGRST302', // JWT invalid
    '401',
    '403',
    // Error messages
    'jwt expired',
    'jwt malformed',
    'invalid token',
    'token expired',
    'not authenticated',
    'authentication required',
    'session expired',
    'refresh_token_not_found',
    'invalid refresh token',
    'user not found',
];

/**
 * Check if an error is auth-related
 * @param {Error|Object} error - The error to check
 * @returns {boolean} - True if the error is auth-related
 */
export function isAuthError(error) {
    if (!error) return false;

    // Check error code
    const code = error.code || error.status || error.statusCode;
    if (code === 401 || code === 403 || code === 'PGRST301' || code === 'PGRST302') {
        return true;
    }

    // Check error message
    const message = (error.message || error.error || error.msg || '').toLowerCase();
    return AUTH_ERROR_PATTERNS.some(pattern =>
        message.includes(pattern.toLowerCase())
    );
}

/**
 * Handle auth error by logging out and redirecting to login
 * This is called when we detect an auth error that can't be recovered
 */
export async function handleAuthError() {
    // Dispatch event to notify the app of auth failure
    window.dispatchEvent(new CustomEvent('authError', {
        detail: { reason: 'session_expired' }
    }));

    // The App component or AuthProvider will handle the actual logout
    // This ensures we go through proper cleanup channels
}

/**
 * Create a query error handler for React Query
 * @param {Function} onAuthError - Callback when auth error is detected
 * @returns {Function} - Error handler function
 */
export function createQueryErrorHandler(onAuthError) {
    let isHandlingAuthError = false;

    return (error) => {
        // Prevent multiple simultaneous auth error handling
        if (isHandlingAuthError) return;

        if (isAuthError(error)) {
            isHandlingAuthError = true;

            if (onAuthError) {
                onAuthError(error);
            } else {
                handleAuthError();
            }

            // Reset flag after a delay to allow for recovery attempts
            setTimeout(() => {
                isHandlingAuthError = false;
            }, 5000);
        }
    };
}

export default {
    isAuthError,
    handleAuthError,
    createQueryErrorHandler,
};
