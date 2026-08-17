// =============================================================================
// coverage-comparison — targets vs achieved rows, banding and rollup
// =============================================================================
// The single row source behind the modeler comparison section, the coverage
// panel's target editor and (later) the Coverage tab / report. What matters
// here: the band edges are exact, untracked features are excluded from every
// rollup, weighting is by AREA (not row count), dome rows exist only for dished
// boots, and a pipe emits no head rows.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type CoverageTargets,
  type DomeScanConfig,
  type ScanCompositeConfig,
  type VesselState,
} from '../../types';
import {
  NEAR_BAND_POINTS,
  computeComparisonRollup,
  computeComparisonRows,
  listComparisonFeatures,
  readTargetEntry,
  statusFor,
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

function makeScan(overrides: Partial<ScanCompositeConfig>): ScanCompositeConfig {
  return {
    id: 'sc',
    name: 'Scan',
    data: [[8, 8], [8, 8]],
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
    data: [[8, 8], [8, 8]],
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
    expect(readTargetEntry(dome, { scope: 'appendage', appendageId: 'app-1', slot: 'dome' })).toEqual(entry);
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
    targets = writeTargetEntry(targets, { scope: 'appendage', appendageId: 'app-1', slot: 'dome' }, entry);
    expect(Object.keys(targets!.appendages!)).toEqual(['app-1']);

    targets = writeTargetEntry(targets, { scope: 'appendage', appendageId: 'app-1', slot: 'dome' }, undefined);
    expect(targets!.appendages!['app-1']).toEqual({ shell: entry });

    targets = writeTargetEntry(targets, { scope: 'appendage', appendageId: 'app-1', slot: 'shell' }, undefined);
    expect(targets).toBeUndefined();
  });

  it('clearing a boot slot leaves sibling boots untouched', () => {
    let targets = writeTargetEntry(
      undefined,
      { scope: 'appendage', appendageId: 'app-1', slot: 'shell' },
      entry
    );
    targets = writeTargetEntry(targets, { scope: 'appendage', appendageId: 'app-2', slot: 'shell' }, entry);
    targets = writeTargetEntry(targets, { scope: 'appendage', appendageId: 'app-1', slot: 'shell' }, undefined);
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
  it('marks every feature untracked when the model carries no targets', () => {
    const rows = computeComparisonRows(makeState({ appendages: [SUMP] }));
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.status).toBe('untracked');
      expect(r.targetPct).toBeUndefined();
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

  it('uses scopedPct as the target and ignores rbaPct entirely', () => {
    const state = makeState({ coverageTargets: { cylinder: { rbaPct: 90, scopedPct: 0 } } });
    const shell = computeComparisonRows(state).find((r) => r.key === 'cylinder')!;
    expect(shell.targetPct).toBe(0);
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
