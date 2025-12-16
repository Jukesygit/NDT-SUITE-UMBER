/**
 * StrakesSection - Strakes with coverage progress and scans
 */

import type { Scan, Strake } from '../../../hooks/queries/useDataHub';

interface Props {
    strakes: Strake[];
    scans: Scan[];
    onScanClick: (scan: Scan) => void;
    onDeleteScan: (scan: Scan) => void;
    onReassignScan: (scan: Scan) => void;
    onAddScans: () => void;
    onManageStrakes: () => void;
}

const TOOL_COLORS: Record<string, string> = {
    pec: '#eab308',
    cscan: '#3b82f6',
    '3dview': '#a855f7',
};

function getCoverage(strake: Strake, scans: Scan[]) {
    const count = scans.filter(s => s.strake_id === strake.id).length;
    const areaPerScan = strake.total_area / 10;
    const target = (strake.total_area * strake.required_coverage) / 100;
    const pct = target > 0 ? Math.min((count * areaPerScan / target) * 100, 100) : 0;
    return { count, pct, done: pct >= 100 };
}

// Scan thumbnail
function ScanCard({ scan, onClick, onDelete, onReassign }: {
    scan: Scan;
    onClick: () => void;
    onDelete: () => void;
    onReassign: () => void;
}) {
    const color = TOOL_COLORS[scan.tool_type] || '#6b7280';

    return (
        <div
            className="group relative w-24 rounded-lg overflow-hidden cursor-pointer"
            style={{ background: 'var(--glass-bg-tertiary)', border: '1px solid var(--glass-border)' }}
            onClick={onClick}
        >
            <div className="aspect-video flex items-center justify-center relative">
                {scan.thumbnail ? (
                    <img src={scan.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                    <svg className="w-6 h-6" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                )}

                {/* Tool badge */}
                <span
                    className="absolute top-1 left-1 px-1 py-0.5 rounded text-[9px] font-bold uppercase"
                    style={{ background: `${color}33`, color }}
                >
                    {scan.tool_type}
                </span>

                {/* Hover actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button
                        onClick={e => { e.stopPropagation(); onReassign(); }}
                        className="p-1.5 rounded-full bg-purple-600 text-white"
                        title="Reassign"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); onDelete(); }}
                        className="p-1.5 rounded-full bg-red-600 text-white"
                        title="Delete"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
            <div className="px-1.5 py-1 text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                {scan.name}
            </div>
        </div>
    );
}

// Single strake card
function StrakeCard({ strake, scans, onScanClick, onDeleteScan, onReassignScan }: {
    strake: Strake;
    scans: Scan[];
    onScanClick: (scan: Scan) => void;
    onDeleteScan: (scan: Scan) => void;
    onReassignScan: (scan: Scan) => void;
}) {
    const strakeScans = scans.filter(s => s.strake_id === strake.id);
    const cov = getCoverage(strake, scans);
    const color = cov.done ? '#22c55e' : '#f59e0b';

    return (
        <div className="glass-panel p-4">
            {/* Header with progress */}
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{strake.name}</h3>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {strake.total_area.toFixed(1)} m² • {strake.required_coverage}% required
                    </p>
                </div>
                <span
                    className="px-2 py-1 rounded-full text-xs font-bold"
                    style={{ background: `${color}22`, color }}
                >
                    {cov.pct.toFixed(0)}%
                </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: 'var(--glass-bg-tertiary)' }}>
                <div className="h-full transition-all" style={{ width: `${cov.pct}%`, background: color }} />
            </div>

            {/* Scans */}
            {strakeScans.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {strakeScans.map(scan => (
                        <ScanCard
                            key={scan.id}
                            scan={scan}
                            onClick={() => onScanClick(scan)}
                            onDelete={() => onDeleteScan(scan)}
                            onReassign={() => onReassignScan(scan)}
                        />
                    ))}
                </div>
            ) : (
                <p className="text-xs text-center py-3" style={{ color: 'var(--text-dim)' }}>
                    No scans assigned yet
                </p>
            )}
        </div>
    );
}

export default function StrakesSection({
    strakes,
    scans,
    onScanClick,
    onDeleteScan,
    onReassignScan,
    onAddScans,
    onManageStrakes,
}: Props) {
    const unassigned = scans.filter(s => !s.strake_id);

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                        Strakes & Coverage
                    </h2>
                    <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                        {strakes.length} strake{strakes.length !== 1 ? 's' : ''} • {scans.length} scan{scans.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onAddScans} className="btn-primary btn-sm">
                        + Scans
                    </button>
                    <button onClick={onManageStrakes} className="btn-secondary btn-sm">
                        Manage Strakes
                    </button>
                </div>
            </div>

            {/* Empty state */}
            {strakes.length === 0 && scans.length === 0 && (
                <div
                    className="text-center py-12 rounded-xl"
                    style={{ background: 'var(--glass-bg-secondary)', border: '2px dashed var(--glass-border)' }}
                >
                    <svg className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <h3 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No strakes yet</h3>
                    <p className="text-sm mb-4" style={{ color: 'var(--text-dim)' }}>
                        Add strakes to organize scans by location
                    </p>
                    <button onClick={onManageStrakes} className="btn-primary btn-sm">
                        + Add First Strake
                    </button>
                </div>
            )}

            {/* Warning if scans but no strakes */}
            {strakes.length === 0 && scans.length > 0 && (
                <div
                    className="flex items-center gap-2 p-3 rounded-lg mb-4 text-sm"
                    style={{ background: '#f59e0b22', border: '1px solid #f59e0b44', color: '#f59e0b' }}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {scans.length} scan{scans.length !== 1 ? 's' : ''} not assigned. Add strakes to track coverage.
                </div>
            )}

            {/* Strakes */}
            {strakes.length > 0 && (
                <div className="space-y-4">
                    {strakes.map(strake => (
                        <StrakeCard
                            key={strake.id}
                            strake={strake}
                            scans={scans}
                            onScanClick={onScanClick}
                            onDeleteScan={onDeleteScan}
                            onReassignScan={onReassignScan}
                        />
                    ))}
                </div>
            )}

            {/* Unassigned scans */}
            {unassigned.length > 0 && (
                <div className="mt-4">
                    <div
                        className="p-4 rounded-xl"
                        style={{ background: 'var(--glass-bg-secondary)', border: '2px dashed var(--glass-border)' }}
                    >
                        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                            Unassigned ({unassigned.length})
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {unassigned.map(scan => (
                                <ScanCard
                                    key={scan.id}
                                    scan={scan}
                                    onClick={() => onScanClick(scan)}
                                    onDelete={() => onDeleteScan(scan)}
                                    onReassign={() => onReassignScan(scan)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
