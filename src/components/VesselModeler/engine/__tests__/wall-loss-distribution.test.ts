import { describe, it, expect } from 'vitest';
import type { ScanCompositeConfig, VesselState, WallLossGroupConfig } from '../../types';
import { computeWallLossDistribution } from '../wall-loss-distribution';

function makeVesselState(overrides?: Partial<VesselState>): VesselState {
  return {
    id: 2000,
    length: 8000,
    headRatio: 2,
    orientation: 'horizontal' as const,
    vesselName: 'Test',
    location: '',
    inspectionDate: '',
    nozzles: [],
    liftingLugs: [],
    saddles: [],
    textures: [],
    annotations: [],
    rulers: [],
    coverageRects: [],
    inspectionImages: [],
    scanComposites: [],
    welds: [],
    pipelines: [],
    referenceDrawings: [],
    measurementConfig: { referenceTangent: 'left', circumDirection: 'CW', viewFromEnd: 'left' },
    coordinateOrigin: { indexMm: 0, scanMm: 0 },
    hasModel: true,
    visuals: {} as any,
    ...overrides,
  } as VesselState;
}

function makeSimpleComposite(overrides?: Partial<ScanCompositeConfig>): ScanCompositeConfig {
  const data: (number | null)[][] = Array.from({ length: 5 }, () => Array(5).fill(8));
  return {
    id: 'sc_test',
    name: 'Test Scan',
    data,
    xAxis: [0, 100, 200, 300, 400],
    yAxis: [0, 100, 200, 300, 400],
    stats: { min: 8, max: 8, mean: 8, median: 8, stdDev: 0 },
    indexStartMm: 2000,
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

const DEFAULT_CONFIG: WallLossGroupConfig = {
  enabled: true,
  nominalThickness: 10,
  binCount: 5,
};

describe('computeWallLossDistribution', () => {
  it('returns empty distribution when no composites exist', () => {
    const vs = makeVesselState();
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);
    expect(result.bins).toHaveLength(5);
    expect(result.totalDataPoints).toBe(0);
    expect(result.totalScannedArea).toBe(0);
    result.bins.forEach(bin => {
      expect(bin.area).toBe(0);
      expect(bin.count).toBe(0);
    });
  });

  it('returns correct bin count matching config', () => {
    const vs = makeVesselState();
    const r3 = computeWallLossDistribution(vs, { ...DEFAULT_CONFIG, binCount: 3 });
    expect(r3.bins).toHaveLength(3);
    expect(r3.bins[0].minPct).toBe(0);
    expect(r3.bins[0].maxPct).toBeCloseTo(100 / 3, 5);
    expect(r3.bins[2].maxPct).toBe(100);
  });

  it('skips composites that are not orientation-confirmed', () => {
    const composite = makeSimpleComposite({ orientationConfirmed: false });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);
    expect(result.totalDataPoints).toBe(0);
  });

  it('produces (rows-1)×(cols-1) cells — not rows×cols', () => {
    const composite = makeSimpleComposite();
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);
    expect(result.totalDataPoints).toBe(16);
  });

  it('places uniform-thickness readings into correct bin', () => {
    const composite = makeSimpleComposite();
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    expect(result.nominalThickness).toBe(10);

    const bin1 = result.bins[1];
    expect(bin1.minPct).toBe(20);
    expect(bin1.maxPct).toBe(40);
    expect(bin1.count).toBe(result.totalDataPoints);
    expect(bin1.areaPercent).toBeCloseTo(100, 0);
  });

  it('handles null cells (no reading) by skipping them', () => {
    const data: (number | null)[][] = [
      [8, null, 8, null, 8],
      [null, null, null, null, null],
      [8, null, 8, null, 8],
      [null, null, null, null, null],
      [8, null, 8, null, 8],
    ];
    const composite = makeSimpleComposite({ data });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);
    expect(result.totalDataPoints).toBe(4);
  });

  it('distributes varied thickness across correct bins', () => {
    const data: (number | null)[][] = [
      [10, 10, 10, 10, 10],
      [8,  8,  8,  8,  8],
      [5,  5,  5,  5,  5],
      [3,  3,  3,  3,  3],
      [0,  0,  0,  0,  0],
    ];
    const composite = makeSimpleComposite({ data });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    expect(result.totalDataPoints).toBe(16);
    expect(result.bins[0].count).toBe(4);
    expect(result.bins[1].count).toBe(4);
    expect(result.bins[2].count).toBe(4);
    expect(result.bins[3].count).toBe(4);
    expect(result.bins[4].count).toBe(0);
  });

  it('clamps negative wall loss to 0% (measured > nominal)', () => {
    const data: (number | null)[][] = [
      [12, 12, 12],
      [12, 12, 12],
    ];
    const composite = makeSimpleComposite({
      data,
      yAxis: [0, 100],
      xAxis: [0, 100, 200],
    });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    expect(result.totalDataPoints).toBe(2);
    expect(result.bins[0].count).toBe(result.totalDataPoints);
  });

  it('computes non-zero surface area on cylinder region', () => {
    const composite = makeSimpleComposite();
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    expect(result.totalScannedArea).toBeGreaterThan(0);
    expect(result.totalScannedArea).toBeGreaterThan(0.01);
    expect(result.totalScannedArea).toBeLessThan(1.0);
  });

  it('area percentages sum to ~100%', () => {
    const data: (number | null)[][] = [
      [10, 8, 5],
      [10, 8, 5],
      [10, 8, 5],
    ];
    const composite = makeSimpleComposite({
      data,
      yAxis: [0, 100, 200],
      xAxis: [0, 100, 200],
    });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    const sumPct = result.bins.reduce((s, b) => s + b.areaPercent, 0);
    expect(sumPct).toBeCloseTo(100, 0);
  });

  it('handles non-zero yAxis[0] correctly (offset origin)', () => {
    const data: (number | null)[][] = [
      [8, 8, 8],
      [8, 8, 8],
      [8, 8, 8],
    ];
    const composite = makeSimpleComposite({
      data,
      yAxis: [500, 600, 700],
      xAxis: [0, 100, 200],
      indexStartMm: 2000,
    });
    const vs = makeVesselState({ scanComposites: [composite] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    expect(result.totalDataPoints).toBe(4);
    expect(result.totalScannedArea).toBeGreaterThan(0);
  });

  it('handles topmost-wins overlap when composites overlap', () => {
    const bottom = makeSimpleComposite({ id: 'sc_bottom' });
    const topData: (number | null)[][] = Array.from({ length: 5 }, () => Array(5).fill(5));
    const top = makeSimpleComposite({ id: 'sc_top', data: topData });

    const vs = makeVesselState({ scanComposites: [bottom, top] });
    const result = computeWallLossDistribution(vs, DEFAULT_CONFIG);

    expect(result.totalDataPoints).toBe(16);
    expect(result.bins[2].count).toBe(16);
  });
});
