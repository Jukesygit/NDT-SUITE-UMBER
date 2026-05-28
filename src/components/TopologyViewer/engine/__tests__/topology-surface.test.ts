import { describe, it, expect } from 'vitest';
import { resolveNominal } from '../../types';
import { buildTopologySurface, clampDisplayDisplacement } from '../topology-surface';
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
  nominalThickness: null, displacementClampUpper: null, denoiseRadius: null,
  gapFillRadius: 0,
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

describe('displacement clamping', () => {
  it('clamps positive spikes in geometry Y', () => {
    // Nominal 10, one point at 50 → raw displacement = +40
    // Clamp upper at 2 → display displacement = 2 * exaggeration
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[0][0] = 50.0;
    cscan.stats = { ...cscan.stats!, min: 10, max: 50 };

    const geom = buildTopologySurface(cscan, {
      ...BASE_OPTIONS, nominalThickness: 10, exaggeration: 5, displacementClampUpper: 2,
    });
    const pos = geom.getAttribute('position');

    // Clamped vertex: Y = 2 * 5 = 10 (not 40 * 5 = 200)
    expect(pos.getY(0)).toBeCloseTo(10);
    // Normal vertex: displacement = 0, unaffected by upper clamp
    expect(pos.getY(4)).toBeCloseTo(0);
  });

  it('does not clamp negative displacement (valleys/pits)', () => {
    // Nominal 10, one pit at 5 → raw displacement = -5
    // Upper clamp at 2 only affects positive direction
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = 5.0;
    cscan.stats = { ...cscan.stats!, min: 5, max: 10 };

    const geom = buildTopologySurface(cscan, {
      ...BASE_OPTIONS, nominalThickness: 10, exaggeration: 1, displacementClampUpper: 2,
    });
    const pos = geom.getAttribute('position');

    // Pit vertex: Y = -5 (not clamped — upper-only)
    expect(pos.getY(4)).toBeCloseTo(-5);
  });

  it('does not affect color — color uses true unclamped value', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[0][0] = 50.0;
    cscan.stats = { ...cscan.stats!, min: 10, max: 50 };

    const geomClamped = buildTopologySurface(cscan, {
      ...BASE_OPTIONS, nominalThickness: 10, displacementClampUpper: 2,
    });
    const geomUnclamped = buildTopologySurface(cscan, {
      ...BASE_OPTIONS, nominalThickness: 10, displacementClampUpper: null,
    });

    const colorC = geomClamped.getAttribute('color');
    const colorU = geomUnclamped.getAttribute('color');

    // The spiked vertex (index 0) should have identical color
    expect(colorC.getX(0)).toBeCloseTo(colorU.getX(0), 5);
    expect(colorC.getY(0)).toBeCloseTo(colorU.getY(0), 5);
    expect(colorC.getZ(0)).toBeCloseTo(colorU.getZ(0), 5);
  });

  it('does not affect null-hole geometry', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = null;

    const geom = buildTopologySurface(cscan, {
      ...BASE_OPTIONS, nominalThickness: 10, displacementClampUpper: 2,
    });
    const index = geom.getIndex()!;

    // Same as unclamped: center null → all 4 quads omitted → 0 indices
    expect(index.count).toBe(0);
  });

  it('is a no-op when displacementClampUpper is null', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[0][0] = 50.0;
    cscan.stats = { ...cscan.stats!, min: 10, max: 50 };

    const geom = buildTopologySurface(cscan, {
      ...BASE_OPTIONS, nominalThickness: 10, exaggeration: 1, displacementClampUpper: null,
    });
    const pos = geom.getAttribute('position');

    // No clamp: Y = (50 - 10) * 1 = 40
    expect(pos.getY(0)).toBeCloseTo(40);
  });
});

describe('clampDisplayDisplacement', () => {
  it('matches surface builder output for consistency', () => {
    // Same scenario as the geometry test: nominal=10, value=50, clamp=2, exag=5
    const y = clampDisplayDisplacement(50, 10, 5, 2);
    expect(y).toBeCloseTo(10); // (clamped to 2) * 5
  });

  it('returns 0 for null values', () => {
    expect(clampDisplayDisplacement(null, 10, 5, 2)).toBe(0);
  });

  it('does not clamp negative displacement', () => {
    const y = clampDisplayDisplacement(5, 10, 1, 2);
    expect(y).toBeCloseTo(-5); // -5 is negative, not clamped
  });

  it('passes through when clamp is null', () => {
    const y = clampDisplayDisplacement(50, 10, 1, null);
    expect(y).toBeCloseTo(40); // no clamp
  });
});

describe('denoise integration', () => {
  it('removes isolated spike from geometry when denoiseRadius is set', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = 99.0;
    cscan.stats = { ...cscan.stats!, min: 10, max: 99 };

    const geom = buildTopologySurface(cscan, {
      ...BASE_OPTIONS, nominalThickness: 10, denoiseRadius: 1,
    });
    const pos = geom.getAttribute('position');

    // After 3×3 median, center becomes 10 → displacement = 0
    expect(pos.getY(4)).toBeCloseTo(0);
  });

  it('is a no-op when denoiseRadius is null', () => {
    const cscan = makeCscan(3, 3, 10.0);
    cscan.data[1][1] = 99.0;
    cscan.stats = { ...cscan.stats!, min: 10, max: 99 };

    const geom = buildTopologySurface(cscan, {
      ...BASE_OPTIONS, nominalThickness: 10, denoiseRadius: null,
    });
    const pos = geom.getAttribute('position');

    // No filter: displacement = (99 - 10) * 1 = 89
    expect(pos.getY(4)).toBeCloseTo(89);
  });
});
