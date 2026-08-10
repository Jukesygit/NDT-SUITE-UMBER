import { useMemo } from 'react';
import type { VesselState } from '../types';
import {
  computeCoverage,
  computeAppendageCoverageTotals,
  type CoverageResult,
} from '../engine/coverage-calculator';
import { useSettledValue } from '../../../hooks/useSettledValue';

// Coverage/footprint sweeps are heavy; settle the state they read so a nozzle
// drag (or slider scrub) that streams updates every frame recomputes ONCE on
// release instead of per frame (R1 perf). A single edit still lands after one
// debounce tick.
const STATS_SETTLE_MS = 250;

interface CoverageStatsSectionProps {
  vesselState: VesselState;
}

function formatArea(m2: number): string {
  return m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2);
}

function formatPct(pct: number): string {
  return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

export default function CoverageStatsSection({ vesselState }: CoverageStatsSectionProps) {
  // Settled snapshot: heavy sweeps recompute on release, not per drag frame (R1).
  const s = useSettledValue(vesselState, STATS_SETTLE_MS);

  // Cutout-adjusted region coverage — recompute when appendages / nozzles change
  // (footprint exclusion depends on both), not just on dimensions. Reading the
  // settled snapshot collapses a drag's per-frame updates into one recompute.
  const result: CoverageResult = useMemo(() => computeCoverage(s.coverageRects, s), [s]);

  // Per-appendage coverable + covered area (design §9 / Phase 4 §4). Coverage
  // rects with a matching bodyId now feed the covered column, so the row reports
  // real coverage on the appendage's lateral cylinder.
  const appendageTotals = useMemo(() => computeAppendageCoverageTotals(s), [s]);

  if (s.coverageRects.length === 0) return null;

  const rows = [
    { label: 'Left Head', data: result.leftHead },
    { label: 'Shell', data: result.cylinder },
    { label: 'Right Head', data: result.rightHead },
  ];

  return (
    <div className="vm-stats-section">
      <div className="vm-coverage-title">Coverage</div>
      <div className="vm-coverage-row vm-coverage-header">
        <span className="vm-coverage-label" />
        <span className="vm-coverage-area">Area</span>
        <span className="vm-coverage-covered">Covered</span>
        <span className="vm-coverage-pct" />
      </div>
      {rows.map(({ label, data }) => (
        <div key={label} className="vm-coverage-row">
          <span className="vm-coverage-label">{label}</span>
          <span className="vm-coverage-area">{formatArea(data.total)} m&sup2;</span>
          <span className="vm-coverage-covered">{formatArea(data.covered)} m&sup2;</span>
          <span className="vm-coverage-pct">{formatPct(data.percent)}%</span>
        </div>
      ))}
      {appendageTotals.map((a) => {
        const totalM2 = a.totalMm2 / 1_000_000;
        const coveredM2 = a.coveredMm2 / 1_000_000;
        const pct = a.totalMm2 > 0 ? (a.coveredMm2 / a.totalMm2) * 100 : 0;
        return (
          <div key={a.appendageId} className="vm-coverage-row">
            <span className="vm-coverage-label">{a.name}</span>
            <span className="vm-coverage-area">{formatArea(totalM2)} m&sup2;</span>
            <span className="vm-coverage-covered">{formatArea(coveredM2)} m&sup2;</span>
            <span className="vm-coverage-pct">{formatPct(pct)}%</span>
          </div>
        );
      })}
      <div className="vm-coverage-divider" />
      <div className="vm-coverage-row vm-coverage-total">
        <span className="vm-coverage-label">Total</span>
        <span className="vm-coverage-area">{formatArea(result.total.total)} m&sup2;</span>
        <span className="vm-coverage-covered">{formatArea(result.total.covered)} m&sup2;</span>
        <span className="vm-coverage-pct">{formatPct(result.total.percent)}%</span>
      </div>
    </div>
  );
}
