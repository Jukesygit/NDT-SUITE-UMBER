/**
 * TripView - Shows trips (projects) as expandable cards: Trip (Site + Date) → Vessels
 * Trip title is composed from site_name + date range.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, ChevronRight, ChevronDown, Ship } from 'lucide-react';
import { useProjectVessels } from '../../hooks/queries/useInspectionProjects';
import type { InspectionProjectSummary, ProjectStatus, ProjectVessel } from '../../types/inspection-project';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, VESSEL_STATUS_LABELS, VESSEL_STATUS_COLORS } from '../../types/inspection-project';

function StatusBadge({ status }: { status: ProjectStatus }) {
    return (
        <span
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '2px 10px', borderRadius: 12,
                fontSize: '0.75rem', fontWeight: 500,
                background: `${PROJECT_STATUS_COLORS[status]}20`,
                color: PROJECT_STATUS_COLORS[status],
            }}
        >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PROJECT_STATUS_COLORS[status] }} />
            {PROJECT_STATUS_LABELS[status]}
        </span>
    );
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
    const pct = total > 0 ? (completed / total) * 100 : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 3,
                    background: pct === 100 ? '#22c55e' : '#3b82f6', transition: 'width 0.3s',
                }} />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                {completed}/{total} vessels
            </span>
        </div>
    );
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

    return (
        <button
            onClick={() => navigate(`/projects/${projectId}/vessels/${vessel.id}`)}
            style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        >
            <Ship size={14} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#fff' }}>
                    {vessel.vessel_tag ? `${vessel.vessel_tag} — ` : ''}{vessel.vessel_name}
                </div>
                {vessel.vessel_type && (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                        {vessel.vessel_type}
                    </div>
                )}
            </div>

            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 500,
                background: `${VESSEL_STATUS_COLORS[vessel.status]}20`,
                color: VESSEL_STATUS_COLORS[vessel.status],
            }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: VESSEL_STATUS_COLORS[vessel.status] }} />
                {VESSEL_STATUS_LABELS[vessel.status]}
            </span>

            <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>
    );
}

function TripVessels({ projectId }: { projectId: string }) {
    const { data: vessels = [], isLoading } = useProjectVessels(projectId);

    if (isLoading) {
        return <div style={{ padding: '8px 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>Loading vessels...</div>;
    }

    if (vessels.length === 0) {
        return <div style={{ padding: '8px 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>No vessels in this trip</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {vessels.map(v => (
                <VesselRow key={v.id} vessel={v} projectId={projectId} />
            ))}
        </div>
    );
}

function TripCard({ project }: { project: InspectionProjectSummary }) {
    const [expanded, setExpanded] = useState(false);
    const tripTitle = buildTripTitle(project);
    const hasSubtitle = tripTitle !== project.name;

    return (
        <div style={{
            borderRadius: 12, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
            transition: 'all 0.15s',
        }}>
            {/* Trip header */}
            <button
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex', flexDirection: 'column', gap: 10, padding: 20,
                    width: '100%', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                        {expanded
                            ? <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.4)', marginTop: 2, flexShrink: 0 }} />
                            : <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.4)', marginTop: 2, flexShrink: 0 }} />
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', margin: 0, marginBottom: 4 }}>
                                {tripTitle}
                            </h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                                {hasSubtitle && <span>{project.name}</span>}
                                {project.client_name && <span>{project.client_name}</span>}
                                {!hasSubtitle && project.site_name && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <MapPin size={12} />{project.site_name}
                                    </span>
                                )}
                                {!hasSubtitle && project.start_date && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <Calendar size={12} />{formatDateRange(project.start_date, project.end_date)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <StatusBadge status={project.status} />
                    </div>
                </div>
                <div style={{ paddingLeft: 26 }}>
                    <ProgressBar completed={project.completed_vessel_count} total={project.vessel_count} />
                </div>
            </button>

            {/* Expanded vessel list */}
            {expanded && (
                <div style={{ padding: '0 20px 16px', paddingLeft: 46 }}>
                    <TripVessels projectId={project.id} />
                </div>
            )}
        </div>
    );
}

interface TripViewProps {
    projects: InspectionProjectSummary[];
}

export function TripView({ projects }: TripViewProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map(project => (
                <TripCard key={project.id} project={project} />
            ))}
        </div>
    );
}
