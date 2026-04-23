/**
 * ScopeProgressCard - Coverage stats with progress bar and "Open Modeler" link.
 */

import { useNavigate } from 'react-router-dom';
import { calculateCoverage } from '../../../utils/coverage-calc';
import type { VesselModelWithGeometry } from '../../../utils/coverage-calc';

interface ScopeProgressCardProps {
    vesselId: string;
    projectId: string;
    composites: { id: string; stats: any }[];
    vesselModels: VesselModelWithGeometry[];
}

export function ScopeProgressCard({
    vesselId,
    projectId,
    composites,
    vesselModels,
}: ScopeProgressCardProps) {
    const navigate = useNavigate();
    const coverage = calculateCoverage(vesselModels, vesselId, composites);

    // Find linked model for navigation
    const linkedModels = vesselModels.filter(
        (m) => m.project_vessel_id === vesselId && m.geometry != null,
    );
    const linkedModel = linkedModels[0] ?? null;
    const hasGeometry = linkedModel != null;

    const modelerUrl = `/vessel-modeler?project=${projectId}&vessel=${vesselId}${
        linkedModel ? `&model=${linkedModel.id}` : ''
    }`;

    const barColor =
        coverage.achievedPct != null && coverage.achievedPct >= coverage.scopedPct
            ? '#22c55e'
            : '#3b82f6';

    return (
        <div className="glass-card" style={{ padding: 20 }}>
            <h4
                style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    margin: '0 0 16px 0',
                }}
            >
                Coverage
            </h4>

            {!hasGeometry ? (
                /* Empty state */
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <p
                        style={{
                            fontSize: '0.85rem',
                            color: 'var(--text-tertiary)',
                            margin: '0 0 12px 0',
                        }}
                    >
                        Link a 3D model to track coverage
                    </p>
                    <button
                        className="btn btn--primary btn--sm"
                        onClick={() => navigate(modelerUrl)}
                    >
                        Open Modeler
                    </button>
                </div>
            ) : (
                /* Normal state */
                <>
                    {/* Achieved percentage */}
                    <div style={{ marginBottom: 12 }}>
                        <span
                            style={{
                                fontSize: '2rem',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                lineHeight: 1,
                            }}
                        >
                            {coverage.achievedPct != null
                                ? `${coverage.achievedPct.toFixed(1)}%`
                                : '--'}
                        </span>
                        <span
                            style={{
                                fontSize: '0.8rem',
                                color: 'var(--text-tertiary)',
                                marginLeft: 6,
                            }}
                        >
                            achieved
                        </span>
                    </div>

                    {/* Progress bar */}
                    <div
                        style={{
                            height: 6,
                            borderRadius: 3,
                            background: 'rgba(255,255,255,0.08)',
                            marginBottom: 14,
                            overflow: 'hidden',
                        }}
                    >
                        <div
                            style={{
                                height: '100%',
                                width: `${Math.min(coverage.achievedPct ?? 0, 100)}%`,
                                borderRadius: 3,
                                background: barColor,
                                transition: 'width 0.3s ease',
                            }}
                        />
                    </div>

                    {/* Stats row */}
                    <div
                        style={{
                            display: 'flex',
                            gap: 16,
                            fontSize: '0.75rem',
                            color: 'var(--text-tertiary)',
                            marginBottom: 14,
                        }}
                    >
                        <span>
                            Shell:{' '}
                            <strong style={{ color: 'var(--text-secondary)' }}>
                                {coverage.shellAreaSqm != null
                                    ? `${coverage.shellAreaSqm.toFixed(2)} m\u00B2`
                                    : '--'}
                            </strong>
                        </span>
                        <span>
                            Scanned:{' '}
                            <strong style={{ color: 'var(--text-secondary)' }}>
                                {coverage.scanAreaSqm.toFixed(2)} m{'\u00B2'}
                            </strong>
                        </span>
                        <span>
                            Composites:{' '}
                            <strong style={{ color: 'var(--text-secondary)' }}>
                                {composites.length}
                            </strong>
                        </span>
                    </div>

                    {/* Open in Modeler button */}
                    <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => navigate(modelerUrl)}
                    >
                        Open in Modeler
                    </button>
                </>
            )}
        </div>
    );
}
