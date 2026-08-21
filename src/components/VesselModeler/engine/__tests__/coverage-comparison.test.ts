// =============================================================================
// coverage-comparison — targets vs achieved rows, banding and rollup
// =============================================================================
// The single row source behind the modeler comparison section, the coverage
// panel's target editor and (later) the Coverage tab / report. What matters
// here: the band edges are exact, untracked features are excluded from every
// rollup, weighting is by AREA (not row count), dome rows exist only for dished
// boots, and a pipe emits no head rows.
//
// Since the 2026-08-21 owner ruling the SCOPE side is rect-derived: drawn rects
// decide the target where they exist, the manual `scopedPct` is the fallback,
// and `targetPctOf` is still the one place that chooses
// (docs/plans/2026-08-21-rect-derived-scope-design.md).
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type CoverageRectConfig,
  type CoverageTargets,
  type DomeScanConfig,
  type ScanCompositeConfig,
  type VesselState,
} from '../../types';
import { computeCoverage, computeRegionCoveredAreas } from '../coverage-calculator';
import {
  NEAR_BAND_POINTS,
  computeComparisonRollup,
  computeComparisonRows,
  listComparisonFeatures,
  readTargetEntry,
  statusFor,
  targetPctOf,
  writeTargetEntry,
  type FeatureComparisonRow,
} from '../coverage-comparison';

const SUMP: AppendageConfig = {
  id: 'app-1',
  name: 'Boot 1',
  mountPos: 4000,
  mountAngle: 270,
  diameter: 1000,
  length: 1500,
  endClosure: 'dished',
  headRatio: 2.0,
  visible: true,
  locked: false,
};

function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return { ...DEFAULT_VESSEL_STATE, ...overrides };
}

function makeRect(overrides: Partial<CoverageRectConfig> = {}): CoverageRectConfig {
  return {
    id: 1,
    name: 'Rect',
    pos: 4000,
    angle: 90,
    width: 1000,
    height: 1000,
    color: '#00ff00',
    lineWidth: 10,
    filled: true,
    fillOpacity: 0.2,
    ...overrides,
  };
}

/**
 * The default vessel is id 3000 / length 8000, so a 1000×1000 mm rect parked mid
 * barrel is a pure-cylinder rect covering exactly R·(h/R)·w = 1 m²: the covered
 * area below is arithmetic, not a snapshot of the sweep.
 */
const MAIN_RECT_COVERED_MM2 = 1_000_000;
/** Boot radius 500 × a 500×500 rect on its lateral cylinder = 0.25 m². */
const BOOT_RECT_COVERED_MM2 = 250_000;

function makeScan(overrides: Partial<ScanCompositeConfig>): ScanCompositeConfig {
  return {
    id: 'sc',
    name: 'Scan',
    data: [
      [8, 8],
      [8, 8],
    ],
    xAxis: [0, 10],
    yAxis: [0, 10],
    stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 1_000_000 },
    indexStartMm: 100,
    datumAngleDeg: 0,
    scanDirection: 'cw',
    indexDirection: 'forward',
    orientationConfirmed: true,
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...overrides,
  };
}

function makeDomeScan(overrides: Partial<DomeScanConfig>): DomeScanConfig {
  return {
    id: 'ds',
    name: 'Dome Scan',
    head: 'left',
    centerPhi: 20,
    centerTheta: 0,
    scanDirection: 'cw',
    indexDirection: 'outward',
    orientationConfirmed: true,
    data: [
      [8, 8],
      [8, 8],
    ],
    xAxis: [0, 10],
    yAxis: [0, 10],
    stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 1_000_000 },
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...overrides,
  };
}

/** A row with explicit areas, for rollup arithmetic that must not depend on geometry. */
function row(over: Partial<FeatureComparisonRow> & { key: string }): FeatureComparisonRow {
  const targetPct = over.targetPct;
  const achievedPct = over.achievedPct ?? 0;
  return {
    label: over.key,
    ref: { scope: 'main', key: 'cylinder' },
    targetPct,
    achievedPct,
    deltaPct: targetPct === undefined ? undefined : achievedPct - targetPct,
    status: statusFor(targetPct, achievedPct),
    totalMm2: 0,
    achievedMm2: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// statusFor — the band edges
// ---------------------------------------------------------------------------

describe('statusFor — band edges', () => {
  it('treats an exactly-met target as met (inclusive upper edge)', () => {
    expect(statusFor(40, 40)).toBe('met');
  });

  it('treats overachievement as met', () => {
    expect(statusFor(40, 40.0001)).toBe('met');
    expect(statusFor(40, 100)).toBe('met');
  });

  it('treats exactly NEAR_BAND_POINTS below target as near (inclusive lower edge)', () => {
    expect(NEAR_BAND_POINTS).toBe(5);
    expect(statusFor(40, 35)).toBe('near');
  });

  it('treats just inside the band as near and just outside as short', () => {
    expect(statusFor(40, 35.0001)).toBe('near');
    expect(statusFor(40, 39.999)).toBe('near');
    expect(statusFor(40, 34.999)).toBe('short');
    expect(statusFor(40, 0)).toBe('short');
  });

  it('survives float drift at both edges (0.1-arithmetic targets)', () => {
    const target = 0.1 + 0.2; // 0.30000000000000004
    expect(statusFor(target, 0.3)).toBe('met');
    expect(statusFor(30.3, 30.3 - NEAR_BAND_POINTS)).toBe('near');
  });

  it('is untracked when there is no target, whatever the achieved value', () => {
    expect(statusFor(undefined, 0)).toBe('untracked');
    expect(statusFor(undefined, 100)).toBe('untracked');
  });

  it('treats a 0% target as tracked and trivially met — not untracked', () => {
    expect(statusFor(0, 0)).toBe('met');
  });
});

// ---------------------------------------------------------------------------
// listComparisonFeatures — which feature instances exist
// ---------------------------------------------------------------------------

describe('listComparisonFeatures', () => {
  it('emits head + shell + head for a vessel, in display order', () => {
    expect(listComparisonFeatures(makeState()).map((f) => f.key)).toEqual([
      'leftHead',
      'cylinder',
      'rightHead',
    ]);
  });

  it('emits no head rows for a pipe shape', () => {
    const keys = listComparisonFeatures(makeState({ vesselShape: 'pipe' })).map((f) => f.key);
    expect(keys).toEqual(['cylinder']);
  });

  it('names horizontal heads by compass heading and vertical heads top/bottom', () => {
    const horizontal = listComparisonFeatures(makeState({ orientation: 'horizontal' }));
    expect(horizontal[0].label).toMatch(/Dome$/);
    const vertical = listComparisonFeatures(makeState({ orientation: 'vertical' }));
    expect(vertical[0].label).toBe('Top Dome');
    expect(vertical[2].label).toBe('Bottom Dome');
  });

  it('emits a shell AND a dome row for a dished boot', () => {
    const keys = listComparisonFeatures(makeState({ appendages: [SUMP] })).map((f) => f.key);
    expect(keys).toEqual(['leftHead', 'cylinder', 'rightHead', 'app-1:shell', 'app-1:dome']);
  });

  it('emits only a shell row for flat and open boots', () => {
    for (const endClosure of ['flat', 'open'] as const) {
      const state = makeState({ appendages: [{ ...SUMP, endClosure }] });
      const keys = listComparisonFeatures(state).map((f) => f.key);
      expect(keys).toEqual(['leftHead', 'cylinder', 'rightHead', 'app-1:shell']);
    }
  });

  it('tags appendage features with their bodyId and main features with none', () => {
    const features = listComparisonFeatures(makeState({ appendages: [SUMP] }));
    expect(features.find((f) => f.key === 'cylinder')!.bodyId).toBeUndefined();
    expect(features.find((f) => f.key === 'app-1:dome')!.bodyId).toBe('app-1');
  });
});

// ---------------------------------------------------------------------------
// read/writeTargetEntry — the target address book
// ---------------------------------------------------------------------------

describe('readTargetEntry / writeTargetEntry', () => {
  const entry = { rbaPct: 10, scopedPct: 40 };

  it('reads back what it writes, on both scopes', () => {
    const main = writeTargetEntry(undefined, { scope: 'main', key: 'cylinder' }, entry);
    expect(readTargetEntry(main, { scope: 'main', key: 'cylinder' })).toEqual(entry);

    const dome = writeTargetEntry(
      undefined,
      { scope: 'appendage', appendageId: 'app-1', slot: 'dome' },
      entry
    );
    expect(
      readTargetEntry(dome, { scope: 'appendage', appendageId: 'app-1', slot: 'dome' })
    ).toEqual(entry);
  });

  it('returns undefined for a missing entry rather than a zero entry', () => {
    expect(readTargetEntry(undefined, { scope: 'main', key: 'cylinder' })).toBeUndefined();
    expect(readTargetEntry({}, { scope: 'main', key: 'cylinder' })).toBeUndefined();
    expect(
      readTargetEntry({}, { scope: 'appendage', appendageId: 'app-1', slot: 'shell' })
    ).toBeUndefined();
  });

  it('does not mutate the input targets', () => {
    const before: CoverageTargets = { cylinder: entry };
    const snapshot = JSON.parse(JSON.stringify(before));
    writeTargetEntry(before, { scope: 'main', key: 'leftHead' }, entry);
    expect(before).toEqual(snapshot);
  });

  it('clearing a main entry removes the key (back to untracked)', () => {
    const set: CoverageTargets = { cylinder: entry, leftHead: entry };
    const cleared = writeTargetEntry(set, { scope: 'main', key: 'cylinder' }, undefined)!;
    expect(cleared).not.toHaveProperty('cylinder');
    expect(cleared.leftHead).toEqual(entry);
  });

  it('clearing the last slot of a boot drops the boot, then the appendages map', () => {
    let targets = writeTargetEntry(
      undefined,
      { scope: 'appendage', appendageId: 'app-1', slot: 'shell' },
      entry
    );
    targets = writeTargetEntry(
      targets,
      { scope: 'appendage', appendageId: 'app-1', slot: 'dome' },
      entry
    );
    expect(Object.keys(targets!.appendages!)).toEqual(['app-1']);

    targets = writeTargetEntry(
      targets,
      { scope: 'appendage', appendageId: 'app-1', slot: 'dome' },
      undefined
    );
    expect(targets!.appendages!['app-1']).toEqual({ shell: entry });

    targets = writeTargetEntry(
      targets,
      { scope: 'appendage', appendageId: 'app-1', slot: 'shell' },
      undefined
    );
    expect(targets).toBeUndefined();
  });

  it('clearing a boot slot leaves sibling boots untouched', () => {
    let targets = writeTargetEntry(
      undefined,
      { scope: 'appendage', appendageId: 'app-1', slot: 'shell' },
      entry
    );
    targets = writeTargetEntry(
      targets,
      { scope: 'appendage', appendageId: 'app-2', slot: 'shell' },
      entry
    );
    targets = writeTargetEntry(
      targets,
      { scope: 'appendage', appendageId: 'app-1', slot: 'shell' },
      undefined
    );
    expect(targets!.appendages).toEqual({ 'app-2': { shell: entry } });
  });

  it('clearing the only entry returns undefined so the model saves legacy-shaped', () => {
    const set = writeTargetEntry(undefined, { scope: 'main', key: 'cylinder' }, entry);
    expect(writeTargetEntry(set, { scope: 'main', key: 'cylinder' }, undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computeComparisonRows
// ---------------------------------------------------------------------------

describe('computeComparisonRows', () => {
  it('marks every feature untracked when the model carries no targets and no rects', () => {
    const rows = computeComparisonRows(makeState({ appendages: [SUMP] }));
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.status).toBe('untracked');
      expect(r.targetPct).toBeUndefined();
      expect(r.targetSource).toBeUndefined();
      expect(r.targetMm2).toBeUndefined();
      expect(r.deltaPct).toBeUndefined();
    }
  });

  it('computes achieved% from the achieved/total area of each feature', () => {
    // One main-shell composite of 1 m²; shell total is the full cylinder area.
    const state = makeState({ scanComposites: [makeScan({})] });
    const shell = computeComparisonRows(state).find((r) => r.key === 'cylinder')!;
    expect(shell.achievedMm2).toBe(1_000_000);
    expect(shell.achievedPct).toBeCloseTo((shell.achievedMm2 / shell.totalMm2) * 100, 10);
  });

  it('reports target, achieved, delta and status together for a tracked feature', () => {
    const state = makeState({
      scanComposites: [makeScan({})],
      coverageTargets: { cylinder: { rbaPct: 0, scopedPct: 100 } },
    });
    const shell = computeComparisonRows(state).find((r) => r.key === 'cylinder')!;
    expect(shell.targetPct).toBe(100);
    expect(shell.deltaPct).toBeCloseTo(shell.achievedPct - 100, 10);
    expect(shell.status).toBe('short'); // 1 m² of a multi-m² shell
  });

  it('uses scopedPct as the target and ignores rbaPct entirely (manual path)', () => {
    // No rects anywhere, so this is the manual fallback leg — rbaPct is never the
    // yardstick on EITHER leg (2026-08-21 ruling left that part untouched).
    const state = makeState({ coverageTargets: { cylinder: { rbaPct: 90, scopedPct: 0 } } });
    const shell = computeComparisonRows(state).find((r) => r.key === 'cylinder')!;
    expect(shell.targetPct).toBe(0);
    expect(shell.targetSource).toBe('manual');
    expect(shell.status).toBe('met');
  });

  it('routes a boot dome scan to the dome row and never to that boot shell', () => {
    const state = makeState({
      appendages: [SUMP],
      domeScanComposites: [makeDomeScan({ head: 'end', bodyId: 'app-1' })],
    });
    const rows = computeComparisonRows(state);
    const dome = rows.find((r) => r.key === 'app-1:dome')!;
    const shell = rows.find((r) => r.key === 'app-1:shell')!;
    expect(dome.achievedMm2).toBe(1_000_000);
    expect(dome.totalMm2).toBeGreaterThan(0);
    expect(shell.achievedMm2).toBe(0);
  });

  it("never credits a main head with a boot's 'end' dome scan", () => {
    const state = makeState({
      appendages: [SUMP],
      domeScanComposites: [makeDomeScan({ head: 'end', bodyId: 'app-1' })],
    });
    const rows = computeComparisonRows(state);
    expect(rows.find((r) => r.key === 'leftHead')!.achievedMm2).toBe(0);
    expect(rows.find((r) => r.key === 'rightHead')!.achievedMm2).toBe(0);
  });

  it('keeps boot shell area separate from the boot dome area (no alias leak)', () => {
    const rows = computeComparisonRows(makeState({ appendages: [SUMP] }));
    const shell = rows.find((r) => r.key === 'app-1:shell')!;
    const dome = rows.find((r) => r.key === 'app-1:dome')!;
    expect(shell.totalMm2).toBeCloseTo(2 * Math.PI * 500 * 1500, 3);
    expect(dome.totalMm2).toBeGreaterThan(0);
    expect(dome.totalMm2).not.toBeCloseTo(shell.totalMm2, 3);
  });

  it('reports a flat boot with no dome row at all', () => {
    const state = makeState({ appendages: [{ ...SUMP, endClosure: 'flat' }] });
    expect(computeComparisonRows(state).some((r) => r.key === 'app-1:dome')).toBe(false);
  });

  it('emits shell-only rows for a pipe shape', () => {
    const rows = computeComparisonRows(makeState({ vesselShape: 'pipe' }));
    expect(rows.map((r) => r.key)).toEqual(['cylinder']);
  });

  it('reports 0% achieved without dividing by a zero area', () => {
    const state = makeState({ appendages: [{ ...SUMP, endClosure: 'flat', length: 0 }] });
    const shell = computeComparisonRows(state).find((r) => r.key === 'app-1:shell')!;
    expect(shell.totalMm2).toBe(0);
    expect(shell.achievedPct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeRegionCoveredAreas — the mm² projection of the rect sweep
// ---------------------------------------------------------------------------

describe('computeRegionCoveredAreas', () => {
  it('is computeCoverage`s regions in mm², not a second calculation', () => {
    // A rect draping past the left tangent so the head raster contributes too —
    // the projection must carry that branch, not just the barrel sweep.
    const state = makeState({
      coverageRects: [
        makeRect({ id: 1 }),
        makeRect({ id: 2, pos: 200, width: 1600, height: 800, angle: 270 }),
      ],
    });
    const expected = computeCoverage(state.coverageRects, state);
    const covered = computeRegionCoveredAreas(state);

    expect(covered.leftHead).toBeCloseTo(expected.leftHead.covered * 1e6, 6);
    expect(covered.cylinder).toBeCloseTo(expected.cylinder.covered * 1e6, 6);
    expect(covered.rightHead).toBeCloseTo(expected.rightHead.covered * 1e6, 6);
    expect(covered.leftHead).toBeGreaterThan(0); // the drape branch really ran
  });

  it('measures a mid-barrel rect as its exact unrolled area', () => {
    const covered = computeRegionCoveredAreas(makeState({ coverageRects: [makeRect()] }));
    expect(covered.cylinder).toBeCloseTo(MAIN_RECT_COVERED_MM2, 6);
    expect(covered.leftHead).toBe(0);
    expect(covered.rightHead).toBe(0);
  });

  it('is all-zero with no rects, and ignores rects belonging to a boot', () => {
    expect(computeRegionCoveredAreas(makeState())).toEqual({
      leftHead: 0,
      cylinder: 0,
      rightHead: 0,
    });
    // bodyId rects are the boot`s own coverage — never the main shell`s.
    const bootOnly = makeState({
      appendages: [SUMP],
      coverageRects: [makeRect({ bodyId: 'app-1', pos: 750, width: 500, height: 500, angle: 180 })],
    });
    expect(computeRegionCoveredAreas(bootOnly)).toEqual({
      leftHead: 0,
      cylinder: 0,
      rightHead: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// targetPctOf — the ONE place a target is decided (2026-08-21 ruling)
// ---------------------------------------------------------------------------

describe('targetPctOf — resolution order', () => {
  const entry = { rbaPct: 90, scopedPct: 25 };

  it('derives from rect coverage when there is any, ignoring a stored manual entry', () => {
    expect(targetPctOf(entry, 250, 1000)).toEqual({ pct: 25, source: 'rects', mm2: 250 });
    // Same rects, wildly different manual entry → same answer: the entry is inert.
    expect(targetPctOf({ rbaPct: 0, scopedPct: 99 }, 250, 1000)).toEqual({
      pct: 25,
      source: 'rects',
      mm2: 250,
    });
    expect(targetPctOf(undefined, 250, 1000)).toEqual({ pct: 25, source: 'rects', mm2: 250 });
  });

  it('falls back to the manual scopedPct only when no rect covers the feature', () => {
    expect(targetPctOf(entry, 0, 1000)).toEqual({ pct: 25, source: 'manual', mm2: 250 });
  });

  it('is undefined — untracked — with neither rects nor an entry', () => {
    expect(targetPctOf(undefined, 0, 1000)).toBeUndefined();
  });

  it('keeps a 0% manual target tracked, distinct from untracked', () => {
    expect(targetPctOf({ rbaPct: 40, scopedPct: 0 }, 0, 1000)).toEqual({
      pct: 0,
      source: 'manual',
      mm2: 0,
    });
  });

  it('never divides by a zero feature area', () => {
    expect(targetPctOf(undefined, 250, 0)).toEqual({ pct: 0, source: 'rects', mm2: 250 });
    expect(targetPctOf(entry, 0, 0)).toEqual({ pct: 25, source: 'manual', mm2: 0 });
  });
});

// ---------------------------------------------------------------------------
// computeComparisonRows — rect-derived scope (2026-08-21 ruling)
// ---------------------------------------------------------------------------

describe('computeComparisonRows — rect-derived scope', () => {
  it('derives the shell target from its drawn rects when the model has no targets', () => {
    const state = makeState({ coverageRects: [makeRect()] });
    const shell = computeComparisonRows(state).find((r) => r.key === 'cylinder')!;

    expect(shell.targetSource).toBe('rects');
    expect(shell.targetMm2).toBeCloseTo(MAIN_RECT_COVERED_MM2, 6);
    expect(shell.targetPct).toBeCloseTo((MAIN_RECT_COVERED_MM2 / shell.totalMm2) * 100, 10);
    // Drawing a rect TRACKS the feature — it is no longer a dash.
    expect(shell.status).not.toBe('untracked');
    expect(shell.deltaPct).toBeCloseTo(shell.achievedPct - shell.targetPct!, 10);
  });

  it('lets rects win over a stored manual scopedPct, leaving the entry inert', () => {
    const targets: CoverageTargets = { cylinder: { rbaPct: 90, scopedPct: 80 } };
    const state = makeState({ coverageRects: [makeRect()], coverageTargets: targets });
    const shell = computeComparisonRows(state).find((r) => r.key === 'cylinder')!;

    expect(shell.targetSource).toBe('rects');
    expect(shell.targetPct).not.toBeCloseTo(80, 6);
    expect(shell.targetPct).toBeCloseTo((MAIN_RECT_COVERED_MM2 / shell.totalMm2) * 100, 10);
    // Inert, not consumed: the manual entry is still sitting in state untouched,
    // so clearing the rects restores exactly what the planner typed.
    expect(state.coverageTargets).toEqual(targets);
    expect(
      computeComparisonRows(makeState({ coverageTargets: targets })).find(
        (r) => r.key === 'cylinder'
      )!
    ).toMatchObject({ targetPct: 80, targetSource: 'manual' });
  });

  it('leaves features the rects do not touch on the manual / untracked legs', () => {
    const state = makeState({
      coverageRects: [makeRect()], // pure barrel: neither head is covered
      coverageTargets: { leftHead: { rbaPct: 0, scopedPct: 40 } },
    });
    const rows = computeComparisonRows(state);

    expect(rows.find((r) => r.key === 'leftHead')).toMatchObject({
      targetPct: 40,
      targetSource: 'manual',
    });
    const right = rows.find((r) => r.key === 'rightHead')!;
    expect(right.targetPct).toBeUndefined();
    expect(right.targetSource).toBeUndefined();
    expect(right.status).toBe('untracked');
  });

  it('reports the manual target as area too, so both legs carry mm²', () => {
    const state = makeState({ coverageTargets: { cylinder: { rbaPct: 0, scopedPct: 40 } } });
    const shell = computeComparisonRows(state).find((r) => r.key === 'cylinder')!;
    expect(shell.targetSource).toBe('manual');
    expect(shell.targetMm2).toBeCloseTo(0.4 * shell.totalMm2, 6);
  });

  it("derives a boot SHELL target from that boot's own rects, by bodyId", () => {
    const state = makeState({
      appendages: [SUMP],
      coverageRects: [makeRect({ bodyId: 'app-1', pos: 750, width: 500, height: 500, angle: 180 })],
    });
    const rows = computeComparisonRows(state);
    const bootShell = rows.find((r) => r.key === 'app-1:shell')!;

    expect(bootShell.targetSource).toBe('rects');
    expect(bootShell.targetMm2).toBeCloseTo(BOOT_RECT_COVERED_MM2, 6);
    expect(bootShell.targetPct).toBeCloseTo((BOOT_RECT_COVERED_MM2 / bootShell.totalMm2) * 100, 10);

    // The boot's rect belongs to the boot and nowhere else: the main shell and
    // both heads stay untracked.
    for (const key of ['leftHead', 'cylinder', 'rightHead']) {
      expect(rows.find((r) => r.key === key)!.targetSource).toBeUndefined();
    }
  });

  it('never rect-derives a boot dome, even when that boot is covered in rects', () => {
    const state = makeState({
      appendages: [SUMP],
      coverageRects: [
        makeRect({ bodyId: 'app-1', pos: 750, width: 1500, height: 4000, angle: 180 }),
      ],
    });
    const rows = computeComparisonRows(state);

    // No dome-rect raster exists in the engine, so the dome is untracked here…
    const dome = rows.find((r) => r.key === 'app-1:dome')!;
    expect(rows.find((r) => r.key === 'app-1:shell')!.targetSource).toBe('rects');
    expect(dome.targetSource).toBeUndefined();
    expect(dome.targetPct).toBeUndefined();
    expect(dome.status).toBe('untracked');

    // …and manual whenever the planner types a number, never the shell's area.
    const withDomeTarget = computeComparisonRows(
      makeState({
        ...state,
        coverageTargets: { appendages: { 'app-1': { dome: { rbaPct: 0, scopedPct: 30 } } } },
      })
    ).find((r) => r.key === 'app-1:dome')!;
    expect(withDomeTarget).toMatchObject({ targetPct: 30, targetSource: 'manual' });
  });
});

// ---------------------------------------------------------------------------
// computeComparisonRollup
// ---------------------------------------------------------------------------

describe('computeComparisonRollup', () => {
  it('is all-zero for an empty or fully untracked set', () => {
    expect(computeComparisonRollup([])).toEqual({
      achievedPct: 0,
      targetPct: 0,
      met: 0,
      near: 0,
      short: 0,
      tracked: 0,
      total: 0,
    });

    const untracked = computeComparisonRollup([
      row({ key: 'a', totalMm2: 1000, achievedMm2: 900 }),
      row({ key: 'b', totalMm2: 1000, achievedMm2: 0 }),
    ]);
    expect(untracked.tracked).toBe(0);
    expect(untracked.total).toBe(2);
    expect(untracked.achievedPct).toBe(0);
  });

  it('excludes untracked rows from the weighted averages entirely', () => {
    const rows = [
      row({ key: 'tracked', targetPct: 50, achievedPct: 50, totalMm2: 100, achievedMm2: 50 }),
      // A huge untracked feature with zero achieved must not drag the number down.
      row({ key: 'untracked', totalMm2: 1_000_000, achievedMm2: 0 }),
    ];
    const rollup = computeComparisonRollup(rows);
    expect(rollup.achievedPct).toBeCloseTo(50, 10);
    expect(rollup.targetPct).toBeCloseTo(50, 10);
    expect(rollup.tracked).toBe(1);
    expect(rollup.total).toBe(2);
  });

  it('weights by AREA, not by row count', () => {
    // 900 mm² feature at 100% + 100 mm² feature at 0% → 90%, not the 50% mean.
    const rows = [
      row({ key: 'big', targetPct: 100, achievedPct: 100, totalMm2: 900, achievedMm2: 900 }),
      row({ key: 'small', targetPct: 100, achievedPct: 0, totalMm2: 100, achievedMm2: 0 }),
    ];
    const rollup = computeComparisonRollup(rows);
    expect(rollup.achievedPct).toBeCloseTo(90, 10);
    expect(rollup.targetPct).toBeCloseTo(100, 10);
  });

  it('weights the target the same way as the achieved figure', () => {
    const rows = [
      row({ key: 'big', targetPct: 100, achievedPct: 0, totalMm2: 900, achievedMm2: 0 }),
      row({ key: 'small', targetPct: 0, achievedPct: 0, totalMm2: 100, achievedMm2: 0 }),
    ];
    expect(computeComparisonRollup(rows).targetPct).toBeCloseTo(90, 10);
  });

  it('counts met / near / short and sums them into tracked', () => {
    const rows = [
      row({ key: 'met', targetPct: 40, achievedPct: 40, totalMm2: 100, achievedMm2: 40 }),
      row({ key: 'near', targetPct: 40, achievedPct: 35, totalMm2: 100, achievedMm2: 35 }),
      row({ key: 'short', targetPct: 40, achievedPct: 10, totalMm2: 100, achievedMm2: 10 }),
      row({ key: 'untracked', totalMm2: 100, achievedMm2: 100 }),
    ];
    const rollup = computeComparisonRollup(rows);
    expect(rollup).toMatchObject({ met: 1, near: 1, short: 1, tracked: 3, total: 4 });
  });

  it('does not divide by zero when every tracked feature has zero area', () => {
    const rollup = computeComparisonRollup([
      row({ key: 'empty', targetPct: 50, achievedPct: 0, totalMm2: 0, achievedMm2: 0 }),
    ]);
    expect(rollup.achievedPct).toBe(0);
    expect(rollup.targetPct).toBe(0);
    expect(rollup.tracked).toBe(1);
  });

  it('counts rect-derived rows as tracked and area-weights them like any other', () => {
    // Shell rect + boot-shell rect, no manual targets anywhere: two derived rows
    // tracked, three rows (both heads + the boot dome) still untracked.
    const state = makeState({
      appendages: [SUMP],
      coverageRects: [
        makeRect(),
        makeRect({ id: 2, bodyId: 'app-1', pos: 750, width: 500, height: 500, angle: 180 }),
      ],
    });
    const rows = computeComparisonRows(state);
    const rollup = computeComparisonRollup(rows);

    expect(rows.filter((r) => r.targetSource === 'rects')).toHaveLength(2);
    expect(rollup.tracked).toBe(2);
    expect(rollup.total).toBe(5);

    const shell = rows.find((r) => r.key === 'cylinder')!;
    const boot = rows.find((r) => r.key === 'app-1:shell')!;
    const weighted =
      ((shell.targetMm2! + boot.targetMm2!) / (shell.totalMm2 + boot.totalMm2)) * 100;
    expect(rollup.targetPct).toBeCloseTo(weighted, 10);
    // The untracked heads carry the vessel's biggest untouched areas, and still
    // contribute nothing — the derived rows did not change that rule.
    expect(rollup.targetPct).toBeCloseTo(
      ((MAIN_RECT_COVERED_MM2 + BOOT_RECT_COVERED_MM2) / (shell.totalMm2 + boot.totalMm2)) * 100,
      10
    );
  });

  it('rolls up real rows end-to-end from a vessel state', () => {
    const state = makeState({
      scanComposites: [makeScan({})],
      coverageTargets: { cylinder: { rbaPct: 0, scopedPct: 100 } },
    });
    const rows = computeComparisonRows(state);
    const rollup = computeComparisonRollup(rows);
    const shell = rows.find((r) => r.key === 'cylinder')!;
    // Only the shell is tracked, so the rollup IS the shell's own numbers.
    expect(rollup.achievedPct).toBeCloseTo(shell.achievedPct, 10);
    expect(rollup.targetPct).toBeCloseTo(100, 10);
    expect(rollup.tracked).toBe(1);
    expect(rollup.total).toBe(3);
  });
});
