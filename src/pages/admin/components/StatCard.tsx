/**
 * StatCard - Card component for displaying statistics
 * Uses the same styling as Personnel Management page's stat-compact
 */

interface StatCardProps {
    label: string;
    value: number | string;
    icon?: React.ReactNode;
    variant?: 'primary' | 'success' | 'warning' | 'danger';
    className?: string;
}

/**
 * StatCard - Displays a statistic in the compact format
 * Matches the Personnel Management page styling
 *
 * @example
 * <StatCard
 *     label="Total Users"
 *     value={42}
 *     icon={<UsersIcon />}
 *     variant="primary"
 * />
 */
export function StatCard({ label, value, icon, variant = 'primary' }: StatCardProps) {
    const iconClass = `stat-compact__icon stat-compact__icon--${variant}`;

    return (
        <div className="stat-compact">
            {icon && (
                <div className={iconClass}>
                    {icon}
                </div>
            )}
            <div className="stat-compact__content">
                <div className="stat-compact__label">{label}</div>
                <div className="stat-compact__value">{value}</div>
            </div>
        </div>
    );
}

export default StatCard;
