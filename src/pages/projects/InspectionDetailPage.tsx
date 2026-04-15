/**
 * InspectionDetailPage - Vessel Inspection Detail Hub
 * Central page for managing all inspection data for a single vessel within a project.
 * Sections mirror the PAUT report structure for direct report generation.
 */

import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Box, MapPin, Calendar, Pencil, Radio } from 'lucide-react';
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
    useProjectImages,
} from '../../hooks/queries/useInspectionProjects';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { VESSEL_STATUS_LABELS, VESSEL_STATUS_COLORS } from '../../types/inspection-project';
import VesselDetailsSection from '../../components/projects/inspection-detail/VesselDetailsSection';
import ProcedureSection from '../../components/projects/inspection-detail/ProcedureSection';
import EquipmentSection from '../../components/projects/inspection-detail/EquipmentSection';
import ScopeSection from '../../components/projects/inspection-detail/ScopeSection';
import ModelsSection from '../../components/projects/inspection-detail/ModelsSection';
import DocumentsSection from '../../components/projects/inspection-detail/DocumentsSection';
import ImagePoolSection from '../../components/projects/inspection-detail/ImagePoolSection';
import CalibrationLogSection from '../../components/projects/inspection-detail/CalibrationLogSection';
import ScanLogSection from '../../components/projects/inspection-detail/ScanLogSection';
import ResultsSummarySection from '../../components/projects/inspection-detail/ResultsSummarySection';
import SignoffSection from '../../components/projects/inspection-detail/SignoffSection';
import ReportGenerationSection from '../../components/projects/inspection-detail/ReportGenerationSection';

export default function InspectionDetailPage() {
    const { projectId, vesselId } = useParams<{ projectId: string; vesselId: string }>();
    const navigate = useNavigate();

    const { data: project, isLoading: projectLoading } = useProject(projectId);
    const { data: vessel, isLoading: vesselLoading } = useProjectVessel(vesselId);
    const { data: procedures = [] } = useProjectProcedures(projectId);
    const { data: files = [] } = useVesselFiles(vesselId);
    const { data: scanLogEntries = [] } = useScanLogEntries(vesselId);
    const { data: calLogEntries = [] } = useCalibrationLogEntries(vesselId);
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

    if (projectLoading || vesselLoading) return <PageSpinner message="Loading inspection details..." />;

    if (!project || !vessel) {
        return (
            <div style={{ padding: '32px 40px' }}>
                <div style={{ color: '#ef4444', padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
                    Project or vessel not found.
                </div>
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

    return (
        <div className="h-full overflow-y-auto glass-scrollbar">
            {/* Header */}
            <div style={{
                padding: '24px 40px 20px',
                borderBottom: '1px solid var(--glass-border)',
                background: 'var(--surface-raised)',
            }}>
                {/* Back nav + trip context row */}
                <button
                    onClick={() => navigate('/projects')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'none', border: 'none', color: 'var(--text-tertiary)',
                        fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: 8,
                        transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                >
                    <ArrowLeft size={14} />
                    {project.name}
                </button>

                {/* Trip context — client, site, dates */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    fontSize: '0.78rem', color: 'var(--text-tertiary)',
                    marginBottom: 10, flexWrap: 'wrap',
                }}>
                    {project.client_name && (
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {project.client_name}
                        </span>
                    )}
                    {project.site_name && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={12} />
                            {project.site_name}
                        </span>
                    )}
                    {project.location_description && !project.site_name && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={12} />
                            {project.location_description}
                        </span>
                    )}
                    {tripDateRange && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={12} />
                            {tripDateRange}
                        </span>
                    )}
                    {project.contract_number && (
                        <span>Contract: {project.contract_number}</span>
                    )}
                    {project.work_order_number && (
                        <span>WO: {project.work_order_number}</span>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        {/* Editable vessel tag + name */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                            {/* Vessel tag (editable) */}
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
                                    style={{
                                        fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)',
                                        background: 'var(--surface-elevated)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 'var(--radius-sm)',
                                        padding: '2px 8px', width: 120, outline: 'none',
                                    }}
                                />
                            ) : (
                                vessel.vessel_tag && (
                                    <span
                                        onClick={startEditTag}
                                        title="Click to edit tag"
                                        style={{
                                            fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)',
                                            cursor: 'pointer', borderBottom: '1px dashed transparent',
                                            transition: 'border-color 0.15s',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = 'var(--text-tertiary)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = 'transparent'; }}
                                    >
                                        {vessel.vessel_tag} —{' '}
                                    </span>
                                )
                            )}

                            {/* Vessel name (editable) */}
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
                                    style={{
                                        fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)',
                                        background: 'var(--surface-elevated)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 'var(--radius-sm)',
                                        padding: '2px 8px', flex: 1, minWidth: 200, outline: 'none',
                                    }}
                                />
                            ) : (
                                <h1
                                    onClick={startEditName}
                                    title="Click to edit vessel name"
                                    style={{
                                        fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)',
                                        margin: 0, cursor: 'pointer',
                                        borderBottom: '1px dashed transparent',
                                        transition: 'border-color 0.15s',
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderBottomColor = 'var(--text-tertiary)';
                                        (e.currentTarget.querySelector('.edit-icon') as HTMLElement)?.style.setProperty('opacity', '1');
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderBottomColor = 'transparent';
                                        (e.currentTarget.querySelector('.edit-icon') as HTMLElement)?.style.setProperty('opacity', '0');
                                    }}
                                >
                                    {vessel.vessel_name}
                                    <Pencil className="edit-icon" size={14} style={{ opacity: 0, color: 'var(--text-tertiary)', transition: 'opacity 0.15s' }} />
                                </h1>
                            )}

                            {/* Add tag link when none exists */}
                            {!vessel.vessel_tag && !editingTag && (
                                <button
                                    onClick={startEditTag}
                                    style={{
                                        background: 'none', border: 'none', color: 'var(--text-quaternary)',
                                        fontSize: '0.78rem', cursor: 'pointer', padding: '0 4px',
                                        transition: 'color 0.15s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-quaternary)'; }}
                                    title="Add vessel tag"
                                >
                                    + add tag
                                </button>
                            )}
                        </div>

                        {vessel.description && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                                {vessel.description}
                            </p>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '5px 14px', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: 500,
                            background: `${VESSEL_STATUS_COLORS[vessel.status]}20`,
                            color: VESSEL_STATUS_COLORS[vessel.status],
                            border: `1px solid ${VESSEL_STATUS_COLORS[vessel.status]}30`,
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: VESSEL_STATUS_COLORS[vessel.status] }} />
                            {VESSEL_STATUS_LABELS[vessel.status]}
                        </span>

                        {companionConnected && (
                            <button
                                onClick={handlePopulateFromCompanion}
                                disabled={populating || companionFileCount === 0}
                                className="btn btn--secondary btn--sm"
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                title={`${companionFileCount} NDE file${companionFileCount !== 1 ? 's' : ''} available`}
                            >
                                <Radio size={14} style={{ color: '#22c55e' }} />
                                {populating ? 'Populating...' : `Populate from Companion (${companionFileCount})`}
                            </button>
                        )}

                        <button
                            onClick={() => navigate(`/vessel-modeler?project=${projectId}&vessel=${vesselId}`)}
                            className="btn btn--primary btn--sm"
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <Box size={14} />
                            Open 3D Modeler
                        </button>
                    </div>
                </div>
            </div>

            {/* Sections — ordered by inspection workflow */}
            <div style={{ padding: '24px 40px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {populateMsg && (
                    <div style={{
                        padding: '10px 16px',
                        marginBottom: 8,
                        background: populateMsg.type === 'success'
                            ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                        border: `1px solid ${populateMsg.type === 'success'
                            ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                        borderRadius: 8,
                        color: populateMsg.type === 'success' ? '#4ade80' : '#f87171',
                        fontSize: '0.84rem',
                    }}>
                        {populateMsg.text}
                    </div>
                )}
                <VesselDetailsSection vessel={vessel} projectId={projectId!} files={files} />
                <ProcedureSection vessel={vessel} projectId={projectId!} procedures={procedures} />
                <EquipmentSection vessel={vessel} projectId={projectId!} projectEquipment={project.equipment} />
                <ScopeSection vessel={vessel} projectId={projectId!} composites={composites} vesselModels={vesselModels} />
                <ModelsSection vessel={vessel} projectId={projectId!} composites={composites} vesselModels={vesselModels} />
                <DocumentsSection vessel={vessel} projectId={projectId!} files={files} />
                <ImagePoolSection vesselId={vesselId!} projectId={projectId!} images={images} />
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
                />
            </div>
        </div>
    );
}
