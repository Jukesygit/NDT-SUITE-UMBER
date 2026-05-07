/**
 * PersonnelPage - Personnel management page
 * Industrial instrument theme: chassis > panel > display well hierarchy
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
import { isSupabaseConfigured } from '../../supabase-client';
import { filterOutPersonalDetails } from '../../utils/competency-field-utils';

type ViewType = 'directory' | 'expiring' | 'approvals';
type SortColumn = 'name' | 'org' | 'role' | 'total' | 'active' | 'expiring' | 'expired';
type SortDirection = 'asc' | 'desc';

/** Quick filter identifiers */
export type QuickFilter = 'irata-l1' | 'irata-l2' | 'irata-l3' | 'paut-l2' | 'tofd-l2';

function hasValidExpiry(c: PersonCompetency, now: Date): boolean {
    return !!c.expiry_date && new Date(c.expiry_date) >= now;
}

function matchesQuickFilter(person: Person, filter: QuickFilter): boolean {
    const now = new Date();
    const comps = person.competencies || [];

    switch (filter) {
        case 'irata-l1':
        case 'irata-l2':
        case 'irata-l3': {
            const level = filter.replace('irata-', '').toUpperCase();
            return comps.some(
                (c) =>
                    c.competency?.name?.toUpperCase().includes('IRATA') &&
                    c.level === level &&
                    hasValidExpiry(c, now)
            );
        }
        case 'paut-l2':
            return comps.some(
                (c) =>
                    c.competency?.name?.toUpperCase().includes('PAUT L2') &&
                    hasValidExpiry(c, now)
            );
        case 'tofd-l2':
            return comps.some(
                (c) =>
                    c.competency?.name?.toUpperCase().includes('TOFD L2') &&
                    hasValidExpiry(c, now)
            );
    }
}

function filterAndSortPersonnel(
    personnel: Person[],
    searchTerm: string,
    filterOrg: string,
    filterRole: string,
    filterCompetencies: string[],
    quickFilters: QuickFilter[],
    sortColumn: SortColumn,
    sortDirection: SortDirection
): Person[] {
    const now = new Date();

    const filtered = personnel.filter((person) => {
        const matchesSearch =
            !searchTerm ||
            person.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            person.email?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesOrg = filterOrg === 'all' || person.organization_id === filterOrg;
        const matchesRole = filterRole === 'all' || person.role === filterRole;

        const matchesCompetencies =
            filterCompetencies.length === 0 ||
            filterCompetencies.every((compId) =>
                person.competencies?.some(
                    (c) =>
                        c.competency_id === compId &&
                        (c.status === 'active' || (c.expiry_date && new Date(c.expiry_date) >= now))
                )
            );

        const matchesQuickFilters =
            quickFilters.length === 0 ||
            quickFilters.every((qf) => matchesQuickFilter(person, qf));

        return matchesSearch && matchesOrg && matchesRole && matchesCompetencies && matchesQuickFilters;
    });

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

export default function PersonnelPage() {
    const [view, setView] = useState<ViewType>('directory');

    const [searchTerm, setSearchTerm] = useState('');
    const [filterOrg, setFilterOrg] = useState('all');
    const [filterRole, setFilterRole] = useState('all');
    const [filterCompetencies, setFilterCompetencies] = useState<string[]>([]);
    const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);

    const [sortColumn, setSortColumn] = useState<SortColumn>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const { isAdmin } = useAuth();

    const personnelQuery = usePersonnel();
    const organizationsQuery = useOrganizations();
    const definitionsQuery = useCompetencyDefinitions();
    const expiringQuery = useExpiringCompetencies(30);
    const pendingApprovalsQuery = usePendingApprovals();

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

    const getFilteredCompetencyStats = useCallback((competencies: PersonCompetency[]) => {
        const filtered = filterOutPersonalDetails(competencies);
        return getCompetencyStats(filtered);
    }, []);

    const handleQuickFilterToggle = useCallback((filter: QuickFilter) => {
        setQuickFilters((prev) =>
            prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
        );
    }, []);

    const filteredPersonnel = useMemo(
        () =>
            filterAndSortPersonnel(
                personnelQuery.data || [],
                searchTerm,
                filterOrg,
                filterRole,
                filterCompetencies,
                quickFilters,
                sortColumn,
                sortDirection
            ),
        [personnelQuery.data, searchTerm, filterOrg, filterRole, filterCompetencies, quickFilters, sortColumn, sortDirection]
    );

    if (!isSupabaseConfigured()) {
        return (
            <div className="h-full overflow-y-auto glass-scrollbar">
                <div className="pm-chassis">
                    <div className="pm-panel">
                        <div className="pm-header">
                            <div className="pm-header-left">
                                <div className="pm-logo" />
                                <div className="pm-header-text">
                                    <h1>Personnel Management</h1>
                                    <p>Manage employee competencies, certifications, and training records</p>
                                </div>
                            </div>
                        </div>
                        <div className="pm-groove" />
                        <div className="pm-display-well">
                            <div className="pm-display">
                                <div className="pm-empty">
                                    <p className="pm-empty-text">Personnel management requires Supabase backend configuration.</p>
                                </div>
                            </div>
                        </div>
                        <div className="pm-groove" />
                        <div className="pm-nameplate-bar">
                            <span className="pm-nameplate">Matrix Portal</span>
                            <span className="pm-nameplate-model">Personnel Management System</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (personnelQuery.isLoading) {
        return (
            <div className="h-full overflow-y-auto glass-scrollbar">
                <div className="pm-chassis">
                    <div className="pm-panel">
                        <div className="pm-header">
                            <div className="pm-header-left">
                                <div className="pm-logo" />
                                <div className="pm-header-text">
                                    <h1>Personnel Management</h1>
                                    <p>Manage employee competencies, certifications, and training records</p>
                                </div>
                            </div>
                        </div>
                        <div className="pm-groove" />
                        <div className="flex items-center justify-center pm-loading-container">
                            <PageSpinner message="Loading personnel data..." />
                        </div>
                        <div className="pm-groove" />
                        <div className="pm-nameplate-bar">
                            <span className="pm-nameplate">Matrix Portal</span>
                            <span className="pm-nameplate-model">Personnel Management System</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (personnelQuery.error) {
        return (
            <div className="h-full overflow-y-auto glass-scrollbar">
                <div className="pm-chassis">
                    <div className="pm-panel">
                        <div className="pm-header">
                            <div className="pm-header-left">
                                <div className="pm-logo" />
                                <div className="pm-header-text">
                                    <h1>Personnel Management</h1>
                                    <p>Manage employee competencies, certifications, and training records</p>
                                </div>
                            </div>
                        </div>
                        <div className="pm-groove" />
                        <div className="flex items-center justify-center pm-loading-container">
                            <ErrorDisplay
                                error={personnelQuery.error}
                                title="Failed to load personnel"
                                onRetry={() => personnelQuery.refetch()}
                            />
                        </div>
                        <div className="pm-groove" />
                        <div className="pm-nameplate-bar">
                            <span className="pm-nameplate">Matrix Portal</span>
                            <span className="pm-nameplate-model">Personnel Management System</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto glass-scrollbar">
            <div className="pm-chassis">
                <div className="pm-panel">
                    {/* Title Rail */}
                    <div className="pm-header">
                        <div className="pm-header-left">
                            <div className="pm-logo" />
                            <div className="pm-header-text">
                                <h1>Personnel Management</h1>
                                <p>Employees · Competencies · Certifications</p>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="pm-tabs-wrapper">
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
                            {/* Dashboard Row: KPI 2×2 + Filter Rail side-by-side */}
                            <div className="pm-dashboard-row">
                                <div className="pm-stats-grid">
                                    <div className="pm-stat-card total">
                                        <div className="pm-stat-card-inner">
                                            <div className="pm-stat-icon" />
                                            <div className="pm-stat-value">
                                                {String(filteredPersonnel.length).padStart(2, '0')}
                                            </div>
                                            <div className="pm-stat-label">Total Personnel</div>
                                        </div>
                                    </div>

                                    <div className="pm-stat-card active">
                                        <div className="pm-stat-card-inner">
                                            <div className="pm-stat-icon" />
                                            <div className="pm-stat-value">
                                                {String(filteredPersonnel.reduce((sum, p) => sum + getFilteredCompetencyStats(p.competencies || []).active, 0)).padStart(2, '0')}
                                            </div>
                                            <div className="pm-stat-label">Active Certs</div>
                                        </div>
                                    </div>

                                    <div className="pm-stat-card expiring">
                                        <div className="pm-stat-card-inner">
                                            <div className="pm-stat-icon" />
                                            <div className="pm-stat-value">
                                                {String(filteredPersonnel.reduce((sum, p) => sum + getFilteredCompetencyStats(p.competencies || []).expiring, 0)).padStart(2, '0')}
                                            </div>
                                            <div className="pm-stat-label">Expiring Soon</div>
                                        </div>
                                    </div>

                                    <div className="pm-stat-card expired">
                                        <div className="pm-stat-card-inner">
                                            <div className="pm-stat-icon" />
                                            <div className="pm-stat-value">
                                                {String(filteredPersonnel.reduce((sum, p) => sum + getFilteredCompetencyStats(p.competencies || []).expired, 0)).padStart(2, '0')}
                                            </div>
                                            <div className="pm-stat-label">Expired</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pm-filter-rail">
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

                                    {/* Quick Filters */}
                                    <div className="pm-quick-filters">
                                        <span className="pm-quick-filters-label">Quick Filters</span>
                                        <div className="pm-quick-filters-buttons">
                                            {([
                                                { id: 'irata-l1' as QuickFilter, label: 'IRATA L1' },
                                                { id: 'irata-l2' as QuickFilter, label: 'IRATA L2' },
                                                { id: 'irata-l3' as QuickFilter, label: 'IRATA L3' },
                                                { id: 'paut-l2' as QuickFilter, label: 'PAUT L2' },
                                                { id: 'tofd-l2' as QuickFilter, label: 'TOFD L2' },
                                            ]).map((filter) => (
                                                <button
                                                    type="button"
                                                    key={filter.id}
                                                    className={`pm-quick-filter-btn ${quickFilters.includes(filter.id) ? 'active' : ''}`}
                                                    onClick={() => handleQuickFilterToggle(filter.id)}
                                                >
                                                    {filter.label}
                                                </button>
                                            ))}
                                            {quickFilters.length > 0 && (
                                                <button
                                                    type="button"
                                                    className="pm-quick-filter-clear"
                                                    onClick={() => setQuickFilters([])}
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Directory Table */}
                            <div className="pm-section-label">
                                <h2 className="pm-section-label__title">Directory</h2>
                                <span className="pm-section-label__count">
                                    {filteredPersonnel.length} of {personnelQuery.data?.length || 0} records
                                </span>
                            </div>
                            <div className="pm-display-well">
                                <div className="pm-display" style={{ padding: 0 }}>
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

                    <div className="pm-groove" />

                    {/* Nameplate strip */}
                    <div className="pm-nameplate-bar">
                        <span className="pm-nameplate">Matrix Portal</span>
                        <span className="pm-nameplate-model">Personnel Management System</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
