/**
 * VesselCard - Summary card for a vessel within a project
 */

import { useNavigate } from 'react-router-dom';
import { Box, FileBarChart, Trash2, Settings, ChevronRight } from 'lucide-react';
import type { ProjectVessel } from '../../types/inspection-project';
import { VESSEL_STATUS_LABELS } from '../../types/inspection-project';

function getVesselStatusClass(status: string): string {
    switch (status) {
        case 'completed': return 'active';
        case 'in_progress': return 'info';
        case 'pending_review': return 'warning';
        case 'not_started': return 'neutral';
        default: return 'neutral';
    }
}

interface VesselCardProps {
    vessel: ProjectVessel;
    projectId: string;
    compositeCount: number;
    onDelete: () => void;
    onEdit: () => void;
}

export function VesselCard({ vessel, projectId, compositeCount, onDelete, onEdit }: VesselCardProps) {
    const navigate = useNavigate();
    const coverageMet = vessel.coverage_target_pct != null &&
        vessel.coverage_actual_pct != null &&
        vessel.coverage_actual_pct >= vessel.coverage_target_pct;

    const statusClass = getVesselStatusClass(vessel.status);

    return (
        <div className="pj-vessel-card">
            <div className="pj-vessel-card-inner">
                {/* Header */}
                <div
                    className="pj-vessel-card-header"
                    onClick={() => navigate(`/projects/${projectId}/vessels/${vessel.id}`)}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 className="pj-vessel-card-title">
                            {vessel.vessel_tag ? `${vessel.vessel_tag} ` : ''}{vessel.vessel_name}
                        </h3>
                        {vessel.vessel_type && (
                            <div className="pj-vessel-card-type">{vessel.vessel_type}</div>
                        )}
                    </div>
                    <span className={`pj-badge ${statusClass}`}>
                        <span className={`pj-led ${statusClass}`} />
                        {VESSEL_STATUS_LABELS[vessel.status]}
                    </span>
                    <ChevronRight size={14} className="pj-vessel-row-chevron" style={{ marginLeft: 6 }} />
                </div>

                {/* Coverage bar */}
                {vessel.coverage_target_pct != null && (
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span className="pj-stat-label" style={{ marginBottom: 0 }}>Coverage</span>
                            <span className="pj-stat-label" style={{ marginBottom: 0 }}>
                                {vessel.coverage_actual_pct?.toFixed(0) ?? 0}% / {vessel.coverage_target_pct.toFixed(0)}%
                                {coverageMet && ' ✓'}
                            </span>
                        </div>
                        <div className="pj-progress-wrap">
                            <div className="pj-progress-track" style={{ flex: 1 }}>
                                <div
                                    className={`pj-progress-fill ${coverageMet ? 'complete' : ''}`}
                                    style={{ width: `${Math.min(100, ((vessel.coverage_actual_pct ?? 0) / vessel.coverage_target_pct) * 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats */}
                <div className="pj-vessel-card-stats">
                    <span>Composites: {compositeCount}</span>
                    {vessel.ga_drawing && <span>GA: uploaded</span>}
                </div>

                {/* Actions */}
                <div className="pj-vessel-card-actions">
                    <button
                        onClick={() => navigate(`/vessel-modeler?project=${projectId}&vessel=${vessel.id}`)}
                        className="pj-vessel-action-btn"
                    >
                        <Box size={12} />
                        Open in Modeler
                    </button>
                    <button
                        onClick={() => navigate(`/cscan?project=${projectId}&vessel=${vessel.id}`)}
                        className="pj-vessel-action-btn ghost"
                    >
                        <FileBarChart size={12} />
                        Import Scans
                    </button>
                    <div style={{ flex: 1 }} />
                    <button onClick={onEdit} title="Edit vessel" className="pj-vessel-action-btn ghost" style={{ padding: 5 }}>
                        <Settings size={12} />
                    </button>
                    <button onClick={onDelete} title="Delete vessel" className="pj-vessel-action-btn danger-ghost" style={{ padding: 5 }}>
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>
        </div>
    );
}
