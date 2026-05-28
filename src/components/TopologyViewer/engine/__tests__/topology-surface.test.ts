import { describe, it, expect } from 'vitest';
import { resolveNominal } from '../../types';
import { buildTopologySurface } from '../topology-surface';
import type { CscanData } from '../../../CscanVisualizer/types';
import type { SurfaceOptions } from '../../types';

describe('resolveNominal', () => {
  it('returns explicit nominal when provided', () => {
    const data: (number | null)[][] = [[10, 10], [10, 10]];
    expect(resolveNominal(14, data)).toBe(14);
  });

  it('returns 95th percentile when nominal is null', () => {
    // 9 values: [50, 10, 10, 10, 10, 10, 10, 10, 10]
    // Sorted: [10, 10, 10, 10, 10, 10, 10, 10, 50]
    // 95th percentile index = floor((9-1) * 0.95) = floor(7.6) = 7 → value 10
    const data: (number | null)[][] = [
      [50, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
    ];
    expect(resolveNominal(null, data)).toBe(10);
  });

  it('ignores null values in percentile calculation', () => {
    const data: (number | null)[][] = [
      [null, 10, 10],
      [10, null, 10],
    ];
    // 4 values: [10, 10, 10, 10], 95th = 10
    expect(resolveNominal(null, data)).toBe(10);
  });

  it('returns 0 for all-null data', () => {
    const data: (number | null)[][] = [[null, null]];
    expect(resolveNominal(null, data)).toBe(0);
  });
});

function makeCscan(rows: number, cols: number, fillValue: number): CscanData {
  const data: (number | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    data.push(Array.from({ length: cols }, () => fillValue));
  }
  return {
    id: 'test', filename: 'test.csv', width: cols, height: rows, data,
    xAxis: Array.from({ length: cols }, (_, i) => i * 10.0),
    yAxis: Array.from({ length: rows }, (_, i) => i * 10.0),
    stats: {
      min: fillValue, max: fillValue, mean: fillValue, median: fillValue,
      stdDev: 0, validPoints: rows * cols, totalPoints: rows * cols,
      totalArea: 0, validArea: 0, ndPercent: 0, ndCount: 0, ndArea: 0,
    },
  };
}

const BASE_OPTIONS: SurfaceOptions = {
  exaggeration: 1, colorScale: 'Jet', reverseScale: true,
  rangeMin: null, rangeMax: null, maxDisplayResolution: 512,
  nominalThickness: null,
};

describe('buildTopologySurface', () => {
  it('uses Y-up convention: X=scan, Z=index, Y=displacement', () => {
    const cscan = makeCscan(3, 3, 10.0);
    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const pos = geom.getAttribute('position');

    expect(pos.getX(0)).toBeCloseTo(0);
    expect(pos.getZ(0)).toBeCloseTo(0);
    expect(pos.getY(0)).toBeCloseTo(0);
  });

  it('displaces from nominal baseline, not stats.max', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = 8.0;
    cscan.stats = { ...cscan.stats!, min: 8, max: 10 };

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 12 });
    const pos = geom.getAttribute('position');

    expect(pos.getY(0)).toBeCloseTo(-2);
    expect(pos.getY(4)).toBeCloseTo(-4);
  });

  it('uses 95th percentile as nominal when nominalThickness is null', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[0][0] = 50.0;
    cscan.stats = { ...cscan.stats!, min: 10, max: 50 };

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: null });
    const pos = geom.getAttribute('position');

    expect(pos.getY(4)).toBeCloseTo(0);
  });

  it('applies exaggeration to Y displacement only', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = 8.0;
    cscan.stats = { ...cscan.stats!, min: 8, max: 10 };

    const geom = buildTopologySurface(cscan, {
      ...BASE_OPTIONS, nominalThickness: 10, exaggeration: 10,
    });
    const pos = geom.getAttribute('position');

    expect(pos.getY(4)).toBeCloseTo(-20);
    expect(pos.getX(4)).toBeCloseTo(10);
    expect(pos.getZ(4)).toBeCloseTo(10);
  });

  it('omits triangles touching null vertices', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = null;

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const index = geom.getIndex()!;

    expect(index.count).toBe(0);
  });

  it('preserves triangles in quads where all 4 vertices have data', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[0][0] = null;

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const index = geom.getIndex()!;

    expect(index.count).toBe(18);
  });

  it('has correct vertex count regardless of nulls', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = null;

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const pos = geom.getAttribute('position');

    expect(pos.count).toBe(9);
  });

  it('computes normals', () => {
    const cscan = makeCscan(4, 4, 10.0);
    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const normals = geom.getAttribute('normal');
    expect(normals).not.toBeNull();
    expect(normals.count).toBe(16);
  });

  it('colors ND vertices distinctly', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[0][0] = null;

    const geom = buildTopologySurface(cscan, { ...BASE_OPTIONS, nominalThickness: 10 });
    const colors = geom.getAttribute('color');

    expect(colors.getX(0)).toBeCloseTo(0.15, 1);
    expect(colors.getY(0)).toBeCloseTo(0.15, 1);
    expect(colors.getZ(0)).toBeCloseTo(0.15, 1);
  });
});
