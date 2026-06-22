import { describe, it, expect } from 'vitest';

import { validAreaFromGrid } from '../coverage-calculator';

// ---------------------------------------------------------------------------
// validAreaFromGrid is the robust fallback that drives the Scan Coverage
// "Achieved" column when a composite's persisted stats.validArea is missing
// (the common case for dome scans). It counts valid data points and multiplies
// by the flat grid-cell area — the same convention as the C-scan distribution
// engine and fileParser's validArea.
// ---------------------------------------------------------------------------

describe('validAreaFromGrid', () => {
  it('multiplies valid point count by flat cell area (mm²)', () => {
    const data = [
      [8, 8, 8],
      [8, 8, 8],
      [8, 8, 8],
    ];
    // 9 valid points × (10 × 10) = 900 mm²
    expect(validAreaFromGrid(data, [0, 10, 20], [0, 10, 20])).toBeCloseTo(900, 6);
  });

  it('excludes null and NaN cells', () => {
    const data = [
      [8, null, 8],
      [8, NaN, 8],
      [8, 8, 8],
    ];
    // 7 valid points × 100 = 700 mm²
    expect(validAreaFromGrid(data, [0, 10, 20], [0, 10, 20])).toBeCloseTo(700, 6);
  });

  it('handles non-square spacing', () => {
    const data = [
      [8, 8],
      [8, 8],
    ];
    // xSpacing 5, ySpacing 20 → cell 100 mm²; 4 points → 400 mm²
    expect(validAreaFromGrid(data, [0, 5], [0, 20])).toBeCloseTo(400, 6);
  });

  it('returns 0 for empty data', () => {
    expect(validAreaFromGrid([], [], [])).toBe(0);
    expect(validAreaFromGrid([[]], [0], [0])).toBe(0);
  });

  it('falls back to unit spacing when an axis has fewer than two points', () => {
    const data = [
      [8, 8],
      [8, 8],
    ];
    // xAxis has only one coord → xSpacing defaults to 1; ySpacing 10 → cell 10 mm²
    expect(validAreaFromGrid(data, [0], [0, 10])).toBeCloseTo(40, 6);
  });
});
