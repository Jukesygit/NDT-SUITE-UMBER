/**
 * ShareStatsTable — per-feature coverage on the client page.
 *
 * The bundle carries NUMBERS; this formats them with the very same engine
 * formatters the modeler, the projects page and the printed report use, so a
 * client and an inspector reading the same vessel see the same digits.
 *
 * Status is never colour-alone — every row carries a word beside its dot, the
 * same rule the printed report follows, because a client page is read on
 * whatever screen and by whoever.
 *
 * CONTENT MIRROR of the modeler's `stats/CoverageScopeSection`: the same
 * RBA · Scoped · Achieved · Δ · status columns, the same stacked % over m², the
 * same area-weighted Total. It deliberately does NOT import that component, for
 * two reasons. It computes live from a `VesselState`, so importing it would drag
 * the modeler's engine into the loginless page's static closure — which is
 * exactly what `npm run verify:share-chunk` fails on. And it does not need to: a
 * bundle ships the finished numbers, so the only code worth sharing is the
 * formatters, and the two three-line helpers below are copies on purpose.
 *
 * Every field this table added on 2026-08-25 is OPTIONAL on the wire, because a
 * published link outlives the deploy that made it. A bundle written before that
 * date carries none of them and degrades to the %-only table with a dashed RBA
 * column — absent is dashed, never rendered as 0.
 */

import {
  formatCoverageDelta,
  formatCoveragePct,
  type ComparisonStatus,
} from '../VesselModeler/engine/coverage-comparison';
import type { ShareStatRollup, ShareStatRow } from './bundle-types';

const STATUS_WORD: Record<ComparisonStatus, string> = {
  met: 'Met',
  near: 'Near',
  short: 'Short',
  untracked: '—',
};

const DASH = '—';

/** The modeler's marker text, word for word — same claim, same wording. */
const AUTO_TITLE = 'Derived from drawn coverage rects';

/** m² text, matching the modeler's stats panel (2dp, 4dp under 0.01). */
function formatArea(mm2: number): string {
  const m2 = mm2 / 1_000_000;
  return `${m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2)} m²`;
}

/** One stacked cell: % on top, m² beneath. `pct === undefined` ⇒ untracked (a
 *  dash, never 0); `mm2 === undefined` ⇒ the bundle shipped no area for it, so
 *  the sub-line is omitted rather than dashed — an older bundle then reads as
 *  the single-line table it was published for. */
function StatCell({
  label,
  pct,
  mm2,
  className,
  auto,
}: {
  label: string;
  pct?: number;
  mm2?: number;
  className?: string;
  auto?: boolean;
}) {
  return (
    <td data-label={label} className={className}>
      <span className="cs-cell">
        <span className="cs-cell-pct">
          {pct === undefined ? DASH : `${formatCoveragePct(pct)}%`}
          {auto && (
            <span className="cs-cell-auto" title={AUTO_TITLE}>
              auto
            </span>
          )}
        </span>
        {mm2 !== undefined && <span className="cs-cell-area">{formatArea(mm2)}</span>}
      </span>
    </td>
  );
}

interface StatTotals {
  rbaMm2: number;
  targetMm2: number;
  achievedMm2: number;
  rbaPct: number;
  targetPct: number;
  achievedPct: number;
}

/**
 * Area-weighted totals, or undefined when this bundle cannot support them.
 *
 * Pure arithmetic over shipped numbers — the same formula as the modeler's
 * `CoverageScopeSection.totals`, not a second opinion: each column's summed area
 * over the summed coverable area, so untracked features contribute to the
 * denominator only. RBA sums `rbaPct ?? 0` because a feature with no stored
 * recommendation contributes no recommended area — that 0 is a SUMMAND, not a
 * displayed value, and the per-row cell above still dashes.
 *
 * Undefined unless every row carries its areas: a partial sum would quietly
 * understate the total, and a total that is wrong is worse than one that is
 * absent.
 */
function computeTotals(rows: ShareStatRow[]): StatTotals | undefined {
  if (rows.length === 0) return undefined;
  if (!rows.every((row) => row.totalMm2 !== undefined && row.achievedMm2 !== undefined)) {
    return undefined;
  }

  let area = 0;
  let rba = 0;
  let target = 0;
  let achieved = 0;
  for (const row of rows) {
    const total = row.totalMm2 ?? 0;
    area += total;
    rba += ((row.rbaPct ?? 0) / 100) * total;
    target += row.targetMm2 ?? 0;
    achieved += row.achievedMm2 ?? 0;
  }

  const pctOf = (part: number) => (area > 0 ? (part / area) * 100 : 0);
  return {
    rbaMm2: rba,
    targetMm2: target,
    achievedMm2: achieved,
    rbaPct: pctOf(rba),
    targetPct: pctOf(target),
    achievedPct: pctOf(achieved),
  };
}

interface ShareStatsTableProps {
  rows: ShareStatRow[];
  rollup: ShareStatRollup;
}

export function ShareStatsTable({ rows, rollup }: ShareStatsTableProps) {
  const totals = computeTotals(rows);

  return (
    <div className="cs-stats">
      <div className="cs-stats-rollup">
        {rollup.tracked === 0 ? (
          <span className="cs-stats-rollup-note">
            No coverage targets were set for this vessel.
          </span>
        ) : (
          <>
            <span className="cs-stats-rollup-main">
              {formatCoveragePct(rollup.achievedPct)}% achieved of{' '}
              {formatCoveragePct(rollup.targetPct)}% targeted
            </span>
            <span className="cs-stats-rollup-note">
              {rollup.short} of {rollup.tracked} targeted{' '}
              {rollup.tracked === 1 ? 'feature' : 'features'} short of target
            </span>
          </>
        )}
      </div>

      <table className="cs-stats-table">
        <thead>
          <tr>
            <th scope="col">Feature</th>
            <th scope="col">RBA</th>
            <th scope="col">Target</th>
            <th scope="col">Achieved</th>
            <th scope="col">&Delta;</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.status === 'untracked' ? 'cs-row-untracked' : ''}>
              <th scope="row">{row.label}</th>
              {/* data-label carries the column name into the stacked mobile
                  layout, where the header row is hidden. */}
              <StatCell
                label="RBA"
                pct={row.rbaPct}
                mm2={
                  row.rbaPct === undefined || row.totalMm2 === undefined
                    ? undefined
                    : (row.rbaPct / 100) * row.totalMm2
                }
              />
              <StatCell
                label="Target"
                pct={row.targetPct}
                mm2={row.targetMm2}
                auto={row.targetAuto}
              />
              <StatCell
                label="Achieved"
                pct={row.achievedPct}
                mm2={row.achievedMm2}
                className="cs-achieved"
              />
              <td data-label="Delta">
                {row.deltaPct === undefined ? DASH : formatCoverageDelta(row.deltaPct)}
              </td>
              <td data-label="Status">
                <span className={`cs-status cs-status--${row.status}`}>
                  <span className="cs-status-dot" aria-hidden="true" />
                  {STATUS_WORD[row.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            {/* No Δ and no status on the total row: a delta against a summed
                target is a different question from "did this feature meet its
                target", and the tracked-only answer is the rollup line above.
                The two cells stay for column alignment, without a data-label so
                the stacked layout drops them. */}
            <tr className="cs-stats-total">
              <th scope="row">Total</th>
              <StatCell label="RBA" pct={totals.rbaPct} mm2={totals.rbaMm2} />
              <StatCell label="Target" pct={totals.targetPct} mm2={totals.targetMm2} />
              <StatCell
                label="Achieved"
                pct={totals.achievedPct}
                mm2={totals.achievedMm2}
                className="cs-achieved"
              />
              <td />
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
