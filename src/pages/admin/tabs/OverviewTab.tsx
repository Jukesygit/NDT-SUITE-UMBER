/**
 * OverviewTab - Admin dashboard overview with stats and summaries
 * Uses Personnel Management page styling patterns
 */

import { useAdminStats } from '../../../hooks/queries/useAdminStats';
import { useOrganizationsWithStats } from '../../../hooks/queries/useAdminOrganizations';
import { useAdminUsers } from '../../../hooks/queries/useAdminUsers';
import { SectionSpinner } from '../../../components/ui/LoadingSpinner';
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { MatrixLogoRacer } from '../../../components/MatrixLogoLoader';

/**
 * Icons for stat cards - matching Personnel Management page style
 */
const BuildingIcon = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
);

const UsersIcon = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const CubeIcon = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
);

const ClockIcon = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export default function OverviewTab() {
    const { data: stats, isLoading: statsLoading, error: statsError } = useAdminStats();
    const { data: organizations = [], isLoading: orgsLoading } = useOrganizationsWithStats();
    const { data: users = [], isLoading: usersLoading } = useAdminUsers();

    // Show loading state with Matrix logo like Personnel page
    if (statsLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <MatrixLogoRacer size={160} duration={4} />
                <div className="text-gray-400 animate-pulse">Loading dashboard statistics...</div>
            </div>
        );
    }

    // Show error state
    if (statsError) {
        return <ErrorDisplay error={statsError} title="Failed to load dashboard" />;
    }

    // Calculate pending requests total
    const pendingRequests = (stats?.pendingAccountRequests || 0) + (stats?.pendingPermissionRequests || 0);

    // Get top 5 organizations by asset count
    const topOrganizations = organizations
        .slice()
        .sort((a, b) => (b.assetCount || 0) - (a.assetCount || 0))
        .slice(0, 5);

    // Get recent users (last 5)
    const recentUsers = users.slice(0, 5);

    return (
        <div>
            {/* Stats Row - using Personnel Management compact style */}
            <div className="stats-compact" style={{ marginBottom: '24px' }}>
                <StatCard
                    label="Organizations"
                    value={stats?.totalOrganizations || 0}
                    icon={<BuildingIcon />}
                    variant="primary"
                />
                <StatCard
                    label="Total Users"
                    value={stats?.totalUsers || 0}
                    icon={<UsersIcon />}
                    variant="success"
                />
                <StatCard
                    label="Total Assets"
                    value={stats?.totalAssets || 0}
                    icon={<CubeIcon />}
                    variant="primary"
                />
                <StatCard
                    label="Pending Requests"
                    value={pendingRequests}
                    icon={<ClockIcon />}
                    variant={pendingRequests > 0 ? 'warning' : 'primary'}
                />
            </div>

            {/* Two Column Layout - using glass-card style */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Organizations List */}
                <div className="glass-card">
                    <h3 style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <BuildingIcon />
                        Top Organizations
                    </h3>

                    {orgsLoading ? (
                        <div className="flex justify-center py-8">
                            <SectionSpinner />
                        </div>
                    ) : topOrganizations.length === 0 ? (
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            textAlign: 'center',
                            padding: '32px 0'
                        }}>
                            No organizations found
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {topOrganizations.map((org) => (
                                <div
                                    key={org.organization.id}
                                    className="list-item-hover"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 16px',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255, 255, 255, 0.06)',
                                        transition: 'all 0.2s ease',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <div style={{ flex: 1 }}>
                                        <p style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                            marginBottom: '4px',
                                            fontSize: '14px'
                                        }}>
                                            {org.organization.name}
                                        </p>
                                        <p style={{
                                            fontSize: '12px',
                                            color: 'rgba(255, 255, 255, 0.5)'
                                        }}>
                                            {org.assetCount || 0} assets · {org.scanCount || 0} scans
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent Users List */}
                <div className="glass-card">
                    <h3 style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <UsersIcon />
                        Recent Users
                    </h3>

                    {usersLoading ? (
                        <div className="flex justify-center py-8">
                            <SectionSpinner />
                        </div>
                    ) : recentUsers.length === 0 ? (
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            textAlign: 'center',
                            padding: '32px 0'
                        }}>
                            No users found
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {recentUsers.map((user) => (
                                <div
                                    key={user.id}
                                    className="list-item-hover"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 16px',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255, 255, 255, 0.06)',
                                        transition: 'all 0.2s ease',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <div style={{ flex: 1 }}>
                                        <p style={{
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                            marginBottom: '4px',
                                            fontSize: '14px'
                                        }}>
                                            {user.username}
                                        </p>
                                        <p style={{
                                            fontSize: '12px',
                                            color: 'rgba(255, 255, 255, 0.5)'
                                        }}>
                                            {user.email}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <StatusBadge variant={user.role as any}>
                                            {user.role}
                                        </StatusBadge>
                                        <StatusBadge variant={user.is_active ? 'active' : 'inactive'} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
