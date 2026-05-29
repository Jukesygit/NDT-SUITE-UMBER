/**
 * ReportBuilderPage - Report Builder for a single vessel inspection.
 * Contains report-specific sections: vessel details, procedure, equipment,
 * calibration log, scan log, results summary, sign-off, and report generation.
 * Scope, models, documents, and images have moved to VesselOverviewPage.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Box, MapPin, Calendar, Pencil, Radio, ChevronDown } from 'lucide-react';
import { useUpdateProjectVessel } from '../../hooks/mutations/useInspectionProjectMutations';
import { usePopulateFromCompanion } from '../../hooks/mutations/usePopulateFromCompanion';
import {
    useProject,
    useProjectVessel,
    useProjectProcedures,
    useVesselFiles,
    useScanLogEntries,
    useCalibrationLogEntries,
    useProjectScanComposites,
    useProjectVesselModels,
} from '../../hooks/queries/useInspectionProjects';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { VESSEL_STATUS_LABELS } from '../../types/inspection-project';
import type { VesselStatus } from '../../types/inspection-project';
import VesselDetailsSection from '../../components/projects/inspection-detail/VesselDetailsSection';
import ProcedureSection from '../../components/projects/inspection-detail/ProcedureSection';
import EquipmentSection from '../../components/projects/inspection-detail/EquipmentSection';
import CalibrationLogSection from '../../components/projects/inspection-detail/CalibrationLogSection';
import ScanLogSection from '../../components/projects/inspection-detail/ScanLogSection';
import ResultsSummarySection from '../../components/projects/inspection-detail/ResultsSummarySection';
import SignoffSection from '../../components/projects/inspection-detail/SignoffSection';
import ReportGenerationSection from '../../components/projects/inspection-detail/ReportGenerationSection';
import './projects.css';

function getVesselStatusBadgeClass(status: VesselStatus): string {
    switch (status) {
        case 'completed': return 'active';
        case 'scanning': case 'annotating': return 'info';
        case 'report_ready': return 'warning';
        case 'not_started': case 'setup': return 'neutral';
        default: return 'neutral';
    }
}

export default function ReportBuilderPage() {
    const { projectId, vesselId } = useParams<{ projectId: string; vesselId: string }>();
    const navigate = useNavigate();

    const { data: project, isLoading: projectLoading } = useProject(projectId);
    const { data: vessel, isLoading: vesselLoading } = useProjectVessel(vesselId);
    const { data: procedures = [] } = useProjectProcedures(projectId);
    const { data: files = [] } = useVesselFiles(vesselId);
    const { data: scanLogEntries = [] } = useScanLogEntries(vesselId);
    const { data: calLogEntries = [] } = useCalibrationLogEntries(vesselId);
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
            const result = await populateFromCompanion(vessel, projectId, scanLogEntries, calLogEntries);
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
    }, [vessel, projectId, scanLogEntries, calLogEntries, populateFromCompanion]);

    /* --- Inline editing for vessel name --- */
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

    /* --- Status dropdown --- */
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const statusMenuRef = useRef<HTMLDivElement>(null);

    const handleStatusChange = useCallback((newStatus: VesselStatus) => {
        setStatusMenuOpen(false);
        if (newStatus !== vessel?.status) {
            updateVessel.mutate({ id: vesselId!, params: { status: newStatus }, projectId: projectId! });
        }
    }, [vessel?.status, vesselId, projectId, updateVessel]);

    /* --- Modeler dropdown --- */
    const [modelerMenuOpen, setModelerMenuOpen] = useState(false);
    const modelerMenuRef = useRef<HTMLDivElement>(null);
    const linkedModels = vesselModels.filter((m) => m.project_vessel_id === vesselId);

    /* Close dropdowns on outside click */
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) setStatusMenuOpen(false);
            if (modelerMenuRef.current && !modelerMenuRef.current.contains(e.target as Node)) setModelerMenuOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    if (projectLoading || vesselLoading) return <PageSpinner message="Loading inspection details..." />;

    if (!project || !vessel) {
        return (
            <div className="pj-page">
                <div className="pj-alert error">Project or vessel not found.</div>
            </div>
        );
    }

    /* Format date range for trip context */
    const formatDate = (d: string | null) => {
        if (!d) return null;
        return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const tripDateRange = project.start_date || project.end_date
        ? [formatDate(project.start_date), formatDate(project.end_date)].filter(Boolean).join(' – ')
        : null;

    const statusClass = getVesselStatusBadgeClass(vessel.status);

    return (
        <div className="pj-page">
            {/* Back nav */}
            <button
                onClick={() => navigate(`/projects/${projectId}/vessels/${vesselId}`)}
                className="pj-back-btn"
            >
                <ArrowLeft size={14} />
                {vessel.vessel_tag ? `${vessel.vessel_tag} — ` : ''}{vessel.vessel_name}
            </button>

            {/* Trip context */}
            <div className="pj-page-meta" style={{ marginBottom: 10 }}>
                {project.client_name && (
                    <span style={{ fontWeight: 500, color: 'var(--clean-text-secondary)' }}>
                        {project.client_name}
                    </span>
                )}
                {project.site_name && (
                    <span><MapPin size={12} />{project.site_name}</span>
                )}
                {project.location_description && !project.site_name && (
                    <span><MapPin size={12} />{project.location_description}</span>
                )}
                {tripDateRange && (
                    <span><Calendar size={12} />{tripDateRange}</span>
                )}
                {project.contract_number && <span>Contract: {project.contract_number}</span>}
                {project.work_order_number && <span>WO: {project.work_order_number}</span>}
            </div>

            {/* Header row: title + actions */}
            <div className="pj-header" style={{ marginBottom: 24 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        {editingTag ? (
                            <input
                                autoFocus
                                value={tagDraft}
                                onChange={(e) => setTagDraft(e.target.value)}
                                onBlur={commitTag}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitTag();
                                    if (e.key === 'Escape') setEditingTag(false);
                                }}
                                placeholder="Tag"
                                className="pj-inline-edit-input"
                                style={{ width: 120 }}
                            />
                        ) : (
                            vessel.vessel_tag && (
                                <span
                                    onClick={startEditTag}
                                    title="Click to edit tag"
                                    className="pj-inline-edit-text"
                                >
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
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitName();
                                    if (e.key === 'Escape') setEditingName(false);
                                }}
                                className="pj-inline-edit-input"
                                style={{ flex: 1, minWidth: 200 }}
                            />
                        ) : (
                            <h1
                                onClick={startEditName}
                                title="Click to edit vessel name"
                                className="pj-page-title pj-inline-edit-text"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                            >
                                {vessel.vessel_name}
                                <Pencil className="pj-edit-icon" size={14} />
                            </h1>
                        )}

                        {!vessel.vessel_tag && !editingTag && (
                            <button onClick={startEditTag} className="pj-add-tag-btn" title="Add vessel tag">
                                + add tag
                            </button>
                        )}
                    </div>

                    {vessel.description && (
                        <p style={{ fontSize: 13, color: 'var(--clean-text-secondary)', margin: '4px 0 0' }}>
                            {vessel.description}
                        </p>
                    )}
                </div>

                <div className="pj-header-actions">
                    {/* Status dropdown */}
                    <div ref={statusMenuRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setStatusMenuOpen(prev => !prev)}
                            className={`pj-badge ${statusClass}`}
                            style={{ cursor: 'pointer', gap: 6, padding: '5px 10px 5px 14px' }}
                        >
                            <span className={`pj-led ${statusClass}`} />
                            {VESSEL_STATUS_LABELS[vessel.status]}
                            <ChevronDown size={12} style={{ opacity: 0.6 }} />
                        </button>

                        {statusMenuOpen && (
                            <div className="pj-dropdown-menu" style={{ right: 0 }}>
                                {(Object.keys(VESSEL_STATUS_LABELS) as VesselStatus[]).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => handleStatusChange(s)}
                                        className={`pj-dropdown-item ${s === vessel.status ? 'active' : ''}`}
                                    >
                                        <span className={`pj-led ${getVesselStatusBadgeClass(s)}`} />
                                        {VESSEL_STATUS_LABELS[s]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {companionConnected && (
                        <button
                            onClick={handlePopulateFromCompanion}
                            disabled={populating || companionFileCount === 0}
                            className="pj-btn secondary"
                            style={{ gap: 6 }}
                            title={`${companionFileCount} NDE file${companionFileCount !== 1 ? 's' : ''} available`}
                        >
                            <Radio size={14} className="pj-companion-led" />
                            {populating ? 'Populating...' : `Populate from Companion (${companionFileCount})`}
                        </button>
                    )}

                    {/* Open 3D Modeler dropdown */}
                    <div ref={modelerMenuRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setModelerMenuOpen(prev => !prev)}
                            className="pj-btn primary"
                            style={{ gap: 6 }}
                        >
                            <Box size={14} />
                            Open 3D Modeler
                            <ChevronDown size={12} style={{ opacity: 0.7 }} />
                        </button>

                        {modelerMenuOpen && (
                            <div className="pj-dropdown-menu" style={{ right: 0, minWidth: 220 }}>
                                <button
                                    onClick={() => { setModelerMenuOpen(false); navigate(`/vessel-modeler?project=${projectId}&vessel=${vesselId}`); }}
                                    className="pj-dropdown-item"
                                >
                                    <Box size={12} />
                                    New Model
                                </button>

                                {linkedModels.length > 0 && (
                                    <>
                                        <div className="pj-divider" style={{ margin: '4px 8px' }} />
                                        <div className="pj-dropdown-section-label">Saved Models</div>
                                        {linkedModels.map((m) => (
                                            <button
                                                key={m.id}
                                                onClick={() => { setModelerMenuOpen(false); navigate(`/vessel-modeler?project=${projectId}&vessel=${vesselId}&model=${m.id}`); }}
                                                className="pj-dropdown-item"
                                            >
                                                <Box size={12} style={{ opacity: 0.5 }} />
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                                    {m.model_type && (
                                                        <span style={{ fontSize: 10, color: 'var(--clean-text-quaternary)' }}>
                                                            {m.model_type}
                                                        </span>
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

            {/* Populate feedback */}
            {populateMsg && (
                <div className={`pj-alert ${populateMsg.type === 'success' ? 'success' : 'error'}`}>
                    {populateMsg.text}
                </div>
            )}

            {/* Report sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <VesselDetailsSection vessel={vessel} projectId={projectId!} files={files} />
                <ProcedureSection vessel={vessel} projectId={projectId!} procedures={procedures} />
                <EquipmentSection vessel={vessel} projectId={projectId!} projectEquipment={project.equipment} />
                <CalibrationLogSection vesselId={vesselId!} entries={calLogEntries} />
                <ScanLogSection vesselId={vesselId!} entries={scanLogEntries} composites={composites} />
                <ResultsSummarySection vessel={vessel} projectId={projectId!} />
                <SignoffSection vessel={vessel} projectId={projectId!} />
                <ReportGenerationSection
                    vessel={vessel}
                    project={project}
                    procedures={procedures}
                    files={files}
                    scanLogEntries={scanLogEntries}
                    calLogEntries={calLogEntries}
                    compositeCount={composites.length}
                    overviewUrl={`/projects/${projectId}/vessels/${vesselId}`}
                />
            </div>
        </div>
    );
}
