import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Calendar, Ship, Building2 } from 'lucide-react';
import { useAllVesselsWithProjects } from '../../hooks/queries/useInspectionProjects';
import { PageSpinner } from '../ui/LoadingSpinner';
import type { VesselWithProject } from '../../types/inspection-project';
import { VESSEL_STATUS_LABELS } from '../../types/inspection-project';

interface TripEntry {
    vessel: VesselWithProject;
    dateRange: string;
}

interface VesselGroup {
    vesselLabel: string;
    trips: TripEntry[];
}

interface AssetGroup {
    siteName: string;
    vessels: VesselGroup[];
    totalTrips: number;
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

function buildAssetGroups(vessels: VesselWithProject[]): AssetGroup[] {
    const siteMap = new Map<string, VesselWithProject[]>();
    for (const v of vessels) {
        const site = v.inspection_projects.site_name?.trim() || 'Unknown Site';
        const group = siteMap.get(site) ?? [];
        group.push(v);
        siteMap.set(site, group);
    }

    return Array.from(siteMap.entries())
        .map(([siteName, siteVessels]) => {
            const vesselMap = new Map<string, VesselWithProject[]>();
            for (const v of siteVessels) {
                const key = v.vessel_tag?.trim().toLowerCase() || v.vessel_name.trim().toLowerCase();
                const group = vesselMap.get(key) ?? [];
                group.push(v);
                vesselMap.set(key, group);
            }

            const vesselGroups: VesselGroup[] = Array.from(vesselMap.entries())
                .map(([_key, vGroup]) => ({
                    vesselLabel: vGroup[0].vessel_tag
                        ? `${vGroup[0].vessel_tag} — ${vGroup[0].vessel_name}`
                        : vGroup[0].vessel_name,
                    trips: vGroup
                        .map(v => ({
                            vessel: v,
                            dateRange: formatDateRange(
                                v.inspection_projects.start_date,
                                v.inspection_projects.end_date,
                            ),
                        }))
                        .sort((a, b) => {
                            const da = a.vessel.inspection_projects.start_date || '';
                            const db = b.vessel.inspection_projects.start_date || '';
                            return db.localeCompare(da);
                        }),
                }))
                .sort((a, b) => a.vesselLabel.localeCompare(b.vesselLabel));

            return { siteName, vessels: vesselGroups, totalTrips: siteVessels.length };
        })
        .sort((a, b) => a.siteName.localeCompare(b.siteName));
}

function TripRow({ trip }: { trip: TripEntry }) {
    const navigate = useNavigate();
    const v = trip.vessel;
    const proj = v.inspection_projects;
    const statusClass = getVesselStatusClass(v.status);

    return (
        <button
            onClick={() => navigate(`/projects/${v.project_id}/vessels/${v.id}`)}
            className="pj-trip-row"
        >
            <Calendar size={11} style={{ color: 'var(--clean-text-quaternary)', flexShrink: 0 }} />
            <span className="pj-trip-row-date">{trip.dateRange || 'No date'}</span>
            <span className="pj-trip-row-project">{proj.name}</span>
            <span className={`pj-badge ${statusClass}`}>
                <span className={`pj-led ${statusClass}`} style={{ width: 6, height: 6 }} />
                {VESSEL_STATUS_LABELS[v.status]}
            </span>
            <ChevronRight size={11} className="pj-vessel-row-chevron" />
        </button>
    );
}

function VesselGroupRow({ group }: { group: VesselGroup }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div>
            <button onClick={() => setExpanded(!expanded)} className="pj-vessel-group-btn">
                {expanded
                    ? <ChevronDown size={12} style={{ color: 'var(--clean-text-quaternary)' }} />
                    : <ChevronRight size={12} style={{ color: 'var(--clean-text-quaternary)' }} />
                }
                <Ship size={12} style={{ color: 'var(--clean-text-quaternary)', flexShrink: 0 }} />
                <span className="pj-vessel-group-label">{group.vesselLabel}</span>
                <span className="pj-vessel-group-count">
                    {group.trips.length} inspection{group.trips.length !== 1 ? 's' : ''}
                </span>
            </button>

            {expanded && (
                <div style={{ paddingLeft: 34, paddingRight: 12, paddingBottom: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {group.trips.map(trip => (
                        <TripRow key={trip.vessel.id} trip={trip} />
                    ))}
                </div>
            )}
        </div>
    );
}

function AssetGroupCard({ group }: { group: AssetGroup }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="pj-card">
            <button onClick={() => setExpanded(!expanded)} className="pj-asset-header">
                {expanded
                    ? <ChevronDown size={14} style={{ color: 'var(--clean-text-quaternary)' }} />
                    : <ChevronRight size={14} style={{ color: 'var(--clean-text-quaternary)' }} />
                }
                <Building2 size={14} className="pj-asset-icon" />
                <span className="pj-asset-title">{group.siteName}</span>
                <span className="pj-asset-count">
                    {group.vessels.length} vessel{group.vessels.length !== 1 ? 's' : ''}
                    {' · '}
                    {group.totalTrips} inspection{group.totalTrips !== 1 ? 's' : ''}
                </span>
            </button>

            {expanded && (
                <div style={{ padding: '0 8px 8px 16px' }}>
                    {group.vessels.map(vg => (
                        <VesselGroupRow key={`${vg.vesselLabel}-${vg.trips[0]?.vessel.id ?? ''}`} group={vg} />
                    ))}
                </div>
            )}
        </div>
    );
}

interface AssetViewProps {
    statusFilter: string;
}

export function AssetView({ statusFilter }: AssetViewProps) {
    const { data: allVessels, isLoading } = useAllVesselsWithProjects();

    if (isLoading) return <PageSpinner message="Loading assets..." />;

    const filtered = (allVessels ?? []).filter(v => {
        if (statusFilter === 'all') return true;
        const projStatus = v.inspection_projects.status;
        if (statusFilter === 'active') return !['completed', 'archived'].includes(projStatus);
        if (statusFilter === 'completed') return projStatus === 'completed';
        if (statusFilter === 'archived') return projStatus === 'archived';
        return true;
    });

    const groups = buildAssetGroups(filtered);

    if (groups.length === 0) {
        return (
            <div className="pj-empty">
                <div className="pj-empty-title">No assets found</div>
                <div className="pj-empty-text">Try a different filter.</div>
            </div>
        );
    }

    return (
        <div className="pj-card-list">
            {groups.map(group => (
                <AssetGroupCard key={group.siteName} group={group} />
            ))}
        </div>
    );
}
