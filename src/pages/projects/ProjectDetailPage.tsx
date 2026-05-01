/**
 * ProjectDetailPage - The Project Hub
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
import type { ProjectStatus } from '../../types/inspection-project';
import { PROJECT_STATUS_LABELS } from '../../types/inspection-project';
import './projects.css';

type Tab = 'overview' | 'vessels' | 'files';

function getProjectStatusClass(status: ProjectStatus): string {
    switch (status) {
        case 'completed': return 'active';
        case 'in_progress': return 'info';
        case 'mobilizing': return 'info';
        case 'review': return 'warning';
        case 'planned': return 'neutral';
        case 'archived': return 'neutral';
        default: return 'neutral';
    }
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
            <div className="pj-chassis">
                <div className="pj-panel">
                    <div className="pj-display-well">
                        <div className="pj-display">
                            <div className="pj-alert error">
                                Failed to load project: {(projectError as Error)?.message ?? 'Not found'}
                            </div>
                        </div>
                    </div>
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
        .join(' – ');

    const completedVessels = vessels.filter(v => v.status === 'completed').length;
    const statusClass = getProjectStatusClass(project.status);

    const handleStatusChange = async (status: ProjectStatus) => {
        setShowStatusMenu(false);
        await updateMutation.mutateAsync({ id: project.id, params: { status } });
    };

    const handleDelete = async () => {
        await deleteMutation.mutateAsync(project.id);
        navigate('/projects');
    };

    return (
        <div className="pj-chassis">
            <div className="pj-panel">
                {/* Back nav */}
                <button onClick={() => navigate('/projects')} className="pj-back-btn">
                    <ArrowLeft size={12} />
                    Projects
                </button>

                {/* Header */}
                <div className="pj-header">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1 className="pj-page-title">{project.name}</h1>
                        <div className="pj-page-meta">
                            {project.client_name && <span>{project.client_name}</span>}
                            {project.site_name && (
                                <span><MapPin size={11} />{project.site_name}</span>
                            )}
                            {dateRange && (
                                <span><Calendar size={11} />{dateRange}</span>
                            )}
                            <span>{vessels.length} vessel{vessels.length !== 1 ? 's' : ''}</span>
                            {vessels.length > 0 && (
                                <span>{completedVessels}/{vessels.length} completed</span>
                            )}
                        </div>
                    </div>

                    <div className="pj-header-actions">
                        {/* Status dropdown */}
                        <div className="pj-status-dropdown">
                            <button
                                onClick={() => setShowStatusMenu(!showStatusMenu)}
                                className={`pj-status-trigger ${statusClass}`}
                            >
                                <span className={`pj-led ${statusClass}`} />
                                {PROJECT_STATUS_LABELS[project.status]}
                            </button>
                            {showStatusMenu && (
                                <div className="pj-status-menu">
                                    {(['planned', 'mobilizing', 'in_progress', 'review', 'completed', 'archived'] as ProjectStatus[]).map(s => {
                                        const sc = getProjectStatusClass(s);
                                        return (
                                            <button
                                                key={s}
                                                onClick={() => handleStatusChange(s)}
                                                className={`pj-status-option ${s === project.status ? 'current' : ''}`}
                                            >
                                                <span className={`pj-led ${sc}`} />
                                                <span style={{ color: s === project.status ? 'var(--green-bright)' : 'rgba(53, 160, 88, 0.65)' }}>
                                                    {PROJECT_STATUS_LABELS[s]}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => navigate(`/projects/${project.id}/edit`)}
                            title="Edit project"
                            className="pj-btn secondary icon-only"
                        >
                            <Settings size={14} />
                        </button>
                        <button
                            onClick={() => setShowDeleteModal(true)}
                            title="Delete project"
                            className="pj-btn danger icon-only"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>

                <div className="pj-groove" />

                {/* Tabs */}
                <div className="pj-toolbar">
                    <div className="pj-tabs-well">
                        <button className={`pj-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                            Overview
                            <span className="pj-tab-count">{vessels.length}</span>
                        </button>
                        <button className={`pj-tab ${activeTab === 'vessels' ? 'active' : ''}`} onClick={() => setActiveTab('vessels')}>
                            Vessels
                            <span className="pj-tab-count">{vessels.length}</span>
                        </button>
                        <button className={`pj-tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
                            Files
                            <span className="pj-tab-count">{files.length + composites.length + models.length}</span>
                        </button>
                    </div>
                </div>

                {/* Tab content */}
                <div className="pj-content">
                    {activeTab === 'overview' && (
                        vessels.length === 0 ? (
                            <div className="pj-display-well">
                                <div className="pj-display">
                                    <div className="pj-empty">
                                        <div className="pj-empty-title">No vessels yet</div>
                                        <div className="pj-empty-text">Add vessels to start setting up this inspection project.</div>
                                        <button onClick={() => setActiveTab('vessels')} className="pj-btn primary" style={{ marginTop: 14 }}>
                                            Add Vessel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="pj-card-grid">
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

                {/* Nameplate */}
                <div className="pj-groove" />
                <div className="pj-nameplate-bar">
                    <span className="pj-nameplate">Matrix Portal</span>
                    <span className="pj-nameplate-model">Project Hub</span>
                </div>
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
                        <button onClick={() => setShowDeleteModal(false)} className="pj-btn secondary">Cancel</button>
                        <button
                            onClick={handleDelete}
                            disabled={deleteMutation.isPending}
                            className="pj-btn danger"
                        >
                            {deleteMutation.isPending ? 'Deleting...' : 'Delete Project'}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
