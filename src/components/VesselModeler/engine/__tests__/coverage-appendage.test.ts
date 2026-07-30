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
  type ScanCompositeConfig,
  type VesselState,
} from '../../types';
import {
  computeAppendageCoverageTotals,
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
        makeScan({ id: 'app-scan', bodyId: 'app-1', stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 1_000_000 } }),
        // A main-shell scan (no bodyId) must NOT count toward the appendage.
        makeScan({ id: 'main-scan', stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 5_000_000 } }),
        // A scan on a different appendage must NOT count either.
        makeScan({ id: 'other-scan', bodyId: 'app-2', stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0, validArea: 9_000_000 } }),
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

describe('compositeValidArea helper', () => {
  it('prefers positive persisted validArea', () => {
    expect(
      compositeValidArea({ stats: { validArea: 12_345 }, data: [[8]], xAxis: [0], yAxis: [0] })
    ).toBe(12_345);
  });

  it('recomputes from the grid when validArea is missing or zero', () => {
    expect(
      compositeValidArea({ stats: {}, data: [[8, 8], [8, 8]], xAxis: [0, 10], yAxis: [0, 10] })
    ).toBe(400);
  });
});
