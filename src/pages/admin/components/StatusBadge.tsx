/**
 * StatusBadge - Reusable badge component for displaying roles and statuses
 * Industrial LCD instrument theme - green-on-dark styling
 */

type BadgeVariant =
    | 'super_admin'
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

// Map variants to inline green-on-dark styles
const variantStyles: Record<BadgeVariant, { background: string; color: string; border: string }> = {
    super_admin: { background: 'rgba(53, 160, 88, 0.15)', color: 'var(--green-bright)', border: '1px solid rgba(53, 160, 88, 0.30)' },
    admin: { background: 'rgba(53, 160, 88, 0.15)', color: 'var(--green-bright)', border: '1px solid rgba(53, 160, 88, 0.30)' },
    manager: { background: 'rgba(53, 160, 88, 0.10)', color: 'var(--green)', border: '1px solid rgba(53, 160, 88, 0.25)' },
    org_admin: { background: 'rgba(53, 160, 88, 0.10)', color: 'var(--green)', border: '1px solid rgba(53, 160, 88, 0.25)' },
    editor: { background: 'rgba(53, 160, 88, 0.08)', color: 'rgba(53, 160, 88, 0.70)', border: '1px solid rgba(53, 160, 88, 0.20)' },
    viewer: { background: 'rgba(53, 160, 88, 0.05)', color: 'rgba(53, 160, 88, 0.45)', border: '1px solid rgba(53, 160, 88, 0.15)' },
    active: { background: 'rgba(53, 160, 88, 0.15)', color: 'var(--green-bright)', border: '1px solid rgba(53, 160, 88, 0.30)' },
    inactive: { background: 'rgba(53, 160, 88, 0.05)', color: 'rgba(53, 160, 88, 0.35)', border: '1px solid rgba(53, 160, 88, 0.15)' },
    pending: { background: 'rgba(245, 158, 11, 0.10)', color: 'var(--amber)', border: '1px solid rgba(245, 158, 11, 0.25)' },
    view: { background: 'rgba(53, 160, 88, 0.05)', color: 'rgba(53, 160, 88, 0.45)', border: '1px solid rgba(53, 160, 88, 0.15)' },
    edit: { background: 'rgba(245, 158, 11, 0.10)', color: 'var(--amber)', border: '1px solid rgba(245, 158, 11, 0.25)' },
    asset: { background: 'rgba(53, 160, 88, 0.10)', color: 'var(--green)', border: '1px solid rgba(53, 160, 88, 0.25)' },
    vessel: { background: 'rgba(53, 160, 88, 0.15)', color: 'var(--green-bright)', border: '1px solid rgba(53, 160, 88, 0.30)' },
    scan: { background: 'rgba(53, 160, 88, 0.15)', color: 'var(--green-bright)', border: '1px solid rgba(53, 160, 88, 0.30)' },
};

const variantLabels: Record<BadgeVariant, string> = {
    super_admin: 'Super Admin',
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
 * Uses inline green-on-dark styles for LCD instrument theme
 *
 * @example
 * <StatusBadge variant="admin" />
 * <StatusBadge variant="pending">Custom Text</StatusBadge>
 */
export function StatusBadge({ variant, children, className = '' }: StatusBadgeProps) {
    const displayText = children || variantLabels[variant];
    const styles = variantStyles[variant];

    return (
        <span
            className={className}
            style={{
                display: 'inline-block',
                padding: '2px 10px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '4px',
                background: styles.background,
                color: styles.color,
                border: styles.border,
                textTransform: 'capitalize',
                letterSpacing: '0.025em',
            }}
        >
            {displayText}
        </span>
    );
}

export default StatusBadge;
