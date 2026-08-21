// =============================================================================
// Vessel Modeler — "Coverage vs Scope" report section data (pure)
// =============================================================================
// The print-facing projection of the coverage comparison, used by the generated
// .docx vessel report (docs/plans/2026-08-17-coverage-comparison-design.md,
// "Generated reports"). Every number arrives from `computeComparisonRows` /
// `computeComparisonRollup` — the ONE row source — and is only FORMATTED here.
// Nothing on this path re-derives a percentage, a delta or a status.
//
// Two rules that make paper different from the screen section:
//   • Status is never colour-alone. Each tracked row carries a WORD (Met / Near
//     / Short) alongside its coloured dot, so a greyscale print stays legible.
//   • The section is OMITTED entirely when no feature carries a target — an
//     all-untracked table is noise on paper. That is signalled by returning
//     `undefined`, which the report builder turns into "emit nothing".
//
// Pure: no docx, no React, no DOM. Testable as data.
// =============================================================================

import type { VesselState } from '../types';
import {
  NEAR_BAND_POINTS,
  computeComparisonRollup,
  computeComparisonRows,
  formatCoverageDelta,
  formatCoveragePct,
  type ComparisonStatus,
} from './coverage-comparison';

/** Heading of the report section, matching the modeler stats section verbatim. */
export const COVERAGE_SCOPE_SECTION_TITLE = 'Coverage vs Scope';

/** Placeholder for anything a feature has no target for (mirrors the UI's dash). */
export const UNTRACKED_DASH = '—';

/**
 * The word printed beside the status dot. Colour-blind and greyscale readers get
 * the status from this text alone — never from the dot.
 */
export const STATUS_PRINT_LABEL: Record<ComparisonStatus, string> = {
  met: 'Met',
  near: 'Near',
  short: 'Short',
  untracked: UNTRACKED_DASH,
};

/**
 * docx colours (RRGGBB, no leading '#'). Same hues as the on-screen dots
 * (`.vm-cmp-dot--*`) one step darker, because the screen values are tuned for a
 * dark panel and wash out on white paper.
 */
export const STATUS_PRINT_COLOR: Record<ComparisonStatus, string> = {
  met: '15803D',
  near: 'B45309',
  short: 'B91C1C',
  untracked: '808080',
};

/** Text colour for an untracked row — the print equivalent of the UI's dimming. */
export const UNTRACKED_PRINT_COLOR = '808080';

// Formatting is the comparison engine's, re-exported so the report's own
// consumers (and its tests) keep one import — paper and screen must round the
// same numbers the same way.
export { formatCoveragePct, formatCoverageDelta };

/** One printed table row: pre-formatted strings plus its print colours. */
export interface CoverageScopeReportRow {
  /** Stable feature key from the engine row (`cylinder`, `<appId>:dome`, …). */
  key: string;
  label: string;
  /** Dash when untracked — never a fabricated 0%. */
  targetText: string;
  achievedText: string;
  /** Dash when untracked. */
  deltaText: string;
  /** Met / Near / Short, or a dash when untracked. */
  statusLabel: string;
  statusColor: string;
  /** True ⇒ render dimmed and print no status dot (dash only). */
  untracked: boolean;
}

/** Everything the report builder needs to emit the section, already formatted. */
export interface CoverageScopeReportSection {
  title: string;
  rows: CoverageScopeReportRow[];
  /** Area-weighted headline, e.g. "62.4% achieved of 70.0% targeted". */
  rollupMain: string;
  /** e.g. "2 of 4 targeted features short · 1 untracked". */
  rollupNote: string;
  /** Band legend + the untracked convention, for the small print under the table. */
  legend: string;
}

/**
 * Builds the printed "Coverage vs Scope" section, or `undefined` when the vessel
 * has no targets at all — the caller then omits the section entirely rather than
 * printing a table of dashes.
 *
 * Untracked features stay in the table (dimmed, dashed) but are excluded from the
 * rollup, exactly as on screen: the rollup arithmetic is the engine's, not ours.
 */
export function buildCoverageScopeSectionData(
  state: VesselState
): CoverageScopeReportSection | undefined {
  const rows = computeComparisonRows(state);
  const rollup = computeComparisonRollup(rows);

  // No feature carries a target ⇒ nothing worth printing.
  if (rollup.tracked === 0) return undefined;

  const untrackedCount = rollup.total - rollup.tracked;

  return {
    title: COVERAGE_SCOPE_SECTION_TITLE,
    rows: rows.map((r) => {
      const untracked = r.status === 'untracked';
      return {
        key: r.key,
        label: r.label,
        targetText:
          r.targetPct === undefined ? UNTRACKED_DASH : `${formatCoveragePct(r.targetPct)}%`,
        achievedText: `${formatCoveragePct(r.achievedPct)}%`,
        deltaText: r.deltaPct === undefined ? UNTRACKED_DASH : formatCoverageDelta(r.deltaPct),
        statusLabel: STATUS_PRINT_LABEL[r.status],
        statusColor: untracked ? UNTRACKED_PRINT_COLOR : STATUS_PRINT_COLOR[r.status],
        untracked,
      };
    }),
    rollupMain: `${formatCoveragePct(rollup.achievedPct)}% achieved of ${formatCoveragePct(
      rollup.targetPct
    )}% targeted`,
    rollupNote:
      `${rollup.short} of ${rollup.tracked} targeted ` +
      `${rollup.tracked === 1 ? 'feature' : 'features'} short` +
      (untrackedCount > 0 ? ` · ${untrackedCount} untracked` : ''),
    legend:
      `Status: Met = achieved at or above target · Near = within ${NEAR_BAND_POINTS} points ` +
      `· Short = more than ${NEAR_BAND_POINTS} points below target. ` +
      `Untracked features (${UNTRACKED_DASH}) carry no target and are excluded from the rollup. ` +
      `Percentages are area-weighted.`,
  };
}
