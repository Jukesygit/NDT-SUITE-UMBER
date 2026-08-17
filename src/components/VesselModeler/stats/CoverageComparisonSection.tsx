import { useMemo } from 'react';
import type { VesselState } from '../types';
import {
  computeComparisonRollup,
  computeComparisonRows,
  type ComparisonStatus,
} from '../engine/coverage-comparison';
import { useSettledValue } from '../../../hooks/useSettledValue';

// Area sweeps are heavy; settle the state they read so a nozzle drag / slider
// scrub recomputes once on release, not per frame (R1 perf) — same budget as the
// neighbouring stats sections.
const STATS_SETTLE_MS = 250;

interface CoverageComparisonSectionProps {
  vesselState: VesselState;
}

function formatPct(pct: number): string {
  return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

/** Signed delta in percentage points, always carrying its sign. */
function formatDelta(delta: number): string {
  const rounded = Math.abs(delta) < 0.05 ? 0 : delta;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`;
}

const STATUS_TITLE: Record<ComparisonStatus, string> = {
  met: 'Target met',
  near: 'Within 5 points of target',
  short: 'More than 5 points short of target',
  untracked: 'No target set',
};

export default function CoverageComparisonSection({ vesselState }: CoverageComparisonSectionProps) {
  // Settled snapshot: heavy sweeps recompute on release, not per drag frame (R1).
  const s = useSettledValue(vesselState, STATS_SETTLE_MS);

  // Every number on this section comes from the engine — the component only
  // formats. Rows are never filtered by layer visibility (stats are truth).
  const rows = useMemo(() => computeComparisonRows(s), [s]);
  const rollup = useMemo(() => computeComparisonRollup(rows), [rows]);

  return (
    <div className="vm-stats-section">
      <div className="vm-stats-section-title">Coverage vs Scope</div>

      <div className="vm-cmp-row vm-cmp-row--header">
        <span className="vm-cmp-feature" />
        <span className="vm-cmp-num">Target</span>
        <span className="vm-cmp-num">Achieved</span>
        <span className="vm-cmp-num">&Delta;</span>
        <span className="vm-cmp-dot-col" />
      </div>

      {rows.map((r) => {
        const untracked = r.status === 'untracked';
        return (
          <div
            key={r.key}
            className={`vm-cmp-row ${untracked ? 'vm-cmp-row--untracked' : ''}`}
          >
            <span className="vm-cmp-feature" title={r.label}>
              {r.label}
            </span>
            <span className="vm-cmp-num">
              {r.targetPct === undefined ? '—' : `${formatPct(r.targetPct)}%`}
            </span>
            <span className="vm-cmp-num vm-cmp-num--achieved">{formatPct(r.achievedPct)}%</span>
            <span className="vm-cmp-num">
              {r.deltaPct === undefined ? '—' : formatDelta(r.deltaPct)}
            </span>
            <span className="vm-cmp-dot-col">
              <span
                className={`vm-cmp-dot vm-cmp-dot--${r.status}`}
                title={STATUS_TITLE[r.status]}
              />
            </span>
          </div>
        );
      })}

      <div className="vm-cmp-rollup">
        {rollup.tracked === 0 ? (
          <span className="vm-cmp-rollup-note">
            No targets set &mdash; add them in the Coverage panel
          </span>
        ) : (
          <>
            <span className="vm-cmp-rollup-main">
              {formatPct(rollup.achievedPct)}% achieved of {formatPct(rollup.targetPct)}% targeted
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
