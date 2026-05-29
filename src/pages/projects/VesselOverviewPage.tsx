/**
 * VesselOverviewPage - Dashboard hub for vessel management.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Box, MapPin, Calendar, Pencil, ChevronDown,
    ClipboardList, Eye, Cuboid,
} from 'lucide-react';
import { useUpdateProjectVessel } from '../../hooks/mutations/useInspectionProjectMutations';
import { usePopulateFromCompanion } from '../../hooks/mutations/usePopulateFromCompanion';
import {
    useProject,
    useProjectVessel,
    useProjectProcedures,
    useVesselFiles,
    useProjectScanComposites,
    useProjectVesselModels,
    useProjectImages,
} from '../../hooks/queries/useInspectionProjects';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { VESSEL_STATUS_LABELS } from '../../types/inspection-project';
import type { VesselStatus } from '../../types/inspection-project';
import { VesselIdentityCard } from '../../components/projects/vessel-overview/VesselIdentityCard';
import { ScopeProgressCard } from '../../components/projects/vessel-overview/ScopeProgressCard';
import { ReportReadinessCard } from '../../components/projects/vessel-overview/ReportReadinessCard';
import DocumentsSection from '../../components/projects/inspection-detail/DocumentsSection';
import ImagePoolSection from '../../components/projects/inspection-detail/ImagePoolSection';
import ModelsSection from '../../components/projects/inspection-detail/ModelsSection';
import './projects.css';

function getVesselStatusClass(status: string): string {
    switch (status) {
        case 'completed': return 'active';
        case 'in_progress': return 'info';
        case 'pending_review': return 'warning';
        case 'not_started': return 'neutral';
        default: return 'neutral';
    }
}

export default function VesselOverviewPage() {
    const { projectId, vesselId } = useParams<{ projectId: string; vesselId: string }>();
    const navigate = useNavigate();

    const { data: project, isLoading: projectLoading } = useProject(projectId);
    const { data: vessel, isLoading: vesselLoading } = useProjectVessel(vesselId);
    const { data: procedures = [] } = useProjectProcedures(projectId);
    const { data: files = [] } = useVesselFiles(vesselId);
    const { data: images = [] } = useProjectImages(vesselId);
    const vesselIds = vesselId ? [vesselId] : [];
    const { data: composites = [] } = useProjectScanComposites(vesselIds);
    const { data: vesselModels = [] } = useProjectVesselModels(vesselIds);

    const updateVessel = useUpdateProjectVessel();

    const {
        populate: populateFromCompanion,
        populating,
        connected: companionConnected,
        fileCount: companionFileCount,
    } = usePopulateFromCompanion();

    const [populateMsg, setPopulateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handlePopulateFromCompanion = useCallback(async () => {
        if (!vessel || !projectId) return;
        try {
            const result = await populateFromCompanion(vessel, projectId, [], []);
            const parts: string[] = [];
            if (result.equipmentUpdated) parts.push('equipment');
            if (result.vesselDetailsUpdated) parts.push('vessel details');
            if (result.scanLogAdded > 0) parts.push(`${result.scanLogAdded} scan log entries`);
            if (result.calLogAdded > 0) parts.push(`${result.calLogAdded} calibration entries`);
            if (result.skipped > 0) parts.push(`${result.skipped} duplicates skipped`);

            if (parts.length === 0) {
                setPopulateMsg({ type: 'success', text: 'Nothing new to populate — all data already present.' });
            } else {
                setPopulateMsg({ type: 'success', text: `Populated: ${parts.join(', ')}` });
            }
        } catch (err) {
            setPopulateMsg({ type: 'error', text: err instanceof Error ? err.message : 'Population failed' });
        }
        setTimeout(() => setPopulateMsg(null), 6000);
    }, [vessel, projectId, populateFromCompanion]);

    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [editingTag, setEditingTag] = useState(false);
    const [tagDraft, setTagDraft] = useState('');

    const startEditName = useCallback(() => {
        setNameDraft(vessel?.vessel_name ?? '');
        setEditingName(true);
    }, [vessel?.vessel_name]);

    const commitName = useCallback(() => {
        setEditingName(false);
        const trimmed = nameDraft.trim();
        if (trimmed && trimmed !== vessel?.vessel_name) {
            updateVessel.mutate({ id: vesselId!, params: { vesselName: trimmed }, projectId: projectId! });
        }
    }, [nameDraft, vessel?.vessel_name, vesselId, projectId, updateVessel]);

    const startEditTag = useCallback(() => {
        setTagDraft(vessel?.vessel_tag ?? '');
        setEditingTag(true);
    }, [vessel?.vessel_tag]);

    const commitTag = useCallback(() => {
        setEditingTag(false);
        const trimmed = tagDraft.trim();
        if (trimmed !== (vessel?.vessel_tag ?? '')) {
            updateVessel.mutate({ id: vesselId!, params: { vesselTag: trimmed || undefined }, projectId: projectId! });
        }
    }, [tagDraft, vessel?.vessel_tag, vesselId, projectId, updateVessel]);

    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const statusMenuRef = useRef<HTMLDivElement>(null);

    const handleStatusChange = useCallback((newStatus: VesselStatus) => {
        setStatusMenuOpen(false);
        if (newStatus !== vessel?.status) {
            updateVessel.mutate({ id: vesselId!, params: { status: newStatus }, projectId: projectId! });
        }
    }, [vessel?.status, vesselId, projectId, updateVessel]);

    const [modelerMenuOpen, setModelerMenuOpen] = useState(false);
    const modelerMenuRef = useRef<HTMLDivElement>(null);
    const linkedModels = vesselModels.filter((m) => m.project_vessel_id === vesselId);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) setStatusMenuOpen(false);
            if (modelerMenuRef.current && !modelerMenuRef.current.contains(e.target as Node)) setModelerMenuOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    if (projectLoading || vesselLoading) return <PageSpinner message="Loading vessel overview..." />;

    if (!project || !vessel) {
        return (
            <div className="pj-page">
                <div className="pj-alert error">Project or vessel not found.</div>
            </div>
        );
    }

    const formatDate = (d: string | null) => {
        if (!d) return null;
        return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const tripDateRange = project.start_date || project.end_date
        ? [formatDate(project.start_date), formatDate(project.end_date)].filter(Boolean).join(' – ')
        : null;

    const statusClass = getVesselStatusClass(vessel.status);

    return (
        <div className="pj-page">
            <button onClick={() => navigate(`/projects/${projectId}`)} className="pj-back-btn">
                <ArrowLeft size={14} />
                {project.name}
            </button>

            <div className="pj-page-meta" style={{ marginBottom: 8 }}>
                {project.client_name && <span style={{ fontWeight: 600, color: 'var(--clean-text-secondary)' }}>{project.client_name}</span>}
                {project.site_name && <span><MapPin size={10} />{project.site_name}</span>}
                {tripDateRange && <span><Calendar size={10} />{tripDateRange}</span>}
                {project.contract_number && <span>Contract: {project.contract_number}</span>}
                {project.work_order_number && <span>WO: {project.work_order_number}</span>}
            </div>

                {/* Header */}
                <div className="pj-header" style={{ marginBottom: 0 }}>
                    <div className="pj-vessel-header" style={{ flex: 1, minWidth: 0 }}>
                        <div className="pj-vessel-title-row">
                            {editingTag ? (
                                <input
                                    autoFocus
                                    value={tagDraft}
                                    onChange={(e) => setTagDraft(e.target.value)}
                                    onBlur={commitTag}
                                    onKeyDown={(e) => { if (e.key === 'Enter') commitTag(); if (e.key === 'Escape') setEditingTag(false); }}
                                    placeholder="Tag"
                                    className="pj-edit-input"
                                    style={{ fontSize: '24px', fontWeight: 600, width: 120 }}
                                />
                            ) : (
                                vessel.vessel_tag && (
                                    <span onClick={startEditTag} title="Click to edit tag" className="pj-vessel-title pj-editable">
                                        {vessel.vessel_tag} —{' '}
                                    </span>
                                )
                            )}

                            {editingName ? (
                                <input
                                    autoFocus
                                    value={nameDraft}
                                    onChange={(e) => setNameDraft(e.target.value)}
                                    onBlur={commitName}
                                    onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
                                    className="pj-edit-input"
                                    style={{ fontSize: '24px', fontWeight: 600, flex: 1, minWidth: 200 }}
                                />
                            ) : (
                                <h1 onClick={startEditName} title="Click to edit vessel name" className="pj-vessel-title pj-editable">
                                    {vessel.vessel_name}
                                    <Pencil size={12} style={{ opacity: 0, color: 'var(--clean-text-tertiary)', transition: 'opacity 0.15s' }} />
                                </h1>
                            )}

                            {!vessel.vessel_tag && !editingTag && (
                                <button onClick={startEditTag} className="pj-back-btn" style={{ marginBottom: 0, fontSize: 10 }} title="Add vessel tag">
                                    + add tag
                                </button>
                            )}
                        </div>

                        {vessel.description && (
                            <p className="pj-vessel-description">{vessel.description}</p>
                        )}
                    </div>

                    <div className="pj-header-actions">
                        {/* Status dropdown */}
                        <div ref={statusMenuRef} className="pj-status-dropdown">
                            <button onClick={() => setStatusMenuOpen(prev => !prev)} className={`pj-status-trigger ${statusClass}`}>
                                <span className={`pj-led ${statusClass}`} />
                                {VESSEL_STATUS_LABELS[vessel.status]}
                                <ChevronDown size={10} style={{ opacity: 0.6 }} />
                            </button>
                            {statusMenuOpen && (
                                <div className="pj-status-menu">
                                    {(Object.keys(VESSEL_STATUS_LABELS) as VesselStatus[]).map((s) => {
                                        const sc = getVesselStatusClass(s);
                                        return (
                                            <button
                                                key={s}
                                                onClick={() => handleStatusChange(s)}
                                                className={`pj-status-option ${s === vessel.status ? 'current' : ''}`}
                                            >
                                                <span className={`pj-led ${sc}`} />
                                                <span>
                                                    {VESSEL_STATUS_LABELS[s]}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {companionConnected && (
                            <button
                                onClick={handlePopulateFromCompanion}
                                disabled={populating || companionFileCount === 0}
                                className="pj-btn secondary"
                            >
                                <span className="pj-companion-led" />
                                {populating ? 'Populating...' : `Populate (${companionFileCount})`}
                            </button>
                        )}

                        {/* Modeler dropdown */}
                        <div ref={modelerMenuRef} style={{ position: 'relative' }}>
                            <button onClick={() => setModelerMenuOpen(prev => !prev)} className="pj-btn primary">
                                <Box size={14} />
                                Open 3D Modeler
                                <ChevronDown size={10} style={{ opacity: 0.7 }} />
                            </button>
                            {modelerMenuOpen && (
                                <div className="pj-dropdown-menu">
                                    <button
                                        onClick={() => { setModelerMenuOpen(false); navigate(`/vessel-modeler?project=${projectId}&vessel=${vesselId}`); }}
                                        className="pj-dropdown-item"
                                    >
                                        <Box size={12} />
                                        New Model
                                    </button>
                                    {linkedModels.length > 0 && (
                                        <>
                                            <div className="pj-dropdown-divider" />
                                            <div className="pj-dropdown-section-label">Saved Models</div>
                                            {linkedModels.map((m) => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => { setModelerMenuOpen(false); navigate(`/vessel-modeler?project=${projectId}&vessel=${vesselId}&model=${m.id}`); }}
                                                    className="pj-dropdown-item muted"
                                                >
                                                    <Box size={12} style={{ opacity: 0.5 }} />
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                                        {m.model_type && (
                                                            <span style={{ fontSize: '10px', color: 'var(--clean-text-quaternary)' }}>{m.model_type}</span>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pj-divider" />

                {/* Body content */}
                <div className="pj-content">
                    {populateMsg && (
                        <div className={`pj-alert ${populateMsg.type === 'success' ? 'success' : 'error'}`}>
                            {populateMsg.text}
                        </div>
                    )}

                    {/* Panel-surface zone: vessel metadata */}
                    <div className="pj-section-label">Vessel Details</div>
                    <VesselIdentityCard vessel={vessel} projectId={projectId!} procedures={procedures} />

                    {/* Panel-surface zone: action controls */}
                    <div className="pj-panel-actions">
                        <button
                            className="pj-panel-action-btn primary"
                            onClick={() => navigate(`/projects/${projectId}/vessels/${vesselId}/report-builder`)}
                        >
                            <ClipboardList size={13} />
                            Report Builder
                        </button>
                        <button
                            className="pj-panel-action-btn"
                            onClick={() => navigate(`/projects/${projectId}/vessels/${vesselId}/viewer`)}
                        >
                            <Eye size={13} />
                            Scan Viewer
                        </button>
                        <button
                            className="pj-panel-action-btn"
                            onClick={() => navigate(`/vessel-modeler?project=${projectId}&vessel=${vesselId}`)}
                        >
                            <Cuboid size={13} />
                            3D Modeler
                        </button>
                    </div>

                    <div className="pj-divider" />

                    {/* LCD readout zone */}
                    <div className="pj-section-label">Readouts</div>
                    <div className="pj-readout-grid">
                        <ScopeProgressCard
                            vesselId={vesselId!}
                            projectId={projectId!}
                            composites={composites}
                            vesselModels={vesselModels}
                        />
                        <ReportReadinessCard
                            vessel={vessel}
                            projectId={projectId!}
                            files={files}
                            compositeCount={composites.length}
                        />
                    </div>

                    <div className="pj-divider" />

                    {/* Attachments zone */}
                    <DocumentsSection vessel={vessel} projectId={projectId!} files={files} />
                    <ImagePoolSection vesselId={vesselId!} projectId={projectId!} images={images} />
                    <ModelsSection vessel={vessel} projectId={projectId!} composites={composites} vesselModels={vesselModels} />
                </div>

        </div>
    );
}
