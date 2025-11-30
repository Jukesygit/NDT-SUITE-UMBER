/**
 * EmptyState - Reusable empty state component
 */

interface EmptyStateProps {
    title?: string;
    message?: string;
    icon?: 'default' | 'search' | 'folder' | 'users' | 'document';
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
}

const icons = {
    default: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
    ),
    search: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
    ),
    folder: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
    ),
    users: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
    ),
    document: (
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
    ),
};

/**
 * EmptyState - Shows when no data is available
 *
 * @example
 * if (data?.length === 0) {
 *     return (
 *         <EmptyState
 *             title="No competencies found"
 *             message="Add your first competency to get started"
 *             icon="document"
 *             action={{ label: 'Add Competency', onClick: () => setShowModal(true) }}
 *         />
 *     );
 * }
 */
export function EmptyState({
    title = 'No data found',
    message = 'There is nothing to display here yet.',
    icon = 'default',
    action,
    className = ''
}: EmptyStateProps) {
    return (
        <div className={`flex flex-col items-center justify-center py-16 px-6 ${className}`}>
            {/* Icon */}
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                <svg
                    className="w-10 h-10 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    {icons[icon]}
                </svg>
            </div>

            {/* Title */}
            <h3 className="text-lg font-semibold text-white mb-2">
                {title}
            </h3>

            {/* Message */}
            <p className="text-sm text-gray-400 text-center max-w-md mb-6">
                {message}
            </p>

            {/* Action Button */}
            {action && (
                <button
                    onClick={action.onClick}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 flex items-center gap-2"
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
                            d="M12 4v16m8-8H4"
                        />
                    </svg>
                    {action.label}
                </button>
            )}
        </div>
    );
}

/**
 * NoSearchResults - Empty state specifically for search
 */
export function NoSearchResults({
    searchTerm,
    onClear,
    className = ''
}: {
    searchTerm: string;
    onClear?: () => void;
    className?: string;
}) {
    return (
        <EmptyState
            title="No results found"
            message={`We couldn't find anything matching "${searchTerm}". Try a different search term.`}
            icon="search"
            action={onClear ? { label: 'Clear Search', onClick: onClear } : undefined}
            className={className}
        />
    );
}

export default EmptyState;
