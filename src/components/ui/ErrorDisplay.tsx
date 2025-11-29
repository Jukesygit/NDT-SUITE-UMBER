/**
 * ErrorDisplay - Reusable error state component for React Query errors
 */

interface ErrorDisplayProps {
    error: Error | null;
    title?: string;
    onRetry?: () => void;
    className?: string;
}

/**
 * ErrorDisplay - Shows error state with optional retry button
 *
 * @example
 * const { data, error, refetch } = useProfile();
 * if (error) return <ErrorDisplay error={error} onRetry={refetch} />;
 */
export function ErrorDisplay({
    error,
    title = 'Something went wrong',
    onRetry,
    className = ''
}: ErrorDisplayProps) {
    const errorMessage = error?.message || 'An unexpected error occurred';

    return (
        <div className={`flex flex-col items-center justify-center py-12 px-6 ${className}`}>
            {/* Error Icon */}
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <svg
                    className="w-8 h-8 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                </svg>
            </div>

            {/* Error Title */}
            <h3 className="text-lg font-semibold text-white mb-2">
                {title}
            </h3>

            {/* Error Message */}
            <p className="text-sm text-gray-400 text-center max-w-md mb-6">
                {errorMessage}
            </p>

            {/* Retry Button */}
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors duration-200 flex items-center gap-2"
                >
                    <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </svg>
                    Try Again
                </button>
            )}
        </div>
    );
}

/**
 * InlineError - Compact error for inline display
 */
export function InlineError({
    message,
    className = ''
}: {
    message: string;
    className?: string;
}) {
    return (
        <div className={`flex items-center gap-2 text-red-400 text-sm ${className}`}>
            <svg
                className="w-4 h-4 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
            </svg>
            <span>{message}</span>
        </div>
    );
}

export default ErrorDisplay;
