/**
 * ActivityLogTab - Activity log viewer with filtering and pagination
 * Features: User filter, action category filter, action type filter, date range filter
 */

import { useState, useMemo } from 'react';
import { useActivityLogs, useActivityUsers } from '../../../hooks/queries/useActivityLog';
import { DataTable, Column } from '../../../components/ui/DataTable/DataTable';
import { SectionSpinner } from '../../../components/ui/LoadingSpinner';
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay';
import type {
    ActivityLogEntry,
    ActionCategory,
    ActionType,
    ActivityLogFilters,
} from '../../../services/activity-log-service';

// Action category options for filter
const ACTION_CATEGORIES: { value: ActionCategory | ''; label: string }[] = [
    { value: '', label: 'All Categories' },
    { value: 'auth', label: 'Authentication' },
    { value: 'profile', label: 'Profile Changes' },
    { value: 'competency', label: 'Competencies' },
    { value: 'admin', label: 'Admin Actions' },
    { value: 'asset', label: 'Assets' },
    { value: 'config', label: 'Configuration' },
];

// Action type options (with category for filtering)
const ACTION_TYPES: { value: ActionType | ''; label: string; category?: ActionCategory }[] = [
    { value: '', label: 'All Actions' },
    // Auth
    { value: 'login_success', label: 'Login Success', category: 'auth' },
    { value: 'login_failed', label: 'Login Failed', category: 'auth' },
    { value: 'logout', label: 'Logout', category: 'auth' },
    // Profile
    { value: 'profile_updated', label: 'Profile Updated', category: 'profile' },
    { value: 'avatar_changed', label: 'Avatar Changed', category: 'profile' },
    // Competency
    { value: 'competency_created', label: 'Competency Created', category: 'competency' },
    { value: 'competency_updated', label: 'Competency Updated', category: 'competency' },
    { value: 'competency_deleted', label: 'Competency Deleted', category: 'competency' },
    { value: 'competency_approved', label: 'Competency Approved', category: 'competency' },
    { value: 'competency_rejected', label: 'Competency Rejected', category: 'competency' },
    { value: 'document_uploaded', label: 'Document Uploaded', category: 'competency' },
    // Admin
    { value: 'user_created', label: 'User Created', category: 'admin' },
    { value: 'user_updated', label: 'User Updated', category: 'admin' },
    { value: 'user_deleted', label: 'User Deleted', category: 'admin' },
    { value: 'organization_created', label: 'Organization Created', category: 'admin' },
    { value: 'organization_updated', label: 'Organization Updated', category: 'admin' },
    { value: 'organization_deleted', label: 'Organization Deleted', category: 'admin' },
    { value: 'permission_approved', label: 'Permission Approved', category: 'admin' },
    { value: 'permission_rejected', label: 'Permission Rejected', category: 'admin' },
    { value: 'account_approved', label: 'Account Approved', category: 'admin' },
    { value: 'account_rejected', label: 'Account Rejected', category: 'admin' },
    // Asset
    { value: 'asset_created', label: 'Asset Created', category: 'asset' },
    { value: 'asset_updated', label: 'Asset Updated', category: 'asset' },
    { value: 'asset_deleted', label: 'Asset Deleted', category: 'asset' },
    { value: 'asset_transferred', label: 'Asset Transferred', category: 'asset' },
    { value: 'vessel_created', label: 'Vessel Created', category: 'asset' },
    { value: 'vessel_updated', label: 'Vessel Updated', category: 'asset' },
    // Config
    { value: 'config_updated', label: 'Config Updated', category: 'config' },
    { value: 'announcement_created', label: 'Announcement Created', category: 'config' },
    { value: 'announcement_updated', label: 'Announcement Updated', category: 'config' },
    { value: 'share_created', label: 'Share Created', category: 'config' },
    { value: 'share_deleted', label: 'Share Deleted', category: 'config' },
];

// Category badge colors
const CATEGORY_COLORS: Record<ActionCategory, { bg: string; text: string }> = {
    auth: { bg: 'rgba(96, 165, 250, 0.15)', text: '#60a5fa' },
    profile: { bg: 'rgba(167, 139, 250, 0.15)', text: '#a78bfa' },
    competency: { bg: 'rgba(52, 211, 153, 0.15)', text: '#34d399' },
    admin: { bg: 'rgba(251, 191, 36, 0.15)', text: '#fbbf24' },
    asset: { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8' },
    config: { bg: 'rgba(156, 163, 175, 0.15)', text: '#9ca3af' },
    document: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
};

// Format action type for display
function formatActionType(type: string): string {
    return type
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Format category for display
function formatCategory(category: ActionCategory): string {
    const labels: Record<ActionCategory, string> = {
        auth: 'Auth',
        profile: 'Profile',
        competency: 'Competency',
        admin: 'Admin',
        asset: 'Asset',
        config: 'Config',
        document: 'Document',
    };
    return labels[category] || category;
}

export default function ActivityLogTab() {
    // Filter state
    const [filters, setFilters] = useState<ActivityLogFilters>({});
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 25;

    // Date filter state (separate from filters to allow Apply button)
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Data hooks
    const { data: logsData, isLoading, error } = useActivityLogs(filters, currentPage, pageSize);
    const { data: users = [] } = useActivityUsers();

    // Filter action types by selected category
    const filteredActionTypes = useMemo(() => {
        if (!filters.actionCategory) return ACTION_TYPES;
        return ACTION_TYPES.filter((at) => !at.category || at.category === filters.actionCategory);
    }, [filters.actionCategory]);

    // Handle filter changes
    const updateFilter = (key: keyof ActivityLogFilters, value: string) => {
        setFilters((prev) => ({
            ...prev,
            [key]: value || undefined,
        }));
        setCurrentPage(1);

        // Clear action type when category changes
        if (key === 'actionCategory') {
            setFilters((prev) => ({
                ...prev,
                actionCategory: value as ActionCategory || undefined,
                actionType: undefined,
            }));
        }
    };

    // Apply date filters
    const applyDateFilter = () => {
        setFilters((prev) => ({
            ...prev,
            startDate: startDate || undefined,
            endDate: endDate ? `${endDate}T23:59:59` : undefined,
        }));
        setCurrentPage(1);
    };

    // Clear all filters
    const clearFilters = () => {
        setFilters({});
        setStartDate('');
        setEndDate('');
        setCurrentPage(1);
    };

    // Check if any filters are active
    const hasActiveFilters = Object.keys(filters).some(
        (key) => filters[key as keyof ActivityLogFilters] !== undefined
    );

    // Column definitions
    const columns = useMemo<Column<ActivityLogEntry>[]>(
        () => [
            {
                key: 'timestamp',
                header: 'Time',
                width: '160px',
                render: (row) => (
                    <div>
                        <p style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '14px' }}>
                            {new Date(row.created_at).toLocaleDateString()}
                        </p>
                        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                            {new Date(row.created_at).toLocaleTimeString()}
                        </p>
                    </div>
                ),
            },
            {
                key: 'user',
                header: 'User',
                width: '200px',
                render: (row) => (
                    <div>
                        <p style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '14px' }}>
                            {row.user_name || 'System'}
                        </p>
                        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                            {row.user_email || '-'}
                        </p>
                    </div>
                ),
            },
            {
                key: 'category',
                header: 'Category',
                width: '100px',
                align: 'center',
                render: (row) => {
                    const colors = CATEGORY_COLORS[row.action_category];
                    return (
                        <span
                            style={{
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 500,
                                backgroundColor: colors?.bg || 'rgba(156, 163, 175, 0.15)',
                                color: colors?.text || '#9ca3af',
                            }}
                        >
                            {formatCategory(row.action_category)}
                        </span>
                    );
                },
            },
            {
                key: 'action',
                header: 'Action',
                width: '160px',
                render: (row) => (
                    <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '14px' }}>
                        {formatActionType(row.action_type)}
                    </span>
                ),
            },
            {
                key: 'description',
                header: 'Description',
                render: (row) => (
                    <p
                        style={{
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '14px',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                        title={row.description}
                    >
                        {row.description}
                    </p>
                ),
            },
            {
                key: 'entity',
                header: 'Entity',
                width: '150px',
                render: (row) =>
                    row.entity_name ? (
                        <div>
                            <p style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase' }}>
                                {row.entity_type}
                            </p>
                            <p
                                style={{
                                    color: 'var(--text-primary)',
                                    fontSize: '13px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                                title={row.entity_name}
                            >
                                {row.entity_name}
                            </p>
                        </div>
                    ) : (
                        <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>-</span>
                    ),
            },
        ],
        []
    );

    // Loading state
    if (isLoading && !logsData) {
        return <SectionSpinner message="Loading activity logs..." />;
    }

    // Error state
    if (error) {
        return <ErrorDisplay error={error} title="Failed to load activity logs" />;
    }

    const { data: logs = [], count = 0, totalPages = 1 } = logsData || {};

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Activity Log
                    </h2>
                    <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '4px' }}>
                        {count.toLocaleString()} {count === 1 ? 'entry' : 'entries'}
                    </p>
                </div>
                {hasActiveFilters && (
                    <button onClick={clearFilters} className="btn btn-secondary">
                        Clear Filters
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="glass-card" style={{ padding: '16px' }}>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '16px',
                    }}
                >
                    {/* User Filter */}
                    <div>
                        <label
                            style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 500,
                                marginBottom: '6px',
                                color: 'rgba(255, 255, 255, 0.7)',
                            }}
                        >
                            User
                        </label>
                        <select
                            value={filters.userId || ''}
                            onChange={(e) => updateFilter('userId', e.target.value)}
                            className="glass-input"
                            style={{ width: '100%' }}
                        >
                            <option value="">All Users</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name} ({user.email})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Category Filter */}
                    <div>
                        <label
                            style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 500,
                                marginBottom: '6px',
                                color: 'rgba(255, 255, 255, 0.7)',
                            }}
                        >
                            Category
                        </label>
                        <select
                            value={filters.actionCategory || ''}
                            onChange={(e) => updateFilter('actionCategory', e.target.value)}
                            className="glass-input"
                            style={{ width: '100%' }}
                        >
                            {ACTION_CATEGORIES.map((cat) => (
                                <option key={cat.value} value={cat.value}>
                                    {cat.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Action Type Filter */}
                    <div>
                        <label
                            style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 500,
                                marginBottom: '6px',
                                color: 'rgba(255, 255, 255, 0.7)',
                            }}
                        >
                            Action Type
                        </label>
                        <select
                            value={filters.actionType || ''}
                            onChange={(e) => updateFilter('actionType', e.target.value)}
                            className="glass-input"
                            style={{ width: '100%' }}
                        >
                            {filteredActionTypes.map((at) => (
                                <option key={at.value} value={at.value}>
                                    {at.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Date Range */}
                    <div>
                        <label
                            style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 500,
                                marginBottom: '6px',
                                color: 'rgba(255, 255, 255, 0.7)',
                            }}
                        >
                            Date Range
                        </label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="glass-input"
                                style={{ flex: 1 }}
                            />
                            <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px' }}>to</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="glass-input"
                                style={{ flex: 1 }}
                            />
                            <button
                                onClick={applyDateFilter}
                                className="btn btn-primary"
                                style={{ padding: '8px 12px', fontSize: '13px' }}
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* DataTable */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <DataTable
                    data={logs}
                    columns={columns}
                    rowKey={(row) => row.id}
                    emptyState={{
                        title: hasActiveFilters ? 'No activity found' : 'No activity yet',
                        message: hasActiveFilters
                            ? 'Try adjusting your filters'
                            : 'Activity will appear here as users interact with the system',
                        icon: 'document',
                    }}
                />

                {/* Pagination */}
                {totalPages > 1 && (
                    <div
                        style={{
                            padding: '16px 24px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
                            Showing {((currentPage - 1) * pageSize + 1).toLocaleString()} to{' '}
                            {Math.min(currentPage * pageSize, count).toLocaleString()} of{' '}
                            {count.toLocaleString()} entries
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '14px' }}
                            >
                                Previous
                            </button>
                            <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '14px' }}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
