/**
 * ActivityLogTab - Admin audit-trail viewer
 *
 * Features: free-text search, category filter, user filter, date range, page-size
 * control, CSV export of the filtered set, and a per-row drill-down showing the
 * captured before/after diff. Actor identity is resolved by join (PII not cached).
 */

import { useState, useMemo, useEffect, Fragment } from 'react';
import { useActivityLogs, useActivityUsers } from '../../../hooks/queries/useActivityLog';
import { getActivityLogsForExport } from '../../../services/activity-log-service';
import { DataTable, Column } from '../../../components/ui/DataTable/DataTable';
import { SectionSpinner } from '../../../components/ui/LoadingSpinner';
import { ErrorDisplay } from '../../../components/ui/ErrorDisplay';
import type {
    ActivityLogEntry,
    ActionCategory,
    ActivityLogFilters,
} from '../../../services/activity-log-service';

// Category options for the filter (single source of truth, mirrors the DB taxonomy)
const ACTION_CATEGORIES: { value: ActionCategory | ''; label: string }[] = [
    { value: '', label: 'All Categories' },
    { value: 'auth', label: 'Authentication' },
    { value: 'security', label: 'Security' },
    { value: 'profile', label: 'Profile' },
    { value: 'competency', label: 'Competency' },
    { value: 'admin', label: 'Administration' },
    { value: 'asset', label: 'Assets' },
    { value: 'inspection', label: 'Inspection' },
    { value: 'document', label: 'Documents' },
    { value: 'config', label: 'Configuration' },
    { value: 'data', label: 'Data / Exports' },
];

// Category badge colors (industrial theme). security/admin/data are amber to stand out.
const CATEGORY_COLORS: Record<ActionCategory, { bg: string; text: string }> = {
    auth: { bg: 'rgba(53, 160, 88, 0.18)', text: 'var(--green-bright)' },
    security: { bg: 'rgba(245, 158, 11, 0.18)', text: 'var(--amber)' },
    profile: { bg: 'rgba(53, 160, 88, 0.12)', text: 'var(--green)' },
    competency: { bg: 'rgba(53, 160, 88, 0.18)', text: 'var(--green-bright)' },
    admin: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--amber)' },
    asset: { bg: 'rgba(53, 160, 88, 0.14)', text: 'var(--green)' },
    inspection: { bg: 'rgba(53, 160, 88, 0.18)', text: 'var(--green-bright)' },
    document: { bg: 'rgba(53, 160, 88, 0.12)', text: 'var(--green)' },
    config: { bg: 'rgba(53, 160, 88, 0.10)', text: 'rgba(53, 160, 88, 0.55)' },
    data: { bg: 'rgba(245, 158, 11, 0.18)', text: 'var(--amber)' },
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const labelMuted = { display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'rgba(53, 160, 88, 0.45)' } as const;

function titleCase(value: string): string {
    return value
        .split(/[_\s]+/)
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
        .join(' ');
}

/** Render the captured details: a before/after diff, a delete snapshot, or key/value pairs. */
function DetailsView({ details }: { details: Record<string, unknown> | null }) {
    if (!details || Object.keys(details).length === 0) {
        return <span style={{ color: 'rgba(53, 160, 88, 0.45)', fontSize: '13px' }}>No additional details.</span>;
    }

    const changes = (details as { changes?: Record<string, { old?: unknown; new?: unknown; changed?: boolean; pii_redacted?: boolean }> }).changes;

    if (changes && typeof changes === 'object') {
        return (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ color: 'rgba(53, 160, 88, 0.45)', textAlign: 'left' }}>
                        <th style={{ padding: '4px 12px 4px 0', fontWeight: 600 }}>Field</th>
                        <th style={{ padding: '4px 12px', fontWeight: 600 }}>Before</th>
                        <th style={{ padding: '4px 12px', fontWeight: 600 }}>After</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(changes).map(([field, change]) => {
                        const redacted = change?.pii_redacted;
                        const bulkOnly = change?.changed && change.old === undefined && change.new === undefined;
                        return (
                            <tr key={field} style={{ borderTop: '1px solid rgba(53, 160, 88, 0.15)' }}>
                                <td style={{ padding: '4px 12px 4px 0', color: 'var(--green)' }}>{titleCase(field)}</td>
                                {redacted || bulkOnly ? (
                                    <td colSpan={2} style={{ padding: '4px 12px', color: 'rgba(53, 160, 88, 0.45)', fontStyle: 'italic' }}>
                                        {redacted ? 'changed (value redacted)' : 'changed'}
                                    </td>
                                ) : (
                                    <>
                                        <td style={{ padding: '4px 12px', color: 'rgba(245, 158, 11, 0.85)', fontFamily: 'monospace' }}>{formatValue(change?.old)}</td>
                                        <td style={{ padding: '4px 12px', color: 'var(--green-bright)', fontFamily: 'monospace' }}>{formatValue(change?.new)}</td>
                                    </>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        );
    }

    // Generic key/value rendering (edge-function details, delete snapshots, etc.)
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: '13px' }}>
            {Object.entries(details).map(([key, value]) => (
                <Fragment key={key}>
                    <span style={{ color: 'var(--green)' }}>{titleCase(key)}</span>
                    <span style={{ color: 'rgba(53, 160, 88, 0.70)', fontFamily: 'monospace', wordBreak: 'break-word' }}>{formatValue(value)}</span>
                </Fragment>
            ))}
        </div>
    );
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function csvEscape(value: string): string {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
}

export default function ActivityLogTab() {
    const [filters, setFilters] = useState<ActivityLogFilters>({});
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Local input state (debounced search; apply-button date range)
    const [searchInput, setSearchInput] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    const { data: logsData, isLoading, error } = useActivityLogs(filters, currentPage, pageSize);
    const { data: users = [] } = useActivityUsers();

    // Debounce the free-text search into filters.
    useEffect(() => {
        const handle = setTimeout(() => {
            setFilters((prev) => {
                const next = searchInput.trim() || undefined;
                if (prev.searchQuery === next) return prev;
                return { ...prev, searchQuery: next };
            });
            setCurrentPage(1);
        }, 300);
        return () => clearTimeout(handle);
    }, [searchInput]);

    const updateFilter = (key: keyof ActivityLogFilters, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value || undefined }));
        setCurrentPage(1);
    };

    const applyDateFilter = () => {
        setFilters((prev) => ({
            ...prev,
            startDate: startDate || undefined,
            endDate: endDate ? `${endDate}T23:59:59` : undefined,
        }));
        setCurrentPage(1);
    };

    const clearFilters = () => {
        setFilters({});
        setSearchInput('');
        setStartDate('');
        setEndDate('');
        setCurrentPage(1);
    };

    const hasActiveFilters = Object.keys(filters).some(
        (key) => filters[key as keyof ActivityLogFilters] !== undefined
    );

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const rows = await getActivityLogsForExport(filters);
            const header = ['Timestamp', 'Actor', 'Role', 'Category', 'Action', 'Entity Type', 'Entity', 'Description'];
            const lines = rows.map((r) =>
                [
                    new Date(r.created_at).toISOString(),
                    r.actor?.username || (r.user_id ? 'Deleted user' : 'System'),
                    r.actor_role || '',
                    r.action_category,
                    r.action_type,
                    r.entity_type || '',
                    r.entity_name || '',
                    r.description,
                ].map((v) => csvEscape(String(v))).join(',')
            );
            const csv = [header.join(','), ...lines].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setIsExporting(false);
        }
    };

    const columns = useMemo<Column<ActivityLogEntry>[]>(
        () => [
            {
                key: 'timestamp',
                header: 'Time',
                width: '150px',
                render: (row) => (
                    <div>
                        <p style={{ fontWeight: 500, color: 'rgba(53, 160, 88, 0.70)', fontSize: '13px' }}>
                            {new Date(row.created_at).toLocaleDateString()}
                        </p>
                        <p style={{ fontSize: '12px', color: 'rgba(53, 160, 88, 0.45)' }}>
                            {new Date(row.created_at).toLocaleTimeString()}
                        </p>
                    </div>
                ),
            },
            {
                key: 'user',
                header: 'Actor',
                width: '190px',
                render: (row) => (
                    <div>
                        <p style={{ fontWeight: 500, color: 'rgba(53, 160, 88, 0.70)', fontSize: '13px' }}>
                            {row.actor?.username || (row.user_id ? 'Deleted user' : 'System')}
                        </p>
                        <p style={{ fontSize: '12px', color: 'rgba(53, 160, 88, 0.45)' }}>
                            {row.actor_role || '—'}
                        </p>
                    </div>
                ),
            },
            {
                key: 'category',
                header: 'Category',
                width: '120px',
                align: 'center',
                render: (row) => {
                    const colors = CATEGORY_COLORS[row.action_category];
                    return (
                        <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, backgroundColor: colors?.bg || 'rgba(53, 160, 88, 0.10)', color: colors?.text || 'rgba(53, 160, 88, 0.45)' }}>
                            {titleCase(row.action_category)}
                        </span>
                    );
                },
            },
            {
                key: 'action',
                header: 'Action',
                width: '170px',
                render: (row) => (
                    <span style={{ color: 'rgba(53, 160, 88, 0.70)', fontSize: '13px' }}>{titleCase(row.action_type)}</span>
                ),
            },
            {
                key: 'description',
                header: 'Description',
                render: (row) => (
                    <p style={{ color: 'rgba(53, 160, 88, 0.55)', fontSize: '13px', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description}>
                        {row.description}
                    </p>
                ),
            },
            {
                key: 'entity',
                header: 'Entity',
                width: '150px',
                render: (row) =>
                    row.entity_name || row.entity_type ? (
                        <div>
                            <p style={{ fontSize: '11px', color: 'rgba(53, 160, 88, 0.35)', textTransform: 'uppercase' }}>
                                {row.entity_type ? titleCase(row.entity_type) : ''}
                            </p>
                            <p style={{ color: 'rgba(53, 160, 88, 0.70)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.entity_name || ''}>
                                {row.entity_name || '—'}
                            </p>
                        </div>
                    ) : (
                        <span style={{ color: 'rgba(53, 160, 88, 0.30)' }}>—</span>
                    ),
            },
        ],
        []
    );

    const renderExpanded = (row: ActivityLogEntry) => (
        <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 24px', fontSize: '13px' }}>
                <div><span style={labelMuted}>Action</span><span style={{ color: 'var(--green)' }}>{titleCase(row.action_type)}</span></div>
                <div><span style={labelMuted}>Actor</span><span style={{ color: 'var(--green)' }}>{row.actor?.username || (row.user_id ? 'Deleted user' : 'System')}{row.actor?.email ? ` · ${row.actor.email}` : ''}</span></div>
                <div><span style={labelMuted}>Entity</span><span style={{ color: 'var(--green)' }}>{row.entity_type ? titleCase(row.entity_type) : '—'}{row.entity_name ? `: ${row.entity_name}` : ''}</span></div>
                <div><span style={labelMuted}>When</span><span style={{ color: 'var(--green)' }}>{new Date(row.created_at).toLocaleString()}</span></div>
            </div>
            <div>
                <span style={labelMuted}>Details</span>
                <DetailsView details={row.details} />
            </div>
        </div>
    );

    if (isLoading && !logsData) {
        return <SectionSpinner message="Loading activity logs..." />;
    }
    if (error) {
        return <ErrorDisplay error={error} title="Failed to load activity logs" />;
    }

    const { data: logs = [], count = 0, totalPages = 1 } = logsData || {};

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'rgba(53, 160, 88, 0.70)' }}>Activity Log</h2>
                    <p style={{ fontSize: '14px', color: 'rgba(53, 160, 88, 0.45)', marginTop: '4px' }}>
                        {count.toLocaleString()} {count === 1 ? 'entry' : 'entries'} · click a row for details
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="ad-btn">Clear Filters</button>
                    )}
                    <button onClick={handleExport} className="ad-btn primary" disabled={isExporting || count === 0}>
                        {isExporting ? 'Exporting…' : 'Export CSV'}
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div style={{ padding: '16px', border: '1px solid rgba(53, 160, 88, 0.30)', borderRadius: '6px', background: 'rgba(53, 160, 88, 0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    {/* Search */}
                    <div>
                        <label style={labelMuted}>Search</label>
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Description, action, entity…"
                            className="ad-input"
                            style={{ width: '100%' }}
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label style={labelMuted}>Category</label>
                        <select value={filters.actionCategory || ''} onChange={(e) => updateFilter('actionCategory', e.target.value)} className="ad-input" style={{ width: '100%' }}>
                            {ACTION_CATEGORIES.map((cat) => (
                                <option key={cat.value} value={cat.value}>{cat.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* User */}
                    <div>
                        <label style={labelMuted}>Actor</label>
                        <select value={filters.userId || ''} onChange={(e) => updateFilter('userId', e.target.value)} className="ad-input" style={{ width: '100%' }}>
                            <option value="">All Actors</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>{user.name}{user.email ? ` (${user.email})` : ''}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Range */}
                    <div>
                        <label style={labelMuted}>Date Range</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="ad-input" style={{ flex: 1 }} />
                            <span style={{ color: 'rgba(53, 160, 88, 0.45)', fontSize: '12px' }}>to</span>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="ad-input" style={{ flex: 1 }} />
                            <button onClick={applyDateFilter} className="ad-btn primary" style={{ padding: '8px 12px', fontSize: '13px' }}>Apply</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* DataTable */}
            <div style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(53, 160, 88, 0.30)', borderRadius: '6px', background: 'rgba(53, 160, 88, 0.05)' }}>
                <DataTable
                    data={logs}
                    columns={columns}
                    rowKey={(row) => row.id}
                    expandable
                    renderExpandedContent={renderExpanded}
                    emptyState={{
                        title: hasActiveFilters ? 'No activity found' : 'No activity yet',
                        message: hasActiveFilters ? 'Try adjusting your filters' : 'Activity will appear here as users interact with the system',
                        icon: 'document',
                    }}
                />

                {/* Footer: page size + pagination */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(53, 160, 88, 0.30)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '14px', color: 'rgba(53, 160, 88, 0.45)' }}>
                            {count > 0
                                ? `Showing ${((currentPage - 1) * pageSize + 1).toLocaleString()}–${Math.min(currentPage * pageSize, count).toLocaleString()} of ${count.toLocaleString()}`
                                : 'No entries'}
                        </span>
                        <select
                            value={pageSize}
                            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                            className="ad-input"
                            style={{ padding: '4px 8px', fontSize: '13px' }}
                        >
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <option key={size} value={size}>{size} / page</option>
                            ))}
                        </select>
                    </div>
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="ad-btn" style={{ padding: '6px 12px', fontSize: '14px' }}>Previous</button>
                            <span style={{ fontSize: '14px', color: 'rgba(53, 160, 88, 0.45)' }}>Page {currentPage} of {totalPages}</span>
                            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="ad-btn" style={{ padding: '6px 12px', fontSize: '14px' }}>Next</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
