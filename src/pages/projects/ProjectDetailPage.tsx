/**
 * ProjectDetailPage - The Project Hub
 * Central management page for an inspection project.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Calendar, MapPin, Trash2 } from 'lucide-react';
import {
    useProject,
    useProjectVessels,
    useProjectFiles,
    useProjectScanComposites,
    useProjectVesselModels,
} from '../../hooks/queries/useInspectionProjects';
import { useDeleteProject, useUpdateProject } from '../../hooks/mutations/useInspectionProjectMutations';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { Modal } from '../../components/ui/Modal';
import { ProjectVesselsTab } from '../../components/projects/ProjectVesselsTab';
import { ProjectFilesTab } from '../../components/projects/ProjectFilesTab';
import { VesselCard } from '../../components/projects/VesselCard';
import { EmptyState } from '../../components/ui/EmptyState';
import type { ProjectStatus } from '../../types/inspection-project';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from '../../types/inspection-project';

type Tab = 'overview' | 'vessels' | 'files';

function TabButton({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '10px 20px',
                borderRadius: 0,
                border: 'none',
                borderBottom: `2px solid ${active ? '#3b82f6' : 'transparent'}`,
                background: 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: '0.85rem',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
            }}
        >
            {label}
            {count != null && (
                <span style={{
                    marginLeft: 6,
                    padding: '1px 6px',
                    borderRadius: 8,
                    fontSize: '0.7rem',
                    background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                    color: active ? '#60a5fa' : 'rgba(255,255,255,0.4)',
                }}>
                    {count}
                </span>
            )}
        </button>
    );
}

export default function ProjectDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showStatusMenu, setShowStatusMenu] = useState(false);

    const { data: project, isLoading: projectLoading, error: projectError } = useProject(id);
    const { data: vessels = [] } = useProjectVessels(id);
    const { data: files = [] } = useProjectFiles(id);

    const vesselIds = vessels.map(v => v.id);
    const { data: composites = [] } = useProjectScanComposites(vesselIds);
    const { data: models = [] } = useProjectVesselModels(vesselIds);

    const deleteMutation = useDeleteProject();
    const updateMutation = useUpdateProject();

    if (projectLoading) return <PageSpinner message="Loading project..." />;

    if (projectError || !project) {
        return (
            <div style={{ padding: '32px 40px' }}>
                <div style={{ color: '#ef4444', padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
                    Failed to load project: {(projectError as Error)?.message ?? 'Not found'}
                </div>
            </div>
        );
    }

    const compositeCountByVessel = new Map<string, number>();
    for (const c of composites) {
        if (c.project_vessel_id) {
            compositeCountByVessel.set(c.project_vessel_id, (compositeCountByVessel.get(c.project_vessel_id) ?? 0) + 1);
        }
    }

    const dateRange = [project.start_date, project.end_date]
        .filter(Boolean)
        .map(d => new Date(d!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))
        .join(' \u2013 ');

    const completedVessels = vessels.filter(v => v.status === 'completed').length;

    const handleStatusChange = async (status: ProjectStatus) => {
        setShowStatusMenu(false);
        await updateMutation.mutateAsync({ id: project.id, params: { status } });
    };

    const handleDelete = async () => {
        await deleteMutation.mutateAsync(project.id);
        navigate('/projects');
    };

    return (
        <div>
            {/* Header */}
            <div style={{ padding: '24px 40px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                    onClick={() => navigate('/projects')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        padding: 0,
                        marginBottom: 16,
                    }}
                >
                    <ArrowLeft size={14} />
                    Projects
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#fff', margin: 0, marginBottom: 6 }}>
                            {project.name}
                        </h1>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
                            {project.client_name && <span>{project.client_name}</span>}
                            {project.site_name && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <MapPin size={13} />
                                    {project.site_name}
                                </span>
                            )}
                            {dateRange && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Calendar size={13} />
                                    {dateRange}
                                </span>
                            )}
                            <span>{vessels.length} vessel{vessels.length !== 1 ? 's' : ''}</span>
                            {vessels.length > 0 && (
                                <span>{completedVessels}/{vessels.length} completed</span>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Status dropdown */}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowStatusMenu(!showStatusMenu)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '4px 12px',
                                    borderRadius: 12,
                                    border: 'none',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    background: `${PROJECT_STATUS_COLORS[project.status]}20`,
                                    color: PROJECT_STATUS_COLORS[project.status],
                                    cursor: 'pointer',
                                }}
                            >
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: PROJECT_STATUS_COLORS[project.status] }} />
                                {PROJECT_STATUS_LABELS[project.status]}
                            </button>
                            {showStatusMenu && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: 4,
                                        padding: 4,
                                        borderRadius: 8,
                                        background: '#1a1a1a',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        zIndex: 10,
                                        minWidth: 160,
                                    }}
                                >
                                    {(['planned', 'mobilizing', 'in_progress', 'review', 'completed', 'archived'] as ProjectStatus[]).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => handleStatusChange(s)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                width: '100%',
                                                padding: '6px 10px',
                                                borderRadius: 4,
                                                border: 'none',
                                                background: s === project.status ? 'rgba(255,255,255,0.06)' : 'transparent',
                                                color: PROJECT_STATUS_COLORS[s],
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                            }}
                                        >
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PROJECT_STATUS_COLORS[s] }} />
                                            {PROJECT_STATUS_LABELS[s]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => navigate(`/projects/${project.id}/edit`)}
                            title="Edit project"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: 8,
                                borderRadius: 6,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.5)',
                                cursor: 'pointer',
                            }}
                        >
                            <Settings size={16} />
                        </button>
                        <button
                            onClick={() => setShowDeleteModal(true)}
                            title="Delete project"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: 8,
                                borderRadius: 6,
                                border: '1px solid rgba(239,68,68,0.2)',
                                background: 'transparent',
                                color: 'rgba(239,68,68,0.6)',
                                cursor: 'pointer',
                            }}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex',
                gap: 0,
                padding: '0 40px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <TabButton active={activeTab === 'overview'} label="Overview" count={vessels.length} onClick={() => setActiveTab('overview')} />
                <TabButton active={activeTab === 'vessels'} label="Vessels" count={vessels.length} onClick={() => setActiveTab('vessels')} />
                <TabButton active={activeTab === 'files'} label="Files" count={files.length + composites.length + models.length} onClick={() => setActiveTab('files')} />
            </div>

            {/* Tab content */}
            <div style={{ padding: '24px 40px' }}>
                {activeTab === 'overview' && (
                    vessels.length === 0 ? (
                        <EmptyState
                            title="No vessels yet"
                            message="Add vessels to start setting up this inspection project."
                            icon="default"
                            action={{ label: 'Add Vessel', onClick: () => setActiveTab('vessels') }}
                        />
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 12 }}>
                            {vessels.map(v => (
                                <VesselCard
                                    key={v.id}
                                    vessel={v}
                                    projectId={project.id}
                                    compositeCount={compositeCountByVessel.get(v.id) ?? 0}
                                    onEdit={() => setActiveTab('vessels')}
                                    onDelete={() => setActiveTab('vessels')}
                                />
                            ))}
                        </div>
                    )
                )}

                {activeTab === 'vessels' && (
                    <ProjectVesselsTab
                        projectId={project.id}
                        vessels={vessels}
                        compositeCountByVessel={compositeCountByVessel}
                    />
                )}

                {activeTab === 'files' && (
                    <ProjectFilesTab
                        projectId={project.id}
                        files={files}
                        vessels={vessels}
                        scanComposites={composites}
                        vesselModels={models}
                    />
                )}
            </div>

            {/* Delete confirmation */}
            {showDeleteModal && (
                <Modal isOpen={true} title="Delete Project" onClose={() => setShowDeleteModal(false)}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
                        Are you sure you want to delete <strong>{project.name}</strong>?
                        This will remove all vessels, files, and data associated with this project.
                        This action cannot be undone.
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => setShowDeleteModal(false)}
                            style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={deleteMutation.isPending}
                            style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}
                        >
                            {deleteMutation.isPending ? 'Deleting...' : 'Delete Project'}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
