/**
 * ScopeProgressCard - Coverage stats with progress bar.
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

    const linkedModels = vesselModels.filter(
        (m) => m.project_vessel_id === vesselId && m.geometry != null,
    );
    const linkedModel = linkedModels[0] ?? null;
    const hasGeometry = linkedModel != null;

    const modelerUrl = `/vessel-modeler?project=${projectId}&vessel=${vesselId}${
        linkedModel ? `&model=${linkedModel.id}` : ''
    }`;

    const isComplete = coverage.achievedPct != null && coverage.achievedPct >= coverage.scopedPct;

    return (
        <div className="pj-info-card">
            <div className="pj-info-card-inner">
                <h4 className="pj-info-card-title">Coverage</h4>

                {!hasGeometry ? (
                    <div className="pj-empty" style={{ padding: '12px 0' }}>
                        <div className="pj-empty-text" style={{ marginBottom: 10 }}>
                            Link a 3D model to track coverage
                        </div>
                        <button className="pj-quick-action-btn primary" onClick={() => navigate(modelerUrl)}>
                            Open Modeler
                        </button>
                    </div>
                ) : (
                    <>
                        <div style={{ marginBottom: 10 }}>
                            <span className="pj-readout-value">
                                {coverage.achievedPct != null ? `${coverage.achievedPct.toFixed(1)}%` : '--'}
                            </span>
                            <span className="pj-readout-unit">achieved</span>
                        </div>

                        <div className="pj-progress-wrap" style={{ marginBottom: 12 }}>
                            <div className="pj-progress-track" style={{ flex: 1 }}>
                                <div
                                    className={`pj-progress-fill ${isComplete ? 'complete' : ''}`}
                                    style={{ width: `${Math.min(coverage.achievedPct ?? 0, 100)}%` }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
                            <div className="pj-info-field">
                                <span className="pj-info-field-label">Shell</span>
                                <span className="pj-info-field-value">
                                    {coverage.shellAreaSqm != null ? `${coverage.shellAreaSqm.toFixed(2)} m²` : '--'}
                                </span>
                            </div>
                            <div className="pj-info-field">
                                <span className="pj-info-field-label">Scanned</span>
                                <span className="pj-info-field-value">{coverage.scanAreaSqm.toFixed(2)} m²</span>
                            </div>
                            <div className="pj-info-field">
                                <span className="pj-info-field-label">Composites</span>
                                <span className="pj-info-field-value">{composites.length}</span>
                            </div>
                        </div>

                        <button className="pj-quick-action-btn secondary" onClick={() => navigate(modelerUrl)}>
                            Open in Modeler
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
