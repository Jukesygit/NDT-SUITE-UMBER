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

interface ShareStatsTableProps {
  rows: ShareStatRow[];
  rollup: ShareStatRollup;
}

export function ShareStatsTable({ rows, rollup }: ShareStatsTableProps) {
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
              <td data-label="Target">
                {row.targetPct === undefined ? DASH : `${formatCoveragePct(row.targetPct)}%`}
              </td>
              <td data-label="Achieved" className="cs-achieved">
                {formatCoveragePct(row.achievedPct)}%
              </td>
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
      </table>
    </div>
  );
}
