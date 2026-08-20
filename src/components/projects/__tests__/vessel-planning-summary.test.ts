// =============================================================================
// vessel-planning-summary — the vessel card's "targets set N/M · achieved %"
// =============================================================================
// The card must agree with the Coverage tab and the modeler section, so the only
// behaviour worth pinning here is what the card ADDS on top of the shared
// rollup: untracked features count toward M but never toward N, and "nothing
// tracked" surfaces as a dash (null), never as 0%.
// =============================================================================

import { describe, it, expect } from 'vitest';

import type { FeatureComparisonRow } from '../../VesselModeler/engine/coverage-comparison';
import { EMPTY_PLANNING_SUMMARY, summarizePlanning } from '../vessel-planning-summary';

/** Row factory — mirrors what computeComparisonRows emits for one feature. */
function row(
  key: string,
  totalMm2: number,
  achievedMm2: number,
  targetPct?: number
): FeatureComparisonRow {
  const achievedPct = totalMm2 > 0 ? (achievedMm2 / totalMm2) * 100 : 0;
  const status =
    targetPct === undefined
      ? ('untracked' as const)
      : achievedPct >= targetPct
        ? ('met' as const)
        : achievedPct >= targetPct - 5
          ? ('near' as const)
          : ('short' as const);
  return {
    key,
    label: key,
    ref: { scope: 'main', key: 'cylinder' },
    targetPct,
    achievedPct,
    deltaPct: targetPct === undefined ? undefined : achievedPct - targetPct,
    status,
    totalMm2,
    achievedMm2,
  };
}

describe('summarizePlanning', () => {
  it('reports no targets as a dash, not 0%', () => {
    const summary = summarizePlanning([row('cylinder', 1000, 400), row('leftHead', 500, 100)]);

    expect(summary.achievedPct).toBeNull();
    expect(summary.tracked).toBe(0);
    expect(summary.total).toBe(2);
    expect(summary.short).toBe(0);
  });

  it('counts untracked features in M but never in N', () => {
    const summary = summarizePlanning([
      row('cylinder', 1000, 400, 40),
      row('leftHead', 500, 100),
      row('rightHead', 500, 250, 50),
    ]);

    expect(summary.tracked).toBe(2);
    expect(summary.total).toBe(3);
  });

  it('weights achieved by area, not by row count', () => {
    // 900/1000 on a big feature, 0/10 on a tiny one: a row-count mean would be
    // 45%, the area-weighted truth is 900/1010.
    const summary = summarizePlanning([
      row('cylinder', 1000, 900, 50),
      row('leftHead', 10, 0, 50),
    ]);

    expect(summary.achievedPct).toBeCloseTo((900 / 1010) * 100, 6);
  });

  it('excludes untracked area from the achieved average', () => {
    const tracked = summarizePlanning([row('cylinder', 1000, 500, 40)]);
    const withUntracked = summarizePlanning([
      row('cylinder', 1000, 500, 40),
      row('leftHead', 5000, 0),
    ]);

    expect(withUntracked.achievedPct).toBe(tracked.achievedPct);
  });

  it('counts only red rows as short (amber is not short)', () => {
    const summary = summarizePlanning([
      row('cylinder', 1000, 360, 40), // 36% vs 40% → amber
      row('leftHead', 1000, 200, 40), // 20% vs 40% → red
      row('rightHead', 1000, 500, 40), // met
    ]);

    expect(summary.short).toBe(1);
    expect(summary.tracked).toBe(3);
  });

  it('an empty row list matches the pre-model placeholder', () => {
    expect(summarizePlanning([])).toEqual(EMPTY_PLANNING_SUMMARY);
  });
});
