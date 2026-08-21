// =============================================================================
// coverage-calculator — per-appendage totals wrapper (P3-T3, design §9)
// =============================================================================
// Bottom-sump fixture: the per-body WRAPPER surfaces an appendage row with its
// coverable lateral area and achieved-from-its-own-scans area, while the main
// cylinder total is reduced by the junction footprint (the subtraction itself is
// asserted by P3-T2's coverage-cutout.test.ts; here we assert the wrapper and
// the reconciliation coexist).
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type DomeScanConfig,
  type ScanCompositeConfig,
  type VesselState,
} from '../../types';
import {
  computeAppendageCoverageTotals,
  computeRegionAchievedAreas,
  computeRegionTotalAreas,
  compositeValidArea,
} from '../coverage-calculator';

const SUMP: AppendageConfig = {
  id: 'app-1',
  name: 'Sump',
  mountPos: 4000,
  mountAngle: 270,
  diameter: 1000,
  length: 1500,
  endClosure: 'dished',
  headRatio: 2.0,
  visible: true,
  locked: false,
};

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

function makeState(overrides: Partial<VesselState>): VesselState {
  return { ...DEFAULT_VESSEL_STATE, ...overrides };
}

describe('computeAppendageCoverageTotals', () => {
  it('returns one row per appendage with its lateral coverable area', () => {
    const state = makeState({ appendages: [SUMP] });
    const rows = computeAppendageCoverageTotals(state);

    expect(rows).toHaveLength(1);
    expect(rows[0].appendageId).toBe('app-1');
    expect(rows[0].name).toBe('Sump');
    // Lateral cylinder area = 2π · r · L = 2π · 500 · 1500.
    expect(rows[0].totalMm2).toBeCloseTo(2 * Math.PI * 500 * 1500, 3);
  });

  it('sums achieved area only from scans mounted on that appendage', () => {
    const state = makeState({
      appendages: [SUMP],
      scanComposites: [
        makeScan({
          id: 'app-scan',
          bodyId: 'app-1',
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 1_000_000 },
        }),
        // A main-shell scan (no bodyId) must NOT count toward the appendage.
        makeScan({
          id: 'main-scan',
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 5_000_000 },
        }),
        // A scan on a different appendage must NOT count either.
        makeScan({
          id: 'other-scan',
          bodyId: 'app-2',
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 9_000_000 },
        }),
      ],
    });
    const rows = computeAppendageCoverageTotals(state);
    expect(rows[0].achievedMm2).toBe(1_000_000);
  });

  it('falls back to grid area when a scan has no persisted validArea', () => {
    const state = makeState({
      appendages: [SUMP],
      scanComposites: [
        makeScan({
          id: 'app-scan',
          bodyId: 'app-1',
          // No validArea → recompute from the 2×2 grid: 4 points × (10×10) = 400 mm².
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0 },
        }),
      ],
    });
    const rows = computeAppendageCoverageTotals(state);
    expect(rows[0].achievedMm2).toBe(400);
  });

  it('returns [] for a vessel with no appendages (main-only unchanged)', () => {
    expect(computeAppendageCoverageTotals(makeState({ appendages: [] }))).toEqual([]);
  });
});

describe('bottom-sump reconciliation (wrapper + main cutout coexist)', () => {
  it('reduces the main cylinder by the footprint while surfacing the appendage row', () => {
    const withSump = makeState({ appendages: [SUMP] });
    const noSump = makeState({ appendages: [] });

    const cutCylinder = computeRegionTotalAreas(withSump).cylinder;
    const uncutCylinder = computeRegionTotalAreas(noSump).cylinder;

    // Main cylinder is reduced by exactly the junction footprint area (design §9.1).
    expect(cutCylinder).toBeLessThan(uncutCylinder);

    // ...and the appendage still surfaces as its own coverable body.
    const rows = computeAppendageCoverageTotals(withSump);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalMm2).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Boot end-closure dome split (design 2026-08-17, work item 1). A dished boot's
// closure is its OWN feature instance: its dome scans (head 'end' + bodyId) were
// previously orphaned — no bucket read them — and must now land in that boot's
// dome bucket and nowhere else.
// ---------------------------------------------------------------------------

describe('computeAppendageCoverageTotals — boot dome split', () => {
  it('reports a dome total for a dished closure, using the main-head integration', () => {
    const row = computeAppendageCoverageTotals(makeState({ appendages: [SUMP] }))[0];

    // SUMP: diameter 1000 (R 500), headRatio 2 → D 250. A main vessel with the
    // same id/headRatio has exactly that head geometry, so the SAME integration
    // must return exactly the same number (not merely a close one).
    const mainHead = computeRegionTotalAreas(
      makeState({ id: 1000, headRatio: 2.0, appendages: [] })
    ).leftHead;
    expect(row.domeTotalMm2).toBe(mainHead);
  });

  it('omits the dome fields entirely for a flat closure (row shape unchanged)', () => {
    const flat: AppendageConfig = { ...SUMP, endClosure: 'flat' };
    const row = computeAppendageCoverageTotals(makeState({ appendages: [flat] }))[0];

    expect(row.domeTotalMm2).toBeUndefined();
    expect(row.domeAchievedMm2).toBeUndefined();
    expect(row.shellTotalMm2).toBeCloseTo(2 * Math.PI * 500 * 1500, 3);
  });

  it('attributes a boot dome scan to that boot dome only', () => {
    const state = makeState({
      appendages: [SUMP, { ...SUMP, id: 'app-2', name: 'Boot 2' }],
      domeScanComposites: [
        makeDomeScan({ id: 'boot-dome', head: 'end', bodyId: 'app-1' }),
        // Another boot's closure scan.
        makeDomeScan({
          id: 'other-boot-dome',
          head: 'end',
          bodyId: 'app-2',
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 7_000_000 },
        }),
        // A MAIN head scan (no bodyId) must never reach a boot.
        makeDomeScan({
          id: 'main-head',
          head: 'left',
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 5_000_000 },
        }),
      ],
    });

    const rows = computeAppendageCoverageTotals(state);
    expect(rows[0].domeAchievedMm2).toBe(1_000_000);
    expect(rows[1].domeAchievedMm2).toBe(7_000_000);

    // ...and it never leaks into the boots' SHELL achieved, nor into the main
    // regions (that split is asserted by computeRegionAchievedAreas below).
    expect(rows[0].shellAchievedMm2).toBe(0);
    expect(rows[1].shellAchievedMm2).toBe(0);
  });

  it('keeps the legacy totalMm2 / achievedMm2 fields shell-only (existing rows unchanged)', () => {
    const state = makeState({
      appendages: [SUMP],
      scanComposites: [makeScan({ id: 'app-scan', bodyId: 'app-1' })],
      domeScanComposites: [makeDomeScan({ id: 'boot-dome', head: 'end', bodyId: 'app-1' })],
    });
    const row = computeAppendageCoverageTotals(state)[0];

    expect(row.totalMm2).toBe(row.shellTotalMm2);
    expect(row.achievedMm2).toBe(row.shellAchievedMm2);
    // The dome area is additive — it never inflates the legacy shell numbers.
    expect(row.totalMm2).toBeCloseTo(2 * Math.PI * 500 * 1500, 3);
    expect(row.achievedMm2).toBe(1_000_000);
    expect(row.domeAchievedMm2).toBe(1_000_000);
  });

  it('falls back to grid area for a boot dome scan with no persisted validArea', () => {
    const state = makeState({
      appendages: [SUMP],
      domeScanComposites: [
        makeDomeScan({
          id: 'boot-dome',
          head: 'end',
          bodyId: 'app-1',
          // 2×2 grid over 10×10 mm cells → 400 mm².
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0 },
        }),
      ],
    });
    expect(computeAppendageCoverageTotals(state)[0].domeAchievedMm2).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// computeRegionAchievedAreas (design 2026-08-17, work item 2) — the engine lift
// of the former stats-section memo (section since merged, 2026-08-21). Same
// semantics, one source.
// ---------------------------------------------------------------------------

describe('computeRegionAchievedAreas', () => {
  it('splits main dome scans by head and sums main shell composites', () => {
    const state = makeState({
      scanComposites: [
        makeScan({
          id: 'a',
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 2_000_000 },
        }),
        makeScan({
          id: 'b',
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 3_000_000 },
        }),
      ],
      domeScanComposites: [
        makeDomeScan({ id: 'l', head: 'left' }),
        makeDomeScan({
          id: 'r',
          head: 'right',
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 4_000_000 },
        }),
      ],
    });

    expect(computeRegionAchievedAreas(state)).toEqual({
      leftHead: 1_000_000,
      cylinder: 5_000_000,
      rightHead: 4_000_000,
    });
  });

  it("never credits a main head from a head:'end' boot dome scan", () => {
    // 'end' is a THIRD enum member: without the bodyId guard a naive
    // `head === 'left' ? left : right` split files it as right-head.
    const state = makeState({
      appendages: [SUMP],
      domeScanComposites: [makeDomeScan({ id: 'boot-dome', head: 'end', bodyId: 'app-1' })],
    });

    expect(computeRegionAchievedAreas(state)).toEqual({
      leftHead: 0,
      cylinder: 0,
      rightHead: 0,
    });
    // The same scan IS counted — on the boot's dome.
    expect(computeAppendageCoverageTotals(state)[0].domeAchievedMm2).toBe(1_000_000);
  });

  it('keeps appendage shell scans out of the main cylinder', () => {
    const state = makeState({
      appendages: [SUMP],
      scanComposites: [
        makeScan({
          id: 'main',
          stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 6_000_000 },
        }),
        makeScan({ id: 'boot', bodyId: 'app-1' }),
      ],
    });
    expect(computeRegionAchievedAreas(state).cylinder).toBe(6_000_000);
  });

  it('falls back to grid area and tolerates a missing domeScanComposites array', () => {
    const state = makeState({
      scanComposites: [
        makeScan({ id: 'g', stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0 } }),
      ],
      domeScanComposites: undefined as unknown as DomeScanConfig[],
    });
    expect(computeRegionAchievedAreas(state)).toEqual({ leftHead: 0, cylinder: 400, rightHead: 0 });
  });
});

describe('compositeValidArea helper', () => {
  it('prefers positive persisted validArea', () => {
    expect(
      compositeValidArea({ stats: { validArea: 12_345 }, data: [[8]], xAxis: [0], yAxis: [0] })
    ).toBe(12_345);
  });

  it('recomputes from the grid when validArea is missing or zero', () => {
    expect(
      compositeValidArea({
        stats: {},
        data: [
          [8, 8],
          [8, 8],
        ],
        xAxis: [0, 10],
        yAxis: [0, 10],
      })
    ).toBe(400);
  });
});
