import { useMemo } from 'react';
import type { VesselState } from '../types';
import {
  computeCoverage,
  computeAppendageCoverageTotals,
  type CoverageResult,
} from '../engine/coverage-calculator';

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
  // Cutout-adjusted region coverage — recompute when appendages change (the
  // footprint exclusion depends on the appendage set), not just on dimensions.
  const result: CoverageResult = useMemo(
    () => computeCoverage(vesselState.coverageRects, vesselState),
    [
      vesselState.coverageRects,
      vesselState.id,
      vesselState.length,
      vesselState.headRatio,
      vesselState.appendages,
    ],
  );

  // Per-appendage coverable + covered area (design §9 / Phase 4 §4). Coverage
  // rects with a matching bodyId now feed the covered column, so the row reports
  // real coverage on the appendage's lateral cylinder.
  const appendageTotals = useMemo(
    () => computeAppendageCoverageTotals(vesselState),
    [vesselState.appendages, vesselState.scanComposites, vesselState.coverageRects],
  );

  if (vesselState.coverageRects.length === 0) return null;

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
