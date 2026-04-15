import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CollapsibleSection from './CollapsibleSection';
import { useUpdateProjectVessel } from '../../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel } from '../../../types/inspection-project';

interface ScopeSectionProps {
    vessel: ProjectVessel;
    projectId: string;
    composites: { id: string; name: string; stats: any; created_at: string; project_vessel_id: string | null }[];
    vesselModels: { id: string; name: string; updated_at: string; project_vessel_id: string | null }[];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScopeSection({ vessel, projectId, composites, vesselModels }: ScopeSectionProps) {
    const navigate = useNavigate();
    const updateVessel = useUpdateProjectVessel();
    const [shellArea, setShellArea] = useState(vessel.shell_area_sqm?.toString() ?? '');

    const actual = vessel.coverage_actual_pct ?? 0;
    const target = vessel.coverage_target_pct ?? 100;
    const hasModel = !!vessel.vessel_model_id || vesselModels.some(m => m.project_vessel_id === vessel.id);

    // Compute scan area from composites that have stats with scan/index ranges
    const scanAreaSqm = useMemo(() => {
        let total = 0;
        for (const comp of composites) {
            const s = comp.stats;
            if (s && typeof s === 'object') {
                const scanRange =
                    typeof s.scan_end === 'number' && typeof s.scan_start === 'number'
                        ? Math.abs(s.scan_end - s.scan_start)
                        : typeof s.scanRange === 'number'
                          ? s.scanRange
                          : 0;
                const indexRange =
                    typeof s.index_end === 'number' && typeof s.index_start === 'number'
                        ? Math.abs(s.index_end - s.index_start)
                        : typeof s.indexRange === 'number'
                          ? s.indexRange
                          : 0;
                if (scanRange > 0 && indexRange > 0) {
                    // Convert mm to m (mm * mm -> mm^2 -> m^2)
                    total += (scanRange * indexRange) / 1_000_000;
                }
            }
        }
        return total;
    }, [composites]);

    const shellAreaNum = shellArea ? parseFloat(shellArea) : null;
    const coveragePct =
        shellAreaNum && shellAreaNum > 0 && scanAreaSqm > 0
            ? (scanAreaSqm / shellAreaNum) * 100
            : null;

    const handleShellAreaBlur = () => {
        const parsed = shellArea ? parseFloat(shellArea) : null;
        if (parsed === vessel.shell_area_sqm) return;
        updateVessel.mutate({
            id: vessel.id,
            projectId,
            params: { shellAreaSqm: parsed },
        });
    };

    return (
        <CollapsibleSection title="Scope & Coverage">
            {/* Overall coverage progress bar */}
            <div style={{ marginBottom: 16 }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        marginBottom: 6,
                    }}
                >
                    <span>Overall Coverage</span>
                    <span>
                        {actual}% / {target}% target
                    </span>
                </div>
                <div
                    style={{
                        height: 8,
                        borderRadius: 4,
                        background: 'var(--border-subtle)',
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            height: '100%',
                            width: `${target > 0 ? Math.min((actual / target) * 100, 100) : 0}%`,
                            borderRadius: 4,
                            background: target > 0 && actual >= target ? '#22c55e' : '#3b82f6',
                            transition: 'width 0.3s ease',
                        }}
                    />
                </div>
            </div>

            {/* Coverage breakdown by region */}
            <div
                style={{
                    padding: 12,
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    marginBottom: 16,
                }}
            >
                <div
                    style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-tertiary)',
                        marginBottom: 10,
                    }}
                >
                    Coverage Breakdown
                </div>

                {hasModel ? (
                    <>
                        {['Left Head', 'Cylinder', 'Right Head'].map((region) => (
                            <div key={region} style={{ marginBottom: 8 }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: '0.8rem',
                                        color: 'var(--text-secondary)',
                                        marginBottom: 4,
                                    }}
                                >
                                    <span>{region}</span>
                                    <span style={{ color: 'var(--text-quaternary)' }}>{'\u2014'}</span>
                                </div>
                                <div
                                    style={{
                                        height: 6,
                                        borderRadius: 3,
                                        background: 'var(--border-subtle)',
                                    }}
                                />
                            </div>
                        ))}
                        <div
                            style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-quaternary)',
                                fontStyle: 'italic',
                                marginTop: 6,
                            }}
                        >
                            Open 3D Modeler for detailed coverage breakdown
                        </div>
                    </>
                ) : (
                    <div
                        style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-quaternary)',
                            textAlign: 'center',
                            padding: 10,
                        }}
                    >
                        Link a vessel model to see regional coverage breakdown
                    </div>
                )}
            </div>

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Shell area (editable) */}
                <div>
                    <label
                        style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            color: 'var(--text-tertiary)',
                            marginBottom: 4,
                        }}
                    >
                        Shell Area (m\u00b2)
                    </label>
                    <input
                        type="number"
                        value={shellArea}
                        onChange={(e) => setShellArea(e.target.value)}
                        onBlur={handleShellAreaBlur}
                        placeholder="--"
                        className="glass-input"
                        style={{ width: '100%', fontSize: '0.9rem' }}
                    />
                </div>

                {/* Scan area (read-only, computed) */}
                <div>
                    <label
                        style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            color: 'var(--text-tertiary)',
                            marginBottom: 4,
                        }}
                    >
                        Scan Area (m\u00b2)
                    </label>
                    <div
                        style={{
                            padding: '8px 10px',
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 6,
                            color: 'var(--text-secondary)',
                            fontSize: '0.9rem',
                        }}
                    >
                        {scanAreaSqm > 0 ? scanAreaSqm.toFixed(3) : '\u2014'}
                    </div>
                </div>

                {/* Coverage percentage (auto-calculated) */}
                <div>
                    <label
                        style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            color: 'var(--text-tertiary)',
                            marginBottom: 4,
                        }}
                    >
                        Coverage %
                    </label>
                    <div
                        style={{
                            padding: '8px 10px',
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 6,
                            color: coveragePct !== null
                                ? coveragePct >= target
                                    ? '#22c55e'
                                    : 'var(--text-primary)'
                                : 'var(--text-quaternary)',
                            fontSize: '0.9rem',
                            fontWeight: coveragePct !== null && coveragePct >= target ? 600 : 400,
                        }}
                    >
                        {coveragePct !== null ? `${coveragePct.toFixed(1)}%` : '\u2014'}
                    </div>
                </div>

                {/* Scan composites count */}
                <div>
                    <label
                        style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            color: 'var(--text-tertiary)',
                            marginBottom: 4,
                        }}
                    >
                        Scan Composites
                    </label>
                    <div
                        style={{
                            padding: '8px 10px',
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 6,
                            color: 'var(--text-secondary)',
                            fontSize: '0.9rem',
                        }}
                    >
                        {composites.length}
                    </div>
                </div>
            </div>

            {/* Open 3D Model link */}
            <button
                onClick={() => navigate(`/vessel-modeler?project=${projectId}&vessel=${vessel.id}`)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 14,
                    fontSize: '0.85rem',
                    color: '#60a5fa',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                }}
            >
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                Open 3D Model
            </button>
        </CollapsibleSection>
    );
}
