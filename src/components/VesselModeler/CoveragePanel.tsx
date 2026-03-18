import { useMemo } from 'react';
import type { VesselState } from './types';
import { computeCoverage, type CoverageResult } from './engine/coverage-calculator';

interface CoveragePanelProps {
    vesselState: VesselState;
    sidebarOpen: boolean;
}

function formatArea(m2: number): string {
    return m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2);
}

function formatPct(pct: number): string {
    return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

export default function CoveragePanel({ vesselState, sidebarOpen }: CoveragePanelProps) {
    const result: CoverageResult = useMemo(
        () => computeCoverage(vesselState.coverageRects, vesselState),
        [vesselState.coverageRects, vesselState.id, vesselState.length, vesselState.headRatio],
    );

    // Hide when no coverage rects
    if (vesselState.coverageRects.length === 0) return null;

    const rows = [
        { label: 'Left Head', data: result.leftHead },
        { label: 'Shell', data: result.cylinder },
        { label: 'Right Head', data: result.rightHead },
    ];

    return (
        <div
            className="vm-coverage-panel"
            style={{ left: sidebarOpen ? 350 : 16 }}
        >
            <div className="vm-coverage-title">Coverage</div>
            {rows.map(({ label, data }) => (
                <div key={label} className="vm-coverage-row">
                    <span className="vm-coverage-label">{label}</span>
                    <span className="vm-coverage-area">{formatArea(data.covered)} m&sup2;</span>
                    <span className="vm-coverage-pct">{formatPct(data.percent)}%</span>
                </div>
            ))}
            <div className="vm-coverage-divider" />
            <div className="vm-coverage-row vm-coverage-total">
                <span className="vm-coverage-label">Total</span>
                <span className="vm-coverage-area">{formatArea(result.total.covered)} m&sup2;</span>
                <span className="vm-coverage-pct">{formatPct(result.total.percent)}%</span>
            </div>
        </div>
    );
}
