/**
 * PersonnelPage - Personnel management page using React Query
 *
 * This is the modernized version of PersonnelManagementPage.jsx
 * Uses React Query for data fetching and extracted components
 */

import { useState, useCallback, useMemo } from 'react';
import { PageHeader } from '../../components/ui';

// React Query hooks
import {
    usePersonnel,
    useOrganizations,
    getCompetencyStats,
    type Person,
    type PersonCompetency,
} from '../../hooks/queries/usePersonnel';
import { useCompetencyDefinitions, useExpiringCompetencies, usePendingApprovals } from '../../hooks/queries/useCompetencies';
import { exportPersonnelToCSV } from '../../hooks/mutations';

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

// Import modal
import UniversalImportModal from '../../components/UniversalImportModal.jsx';

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

    // Modal state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importSuccess, setImportSuccess] = useState(false);

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

    // Handle export
    const handleExport = useCallback(async () => {
        const filteredData = filterAndSortPersonnel(
            personnelQuery.data || [],
            searchTerm,
            filterOrg,
            filterRole,
            filterCompetencies,
            sortColumn,
            sortDirection
        );
        try {
            await exportPersonnelToCSV(filteredData);
        } catch {
            alert('Failed to export data');
        }
    }, [personnelQuery.data, searchTerm, filterOrg, filterRole, filterCompetencies, sortColumn, sortDirection]);

    // Handle import complete
    const handleImportComplete = useCallback(() => {
        setShowImportModal(false);
        setImportSuccess(true);
        setView('directory');
        personnelQuery.refetch();
        setTimeout(() => setImportSuccess(false), 5000);
    }, [personnelQuery]);

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
            <div className="h-full flex flex-col">
                <PageHeader title="Personnel Management" subtitle="Manage employee competencies, certifications, and training records" />
                <div className="flex-1 flex items-center justify-center">
                    <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
                        <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            Personnel management requires Supabase backend configuration.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Loading state
    if (personnelQuery.isLoading) {
        return (
            <div className="h-full flex flex-col">
                <PageHeader title="Personnel Management" subtitle="Manage employee competencies, certifications, and training records" />
                <div className="flex-1 flex items-center justify-center">
                    <PageSpinner message="Loading personnel data..." />
                </div>
            </div>
        );
    }

    // Error state
    if (personnelQuery.error) {
        return (
            <div className="h-full flex flex-col">
                <PageHeader title="Personnel Management" subtitle="Manage employee competencies, certifications, and training records" />
                <div className="flex-1 flex items-center justify-center p-6">
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
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <PageHeader title="Personnel Management" subtitle="Manage employee competencies, certifications, and training records" />

            {/* Navigation Tabs */}
            <div
                className="glass-panel"
                style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 0,
                    flexShrink: 0,
                    padding: 0,
                }}
            >
                <div className="flex px-6">
                    <button
                        onClick={() => setView('directory')}
                        className="tab-btn px-4 py-3 text-sm font-medium border-b-2"
                        style={{
                            borderColor: view === 'directory' ? 'var(--accent-primary)' : 'transparent',
                            color: view === 'directory' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)',
                        }}
                    >
                        Personnel Directory
                    </button>
                    <button
                        onClick={() => setView('expiring')}
                        className="tab-btn px-4 py-3 text-sm font-medium border-b-2"
                        style={{
                            borderColor: view === 'expiring' ? 'var(--accent-primary)' : 'transparent',
                            color: view === 'expiring' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)',
                        }}
                    >
                        Expiring Certifications
                        {(expiringQuery.data?.length || 0) > 0 && (
                            <span className="ml-2 glass-badge badge-red text-xs">
                                {expiringQuery.data?.length}
                            </span>
                        )}
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setView('approvals')}
                            className="tab-btn px-4 py-3 text-sm font-medium border-b-2"
                            style={{
                                borderColor: view === 'approvals' ? 'var(--accent-primary)' : 'transparent',
                                color: view === 'approvals' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)',
                            }}
                        >
                            Pending Approvals
                            {(pendingApprovalsQuery.data?.length || 0) > 0 && (
                                <span className="ml-2 glass-badge badge-yellow text-xs">
                                    {pendingApprovalsQuery.data?.length}
                                </span>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto glass-scrollbar p-6">
                {view === 'directory' ? (
                    <>
                        {/* Stats Cards */}
                        <div className="stats-compact" style={{ marginBottom: '24px' }}>
                            <div className="stat-compact">
                                <div className="stat-compact__icon stat-compact__icon--primary">
                                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <div className="stat-compact__content">
                                    <div className="stat-compact__label">Total Personnel</div>
                                    <div className="stat-compact__value">{filteredPersonnel.length}</div>
                                </div>
                            </div>

                            <div className="stat-compact">
                                <div className="stat-compact__icon stat-compact__icon--success">
                                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div className="stat-compact__content">
                                    <div className="stat-compact__label">Active Certs</div>
                                    <div className="stat-compact__value">
                                        {filteredPersonnel.reduce((sum, p) => sum + getFilteredCompetencyStats(p.competencies || []).active, 0)}
                                    </div>
                                </div>
                            </div>

                            <div className="stat-compact">
                                <div className="stat-compact__icon stat-compact__icon--warning">
                                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div className="stat-compact__content">
                                    <div className="stat-compact__label">Expiring Soon</div>
                                    <div className="stat-compact__value">
                                        {filteredPersonnel.reduce((sum, p) => sum + getFilteredCompetencyStats(p.competencies || []).expiring, 0)}
                                    </div>
                                </div>
                            </div>

                            <div className="stat-compact">
                                <div className="stat-compact__icon stat-compact__icon--danger">
                                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div className="stat-compact__content">
                                    <div className="stat-compact__label">Expired</div>
                                    <div className="stat-compact__value">
                                        {filteredPersonnel.reduce((sum, p) => sum + getFilteredCompetencyStats(p.competencies || []).expired, 0)}
                                    </div>
                                </div>
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
                            onImport={() => setShowImportModal(true)}
                            onExport={handleExport}
                            canImport={isAdmin}
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

            {/* Import Modal */}
            {showImportModal && (
                <UniversalImportModal
                    onClose={() => setShowImportModal(false)}
                    onComplete={handleImportComplete}
                />
            )}

            {/* Import Success Toast */}
            {importSuccess && (
                <div
                    style={{
                        position: 'fixed',
                        top: '20px',
                        right: '20px',
                        zIndex: 9999,
                        padding: '16px 24px',
                        background: 'rgba(16, 185, 129, 0.95)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: '12px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                        color: '#ffffff',
                        fontSize: '15px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        animation: 'slideInRight 0.3s ease-out',
                    }}
                >
                    <svg
                        style={{ width: '24px', height: '24px' }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    Personnel imported successfully! Check the directory below.
                </div>
            )}
        </div>
    );
}
