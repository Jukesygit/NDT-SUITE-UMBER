/**
 * ProjectListPage - Dashboard showing all inspection projects
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen } from 'lucide-react';
import { useProjectList } from '../../hooks/queries/useInspectionProjects';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { ProjectViewToggle, type ViewMode } from '../../components/projects/ProjectViewToggle';
import { TripView } from '../../components/projects/TripView';
import { AssetView } from '../../components/projects/AssetView';

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
            <div style={{ padding: '32px 40px' }}>
                <div style={{ color: '#ef4444', padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
                    Failed to load projects: {(error as Error).message}
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
        <div>
            <PageHeader
                title="Projects"
                subtitle="Manage inspection campaigns and reports"
                icon={<FolderOpen size={24} />}
            />

            <div style={{ padding: '24px 40px' }}>
                {/* Toolbar */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 20,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <ProjectViewToggle viewMode={viewMode} onChange={handleViewModeChange} />
                        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
                        {(['all', 'active', 'completed', 'archived'] as FilterStatus[]).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: 8,
                                    border: 'none',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    background: filter === f ? 'rgba(59,130,246,0.2)' : 'transparent',
                                    color: filter === f ? '#60a5fa' : 'rgba(255,255,255,0.5)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => navigate('/projects/new')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#3b82f6',
                            color: '#fff',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                        }}
                    >
                        <Plus size={16} />
                        New Project
                    </button>
                </div>

                {/* Project / Asset list */}
                {viewMode === 'trips' ? (
                    filtered.length === 0 ? (
                        <EmptyState
                            title={filter === 'all' ? 'No projects yet' : `No ${filter} projects`}
                            message={filter === 'all' ? 'Create your first inspection project to get started.' : 'Try a different filter.'}
                            icon="folder"
                            action={filter === 'all' ? { label: 'New Project', onClick: () => navigate('/projects/new') } : undefined}
                        />
                    ) : (
                        <TripView projects={filtered} />
                    )
                ) : (
                    <AssetView statusFilter={filter} />
                )}
            </div>
        </div>
    );
}
