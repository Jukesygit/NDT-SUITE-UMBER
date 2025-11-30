/**
 * StatusBadge - Reusable badge component for displaying roles and statuses
 * Uses the glass-badge styling to match Personnel Management page
 */

type BadgeVariant =
    | 'admin'
    | 'manager'
    | 'org_admin'
    | 'editor'
    | 'viewer'
    | 'active'
    | 'inactive'
    | 'pending'
    | 'view'
    | 'edit'
    | 'asset'
    | 'vessel'
    | 'scan';

interface StatusBadgeProps {
    variant: BadgeVariant;
    children?: React.ReactNode;
    className?: string;
}

// Map variants to badge color classes
const variantColorClass: Record<BadgeVariant, string> = {
    admin: 'badge-purple',
    manager: 'badge-cyan',
    org_admin: 'badge-blue',
    editor: 'badge-green',
    viewer: 'badge-gray',
    active: 'badge-green',
    inactive: 'badge-gray',
    pending: 'badge-yellow',
    view: 'badge-gray',
    edit: 'badge-yellow',
    asset: 'badge-blue',
    vessel: 'badge-green',
    scan: 'badge-purple',
};

const variantLabels: Record<BadgeVariant, string> = {
    admin: 'Admin',
    manager: 'Manager',
    org_admin: 'Org Admin',
    editor: 'Editor',
    viewer: 'Viewer',
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
    view: 'View',
    edit: 'Edit',
    asset: 'Asset',
    vessel: 'Vessel',
    scan: 'Scan',
};

/**
 * StatusBadge - Displays role or status with appropriate styling
 * Uses glass-badge classes for consistent styling
 *
 * @example
 * <StatusBadge variant="admin" />
 * <StatusBadge variant="pending">Custom Text</StatusBadge>
 */
export function StatusBadge({ variant, children, className = '' }: StatusBadgeProps) {
    const displayText = children || variantLabels[variant];
    const colorClass = variantColorClass[variant];

    return (
        <span className={`glass-badge ${colorClass} ${className}`}>
            {displayText}
        </span>
    );
}

export default StatusBadge;
