/**
 * ProjectListPage - Dashboard showing all inspection projects
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen } from 'lucide-react';
import { useProjectList } from '../../hooks/queries/useInspectionProjects';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { ProjectViewToggle, type ViewMode } from '../../components/projects/ProjectViewToggle';
import { TripView } from '../../components/projects/TripView';
import { AssetView } from '../../components/projects/AssetView';
import './projects.css';

type FilterStatus = 'all' | 'active' | 'completed' | 'archived';

export default function ProjectListPage() {
    const navigate = useNavigate();
    const { data: projects, isLoading, error } = useProjectList();
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        return (localStorage.getItem('projectViewMode') as ViewMode) || 'trips';
    });

    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode);
        localStorage.setItem('projectViewMode', mode);
    };

    if (isLoading) return <PageSpinner message="Loading projects..." />;

    if (error) {
        return (
            <div className="pj-chassis">
                <div className="pj-panel">
                    <div className="pj-display-well">
                        <div className="pj-display">
                            <div className="pj-alert error">
                                Failed to load projects: {(error as Error).message}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const filtered = (projects ?? []).filter(p => {
        if (filter === 'all') return true;
        if (filter === 'active') return !['completed', 'archived'].includes(p.status);
        if (filter === 'completed') return p.status === 'completed';
        if (filter === 'archived') return p.status === 'archived';
        return true;
    });

    return (
        <div className="pj-chassis">
            <div className="pj-panel">
                {/* Header */}
                <div className="pj-header">
                    <div className="pj-header-left">
                        <span className="pj-logo" />
                        <div className="pj-header-text">
                            <h1>Projects</h1>
                            <div className="pj-subtitle">Manage inspection campaigns and reports</div>
                        </div>
                    </div>
                    <div className="pj-header-actions">
                        <button onClick={() => navigate('/projects/new')} className="pj-btn primary">
                            <Plus size={14} />
                            New Project
                        </button>
                    </div>
                </div>

                <div className="pj-groove" />

                {/* Toolbar */}
                <div className="pj-toolbar">
                    <div className="pj-toolbar-left">
                        <ProjectViewToggle viewMode={viewMode} onChange={handleViewModeChange} />
                        <div className="pj-groove-vertical" style={{ height: 20 }} />
                        <div className="pj-filter-well">
                            {(['all', 'active', 'completed', 'archived'] as FilterStatus[]).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`pj-filter-chip ${filter === f ? 'active' : ''}`}
                                >
                                    {f.charAt(0).toUpperCase() + f.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="pj-display-well">
                    <div className="pj-display" style={{ padding: viewMode === 'trips' && filtered.length === 0 ? undefined : 8 }}>
                        {viewMode === 'trips' ? (
                            filtered.length === 0 ? (
                                <div className="pj-empty">
                                    <div className="pj-empty-icon">
                                        <FolderOpen size={32} />
                                    </div>
                                    <div className="pj-empty-title">
                                        {filter === 'all' ? 'No projects yet' : `No ${filter} projects`}
                                    </div>
                                    <div className="pj-empty-text">
                                        {filter === 'all' ? 'Create your first inspection project to get started.' : 'Try a different filter.'}
                                    </div>
                                    {filter === 'all' && (
                                        <button
                                            onClick={() => navigate('/projects/new')}
                                            className="pj-btn primary"
                                            style={{ marginTop: 14 }}
                                        >
                                            <Plus size={14} />
                                            New Project
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <TripView projects={filtered} />
                            )
                        ) : (
                            <AssetView statusFilter={filter} />
                        )}
                    </div>
                </div>

                {/* Nameplate */}
                <div className="pj-groove" />
                <div className="pj-nameplate-bar">
                    <span className="pj-nameplate">Matrix Portal</span>
                    <span className="pj-nameplate-model">Inspection Projects</span>
                </div>
            </div>
        </div>
    );
}
