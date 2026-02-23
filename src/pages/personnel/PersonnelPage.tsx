/**
 * PersonnelPage - Personnel management page using React Query
 *
 * This is the modernized version of PersonnelManagementPage.jsx
 * Uses React Query for data fetching and extracted components
 */

import { useState, useCallback, useMemo } from 'react';
import './personnel.css';

// React Query hooks
import {
    usePersonnel,
    useOrganizations,
    getCompetencyStats,
    type Person,
    type PersonCompetency,
} from '../../hooks/queries/usePersonnel';
import { useCompetencyDefinitions, useExpiringCompetencies, usePendingApprovals } from '../../hooks/queries/useCompetencies';
// Components
import { PageSpinner, ErrorDisplay } from '../../components/ui';
import { PersonnelFilters, type CompetencyDefinition } from './PersonnelFilters';
import { PersonnelTable } from './PersonnelTable';
import { ExpiringView, type ExpiringCompetency } from './ExpiringView';
import { PendingApprovalsView } from './PendingApprovalsView';

// Auth
import { useAuth } from '../../contexts/AuthContext';
import { isSupabaseConfigured } from '../../supabase-client.js';
import { filterOutPersonalDetails } from '../../utils/competency-field-utils.js';

type ViewType = 'directory' | 'expiring' | 'approvals';
type SortColumn = 'name' | 'org' | 'role' | 'total' | 'active' | 'expiring' | 'expired';
type SortDirection = 'asc' | 'desc';

/**
 * Filter and sort personnel
 */
function filterAndSortPersonnel(
    personnel: Person[],
    searchTerm: string,
    filterOrg: string,
    filterRole: string,
    filterCompetencies: string[],
    sortColumn: SortColumn,
    sortDirection: SortDirection
): Person[] {
    // Filter
    const filtered = personnel.filter((person) => {
        const matchesSearch =
            !searchTerm ||
            person.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            person.email?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesOrg = filterOrg === 'all' || person.organization_id === filterOrg;
        const matchesRole = filterRole === 'all' || person.role === filterRole;

        // Filter by competencies - person must have ALL selected competencies
        const matchesCompetencies =
            filterCompetencies.length === 0 ||
            filterCompetencies.every((compId) =>
                person.competencies?.some(
                    (c) =>
                        c.competency_id === compId &&
                        (c.status === 'active' || (c.expiry_date && new Date(c.expiry_date) >= new Date()))
                )
            );

        return matchesSearch && matchesOrg && matchesRole && matchesCompetencies;
    });

    // Sort
    return filtered.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        const aComps = filterOutPersonalDetails(a.competencies || []);
        const bComps = filterOutPersonalDetails(b.competencies || []);

        switch (sortColumn) {
            case 'name':
                aValue = (a.username || '').toLowerCase();
                bValue = (b.username || '').toLowerCase();
                break;
            case 'org':
                aValue = (a.organizations?.name || '').toLowerCase();
                bValue = (b.organizations?.name || '').toLowerCase();
                break;
            case 'role':
                aValue = (a.role || '').toLowerCase();
                bValue = (b.role || '').toLowerCase();
                break;
            case 'total':
                aValue = getCompetencyStats(aComps).total;
                bValue = getCompetencyStats(bComps).total;
                break;
            case 'active':
                aValue = getCompetencyStats(aComps).active;
                bValue = getCompetencyStats(bComps).active;
                break;
            case 'expiring':
                aValue = getCompetencyStats(aComps).expiring;
                bValue = getCompetencyStats(bComps).expiring;
                break;
            case 'expired':
                aValue = getCompetencyStats(aComps).expired;
                bValue = getCompetencyStats(bComps).expired;
                break;
            default:
                return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

/**
 * PersonnelPage component
 */
export default function PersonnelPage() {
    // View state
    const [view, setView] = useState<ViewType>('directory');

    // Filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [filterOrg, setFilterOrg] = useState('all');
    const [filterRole, setFilterRole] = useState('all');
    const [filterCompetencies, setFilterCompetencies] = useState<string[]>([]);

    // Sort state
    const [sortColumn, setSortColumn] = useState<SortColumn>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Auth - reactive via useAuth hook
    const { isAdmin } = useAuth();

    // React Query hooks
    const personnelQuery = usePersonnel();
    const organizationsQuery = useOrganizations();
    const definitionsQuery = useCompetencyDefinitions();
    const expiringQuery = useExpiringCompetencies(30);
    const pendingApprovalsQuery = usePendingApprovals();

    // Handle sort
    const handleSort = useCallback((column: string) => {
        setSortColumn((prev) => {
            if (prev === column) {
                setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                return prev;
            }
            setSortDirection('asc');
            return column as SortColumn;
        });
    }, []);

    // Get competency stats (filtered version)
    const getFilteredCompetencyStats = useCallback((competencies: PersonCompetency[]) => {
        const filtered = filterOutPersonalDetails(competencies);
        return getCompetencyStats(filtered);
    }, []);

    // Filtered personnel (memoized)
    const filteredPersonnel = useMemo(
        () =>
            filterAndSortPersonnel(
                personnelQuery.data || [],
                searchTerm,
                filterOrg,
                filterRole,
                filterCompetencies,
                sortColumn,
                sortDirection
            ),
        [personnelQuery.data, searchTerm, filterOrg, filterRole, filterCompetencies, sortColumn, sortDirection]
    );

    // Not configured state
    if (!isSupabaseConfigured()) {
        return (
            <div className="h-full overflow-y-auto glass-scrollbar" style={{ padding: '32px 40px' }}>
                <div className="pm-header">
                    <div className="pm-header-left">
                        <div className="pm-logo">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <div className="pm-header-text">
                            <h1>Personnel Management</h1>
                            <p>Manage employee competencies, certifications, and training records</p>
                        </div>
                    </div>
                </div>
                <div className="pm-empty">
                    <p className="pm-empty-text">Personnel management requires Supabase backend configuration.</p>
                </div>
            </div>
        );
    }

    // Loading state
    if (personnelQuery.isLoading) {
        return (
            <div className="h-full overflow-y-auto glass-scrollbar" style={{ padding: '32px 40px' }}>
                <div className="pm-header">
                    <div className="pm-header-left">
                        <div className="pm-logo">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <div className="pm-header-text">
                            <h1>Personnel Management</h1>
                            <p>Manage employee competencies, certifications, and training records</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-center" style={{ minHeight: '300px' }}>
                    <PageSpinner message="Loading personnel data..." />
                </div>
            </div>
        );
    }

    // Error state
    if (personnelQuery.error) {
        return (
            <div className="h-full overflow-y-auto glass-scrollbar" style={{ padding: '32px 40px' }}>
                <div className="pm-header">
                    <div className="pm-header-left">
                        <div className="pm-logo">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <div className="pm-header-text">
                            <h1>Personnel Management</h1>
                            <p>Manage employee competencies, certifications, and training records</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-center" style={{ minHeight: '300px' }}>
                    <ErrorDisplay
                        error={personnelQuery.error}
                        title="Failed to load personnel"
                        onRetry={() => personnelQuery.refetch()}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto glass-scrollbar" style={{ padding: '32px 40px' }}>
            {/* Header */}
            <div className="pm-header">
                <div className="pm-header-left">
                    <div className="pm-logo">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                    <div className="pm-header-text">
                        <h1>Personnel Management</h1>
                        <p>Manage employee competencies, certifications, and training records</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ marginBottom: '28px' }}>
                <div className="pm-tabs">
                    <button
                        className={`pm-tab ${view === 'directory' ? 'active' : ''}`}
                        onClick={() => setView('directory')}
                    >
                        Personnel Directory
                    </button>
                    <button
                        className={`pm-tab ${view === 'expiring' ? 'active' : ''}`}
                        onClick={() => setView('expiring')}
                    >
                        Expiring Certifications
                        {(expiringQuery.data?.length || 0) > 0 && (
                            <span className="pm-tab-badge red">{expiringQuery.data?.length}</span>
                        )}
                    </button>
                    {isAdmin && (
                        <button
                            className={`pm-tab ${view === 'approvals' ? 'active' : ''}`}
                            onClick={() => setView('approvals')}
                        >
                            Pending Approvals
                            {(pendingApprovalsQuery.data?.length || 0) > 0 && (
                                <span className="pm-tab-badge yellow">{pendingApprovalsQuery.data?.length}</span>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            {view === 'directory' ? (
                <>
                    {/* Stats Cards */}
                    <div className="pm-stats-grid">
                        <div className="pm-stat-card total">
                            <div className="pm-stat-icon">
                                <svg viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                            <div className="pm-stat-value">{filteredPersonnel.length}</div>
                            <div className="pm-stat-label">Total Personnel</div>
                        </div>

                        <div className="pm-stat-card active">
                            <div className="pm-stat-icon">
                                <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div className="pm-stat-value">
                                {filteredPersonnel.reduce((sum, p) => sum + getFilteredCompetencyStats(p.competencies || []).active, 0)}
                            </div>
                            <div className="pm-stat-label">Active Certs</div>
                        </div>

                        <div className="pm-stat-card expiring">
                            <div className="pm-stat-icon">
                                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            </div>
                            <div className="pm-stat-value">
                                {filteredPersonnel.reduce((sum, p) => sum + getFilteredCompetencyStats(p.competencies || []).expiring, 0)}
                            </div>
                            <div className="pm-stat-label">Expiring Soon</div>
                        </div>

                        <div className="pm-stat-card expired">
                            <div className="pm-stat-icon">
                                <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                            </div>
                            <div className="pm-stat-value">
                                {filteredPersonnel.reduce((sum, p) => sum + getFilteredCompetencyStats(p.competencies || []).expired, 0)}
                            </div>
                            <div className="pm-stat-label">Expired</div>
                        </div>
                    </div>

                    {/* Filters */}
                    <PersonnelFilters
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        filterOrg={filterOrg}
                        onOrgChange={setFilterOrg}
                        filterRole={filterRole}
                        onRoleChange={setFilterRole}
                        filterCompetencies={filterCompetencies}
                        onCompetenciesChange={setFilterCompetencies}
                        organizations={organizationsQuery.data || []}
                        competencyDefinitions={(definitionsQuery.data as CompetencyDefinition[]) || []}
                    />

                    {/* Table */}
                    <div style={{ marginTop: '16px' }}>
                        <PersonnelTable
                            personnel={filteredPersonnel}
                            getCompetencyStats={getFilteredCompetencyStats}
                            sortColumn={sortColumn}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            isAdmin={isAdmin}
                            organizations={organizationsQuery.data || []}
                            onPersonUpdate={() => personnelQuery.refetch()}
                        />
                    </div>
                </>
            ) : view === 'expiring' ? (
                <ExpiringView
                    expiringCompetencies={(expiringQuery.data as ExpiringCompetency[]) || []}
                    personnel={personnelQuery.data || []}
                />
            ) : view === 'approvals' && isAdmin ? (
                <PendingApprovalsView
                    pendingApprovals={pendingApprovalsQuery.data || []}
                    onRefresh={() => pendingApprovalsQuery.refetch()}
                />
            ) : null}

        </div>
    );
}
