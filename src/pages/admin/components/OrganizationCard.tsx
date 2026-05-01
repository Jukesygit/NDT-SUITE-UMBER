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
        <div style={{ padding: '24px', border: '1px solid rgba(53, 160, 88, 0.20)', borderRadius: '8px', background: 'rgba(53, 160, 88, 0.05)' }}>
            {/* Header with name and menu button */}
            <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--green-bright)' }}>
                    {organization.name}
                </h3>
                <button
                    style={{ padding: '4px', color: 'rgba(53, 160, 88, 0.45)', cursor: 'pointer', background: 'none', border: 'none' }}
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
                    <p className="text-xs" style={{ color: 'rgba(53, 160, 88, 0.45)' }}>Users</p>
                </div>
            </div>

            {/* Footer with creation date */}
            <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(53, 160, 88, 0.15)' }}>
                <p className="text-xs" style={{ color: 'rgba(53, 160, 88, 0.45)' }}>
                    Created {createdDate}
                </p>
            </div>
        </div>
    );
}

export default OrganizationCard;
