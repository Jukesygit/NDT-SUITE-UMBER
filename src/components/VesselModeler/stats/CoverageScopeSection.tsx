import { useMemo } from 'react';
import type { VesselState } from '../types';
import {
  computeComparisonRollup,
  computeComparisonRows,
  formatCoverageDelta,
  formatCoveragePct,
  readTargetEntry,
  type ComparisonStatus,
  type FeatureComparisonRow,
} from '../engine/coverage-comparison';
import { useSettledValue } from '../../../hooks/useSettledValue';

// =============================================================================
// THE coverage stats section (design 2026-08-21 "One merged stats section").
// Replaces the three overlapping sections that preceded it — Coverage (rect
// area), Scan Coverage (RBA/Scoped/Achieved) and Coverage vs Scope (Δ/status) —
// which showed achieved twice and targets three times, and made the rect area
// look like a third "achieved" when it is actually the SCOPE definition.
//
// DISPLAY-ONLY, and every number comes from `computeComparisonRows`: the section
// never re-derives a percentage, a delta or a status, and never picks a target
// (that is `targetPctOf`'s job alone). Rows are never filtered by layer
// visibility — stats are truth, not what happens to be on screen.
// =============================================================================

// Area sweeps are heavy — and since the scope side became rect-derived the row
// build runs the rect sweep too. Read a SETTLED snapshot so a nozzle drag or a
// slider scrub recomputes once on release, not per frame (standing PERF RULE).
const STATS_SETTLE_MS = 250;

/** Untracked features render this, NEVER 0 — a 0% target is a different thing. */
const DASH = '—';

const AUTO_TITLE = 'Derived from drawn coverage rects';

const STATUS_TITLE: Record<ComparisonStatus, string> = {
  met: 'Target met',
  near: 'Within 5 points of target',
  short: 'More than 5 points short of target',
  untracked: 'No target set',
};

interface CoverageScopeSectionProps {
  vesselState: VesselState;
}

/** m² text, matching the sections this one replaces (2dp, 4dp under 0.01). */
function formatArea(mm2: number): string {
  const m2 = mm2 / 1_000_000;
  return `${m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2)} m²`;
}

/** One stacked % / m² cell. `pct === undefined` ⇒ untracked, rendered as dashes. */
function StatCell({
  pct,
  mm2,
  achieved,
  auto,
}: {
  pct?: number;
  mm2?: number;
  achieved?: boolean;
  auto?: boolean;
}) {
  return (
    <div className={`vm-scancov-cell ${achieved ? 'vm-scancov-cell--achieved' : ''}`}>
      <span className="vm-scancov-cell-pct">
        {pct === undefined ? DASH : `${formatCoveragePct(pct)}%`}
        {auto && (
          <span className="vm-scancov-auto" title={AUTO_TITLE}>
            auto
          </span>
        )}
      </span>
      <span className="vm-scancov-cell-area">{mm2 === undefined ? DASH : formatArea(mm2)}</span>
    </div>
  );
}

/** One feature instance: RBA · Scoped · Achieved · Δ · status. */
function FeatureRow({ row, rbaPct }: { row: FeatureComparisonRow; rbaPct?: number }) {
  const untracked = row.status === 'untracked';
  return (
    <div className={`vm-scancov-row ${untracked ? 'vm-cmp-row--untracked' : ''}`}>
      <span className="vm-scancov-section-col" title={row.label}>
        {row.label}
      </span>
      <StatCell
        pct={rbaPct}
        mm2={rbaPct === undefined ? undefined : (rbaPct / 100) * row.totalMm2}
      />
      <StatCell pct={row.targetPct} mm2={row.targetMm2} auto={row.targetSource === 'rects'} />
      <StatCell pct={row.achievedPct} mm2={row.achievedMm2} achieved />
      <span className="vm-scancov-delta">
        {row.deltaPct === undefined ? DASH : formatCoverageDelta(row.deltaPct)}
      </span>
      <span className="vm-cmp-dot-col">
        <span className={`vm-cmp-dot vm-cmp-dot--${row.status}`} title={STATUS_TITLE[row.status]} />
      </span>
    </div>
  );
}

export default function CoverageScopeSection({ vesselState }: CoverageScopeSectionProps) {
  // Settled snapshot: heavy sweeps recompute on release, not per drag frame.
  const s = useSettledValue(vesselState, STATS_SETTLE_MS);

  const rows = useMemo(() => computeComparisonRows(s), [s]);
  const rollup = useMemo(() => computeComparisonRollup(rows), [rows]);

  // RBA is informational and lives outside the comparison row, so it is read
  // straight off the stored entry (the ONE reader of that shape). Absent ⇒ dash.
  const rbaByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const entry = readTargetEntry(s.coverageTargets, row.ref);
      if (entry) map.set(row.key, entry.rbaPct);
    }
    return map;
  }, [rows, s.coverageTargets]);

  // Area-weighted totals across every feature, as the section this replaces did:
  // each column's summed area over the summed coverable area. Untracked features
  // contribute their area to the denominator only — the tracked-only figures are
  // the rollup line below, which is where the "how am I doing" answer lives.
  const totals = useMemo(() => {
    let area = 0;
    let rba = 0;
    let scoped = 0;
    let achieved = 0;
    for (const row of rows) {
      area += row.totalMm2;
      rba += ((rbaByKey.get(row.key) ?? 0) / 100) * row.totalMm2;
      scoped += row.targetMm2 ?? 0;
      achieved += row.achievedMm2;
    }
    const pctOf = (part: number) => (area > 0 ? (part / area) * 100 : 0);
    return {
      rba,
      scoped,
      achieved,
      rbaPct: pctOf(rba),
      scopedPct: pctOf(scoped),
      achievedPct: pctOf(achieved),
    };
  }, [rows, rbaByKey]);

  return (
    <div className="vm-stats-section">
      <div className="vm-stats-section-title">Coverage</div>

      <div className="vm-scancov-group-headers">
        <span className="vm-scancov-section-col" />
        <span className="vm-scancov-group-label">RBA</span>
        <span className="vm-scancov-group-label">Scoped</span>
        <span className="vm-scancov-group-label vm-scancov-group-label--achieved">Achieved</span>
        <span className="vm-scancov-delta">&Delta;</span>
        <span className="vm-cmp-dot-col" />
      </div>

      {rows.map((row) => (
        <FeatureRow key={row.key} row={row} rbaPct={rbaByKey.get(row.key)} />
      ))}

      <div className="vm-scancov-row vm-scancov-row--total">
        <span className="vm-scancov-section-col">Total</span>
        <StatCell pct={totals.rbaPct} mm2={totals.rba} />
        <StatCell pct={totals.scopedPct} mm2={totals.scoped} />
        <StatCell pct={totals.achievedPct} mm2={totals.achieved} achieved />
        <span className="vm-scancov-delta" />
        <span className="vm-cmp-dot-col" />
      </div>

      <div className="vm-cmp-rollup">
        {rollup.tracked === 0 ? (
          <span className="vm-cmp-rollup-note">
            Draw coverage rects or set targets in the Coverage panel
          </span>
        ) : (
          <>
            <span className="vm-cmp-rollup-main">
              {formatCoveragePct(rollup.achievedPct)}% achieved of{' '}
              {formatCoveragePct(rollup.targetPct)}% targeted
            </span>
            <span className="vm-cmp-rollup-note">
              {rollup.short} of {rollup.tracked} targeted{' '}
              {rollup.tracked === 1 ? 'feature' : 'features'} short
              {rollup.total > rollup.tracked && ` · ${rollup.total - rollup.tracked} untracked`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
