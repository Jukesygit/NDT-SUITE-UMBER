/**
 * AssetView - 3-level hierarchy: Site/Asset → Vessel → Trip dates
 *
 * Groups all vessels across all projects by site_name (the asset/platform),
 * then by vessel_tag within each site, then shows trip dates for each vessel.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Calendar, Ship, Building2 } from 'lucide-react';
import { useAllVesselsWithProjects } from '../../hooks/queries/useInspectionProjects';
import { PageSpinner } from '../ui/LoadingSpinner';
import type { VesselWithProject } from '../../types/inspection-project';
import { VESSEL_STATUS_LABELS, VESSEL_STATUS_COLORS } from '../../types/inspection-project';

// ---------------------------------------------------------------------------
// Data grouping
// ---------------------------------------------------------------------------

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

function formatDateRange(start: string | null, end: string | null): string {
    return [start, end]
        .filter(Boolean)
        .map(d => new Date(d!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }))
        .join(' – ');
}

function buildAssetGroups(vessels: VesselWithProject[]): AssetGroup[] {
    // Level 1: Group by site_name (the asset/platform)
    const siteMap = new Map<string, VesselWithProject[]>();

    for (const v of vessels) {
        const site = v.inspection_projects.site_name?.trim() || 'Unknown Site';
        const group = siteMap.get(site) ?? [];
        group.push(v);
        siteMap.set(site, group);
    }

    return Array.from(siteMap.entries())
        .map(([siteName, siteVessels]) => {
            // Level 2: Within each site, group by vessel_tag or vessel_name
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
                            return db.localeCompare(da); // newest first
                        }),
                }))
                .sort((a, b) => a.vesselLabel.localeCompare(b.vesselLabel));

            return {
                siteName,
                vessels: vesselGroups,
                totalTrips: siteVessels.length,
            };
        })
        .sort((a, b) => a.siteName.localeCompare(b.siteName));
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function TripRow({ trip }: { trip: TripEntry }) {
    const navigate = useNavigate();
    const v = trip.vessel;
    const proj = v.inspection_projects;

    return (
        <button
            onClick={() => navigate(`/projects/${v.project_id}/vessels/${v.id}`)}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
        >
            <Calendar size={12} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', color: '#fff', flex: 1 }}>
                {trip.dateRange || 'No date'}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                {proj.name}
            </span>
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '1px 7px', borderRadius: 8, fontSize: '0.65rem', fontWeight: 500,
                background: `${VESSEL_STATUS_COLORS[v.status]}20`,
                color: VESSEL_STATUS_COLORS[v.status],
            }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: VESSEL_STATUS_COLORS[v.status] }} />
                {VESSEL_STATUS_LABELS[v.status]}
            </span>
            <ChevronRight size={12} style={{ color: 'rgba(255,255,255,0.25)' }} />
        </button>
    );
}

function VesselGroupRow({ group }: { group: VesselGroup }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div>
            <button
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '10px 14px',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderRadius: 6,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
                {expanded
                    ? <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.35)' }} />
                    : <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.35)' }} />
                }
                <Ship size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#fff', flex: 1 }}>
                    {group.vesselLabel}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                    {group.trips.length} inspection{group.trips.length !== 1 ? 's' : ''}
                </span>
            </button>

            {expanded && (
                <div style={{ paddingLeft: 38, paddingRight: 14, paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
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
        <div style={{
            borderRadius: 12, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
            <button
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '16px 20px',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
            >
                {expanded
                    ? <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
                    : <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
                }
                <Building2 size={16} style={{ color: '#f59e0b' }} />
                <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                        {group.siteName}
                    </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                    {group.vessels.length} vessel{group.vessels.length !== 1 ? 's' : ''}
                    {' · '}
                    {group.totalTrips} inspection{group.totalTrips !== 1 ? 's' : ''}
                </span>
            </button>

            {expanded && (
                <div style={{ padding: '0 8px 8px 20px' }}>
                    {group.vessels.map(vg => (
                        <VesselGroupRow key={`${vg.vesselLabel}-${vg.trips[0]?.vessel.id ?? ''}`} group={vg} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>
                No assets found.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.map(group => (
                <AssetGroupCard key={group.siteName} group={group} />
            ))}
        </div>
    );
}
