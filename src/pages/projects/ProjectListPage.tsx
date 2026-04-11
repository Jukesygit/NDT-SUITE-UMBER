/**
 * ProjectListPage - Dashboard showing all inspection projects
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, Calendar, MapPin, ChevronRight } from 'lucide-react';
import { useProjectList } from '../../hooks/queries/useInspectionProjects';
import { useDeleteProject } from '../../hooks/mutations/useInspectionProjectMutations';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import type { InspectionProjectSummary, ProjectStatus } from '../../types/inspection-project';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from '../../types/inspection-project';

function StatusBadge({ status }: { status: ProjectStatus }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 10px',
                borderRadius: 12,
                fontSize: '0.75rem',
                fontWeight: 500,
                background: `${PROJECT_STATUS_COLORS[status]}20`,
                color: PROJECT_STATUS_COLORS[status],
            }}
        >
            <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: PROJECT_STATUS_COLORS[status],
            }} />
            {PROJECT_STATUS_LABELS[status]}
        </span>
    );
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
    const pct = total > 0 ? (completed / total) * 100 : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
            }}>
                <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    borderRadius: 3,
                    background: pct === 100 ? '#22c55e' : '#3b82f6',
                    transition: 'width 0.3s',
                }} />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                {completed}/{total} vessels
            </span>
        </div>
    );
}

function ProjectCard({ project, onClick }: { project: InspectionProjectSummary; onClick: () => void }) {
    const dateRange = [project.start_date, project.end_date]
        .filter(Boolean)
        .map(d => new Date(d!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))
        .join(' – ');

    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: 20,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                width: '100%',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', margin: 0, marginBottom: 4 }}>
                        {project.name}
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                        {project.client_name && (
                            <span>{project.client_name}</span>
                        )}
                        {project.site_name && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <MapPin size={12} />
                                {project.site_name}
                            </span>
                        )}
                        {dateRange && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Calendar size={12} />
                                {dateRange}
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusBadge status={project.status} />
                    <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
                </div>
            </div>

            <ProgressBar completed={project.completed_vessel_count} total={project.vessel_count} />
        </button>
    );
}

type FilterStatus = 'all' | 'active' | 'completed' | 'archived';

export default function ProjectListPage() {
    const navigate = useNavigate();
    const { data: projects, isLoading, error } = useProjectList();
    const deleteMutation = useDeleteProject();
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [deleteTarget, setDeleteTarget] = useState<InspectionProjectSummary | null>(null);

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
                    <div style={{ display: 'flex', gap: 4 }}>
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

                {/* Project list */}
                {filtered.length === 0 ? (
                    <EmptyState
                        title={filter === 'all' ? 'No projects yet' : `No ${filter} projects`}
                        message={filter === 'all' ? 'Create your first inspection project to get started.' : 'Try a different filter.'}
                        icon="folder"
                        action={filter === 'all' ? { label: 'New Project', onClick: () => navigate('/projects/new') } : undefined}
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {filtered.map(p => (
                            <ProjectCard
                                key={p.id}
                                project={p}
                                onClick={() => navigate(`/projects/${p.id}`)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Delete confirmation modal */}
            {deleteTarget && (
                <Modal
                    title="Delete Project"
                    onClose={() => setDeleteTarget(null)}
                >
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
                        Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
                        This will remove all vessels, files, and data associated with this project.
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => setDeleteTarget(null)}
                            className="btn btn--ghost btn--sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                deleteMutation.mutate(deleteTarget.id);
                                setDeleteTarget(null);
                            }}
                            style={{
                                padding: '6px 16px',
                                borderRadius: 6,
                                border: 'none',
                                background: '#ef4444',
                                color: '#fff',
                                cursor: 'pointer',
                            }}
                        >
                            Delete
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
