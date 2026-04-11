/**
 * VesselCard - Summary card for a vessel within a project
 */

import { useNavigate } from 'react-router-dom';
import { Box, FileBarChart, Trash2, Settings } from 'lucide-react';
import type { ProjectVessel } from '../../types/inspection-project';
import { VESSEL_STATUS_LABELS, VESSEL_STATUS_COLORS } from '../../types/inspection-project';

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

    return (
        <div
            style={{
                padding: 20,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', margin: 0 }}>
                        {vessel.vessel_tag ? `${vessel.vessel_tag} ` : ''}{vessel.vessel_name}
                    </h3>
                    {vessel.vessel_type && (
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                            {vessel.vessel_type}
                        </span>
                    )}
                </div>
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '2px 10px',
                        borderRadius: 12,
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        background: `${VESSEL_STATUS_COLORS[vessel.status]}20`,
                        color: VESSEL_STATUS_COLORS[vessel.status],
                    }}
                >
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: VESSEL_STATUS_COLORS[vessel.status] }} />
                    {VESSEL_STATUS_LABELS[vessel.status]}
                </span>
            </div>

            {/* Coverage bar */}
            {vessel.coverage_target_pct != null && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                        <span>Coverage</span>
                        <span>
                            {vessel.coverage_actual_pct?.toFixed(0) ?? 0}% / {vessel.coverage_target_pct.toFixed(0)}% target
                            {coverageMet && ' \u2713'}
                        </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{
                            width: `${Math.min(100, ((vessel.coverage_actual_pct ?? 0) / vessel.coverage_target_pct) * 100)}%`,
                            height: '100%',
                            borderRadius: 3,
                            background: coverageMet ? '#22c55e' : '#3b82f6',
                            transition: 'width 0.3s',
                        }} />
                    </div>
                </div>
            )}

            {/* Stats */}
            <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
                <span>Composites: {compositeCount}</span>
                {vessel.ga_drawing && <span>GA: uploaded</span>}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
                <button
                    onClick={() => navigate(`/vessel-modeler?project=${projectId}&vessel=${vessel.id}`)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid rgba(59,130,246,0.3)',
                        background: 'rgba(59,130,246,0.1)',
                        color: '#60a5fa',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                    }}
                >
                    <Box size={14} />
                    Open in Modeler
                </button>
                <button
                    onClick={() => navigate(`/cscan?project=${projectId}&vessel=${vessel.id}`)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                    }}
                >
                    <FileBarChart size={14} />
                    Import Scans
                </button>
                <div style={{ flex: 1 }} />
                <button
                    onClick={onEdit}
                    title="Edit vessel"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: 6,
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'transparent',
                        color: 'rgba(255,255,255,0.4)',
                        cursor: 'pointer',
                    }}
                >
                    <Settings size={14} />
                </button>
                <button
                    onClick={onDelete}
                    title="Delete vessel"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: 6,
                        borderRadius: 6,
                        border: '1px solid rgba(239,68,68,0.2)',
                        background: 'transparent',
                        color: 'rgba(239,68,68,0.6)',
                        cursor: 'pointer',
                    }}
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
}
