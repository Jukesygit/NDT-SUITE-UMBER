import { describe, it, expect } from 'vitest';

import { compute, type WallLossRequest, type CompositeSlim, type DomeCompositeSlim } from '../wall-loss-compute';

// ---------------------------------------------------------------------------
// These tests exercise the *production* wall-loss math (the same compute()
// the Web Worker calls). They lock in the existing shell behaviour and the
// new dome-scan inclusion.
//
// Vessel used throughout: ID 3000 mm, tan-tan 8000 mm, 2:1 heads.
//   radius = 1500 mm, headDepth = 750 mm, circumference = π·3000 ≈ 9424.78 mm.
// ---------------------------------------------------------------------------

function makeShellComposite(overrides: Partial<CompositeSlim> = {}): CompositeSlim {
  return {
    id: 'sc_1',
    orientationConfirmed: true,
    // 3×3 grid → 2×2 cells, all 8 mm thick
    data: [
      [8, 8, 8],
      [8, 8, 8],
      [8, 8, 8],
    ],
    xAxis: [0, 100, 200], // scan (circumferential) mm
    yAxis: [0, 100, 200], // index (axial) mm
    indexStartMm: 1000, // well inside the cylinder
    datumAngleDeg: 0,
    scanDirection: 'cw',
    indexDirection: 'forward',
    ...overrides,
  };
}

function makeDomeComposite(overrides: Partial<DomeCompositeSlim> = {}): DomeCompositeSlim {
  return {
    id: 'ds_1',
    orientationConfirmed: true,
    // 3×3 grid, all 8 mm thick
    data: [
      [8, 8, 8],
      [8, 8, 8],
      [8, 8, 8],
    ],
    xAxis: [0, 10, 20], // 10 mm scan spacing
    yAxis: [0, 10, 20], // 10 mm index spacing
    ...overrides,
  };
}

function makeRequest(overrides: Partial<WallLossRequest> = {}): WallLossRequest {
  return {
    id: 1,
    composites: [],
    domeComposites: [],
    vesselId: 3000,
    vesselLength: 8000,
    headRatio: 2,
    nominalThickness: 10,
    binCount: 5,
    binMode: 'equal',
    shellNominalThickness: 10,
    domeNominalThickness: 10,
    ...overrides,
  };
}

describe('compute - empty input', () => {
  it('returns an empty distribution when there are no composites', () => {
    const res = compute(makeRequest());
    expect(res.totalDataPoints).toBe(0);
    expect(res.totalScannedArea).toBe(0);
    expect(res.bins.every(b => b.area === 0 && b.count === 0)).toBe(true);
  });
});

describe('compute - shell composites (regression)', () => {
  it('accumulates flat cylinder cell area into the correct bin', () => {
    const res = compute(makeRequest({ composites: [makeShellComposite()] }));

    // 2×2 cells = 4 data points
    expect(res.totalDataPoints).toBe(4);

    // Each cylinder cell: radius·dθ·dPos = 1500 · ((100·360/circ)/360·2π) · 100
    //   = 1500 · (100/circ·2π) · 100, circ = π·3000 → 1500·(100/(π·3000)·2π)·100
    //   = 1500 · (0.0066667·... ) → 10000 mm² = 0.01 m² per cell → 0.04 m² total.
    expect(res.totalScannedArea).toBeCloseTo(0.04, 4);

    // 8 mm vs 10 mm nominal = 20% wall loss → bin index 1 (20–40%).
    expect(res.bins[1].area).toBeCloseTo(0.04, 4);
    expect(res.bins[1].count).toBe(4);

    // Conservation: bins + spurious === total.
    const binSum = res.bins.reduce((s, b) => s + b.area, 0);
    expect(binSum + res.spuriousArea).toBeCloseTo(res.totalScannedArea, 6);
  });
});

describe('compute - dome scans (new)', () => {
  it('includes dome data points using flat grid-cell area', () => {
    const res = compute(makeRequest({ domeComposites: [makeDomeComposite()] }));

    // Point-based: 3×3 = 9 valid points, each 10·10 = 100 mm² = 1e-4 m².
    expect(res.totalDataPoints).toBe(9);
    expect(res.totalScannedArea).toBeCloseTo(9e-4, 8);

    // 8 mm vs 10 mm dome nominal = 20% → bin 1.
    expect(res.bins[1].area).toBeCloseTo(9e-4, 8);
    expect(res.bins[1].count).toBe(9);
  });

  it('skips null dome cells', () => {
    const dome = makeDomeComposite({
      data: [
        [8, 8, 8],
        [8, null, 8],
        [8, 8, 8],
      ],
    });
    const res = compute(makeRequest({ domeComposites: [dome] }));
    expect(res.totalDataPoints).toBe(8);
    expect(res.totalScannedArea).toBeCloseTo(8e-4, 8);
  });

  it('uses domeNominalThickness (not shell nominal) for dome wall-loss %', () => {
    // domeNwt = 16, thickness = 8 → 50% wall loss → bin 2 (40–60%).
    // If shell nominal (10) were wrongly used it would land in bin 1.
    const res = compute(
      makeRequest({
        domeComposites: [makeDomeComposite()],
        shellNominalThickness: 10,
        domeNominalThickness: 16,
      }),
    );
    expect(res.bins[2].area).toBeCloseTo(9e-4, 8);
    expect(res.bins[1].area).toBe(0);
  });

  it('combines shell and dome contributions in one distribution', () => {
    const res = compute(
      makeRequest({
        composites: [makeShellComposite()],
        domeComposites: [makeDomeComposite()],
      }),
    );
    // 4 shell cells + 9 dome points
    expect(res.totalDataPoints).toBe(13);
    expect(res.totalScannedArea).toBeCloseTo(0.04 + 9e-4, 6);
  });

  it('produces a distribution for a dome-only vessel (no shell scans)', () => {
    const res = compute(makeRequest({ composites: [], domeComposites: [makeDomeComposite()] }));
    expect(res.totalDataPoints).toBe(9);
    expect(res.bins[1].areaPercent).toBeCloseTo(100, 4);
  });

  it('ignores unconfirmed dome scans', () => {
    const dome = makeDomeComposite({ orientationConfirmed: false });
    const res = compute(makeRequest({ domeComposites: [dome] }));
    expect(res.totalDataPoints).toBe(0);
  });
});
