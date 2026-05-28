import { describe, it, expect } from 'vitest';
import { extractCrossSection, bilinearSample } from '../topology-cross-section';
import type { CscanData } from '../../../CscanVisualizer/types';

function makeGradientCscan(): CscanData {
  const data: (number | null)[][] = Array.from({ length: 5 }, () =>
    [5, 6, 7, 8, 9]
  );
  return {
    id: 'test', filename: 'test.csv', width: 5, height: 5, data,
    xAxis: [0, 10, 20, 30, 40],
    yAxis: [0, 10, 20, 30, 40],
    stats: { min: 5, max: 9, mean: 7, median: 7, stdDev: 1.41,
      validPoints: 25, totalPoints: 25, totalArea: 1600, validArea: 1600,
      ndPercent: 0, ndCount: 0, ndArea: 0 },
  };
}

describe('bilinearSample', () => {
  it('returns exact value at grid nodes', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [0, 1], [0, 1], 0, 0)).toBeCloseTo(10);
    expect(bilinearSample(data, [0, 1], [0, 1], 1, 1)).toBeCloseTo(40);
  });

  it('interpolates between grid nodes', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [0, 10], [0, 10], 5, 5)).toBeCloseTo(25);
  });

  it('returns null if any corner of the interpolation cell is null', () => {
    const data: (number | null)[][] = [[null, 20], [30, 40]];
    expect(bilinearSample(data, [0, 1], [0, 1], 0.5, 0.5)).toBeNull();
  });

  it('returns null when scanMm is below axis range', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [10, 20], [0, 10], 5, 5)).toBeNull();
  });

  it('returns null when scanMm is above axis range', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [10, 20], [0, 10], 25, 5)).toBeNull();
  });

  it('returns null when indexMm is below axis range', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [0, 10], [10, 20], 5, 5)).toBeNull();
  });

  it('returns null when indexMm is above axis range', () => {
    const data: (number | null)[][] = [[10, 20], [30, 40]];
    expect(bilinearSample(data, [0, 10], [10, 20], 5, 25)).toBeNull();
  });
});

describe('extractCrossSection', () => {
  it('auto-determines sample count from axis spacing', () => {
    const cscan = makeGradientCscan();
    const result = extractCrossSection(cscan, 0, 20, 40, 20);

    expect(result.points.length).toBeGreaterThanOrEqual(5);
    expect(result.totalDistance).toBeCloseTo(40);
  });

  it('includes scan/index coordinates per point for traceability', () => {
    const cscan = makeGradientCscan();
    const result = extractCrossSection(cscan, 0, 20, 40, 20);

    expect(result.points[0].scanMm).toBeCloseTo(0);
    expect(result.points[0].indexMm).toBeCloseTo(20);

    const last = result.points[result.points.length - 1];
    expect(last.scanMm).toBeCloseTo(40);
    expect(last.indexMm).toBeCloseTo(20);
  });

  it('uses bilinear interpolation, not nearest-neighbor', () => {
    const cscan = makeGradientCscan();
    const result = extractCrossSection(cscan, 15, 20, 15, 20);
    expect(result.points[0].thickness).toBeCloseTo(6.5);
  });
});
