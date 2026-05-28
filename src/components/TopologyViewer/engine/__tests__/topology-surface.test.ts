import { describe, it, expect } from 'vitest';
import { resolveNominal } from '../../types';

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
