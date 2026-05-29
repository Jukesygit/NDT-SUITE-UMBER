import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, Search } from 'lucide-react';
import { useProjectList } from '../../hooks/queries/useInspectionProjects';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { ProjectViewToggle, type ViewMode } from '../../components/projects/ProjectViewToggle';
import { TripView } from '../../components/projects/TripView';
import { AssetView } from '../../components/projects/AssetView';
import type { InspectionProjectSummary } from '../../types/inspection-project';
import './projects.css';

type FilterStatus = 'all' | 'active' | 'completed' | 'archived';
type SortKey = 'newest' | 'oldest' | 'name' | 'client' | 'progress';

const FILTER_OPTIONS: { key: FilterStatus; label: string; dotClass?: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active', dotClass: 'dot-active' },
    { key: 'completed', label: 'Completed', dotClass: 'dot-completed' },
    { key: 'archived', label: 'Archived' },
];

function filterProjects(projects: InspectionProjectSummary[], filter: FilterStatus): InspectionProjectSummary[] {
    if (filter === 'all') return projects.filter(p => p.status !== 'archived');
    if (filter === 'active') return projects.filter(p => !['completed', 'archived'].includes(p.status));
    if (filter === 'completed') return projects.filter(p => p.status === 'completed');
    if (filter === 'archived') return projects.filter(p => p.status === 'archived');
    return projects;
}

function searchProjects(projects: InspectionProjectSummary[], query: string): InspectionProjectSummary[] {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.client_name ?? '').toLowerCase().includes(q) ||
        (p.site_name ?? '').toLowerCase().includes(q)
    );
}

function sortProjects(projects: InspectionProjectSummary[], key: SortKey): InspectionProjectSummary[] {
    const sorted = [...projects];
    switch (key) {
        case 'newest':
            return sorted.sort((a, b) => new Date(b.start_date ?? b.created_at).getTime() - new Date(a.start_date ?? a.created_at).getTime());
        case 'oldest':
            return sorted.sort((a, b) => new Date(a.start_date ?? a.created_at).getTime() - new Date(b.start_date ?? b.created_at).getTime());
        case 'name':
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'client':
            return sorted.sort((a, b) => (a.client_name ?? '').localeCompare(b.client_name ?? ''));
        case 'progress': {
            const pct = (p: InspectionProjectSummary) => p.vessel_count ? p.completed_vessel_count / p.vessel_count : 0;
            return sorted.sort((a, b) => pct(b) - pct(a));
        }
        default:
            return sorted;
    }
}

export default function ProjectListPage() {
    const navigate = useNavigate();
    const { data: projects, isLoading, error } = useProjectList();
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<SortKey>('newest');
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        return (localStorage.getItem('projectViewMode') as ViewMode) || 'trips';
    });

    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode);
        localStorage.setItem('projectViewMode', mode);
    };

    const allProjects = projects ?? [];

    const counts = useMemo(() => {
        const c = { all: 0, active: 0, completed: 0, archived: 0 };
        for (const p of allProjects) {
            if (p.status === 'completed') c.completed++;
            else if (p.status === 'archived') c.archived++;
            else c.active++;
        }
        c.all = allProjects.length - c.archived;
        return c;
    }, [allProjects]);

    const filtered = useMemo(() => {
        const byFilter = filterProjects(allProjects, filter);
        const bySearch = searchProjects(byFilter, query);
        return sortProjects(bySearch, sort);
    }, [allProjects, filter, query, sort]);

    if (isLoading) return <PageSpinner message="Loading projects..." />;

    if (error) {
        return (
            <div className="pj-page">
                <div className="pj-alert error">
                    Failed to load projects: {(error as Error).message}
                </div>
            </div>
        );
    }

    return (
        <div className="pj-page">
            {/* Header */}
            <div className="pj-header">
                <div>
                    <h1>Projects</h1>
                    <div className="pj-subtitle">Plan inspection campaigns, track vessels, and review reports.</div>
                </div>
                <div className="pj-header-actions">
                    <button onClick={() => navigate('/projects/new')} className="pj-btn primary">
                        <Plus size={14} />
                        New Project
                    </button>
                </div>
            </div>

            {/* Tabs + View Toggle */}
            <div className="pj-toolbar">
                <div className="pj-toolbar-left">
                    <ProjectViewToggle viewMode={viewMode} onChange={handleViewModeChange} />
                </div>
            </div>

            {/* Filter chips + Search + Sort */}
            <div className="pj-toolbar-row">
                <div className="pj-filter-well">
                    {FILTER_OPTIONS.map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`pj-filter-chip ${filter === f.key ? 'active' : ''}`}
                        >
                            {f.dotClass && <span className={`pj-chip-dot ${f.dotClass}`} />}
                            {f.label}
                            <span className="pj-chip-count">{counts[f.key]}</span>
                        </button>
                    ))}
                </div>
                <div className="pj-toolbar-right-group">
                    <div className="pj-search">
                        <Search size={15} className="pj-search-icon" />
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search projects, clients..."
                            className="pj-search-input"
                        />
                    </div>
                    <div className="pj-sort">
                        <span className="pj-sort-label">Sort</span>
                        <select
                            value={sort}
                            onChange={e => setSort(e.target.value as SortKey)}
                            className="pj-sort-select"
                        >
                            <option value="newest">Newest first</option>
                            <option value="oldest">Oldest first</option>
                            <option value="name">Name (A–Z)</option>
                            <option value="client">Client (A–Z)</option>
                            <option value="progress">Progress</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Content */}
            {viewMode === 'trips' ? (
                filtered.length === 0 ? (
                    <div className="pj-list">
                        <div className="pj-empty">
                            <div className="pj-empty-icon">
                                <FolderOpen size={32} />
                            </div>
                            <div className="pj-empty-title">
                                {query ? 'No projects match this search' : filter === 'all' ? 'No projects yet' : `No ${filter} projects`}
                            </div>
                            <div className="pj-empty-text">
                                {query
                                    ? 'Try a different search term or clear the filter.'
                                    : filter === 'all'
                                        ? 'Create your first inspection project to get started.'
                                        : 'Try a different filter.'}
                            </div>
                            {filter === 'all' && !query && (
                                <button
                                    onClick={() => navigate('/projects/new')}
                                    className="pj-btn primary"
                                    style={{ marginTop: 16 }}
                                >
                                    <Plus size={14} />
                                    New Project
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <TripView projects={filtered} />
                )
            ) : (
                <AssetView statusFilter={filter} />
            )}

            {/* Footer */}
            <div className="pj-listfoot">
                <span>Showing {filtered.length} of {allProjects.length} projects</span>
            </div>
        </div>
    );
}
