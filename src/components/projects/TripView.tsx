import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MapPin, ChevronRight, Ship, MoreHorizontal,
    Download, Copy, Archive, ExternalLink,
} from 'lucide-react';
import { useProjectVessels } from '../../hooks/queries/useInspectionProjects';
import type { InspectionProjectSummary, ProjectStatus, ProjectVessel } from '../../types/inspection-project';
import { PROJECT_STATUS_LABELS, VESSEL_STATUS_LABELS } from '../../types/inspection-project';

function getStatusBadgeClass(status: ProjectStatus): string {
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

function getAccentColor(status: ProjectStatus): string {
    switch (status) {
        case 'in_progress': return 'var(--clean-green)';
        case 'mobilizing': return 'var(--clean-green)';
        case 'review': return 'var(--clean-badge-amber-text)';
        case 'planned': return 'var(--clean-badge-blue-text)';
        case 'completed': return 'var(--clean-text-tertiary)';
        default: return 'transparent';
    }
}

function formatDateRange(start: string | null, end: string | null): string {
    return [start, end]
        .filter(Boolean)
        .map(d => new Date(d!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }))
        .join(' – ');
}

function relativeTime(start: string | null, end: string | null, status: ProjectStatus): string {
    const today = new Date();
    const ms = 86400000;

    if (status === 'in_progress' && end) {
        const days = Math.ceil((new Date(end).getTime() - today.getTime()) / ms);
        return days > 0 ? `${days}d remaining` : 'Ends today';
    }
    if (status === 'planned' && start) {
        const days = Math.ceil((new Date(start).getTime() - today.getTime()) / ms);
        return days > 0 ? `Starts in ${days}d` : 'Starts soon';
    }
    if (status === 'review') return 'Reports under review';
    if (status === 'completed' && end) {
        const days = Math.ceil((today.getTime() - new Date(end).getTime()) / ms);
        return `Closed ${days}d ago`;
    }
    if (status === 'mobilizing') return 'Mobilizing';
    return '';
}

function VesselAvatar({ vessel }: { vessel: ProjectVessel }) {
    const initials = (vessel.vessel_tag || vessel.vessel_name)
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 2)
        .toUpperCase();
    return <div className="pj-vessel-avatar">{initials}</div>;
}

function ExpandedDetail({ project }: { project: InspectionProjectSummary }) {
    const navigate = useNavigate();
    const { data: vessels = [], isLoading } = useProjectVessels(project.id);

    return (
        <div className="pj-row-detail">
            <div className="pj-detail-card">
                <h4>Vessels & assets</h4>
                {isLoading ? (
                    <div className="pj-detail-loading">Loading vessels...</div>
                ) : vessels.length === 0 ? (
                    <div className="pj-detail-empty">No vessels assigned</div>
                ) : (
                    <div className="pj-detail-vessels">
                        {vessels.map(v => (
                            <button
                                key={v.id}
                                className="pj-detail-vessel"
                                onClick={() => navigate(`/projects/${project.id}/vessels/${v.id}`)}
                            >
                                <VesselAvatar vessel={v} />
                                <div className="pj-detail-vessel-info">
                                    <strong>{v.vessel_tag ? `${v.vessel_tag} — ` : ''}{v.vessel_name}</strong>
                                    <span>{v.vessel_type || VESSEL_STATUS_LABELS[v.status]}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="pj-detail-card">
                <h4>Details</h4>
                <div className="pj-detail-kvs">
                    <div className="pj-detail-kv">
                        <span className="pj-kv-key">Client</span>
                        <span className="pj-kv-val">{project.client_name || '—'}</span>
                    </div>
                    <div className="pj-detail-kv">
                        <span className="pj-kv-key">Location</span>
                        <span className="pj-kv-val">{project.site_name || '—'}</span>
                    </div>
                    <div className="pj-detail-kv">
                        <span className="pj-kv-key">Dates</span>
                        <span className="pj-kv-val">{formatDateRange(project.start_date, project.end_date) || '—'}</span>
                    </div>
                    <div className="pj-detail-kv">
                        <span className="pj-kv-key">Inspections</span>
                        <span className="pj-kv-val">{project.completed_vessel_count} of {project.vessel_count}</span>
                    </div>
                </div>
            </div>
            <div className="pj-detail-card">
                <h4>Quick actions</h4>
                <div className="pj-detail-actions">
                    <button
                        className="pj-detail-action-btn"
                        onClick={() => navigate(`/projects/${project.id}`)}
                    >
                        <ExternalLink size={14} />Open project
                    </button>
                    <button className="pj-detail-action-btn">
                        <Download size={14} />Export report
                    </button>
                    <button className="pj-detail-action-btn">
                        <Copy size={14} />Duplicate project
                    </button>
                    {project.status !== 'archived' && (
                        <button className="pj-detail-action-btn">
                            <Archive size={14} />Archive
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function ProjectRow({
    project,
    isOpen,
    onToggle,
}: {
    project: InspectionProjectSummary;
    isOpen: boolean;
    onToggle: () => void;
}) {
    const statusClass = getStatusBadgeClass(project.status);
    const accentColor = getAccentColor(project.status);
    const pct = project.vessel_count > 0
        ? Math.round((project.completed_vessel_count / project.vessel_count) * 100)
        : 0;
    const dateRange = formatDateRange(project.start_date, project.end_date);
    const relTime = relativeTime(project.start_date, project.end_date, project.status);
    const isPulse = project.status === 'in_progress';

    return (
        <div className={`pj-project-row-wrap ${isOpen ? 'is-open' : ''}`}>
            <div
                className="pj-project-row"
                style={{ '--row-accent': accentColor } as React.CSSProperties}
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    onToggle();
                }}
            >
                <span className="pj-accent-bar" />
                <div className="pj-project-row-name">
                    <div className="pj-row-chev" aria-hidden="true">
                        <ChevronRight size={13} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <span className="pj-project-row-title">{project.name}</span>
                        <span className="pj-project-row-meta">
                            {project.client_name && <span>{project.client_name}</span>}
                            {project.site_name && (
                                <>
                                    <span className="pj-dot-sep" />
                                    <span><MapPin size={10} />{project.site_name}</span>
                                </>
                            )}
                        </span>
                    </div>
                </div>
                <div className="pj-project-row-dates">
                    {dateRange && <span className="pj-date-range">{dateRange}</span>}
                    {relTime && <span className="pj-date-rel">{relTime}</span>}
                </div>
                <div className="pj-project-row-progress">
                    <div className="pj-progress-meta">
                        <span><strong>{project.completed_vessel_count}</strong> / {project.vessel_count}</span>
                        <span>{pct}%</span>
                    </div>
                    <div className="pj-progress-track">
                        <div
                            className={`pj-progress-fill ${pct >= 100 ? 'complete' : ''}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>
                <span className={`pj-badge ${statusClass} ${isPulse ? 'pulse' : ''}`}>
                    <span className={`pj-led ${statusClass}`} />
                    {PROJECT_STATUS_LABELS[project.status]}
                </span>
                <div className="pj-project-row-vessels">
                    <Ship size={14} />
                    <span>{project.vessel_count}</span>
                </div>
                <button className="pj-more-btn" aria-label="More actions" onClick={e => e.stopPropagation()}>
                    <MoreHorizontal size={15} />
                </button>
            </div>
            {isOpen && <ExpandedDetail project={project} />}
        </div>
    );
}

interface TripViewProps {
    projects: InspectionProjectSummary[];
}

export function TripView({ projects }: TripViewProps) {
    const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

    const toggleOpen = (id: string) => {
        setOpenIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="pj-list">
            <div className="pj-list-head">
                <span>Project</span>
                <span>Dates</span>
                <span>Progress</span>
                <span>Status</span>
                <span>Vessels</span>
                <span />
            </div>
            {projects.length === 0 ? (
                <div className="pj-empty-text" style={{ padding: '32px 20px' }}>
                    No projects match the current filters
                </div>
            ) : (
                projects.map(project => (
                    <ProjectRow
                        key={project.id}
                        project={project}
                        isOpen={openIds.has(project.id)}
                        onToggle={() => toggleOpen(project.id)}
                    />
                ))
            )}
        </div>
    );
}
