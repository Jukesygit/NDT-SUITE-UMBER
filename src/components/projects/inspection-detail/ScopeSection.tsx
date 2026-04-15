import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CollapsibleSection from './CollapsibleSection';
import type { ProjectVessel } from '../../../types/inspection-project';
import { computeCoverage } from '../../VesselModeler/engine/coverage-calculator';
import type { CoverageRectConfig, VesselState } from '../../VesselModeler/types';

interface ModelGeometry {
    id: number;       // inner diameter mm
    length: number;   // tan-tan length mm
    headRatio: number;
}

interface VesselModelWithGeometry {
    id: string;
    name: string;
    updated_at: string;
    project_vessel_id: string | null;
    geometry: ModelGeometry | null;
    coverageRects: CoverageRectConfig[];
}

interface ScopeSectionProps {
    vessel: ProjectVessel;
    projectId: string;
    composites: { id: string; name: string; stats: any; created_at: string; project_vessel_id: string | null }[];
    vesselModels: VesselModelWithGeometry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal VesselState from geometry fields for the coverage calculator */
function toVesselState(geo: ModelGeometry): Pick<VesselState, 'id' | 'length' | 'headRatio'> & VesselState {
    // The coverage calculator only reads id, length, headRatio — supply defaults for rest
    return {
        id: geo.id,
        length: geo.length,
        headRatio: geo.headRatio,
    } as VesselState;
}

// ---------------------------------------------------------------------------
// Info card sub-component
// ---------------------------------------------------------------------------

function InfoCard({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
    return (
        <div>
            <label
                style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--text-tertiary)',
                    marginBottom: 4,
                }}
            >
                {label}
            </label>
            <div
                style={{
                    padding: '8px 10px',
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6,
                    color: color ?? 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    fontWeight: bold ? 600 : 400,
                }}
            >
                {value}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Progress bar sub-component
// ---------------------------------------------------------------------------

function CoverageBar({ label, percent, target }: { label: string; percent: number; target?: number }) {
    const meetsTarget = target != null && percent >= target;
    return (
        <div style={{ marginBottom: 10 }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                }}
            >
                <span>{label}</span>
                <span>
                    {percent.toFixed(1)}%
                    {target != null && <span style={{ color: 'var(--text-quaternary)' }}> / {target}% target</span>}
                </span>
            </div>
            <div
                style={{
                    height: 7,
                    borderRadius: 4,
                    background: 'var(--border-subtle)',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        height: '100%',
                        width: `${Math.min(percent, 100)}%`,
                        borderRadius: 4,
                        background: meetsTarget ? '#22c55e' : '#3b82f6',
                        transition: 'width 0.3s ease',
                    }}
                />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScopeSection({ vessel, projectId, composites, vesselModels }: ScopeSectionProps) {
    const navigate = useNavigate();
    const target = vessel.coverage_target_pct ?? 100;

    // Find the linked model for this vessel
    const linkedModel = useMemo(
        () => vesselModels.find(m => m.project_vessel_id === vessel.id && m.geometry != null),
        [vesselModels, vessel.id],
    );

    // Compute total shell area from model geometry (m²)
    const modelCoverage = useMemo(() => {
        if (!linkedModel?.geometry) return null;
        const vs = toVesselState(linkedModel.geometry);
        return computeCoverage(linkedModel.coverageRects ?? [], vs);
    }, [linkedModel]);

    // Total shell area from model (m²)
    const shellAreaSqm = modelCoverage?.total.total ?? null;

    // Scoped area = area of coverage rects on the model (m²)
    const scopedAreaSqm = modelCoverage?.total.covered ?? 0;

    // Scoped coverage % = coverage rects area / total shell area
    const scopedPct = modelCoverage?.total.percent ?? 0;

    // Compute scan area from composites (achieved area in m²)
    const scanAreaSqm = useMemo(() => {
        let total = 0;
        for (const comp of composites) {
            const s = comp.stats;
            if (s && typeof s === 'object') {
                // Prefer pre-computed totalArea (mm²) if available
                if (typeof s.totalArea === 'number' && s.totalArea > 0) {
                    total += s.totalArea / 1_000_000;
                    continue;
                }
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
                    total += (scanRange * indexRange) / 1_000_000;
                }
            }
        }
        return total;
    }, [composites]);

    // Achieved coverage % = scan area from composites / total shell area
    const achievedPct =
        shellAreaSqm && shellAreaSqm > 0 && scanAreaSqm > 0
            ? (scanAreaSqm / shellAreaSqm) * 100
            : null;

    const hasModel = linkedModel != null;

    return (
        <CollapsibleSection title="Scope & Coverage">
            {/* Coverage progress bars */}
            <div style={{ marginBottom: 16 }}>
                {hasModel ? (
                    <>
                        <CoverageBar label="Scoped Coverage" percent={scopedPct} />
                        <CoverageBar
                            label="Achieved Coverage"
                            percent={achievedPct ?? 0}
                            target={target}
                        />
                    </>
                ) : (
                    <div
                        style={{
                            padding: 10,
                            fontSize: '0.8rem',
                            color: 'var(--text-quaternary)',
                            textAlign: 'center',
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 8,
                        }}
                    >
                        Link a vessel model to see coverage breakdown
                    </div>
                )}
            </div>

            {/* Coverage breakdown by region */}
            {hasModel && modelCoverage && (
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
                        Regional Breakdown (Scoped)
                    </div>

                    {([
                        ['Left Head', modelCoverage.leftHead],
                        ['Cylinder', modelCoverage.cylinder],
                        ['Right Head', modelCoverage.rightHead],
                    ] as const).map(([region, data]) => (
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
                                <span style={{ color: data.percent > 0 ? 'var(--text-secondary)' : 'var(--text-quaternary)' }}>
                                    {data.percent > 0 ? `${data.percent.toFixed(1)}%` : '\u2014'}
                                </span>
                            </div>
                            <div
                                style={{
                                    height: 6,
                                    borderRadius: 3,
                                    background: 'var(--border-subtle)',
                                    overflow: 'hidden',
                                }}
                            >
                                {data.percent > 0 && (
                                    <div
                                        style={{
                                            height: '100%',
                                            width: `${Math.min(data.percent, 100)}%`,
                                            borderRadius: 3,
                                            background: 'rgba(59,130,246,0.6)',
                                            transition: 'width 0.3s ease',
                                        }}
                                    />
                                )}
                            </div>
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
                        Open 3D Modeler to adjust scoped coverage areas
                    </div>
                </div>
            )}

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Shell area (from model) */}
                <InfoCard
                    label="Shell Area (m²)"
                    value={shellAreaSqm != null ? shellAreaSqm.toFixed(3) : '\u2014'}
                />

                {/* Scoped area (from coverage rects) */}
                <InfoCard
                    label="Scoped Area (m²)"
                    value={scopedAreaSqm > 0 ? scopedAreaSqm.toFixed(3) : '\u2014'}
                />

                {/* Scan area (from composites) */}
                <InfoCard
                    label="Scan Area (m²)"
                    value={scanAreaSqm > 0 ? scanAreaSqm.toFixed(3) : '\u2014'}
                />

                {/* Scan composites count */}
                <InfoCard
                    label="Scan Composites"
                    value={String(composites.length)}
                />

                {/* Scoped coverage % */}
                <InfoCard
                    label="Scoped %"
                    value={scopedPct > 0 ? `${scopedPct.toFixed(1)}%` : '\u2014'}
                    color={scopedPct > 0 ? 'var(--text-primary)' : 'var(--text-quaternary)'}
                />

                {/* Achieved coverage % */}
                <InfoCard
                    label="Achieved %"
                    value={achievedPct != null ? `${achievedPct.toFixed(1)}%` : '\u2014'}
                    color={
                        achievedPct != null
                            ? achievedPct >= target
                                ? '#22c55e'
                                : 'var(--text-primary)'
                            : 'var(--text-quaternary)'
                    }
                    bold={achievedPct != null && achievedPct >= target}
                />
            </div>

            {/* Open 3D Model link */}
            <button
                onClick={() => {
                    const modelParam = linkedModel ? `&model=${linkedModel.id}` : '';
                    navigate(`/vessel-modeler?project=${projectId}&vessel=${vessel.id}${modelParam}`);
                }}
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
