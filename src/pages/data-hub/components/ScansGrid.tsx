/**
 * ScansGrid - Displays scan cards in a grid layout
 * Supports grouping by strake when strakes are present
 */

import type { Scan, Strake } from '../../../hooks/queries/useDataHub';

interface ScansGridProps {
    scans: Scan[];
    strakes: Strake[];
    onScanClick: (scan: Scan) => void;
    onDeleteScan: (scan: Scan) => void;
    onReassignScan?: (scan: Scan) => void;
    onAddScans?: () => void;
    onManageStrakes?: () => void;
}

// Tool type badge colors
const toolTypeBadge: Record<string, string> = {
    pec: 'badge-yellow',
    cscan: 'badge-blue',
    '3dview': 'badge-purple',
};

function ScanCard({
    scan,
    onClick,
    onDelete,
    onReassign,
}: {
    scan: Scan;
    onClick: () => void;
    onDelete: () => void;
    onReassign?: () => void;
}) {
    return (
        <div
            className="scan-card-compact glass-card group relative cursor-pointer overflow-hidden"
            style={{ padding: 0, transition: 'all var(--transition-base)' }}
            onClick={onClick}
        >
            {/* Thumbnail */}
            {scan.thumbnail ? (
                <div className="aspect-video relative" style={{ background: 'var(--glass-bg-tertiary)' }}>
                    <img
                        src={scan.thumbnail}
                        alt={scan.name}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center gap-2">
                        {onReassign && (
                            <button
                                className="opacity-0 group-hover:opacity-100 bg-purple-600 text-white p-2 rounded-full hover:bg-purple-700 transition-all"
                                onClick={(e) => { e.stopPropagation(); onReassign(); }}
                                aria-label="Reassign to strake"
                                title="Reassign to strake"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                </svg>
                            </button>
                        )}
                        <button
                            className="opacity-0 group-hover:opacity-100 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition-all"
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            aria-label="Delete scan"
                            title="Delete scan"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    className="aspect-video flex items-center justify-center relative"
                    style={{
                        background: 'linear-gradient(135deg, var(--glass-bg-secondary), var(--glass-bg-tertiary))',
                    }}
                >
                    <svg className="w-8 h-8" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center gap-2">
                        {onReassign && (
                            <button
                                className="opacity-0 group-hover:opacity-100 bg-purple-600 text-white p-2 rounded-full hover:bg-purple-700 transition-all"
                                onClick={(e) => { e.stopPropagation(); onReassign(); }}
                                aria-label="Reassign to strake"
                                title="Reassign to strake"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                </svg>
                            </button>
                        )}
                        <button
                            className="opacity-0 group-hover:opacity-100 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition-all"
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            aria-label="Delete scan"
                            title="Delete scan"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Info */}
            <div style={{ padding: 'var(--spacing-sm)' }}>
                <div
                    className="text-xs font-semibold truncate"
                    style={{ color: 'var(--text-primary)', marginBottom: 'var(--spacing-xs)' }}
                    title={scan.name}
                >
                    {scan.name}
                </div>
                <span
                    className={`glass-badge ${toolTypeBadge[scan.tool_type] || ''}`}
                    style={{ padding: '2px 8px', fontSize: '10px' }}
                >
                    {scan.tool_type.toUpperCase()}
                </span>
            </div>
        </div>
    );
}

export default function ScansGrid({
    scans,
    strakes,
    onScanClick,
    onDeleteScan,
    onReassignScan,
    onAddScans,
    onManageStrakes,
}: ScansGridProps) {
    const hasStrakes = strakes.length > 0;

    // If no strakes, show flat grid
    if (!hasStrakes) {
        return (
            <div>
                <div className="flex justify-between items-center" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <div className="text-xs font-semibold text-secondary" style={{ textTransform: 'uppercase' }}>
                        Scans
                    </div>
                    {onManageStrakes && (
                        <button
                            className="btn-secondary text-xs"
                            onClick={onManageStrakes}
                        >
                            + Add Strake
                        </button>
                    )}
                </div>

                {scans.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {scans.map((scan) => (
                            <ScanCard
                                key={scan.id}
                                scan={scan}
                                onClick={() => onScanClick(scan)}
                                onDelete={() => onDeleteScan(scan)}
                                onReassign={onReassignScan ? () => onReassignScan(scan) : undefined}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-sm italic" style={{ color: 'var(--text-dim)' }}>
                        No scans yet
                    </p>
                )}
            </div>
        );
    }

    // Group scans by strake
    const unassignedScans = scans.filter((s) => !s.strake_id);

    return (
        <div>
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--spacing-md)' }}>
                <div className="text-xs font-semibold text-secondary" style={{ textTransform: 'uppercase' }}>
                    Scans by Strake
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end" style={{ gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
                {onAddScans && (
                    <button
                        className="btn-primary text-xs flex items-center"
                        style={{ gap: 'var(--spacing-xs)' }}
                        onClick={onAddScans}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Add Scans
                    </button>
                )}
                {onManageStrakes && (
                    <button
                        className="btn-secondary text-xs"
                        onClick={onManageStrakes}
                    >
                        Manage Strakes
                    </button>
                )}
            </div>

            {/* Strakes with their scans */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                {strakes.map((strake) => {
                    const strakeScans = scans.filter((s) => s.strake_id === strake.id);

                    return (
                        <div
                            key={strake.id}
                            className="glass-panel"
                            style={{
                                padding: 'var(--spacing-lg)',
                                background: 'var(--glass-bg-tertiary)',
                                border: '1px solid var(--glass-border)',
                            }}
                        >
                            <div className="flex justify-between items-start" style={{ marginBottom: 'var(--spacing-md)' }}>
                                <div className="flex-1">
                                    <div className="flex items-center" style={{ gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
                                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{strake.name}</h4>
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                                        <div>Strake Area: {strake.total_area.toFixed(1)} m²</div>
                                        <div>Required Coverage: {strake.required_coverage}%</div>
                                        <div>{strakeScans.length} scan{strakeScans.length !== 1 ? 's' : ''}</div>
                                    </div>
                                </div>
                            </div>

                            {strakeScans.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
                                    {strakeScans.map((scan) => (
                                        <ScanCard
                                            key={scan.id}
                                            scan={scan}
                                            onClick={() => onScanClick(scan)}
                                            onDelete={() => onDeleteScan(scan)}
                                            onReassign={onReassignScan ? () => onReassignScan(scan) : undefined}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs italic" style={{ color: 'var(--text-dim)', marginTop: 'var(--spacing-sm)' }}>
                                    No scans assigned to this strake
                                </p>
                            )}
                        </div>
                    );
                })}

                {/* Unassigned scans */}
                {unassignedScans.length > 0 && (
                    <div
                        className="glass-panel"
                        style={{
                            padding: 'var(--spacing-lg)',
                            background: 'var(--glass-bg-secondary)',
                            border: '1px dashed var(--glass-border)',
                        }}
                    >
                        <h4 className="font-semibold" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                            Unassigned Scans
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 'var(--spacing-md)' }}>
                            {unassignedScans.map((scan) => (
                                <ScanCard
                                    key={scan.id}
                                    scan={scan}
                                    onClick={() => onScanClick(scan)}
                                    onDelete={() => onDeleteScan(scan)}
                                    onReassign={onReassignScan ? () => onReassignScan(scan) : undefined}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
