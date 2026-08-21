// =============================================================================
// coverage-scope-report — the printed "Coverage vs Scope" section data
// =============================================================================
// What matters on paper: the section EXISTS only when some feature carries a
// target (an all-untracked table of dashes is noise), untracked features stay
// visible but dashed and out of the rollup, and every status carries a WORD —
// never colour alone — so a greyscale print is still readable.
//
// Numbers are the comparison engine's; this suite guards the projection, not the
// arithmetic (see coverage-comparison.test.ts for that).
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type CoverageTargetEntry,
  type CoverageTargets,
  type VesselState,
} from '../../types';
import {
  COVERAGE_SCOPE_SECTION_TITLE,
  UNTRACKED_DASH,
  UNTRACKED_PRINT_COLOR,
  buildCoverageScopeSectionData,
  formatCoverageDelta,
  formatCoveragePct,
} from '../coverage-scope-report';

function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return { ...DEFAULT_VESSEL_STATE, ...overrides };
}

/** `rbaPct` is the risk recommendation; `scopedPct` is the committed yardstick. */
function target(scopedPct: number): CoverageTargetEntry {
  return { rbaPct: scopedPct, scopedPct };
}

/**
 * No scans anywhere ⇒ achieved is 0% on every feature, so a target of 0 / 5 / 10
 * lands exactly on met / near / short without depending on any geometry sweep.
 */
function withTargets(targets: CoverageTargets): VesselState {
  return makeState({ coverageTargets: targets });
}

// ---------------------------------------------------------------------------
// Include / omit rule
// ---------------------------------------------------------------------------

describe('buildCoverageScopeSectionData — include/omit', () => {
  it('omits the section entirely when no feature carries a target', () => {
    expect(buildCoverageScopeSectionData(makeState())).toBeUndefined();
    expect(buildCoverageScopeSectionData(withTargets({}))).toBeUndefined();
    expect(buildCoverageScopeSectionData(withTargets({ appendages: {} }))).toBeUndefined();
  });

  it('includes the section as soon as one feature carries a target', () => {
    const section = buildCoverageScopeSectionData(withTargets({ cylinder: target(10) }));
    expect(section).toBeDefined();
    expect(section!.title).toBe(COVERAGE_SCOPE_SECTION_TITLE);
    expect(section!.rows.length).toBeGreaterThan(0);
  });

  it('includes a 0% target — that is tracked, not untracked', () => {
    const section = buildCoverageScopeSectionData(withTargets({ cylinder: target(0) }));
    expect(section).toBeDefined();
    const shell = section!.rows.find((r) => r.key === 'cylinder')!;
    expect(shell.untracked).toBe(false);
    expect(shell.targetText).toBe('0.0%');
  });
});

// ---------------------------------------------------------------------------
// Untracked features
// ---------------------------------------------------------------------------

describe('buildCoverageScopeSectionData — untracked features', () => {
  const section = buildCoverageScopeSectionData(withTargets({ cylinder: target(10) }))!;

  it('still lists untracked features, dimmed and dashed', () => {
    const heads = section.rows.filter((r) => r.key !== 'cylinder');
    expect(heads.length).toBe(2);
    for (const head of heads) {
      expect(head.untracked).toBe(true);
      expect(head.targetText).toBe(UNTRACKED_DASH);
      expect(head.deltaText).toBe(UNTRACKED_DASH);
      expect(head.statusLabel).toBe(UNTRACKED_DASH);
      expect(head.statusColor).toBe(UNTRACKED_PRINT_COLOR);
    }
  });

  it('still reports an untracked feature achieved %, never a dash', () => {
    const head = section.rows.find((r) => r.key === 'leftHead')!;
    expect(head.achievedText).toMatch(/^\d+(\.\d+)?%$/);
  });

  it('excludes untracked features from the rollup and counts them separately', () => {
    // One tracked feature (short, since nothing is scanned), two untracked heads.
    expect(section.rollupNote).toBe('1 of 1 targeted feature short · 2 untracked');
  });

  it('drops the untracked suffix when every feature is targeted', () => {
    const all = buildCoverageScopeSectionData(
      withTargets({ leftHead: target(10), cylinder: target(10), rightHead: target(10) })
    )!;
    expect(all.rollupNote).toBe('3 of 3 targeted features short');
  });
});

// ---------------------------------------------------------------------------
// Status is never colour-alone
// ---------------------------------------------------------------------------

describe('buildCoverageScopeSectionData — greyscale-safe status', () => {
  const section = buildCoverageScopeSectionData(
    withTargets({ leftHead: target(0), cylinder: target(5), rightHead: target(10) })
  )!;

  it('prints a status WORD for every tracked band, not just a colour', () => {
    const byKey = new Map(section.rows.map((r) => [r.key, r]));
    expect(byKey.get('leftHead')!.statusLabel).toBe('Met');
    expect(byKey.get('cylinder')!.statusLabel).toBe('Near');
    expect(byKey.get('rightHead')!.statusLabel).toBe('Short');
  });

  it('gives each band a distinct print colour alongside its word', () => {
    const colors = section.rows.map((r) => r.statusColor);
    expect(new Set(colors).size).toBe(3);
    for (const color of colors) expect(color).toMatch(/^[0-9A-F]{6}$/);
  });

  it('states the band rules and the untracked convention in the legend', () => {
    expect(section.legend).toContain('Met');
    expect(section.legend).toContain('Near');
    expect(section.legend).toContain('Short');
    expect(section.legend).toContain(UNTRACKED_DASH);
    expect(section.legend).toContain('5 points');
  });
});

// ---------------------------------------------------------------------------
// Rollup line + formatting
// ---------------------------------------------------------------------------

describe('buildCoverageScopeSectionData — rollup line', () => {
  it('reads as area-weighted achieved vs targeted', () => {
    const section = buildCoverageScopeSectionData(withTargets({ cylinder: target(40) }))!;
    // Nothing scanned ⇒ 0% achieved; the targeted side is area-weighted by the engine.
    expect(section.rollupMain).toMatch(/^0\.0% achieved of \d+(\.\d+)?% targeted$/);
  });

  it('singularises the feature count for a lone tracked feature', () => {
    const one = buildCoverageScopeSectionData(withTargets({ cylinder: target(10) }))!;
    expect(one.rollupNote).toContain('targeted feature short');
    const two = buildCoverageScopeSectionData(
      withTargets({ cylinder: target(10), leftHead: target(10) })
    )!;
    expect(two.rollupNote).toContain('targeted features short');
  });
});

describe('print formatters', () => {
  it('keeps two decimals only for tiny non-zero percentages', () => {
    expect(formatCoveragePct(0)).toBe('0.0');
    expect(formatCoveragePct(0.04)).toBe('0.04');
    expect(formatCoveragePct(12.34)).toBe('12.3');
  });

  it('always signs a delta, and snaps a hair-width delta to a bare zero', () => {
    expect(formatCoverageDelta(2.5)).toBe('+2.5');
    expect(formatCoverageDelta(-2.5)).toBe('−2.5');
    expect(formatCoverageDelta(-0.001)).toBe('0.0');
  });
});
