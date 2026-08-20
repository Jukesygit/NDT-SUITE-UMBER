// ---------------------------------------------------------------------------
// Vessel-card planning summary — pure.
//
// Condenses the coverage-comparison rollup into the three facts a project
// vessel card shows (docs/plans/2026-08-17-coverage-comparison-design.md,
// Surfaces §3): model linked · targets set N/M · achieved %.
//
// It derives NOTHING itself: percentages and counts come from
// `computeComparisonRollup`, the same engine call the Coverage tab and the
// modeler's stats section make, so the three surfaces can never disagree. The
// only decision made here is the "nothing tracked ⇒ dash" rule, expressed as a
// null achievedPct rather than a misleading 0.
// ---------------------------------------------------------------------------

import {
  computeComparisonRollup,
  type FeatureComparisonRow,
} from '../VesselModeler/engine/coverage-comparison';

export interface VesselPlanningSummary {
  /** Feature instances carrying a target — the "N" of "targets set N/M". */
  tracked: number;
  /** All feature instances on the model — the "M". */
  total: number;
  /**
   * Area-weighted achieved % over tracked features, or null when nothing is
   * tracked (the card renders a dash — never 0%, which would read as a miss).
   */
  achievedPct: number | null;
  /** Tracked features more than the amber band below target. */
  short: number;
}

/** Summary shown before a model has been linked (or while one is loading). */
export const EMPTY_PLANNING_SUMMARY: VesselPlanningSummary = {
  tracked: 0,
  total: 0,
  achievedPct: null,
  short: 0,
};

export function summarizePlanning(rows: FeatureComparisonRow[]): VesselPlanningSummary {
  const rollup = computeComparisonRollup(rows);
  return {
    tracked: rollup.tracked,
    total: rollup.total,
    achievedPct: rollup.tracked === 0 ? null : rollup.achievedPct,
    short: rollup.short,
  };
}
