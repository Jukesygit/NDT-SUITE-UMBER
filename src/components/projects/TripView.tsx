/**
 * TripView - Shows trips (projects) as expandable cards: Trip (Site + Date) → Vessels
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, ChevronRight, ChevronDown, Ship, Plus } from 'lucide-react';
import { useProjectVessels } from '../../hooks/queries/useInspectionProjects';
import { useCreateProjectVessel } from '../../hooks/mutations/useInspectionProjectMutations';
import { Modal } from '../ui/Modal';
import type { InspectionProjectSummary, ProjectStatus, ProjectVessel } from '../../types/inspection-project';
import { PROJECT_STATUS_LABELS, VESSEL_STATUS_LABELS } from '../../types/inspection-project';

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

function getVesselStatusClass(status: string): string {
    switch (status) {
        case 'completed': return 'active';
        case 'in_progress': return 'info';
        case 'pending_review': return 'warning';
        case 'not_started': return 'neutral';
        default: return 'neutral';
    }
}

function formatDateRange(start: string | null, end: string | null): string {
    return [start, end]
        .filter(Boolean)
        .map(d => new Date(d!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }))
        .join(' – ');
}

function buildTripTitle(project: InspectionProjectSummary): string {
    const parts: string[] = [];
    if (project.site_name) parts.push(project.site_name);
    const dateRange = formatDateRange(project.start_date, project.end_date);
    if (dateRange) parts.push(dateRange);
    if (parts.length === 0) return project.name;
    return parts.join(' — ');
}

function VesselRow({ vessel, projectId }: { vessel: ProjectVessel; projectId: string }) {
    const navigate = useNavigate();
    const statusClass = getVesselStatusClass(vessel.status);

    return (
        <button
            onClick={() => navigate(`/projects/${projectId}/vessels/${vessel.id}`)}
            className="pj-vessel-row"
        >
            <Ship size={13} className="pj-vessel-row-icon" />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pj-vessel-row-name">
                    {vessel.vessel_tag ? `${vessel.vessel_tag} — ` : ''}{vessel.vessel_name}
                </div>
                {vessel.vessel_type && (
                    <div className="pj-vessel-row-type">{vessel.vessel_type}</div>
                )}
            </div>
            <span className={`pj-badge ${statusClass}`}>
                <span className={`pj-led ${statusClass}`} />
                {VESSEL_STATUS_LABELS[vessel.status]}
            </span>
            <ChevronRight size={12} className="pj-vessel-row-chevron" />
        </button>
    );
}

function TripVessels({ projectId }: { projectId: string }) {
    const { data: vessels = [], isLoading } = useProjectVessels(projectId);
    const createMutation = useCreateProjectVessel();
    const [showAddModal, setShowAddModal] = useState(false);
    const [form, setForm] = useState({ vesselName: '', vesselTag: '', vesselType: '', coverageTargetPct: '' });

    const handleAdd = async () => {
        if (!form.vesselName.trim()) return;
        const coverage = form.coverageTargetPct ? parseFloat(form.coverageTargetPct) : undefined;
        await createMutation.mutateAsync({
            projectId,
            vesselName: form.vesselName,
            vesselTag: form.vesselTag || undefined,
            vesselType: form.vesselType || undefined,
            coverageTargetPct: coverage,
        });
        setShowAddModal(false);
        setForm({ vesselName: '', vesselTag: '', vesselType: '', coverageTargetPct: '' });
    };

    if (isLoading) {
        return <div style={{ padding: '8px 14px' }} className="pj-empty-text">Loading vessels...</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {vessels.length === 0 && (
                <div style={{ padding: '8px 14px' }} className="pj-empty-text">No vessels in this trip</div>
            )}
            {vessels.map(v => (
                <VesselRow key={v.id} vessel={v} projectId={projectId} />
            ))}
            <div style={{ padding: '4px 14px 8px' }}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setForm({ vesselName: '', vesselTag: '', vesselType: '', coverageTargetPct: '' });
                        setShowAddModal(true);
                    }}
                    className="pj-add-vessel-btn"
                >
                    <Plus size={12} />
                    Add Vessel
                </button>
            </div>

            {showAddModal && (
                <Modal isOpen={true} title="Add Vessel" onClose={() => setShowAddModal(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 400 }}>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Vessel Name *</span>
                            <input
                                value={form.vesselName}
                                onChange={e => setForm(f => ({ ...f, vesselName: e.target.value }))}
                                placeholder="e.g., Feed Drum"
                                autoFocus
                                className="pj-form-input"
                            />
                        </div>
                        <div className="pj-form-grid">
                            <div className="pj-form-field">
                                <span className="pj-form-label">Tag Number</span>
                                <input
                                    value={form.vesselTag}
                                    onChange={e => setForm(f => ({ ...f, vesselTag: e.target.value }))}
                                    placeholder="e.g., V-101"
                                    className="pj-form-input"
                                />
                            </div>
                            <div className="pj-form-field">
                                <span className="pj-form-label">Type</span>
                                <select
                                    value={form.vesselType}
                                    onChange={e => setForm(f => ({ ...f, vesselType: e.target.value }))}
                                    className="pj-form-input"
                                >
                                    <option value="">Select type...</option>
                                    <option value="pressure_vessel">Pressure Vessel</option>
                                    <option value="heat_exchanger">Heat Exchanger</option>
                                    <option value="tank">Tank</option>
                                    <option value="column">Column</option>
                                    <option value="piping">Piping</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                        <div className="pj-form-field">
                            <span className="pj-form-label">Coverage Target (%)</span>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={form.coverageTargetPct}
                                onChange={e => setForm(f => ({ ...f, coverageTargetPct: e.target.value }))}
                                placeholder="e.g., 40"
                                className="pj-form-input"
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
                            <button onClick={() => setShowAddModal(false)} className="pj-btn secondary">Cancel</button>
                            <button
                                onClick={handleAdd}
                                disabled={!form.vesselName.trim() || createMutation.isPending}
                                className="pj-btn primary"
                                style={{ opacity: form.vesselName.trim() ? 1 : 0.5 }}
                            >
                                {createMutation.isPending ? 'Adding...' : 'Add Vessel'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function TripCard({ project }: { project: InspectionProjectSummary }) {
    const [expanded, setExpanded] = useState(false);
    const tripTitle = buildTripTitle(project);
    const hasSubtitle = tripTitle !== project.name;
    const statusClass = getProjectStatusClass(project.status);

    const pct = project.vessel_count > 0
        ? (project.completed_vessel_count / project.vessel_count) * 100
        : 0;

    return (
        <div className="pj-card-well">
            <div className="pj-card-display">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="pj-trip-header"
                >
                    <div className="pj-trip-top-row">
                        <div className="pj-trip-title-area">
                            {expanded
                                ? <ChevronDown size={14} style={{ color: 'rgba(53, 160, 88, 0.40)', marginTop: 1, flexShrink: 0 }} />
                                : <ChevronRight size={14} style={{ color: 'rgba(53, 160, 88, 0.40)', marginTop: 1, flexShrink: 0 }} />
                            }
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 className="pj-trip-title">{tripTitle}</h3>
                                <div className="pj-trip-meta">
                                    {hasSubtitle && <span>{project.name}</span>}
                                    {project.client_name && <span>{project.client_name}</span>}
                                    {!hasSubtitle && project.site_name && (
                                        <span><MapPin size={10} />{project.site_name}</span>
                                    )}
                                    {!hasSubtitle && project.start_date && (
                                        <span><Calendar size={10} />{formatDateRange(project.start_date, project.end_date)}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <span className={`pj-badge ${statusClass}`}>
                            <span className={`pj-led ${statusClass}`} />
                            {PROJECT_STATUS_LABELS[project.status]}
                        </span>
                    </div>
                    <div style={{ paddingLeft: 22 }}>
                        <div className="pj-progress-wrap">
                            <div className="pj-progress-track">
                                <div
                                    className={`pj-progress-fill ${pct >= 100 ? 'complete' : ''}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <span className="pj-progress-label">
                                {project.completed_vessel_count}/{project.vessel_count} vessels
                            </span>
                        </div>
                    </div>
                </button>

                {expanded && <TripVessels projectId={project.id} />}
            </div>
        </div>
    );
}

interface TripViewProps {
    projects: InspectionProjectSummary[];
}

export function TripView({ projects }: TripViewProps) {
    return (
        <div className="pj-card-list">
            {projects.map(project => (
                <TripCard key={project.id} project={project} />
            ))}
        </div>
    );
}
