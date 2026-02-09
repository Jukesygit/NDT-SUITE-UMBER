/**
 * OrganizationCard - Card displaying organization info with actions
 */

import { StatusBadge } from './StatusBadge';

interface Organization {
    id: string;
    name: string;
    createdAt: string;
}

interface OrganizationCardProps {
    organization: Organization;
    userCount: number;
    onEdit: () => void;
    onDelete: () => void;
}

/**
 * OrganizationCard - Displays organization info with menu for actions
 */
export function OrganizationCard({
    organization,
    userCount,
    onEdit: _onEdit,
    onDelete: _onDelete,
}: OrganizationCardProps) {
    void _onEdit;
    void _onDelete;
    const createdDate = new Date(organization.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            {/* Header with name and menu button */}
            <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {organization.name}
                </h3>
                <button
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    aria-label="Organization menu"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                        />
                    </svg>
                </button>
            </div>

            {/* Stats */}
            <div className="mb-4">
                <div className="text-center">
                    <div className="flex items-center justify-center mb-1">
                        <StatusBadge variant="vessel">{userCount}</StatusBadge>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Users</p>
                </div>
            </div>

            {/* Footer with creation date */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Created {createdDate}
                </p>
            </div>
        </div>
    );
}

export default OrganizationCard;
