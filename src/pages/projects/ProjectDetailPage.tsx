import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Calendar, MapPin, Trash2, ChevronDown } from 'lucide-react';
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
import { ProjectFilesTab } from '../../components/projects/ProjectFilesTab';
import { ProjectSummaryStrip } from '../../components/projects/ProjectSummaryStrip';
import { ProjectAttentionQueue } from '../../components/projects/ProjectAttentionQueue';
import { ProjectVesselList } from '../../components/projects/ProjectVesselList';
import type { ProjectStatus, ProjectVessel, ProjectFile } from '../../types/inspection-project';
import { PROJECT_STATUS_LABELS } from '../../types/inspection-project';
import './projects.css';

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

function FilesSection({
    projectId,
    files,
    vessels,
    composites,
    models,
    defaultOpen,
}: {
    projectId: string;
    files: ProjectFile[];
    vessels: ProjectVessel[];
    composites: { id: string; name: string; created_at: string; project_vessel_id: string | null }[];
    models: { id: string; name: string; updated_at: string; project_vessel_id: string | null; model_type: string | null }[];
    defaultOpen: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const totalCount = files.length + composites.length + models.length;

    return (
        <div className="pj-files-section">
            <button onClick={() => setOpen(!open)} className="pj-files-toggle">
                <div className="pj-files-toggle-left">
                    <span className="pj-files-toggle-label">Files</span>
                    <span className="pj-files-toggle-count">{totalCount}</span>
                </div>
                <ChevronDown size={14} className={`pj-files-toggle-chevron ${open ? 'open' : ''}`} />
            </button>
            {open && (
                <ProjectFilesTab
                    projectId={projectId}
                    files={files}
                    vessels={vessels}
                    scanComposites={composites}
                    vesselModels={models}
                />
            )}
        </div>
    );
}

export default function ProjectDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
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
            <div className="pj-page">
                <div className="pj-alert error">
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
        <div className="pj-page">
            <button onClick={() => navigate('/projects')} className="pj-back-btn">
                <ArrowLeft size={14} />
                Projects
            </button>

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
                                            {PROJECT_STATUS_LABELS[s]}
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

            <div className="pj-divider" />

            {/* Summary */}
            <ProjectSummaryStrip vessels={vessels} />

            {/* Attention queue */}
            <ProjectAttentionQueue
                projectId={project.id}
                vessels={vessels}
                compositeCountByVessel={compositeCountByVessel}
                projectStatus={project.status}
            />

            {/* Vessel list */}
            <ProjectVesselList
                projectId={project.id}
                vessels={vessels}
                compositeCountByVessel={compositeCountByVessel}
            />

            {/* Files (collapsible) */}
            <FilesSection
                projectId={project.id}
                files={files}
                vessels={vessels}
                composites={composites}
                models={models}
                defaultOpen={false}
            />

            {showDeleteModal && (
                <Modal isOpen={true} title="Delete Project" onClose={() => setShowDeleteModal(false)}>
                    <p style={{ marginBottom: 16 }}>
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
