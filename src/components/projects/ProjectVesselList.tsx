import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, Ship } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useCreateProjectVessel } from '../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel } from '../../types/inspection-project';
import { VESSEL_STATUS_LABELS } from '../../types/inspection-project';

function getVesselStatusClass(status: string): string {
    switch (status) {
        case 'completed': return 'active';
        case 'report_ready': return 'active';
        case 'scanning': return 'info';
        case 'annotating': return 'info';
        case 'setup': return 'info';
        case 'not_started': return 'neutral';
        default: return 'neutral';
    }
}

interface ProjectVesselListProps {
    projectId: string;
    vessels: ProjectVessel[];
    compositeCountByVessel: Map<string, number>;
}

export function ProjectVesselList({ projectId, vessels, compositeCountByVessel }: ProjectVesselListProps) {
    const navigate = useNavigate();
    const [showAddModal, setShowAddModal] = useState(false);
    const [vesselName, setVesselName] = useState('');
    const [vesselTag, setVesselTag] = useState('');
    const [vesselType, setVesselType] = useState('');
    const createMutation = useCreateProjectVessel();

    const handleAdd = async () => {
        if (!vesselName.trim()) return;
        await createMutation.mutateAsync({
            projectId,
            vesselName: vesselName.trim(),
            vesselTag: vesselTag.trim() || undefined,
            vesselType: vesselType.trim() || undefined,
        });
        setVesselName('');
        setVesselTag('');
        setVesselType('');
        setShowAddModal(false);
    };

    return (
        <div>
            <div className="pj-vessel-list-header">
                <span className="pj-vessel-list-label">Vessels</span>
                <button onClick={() => setShowAddModal(true)} className="pj-btn secondary sm">
                    <Plus size={13} />
                    Add Vessel
                </button>
            </div>

            {vessels.length === 0 ? (
                <div className="pj-card">
                    <div className="pj-empty">
                        <Ship size={28} style={{ color: 'var(--clean-text-quaternary)', marginBottom: 8 }} />
                        <div className="pj-empty-title">No vessels yet</div>
                        <div className="pj-empty-text">Add vessels to start setting up this inspection project.</div>
                        <button onClick={() => setShowAddModal(true)} className="pj-btn primary" style={{ marginTop: 16 }}>
                            <Plus size={14} />
                            Add Vessel
                        </button>
                    </div>
                </div>
            ) : (
                <div className="pj-card" style={{ overflow: 'hidden' }}>
                    {vessels.map(v => {
                        const statusClass = getVesselStatusClass(v.status);
                        const scans = compositeCountByVessel.get(v.id) ?? 0;
                        const coveragePct = v.coverage_target_pct && v.coverage_actual_pct
                            ? Math.round((v.coverage_actual_pct / v.coverage_target_pct) * 100)
                            : null;

                        return (
                            <div
                                key={v.id}
                                className="pj-dash-vessel-row"
                                onClick={() => navigate(`/projects/${projectId}/vessels/${v.id}`)}
                            >
                                <div className="pj-dash-vessel-name">
                                    <span className="pj-dash-vessel-title">
                                        {v.vessel_tag ? `${v.vessel_tag} — ` : ''}{v.vessel_name}
                                    </span>
                                    {v.vessel_type && (
                                        <span className="pj-dash-vessel-type">{v.vessel_type}</span>
                                    )}
                                </div>

                                <span className={`pj-badge ${statusClass}`}>
                                    <span className={`pj-led ${statusClass}`} />
                                    {VESSEL_STATUS_LABELS[v.status]}
                                </span>

                                <span className="pj-dash-vessel-scans">
                                    {scans} scan{scans !== 1 ? 's' : ''}
                                </span>

                                {coveragePct !== null && (
                                    <div className="pj-progress-wrap" style={{ width: 80 }}>
                                        <div className="pj-progress-track" style={{ flex: 1 }}>
                                            <div
                                                className={`pj-progress-fill ${coveragePct >= 100 ? 'complete' : ''}`}
                                                style={{ width: `${Math.min(100, coveragePct)}%` }}
                                            />
                                        </div>
                                        <span className="pj-progress-label">{coveragePct}%</span>
                                    </div>
                                )}

                                <ChevronRight size={14} style={{ color: 'var(--clean-text-quaternary)', flexShrink: 0 }} />
                            </div>
                        );
                    })}
                </div>
            )}

            {showAddModal && (
                <Modal isOpen={true} title="Add Vessel" onClose={() => setShowAddModal(false)}>
                    <div className="pj-form-card" style={{ border: 'none', padding: 0, margin: 0 }}>
                        <div className="pj-form-grid">
                            <div className="pj-form-field">
                                <label className="pj-form-label">Vessel Name *</label>
                                <input
                                    value={vesselName}
                                    onChange={e => setVesselName(e.target.value)}
                                    placeholder="e.g. Knockout Drum"
                                    className="pj-form-input"
                                    autoFocus
                                />
                            </div>
                            <div className="pj-form-field">
                                <label className="pj-form-label">Tag</label>
                                <input
                                    value={vesselTag}
                                    onChange={e => setVesselTag(e.target.value)}
                                    placeholder="e.g. V-101"
                                    className="pj-form-input"
                                />
                            </div>
                            <div className="pj-form-field full-width">
                                <label className="pj-form-label">Vessel Type</label>
                                <input
                                    value={vesselType}
                                    onChange={e => setVesselType(e.target.value)}
                                    placeholder="e.g. Pressure Vessel, Heat Exchanger"
                                    className="pj-form-input"
                                />
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setShowAddModal(false)} className="pj-btn secondary">Cancel</button>
                        <button
                            onClick={handleAdd}
                            disabled={!vesselName.trim() || createMutation.isPending}
                            className="pj-btn primary"
                        >
                            {createMutation.isPending ? 'Adding...' : 'Add Vessel'}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
