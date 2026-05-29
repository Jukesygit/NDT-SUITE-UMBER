import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CollapsibleSection from './CollapsibleSection';
import CompanionScanPanel from './CompanionScanPanel';
import type { ProjectVessel } from '../../../types/inspection-project';
import { calculateCoverage } from '../../../utils/coverage-calc';
import type { VesselModelWithGeometry } from '../../../utils/coverage-calc';

interface ScopeSectionProps {
    vessel: ProjectVessel;
    projectId: string;
    composites: { id: string; name: string; stats: any; created_at: string; project_vessel_id: string | null }[];
    vesselModels: VesselModelWithGeometry[];
}

function fmtArea(val: number | null): string {
    if (val == null || val <= 0) return '\u2014';
    return val.toFixed(2);
}

function fmtPct(val: number | null): string {
    if (val == null || val <= 0) return '\u2014';
    return `${val.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Coverage gauge — the primary visual
// ---------------------------------------------------------------------------

function CoverageGauge({
    achievedPct,
    scopedPct,
    shellArea,
    achievedArea,
    scopedArea,
}: {
    achievedPct: number;
    scopedPct: number;
    shellArea: number;
    achievedArea: number;
    scopedArea: number;
}) {
    // The bar represents 0-100% of total shell area
    // Achieved fills as a solid bar, scoped is shown as a marker line
    const barMax = Math.max(scopedPct, achievedPct, 1);
    const scale = 100 / Math.max(barMax * 1.15, 10); // pad 15% headroom, min 10% range
    const achievedWidth = Math.min(achievedPct * scale, 100);
    const scopedPos = Math.min(scopedPct * scale, 100);
    const meetsScope = achievedPct >= scopedPct && scopedPct > 0;

    return (
        <div
            style={{
                padding: 16,
                background: 'var(--clean-surface-secondary)',
                border: '1px solid var(--clean-border)',
                borderRadius: '6px',
            }}
        >
            {/* Header row: achieved big number + status */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{
                        fontSize: '1.8rem',
                        fontWeight: 700,
                        color: meetsScope ? '#22c55e' : 'var(--clean-text-primary)',
                        lineHeight: 1,
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        {fmtPct(achievedPct)}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--clean-text-tertiary)' }}>
                        achieved
                    </span>
                </div>
                {scopedPct > 0 && (
                    <span style={{
                        fontSize: '0.8rem',
                        color: meetsScope ? '#22c55e' : 'var(--clean-text-quaternary)',
                        fontWeight: meetsScope ? 600 : 400,
                    }}>
                        {meetsScope ? 'Scope met' : `${fmtPct(scopedPct)} scoped`}
                    </span>
                )}
            </div>

            {/* The bar */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
                {/* Track */}
                <div style={{
                    height: 10,
                    borderRadius: 5,
                    background: 'var(--clean-border)',
                    overflow: 'visible',
                    position: 'relative',
                }}>
                    {/* Achieved fill */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        width: `${achievedWidth}%`,
                        borderRadius: 5,
                        background: meetsScope
                            ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                            : 'linear-gradient(90deg, #3b82f6, #2563eb)',
                        transition: 'width 0.4s ease',
                    }} />

                    {/* Scoped marker line */}
                    {scopedPct > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: -3,
                            left: `${scopedPos}%`,
                            transform: 'translateX(-1px)',
                            width: 2,
                            height: 16,
                            background: meetsScope ? '#22c55e' : 'var(--clean-text-secondary)',
                            borderRadius: 1,
                            transition: 'left 0.4s ease',
                        }} />
                    )}
                </div>
            </div>

            {/* Legend row beneath bar */}
            <div style={{
                display: 'flex',
                gap: 16,
                fontSize: '0.7rem',
                color: 'var(--clean-text-quaternary)',
            }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                        display: 'inline-block', width: 10, height: 4, borderRadius: 2,
                        background: meetsScope
                            ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                            : 'linear-gradient(90deg, #3b82f6, #2563eb)',
                    }} />
                    Achieved
                </span>
                {scopedPct > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{
                            display: 'inline-block', width: 2, height: 10, borderRadius: 1,
                            background: meetsScope ? '#22c55e' : 'var(--clean-text-secondary)',
                        }} />
                        Scoped target
                    </span>
                )}
            </div>

            {/* Area breakdown — compact row */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 8,
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid var(--clean-border)',
            }}>
                <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--clean-text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                        Shell
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--clean-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtArea(shellArea)} <span style={{ fontSize: '0.7rem', color: 'var(--clean-text-quaternary)' }}>m²</span>
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--clean-text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                        Scoped
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--clean-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtArea(scopedArea)} <span style={{ fontSize: '0.7rem', color: 'var(--clean-text-quaternary)' }}>m²</span>
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--clean-text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                        Achieved
                    </div>
                    <div style={{
                        fontSize: '0.9rem',
                        fontVariantNumeric: 'tabular-nums',
                        color: meetsScope ? '#22c55e' : 'var(--clean-text-secondary)',
                        fontWeight: meetsScope ? 600 : 400,
                    }}>
                        {fmtArea(achievedArea)} <span style={{ fontSize: '0.7rem', color: 'var(--clean-text-quaternary)' }}>m²</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Region row — mini bar for Left Head / Cylinder / Right Head
// ---------------------------------------------------------------------------

function RegionRow({ label, region }: { label: string; region: { covered: number; total: number; percent: number } }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--clean-text-secondary)', width: 80, flexShrink: 0 }}>
                {label}
            </span>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--clean-border)', overflow: 'hidden' }}>
                {region.percent > 0 && (
                    <div style={{
                        height: '100%',
                        width: `${Math.min(region.percent, 100)}%`,
                        borderRadius: 3,
                        background: 'rgba(59,130,246,0.5)',
                        transition: 'width 0.3s ease',
                    }} />
                )}
            </div>
            <span style={{
                fontSize: '0.75rem',
                color: region.percent > 0 ? 'var(--clean-text-secondary)' : 'var(--clean-text-quaternary)',
                width: 42,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
            }}>
                {region.percent > 0 ? `${region.percent.toFixed(1)}%` : '\u2014'}
            </span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScopeSection({ vessel, projectId, composites, vesselModels }: ScopeSectionProps) {
    const navigate = useNavigate();

    // Coverage calculation (shared utility)
    const {
        shellAreaSqm,
        scopedAreaSqm,
        scopedPct,
        scanAreaSqm,
        achievedPct,
        regionBreakdown: modelCoverage,
    } = useMemo(
        () => calculateCoverage(vesselModels, vessel.id, composites),
        [vesselModels, vessel.id, composites],
    );

    // Resolve the coverage model reference for the "Open in Modeler" link
    const coverageModel = useMemo(() => {
        const linked = vesselModels.filter(m => m.project_vessel_id === vessel.id && m.geometry != null);
        return linked.find(m => m.model_type === 'coverage') ?? linked[0] ?? null;
    }, [vesselModels, vessel.id]);

    const hasModel = coverageModel != null;

    return (
        <CollapsibleSection title="Scope & Coverage">
            {hasModel && shellAreaSqm ? (
                <>
                    {/* Primary visual: the coverage gauge */}
                    <CoverageGauge
                        achievedPct={achievedPct ?? 0}
                        scopedPct={scopedPct}
                        shellArea={shellAreaSqm}
                        achievedArea={scanAreaSqm}
                        scopedArea={scopedAreaSqm}
                    />

                    {/* Regional breakdown */}
                    {modelCoverage && (
                        <div style={{
                            marginTop: 12,
                            padding: '10px 14px',
                            background: 'var(--clean-surface-secondary)',
                            border: '1px solid var(--clean-border)',
                            borderRadius: '6px',
                        }}>
                            <div style={{
                                fontSize: '0.7rem',
                                color: 'var(--clean-text-quaternary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: 6,
                            }}>
                                Regional scope
                            </div>
                            <RegionRow label="Dome 1" region={modelCoverage.leftHead} />
                            <RegionRow label="Vessel Shell" region={modelCoverage.cylinder} />
                            <RegionRow label="Dome 2" region={modelCoverage.rightHead} />
                        </div>
                    )}

                    {/* Composites count + modeler link */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 12,
                    }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--clean-text-quaternary)' }}>
                            {composites.length} scan composite{composites.length !== 1 ? 's' : ''} linked
                        </span>
                        <button
                            onClick={() => {
                                const modelParam = coverageModel ? `&model=${coverageModel.id}` : '';
                                navigate(`/vessel-modeler?project=${projectId}&vessel=${vessel.id}${modelParam}`);
                            }}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                fontSize: '0.78rem',
                                color: '#60a5fa',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                            }}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                            Open in Modeler
                        </button>
                    </div>
                </>
            ) : (
                /* No model linked — empty state */
                <div style={{
                    padding: '20px 16px',
                    background: 'var(--clean-surface-secondary)',
                    border: '1px solid var(--clean-border)',
                    borderRadius: '6px',
                    textAlign: 'center',
                }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--clean-text-tertiary)', marginBottom: 8 }}>
                        No coverage model linked
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--clean-text-quaternary)', lineHeight: 1.5 }}>
                        Save a model with the <span style={{ color: 'var(--clean-text-secondary)', fontWeight: 500 }}>Coverage</span> type
                        from the 3D Modeler to populate this section.
                    </div>
                    {composites.length > 0 && (
                        <div style={{
                            marginTop: 10,
                            paddingTop: 10,
                            borderTop: '1px solid var(--clean-border)',
                            fontSize: '0.78rem',
                            color: 'var(--clean-text-quaternary)',
                        }}>
                            {composites.length} scan composite{composites.length !== 1 ? 's' : ''} linked
                            ({fmtArea(scanAreaSqm)} m² valid data)
                        </div>
                    )}
                </div>
            )}
            {/* Companion scan folder pairing + composite generation */}
            <CompanionScanPanel vessel={vessel} projectId={projectId} />
        </CollapsibleSection>
    );
}
