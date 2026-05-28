import { describe, it, expect } from 'vitest';
import { fillSmallGaps } from '../topology-gap-fill';

describe('fillSmallGaps', () => {
  it('returns same data when radius is 0', () => {
    const data: (number | null)[][] = [
      [10, null, 10],
      [10, null, 10],
      [10, null, 10],
    ];
    expect(fillSmallGaps(data, 0)).toEqual(data);
  });

  it('returns empty array for empty input', () => {
    expect(fillSmallGaps([], 1)).toEqual([]);
  });

  it('fills single-pixel gap surrounded by data', () => {
    const data: (number | null)[][] = [
      [10, 10, 10],
      [10, null, 10],
      [10, 10, 10],
    ];
    const result = fillSmallGaps(data, 1);
    expect(result[1][1]).toBeCloseTo(10);
  });

  it('interpolates value from non-uniform neighbors', () => {
    const data: (number | null)[][] = [
      [8, 8, 8],
      [8, null, 12],
      [8, 12, 12],
    ];
    // Neighbors: 8, 8, 8, 8, 12, 8, 12, 12 → avg = 76/8 = 9.5
    const result = fillSmallGaps(data, 1);
    expect(result[1][1]).toBeCloseTo(9.5);
  });

  it('does not fill null cell with fewer than 3 neighbors', () => {
    const data: (number | null)[][] = [
      [null, null, null],
      [null, null, 10],
      [null, 10, null],
    ];
    // Center [1][1]: non-null neighbors are [1][2]=10 and [2][1]=10 → only 2, not filled
    const result = fillSmallGaps(data, 1);
    expect(result[1][1]).toBeNull();
  });

  it('fills progressively with multiple iterations', () => {
    // 2-pixel wide gap needs 2 iterations to fully close
    const data: (number | null)[][] = [
      [10, 10, 10, 10, 10],
      [10, null, null, null, 10],
      [10, null, null, null, 10],
      [10, null, null, null, 10],
      [10, 10, 10, 10, 10],
    ];
    const r1 = fillSmallGaps(data, 1);
    // After 1 iteration, center [2][2] still has nulls around it
    expect(r1[2][2]).toBeNull();

    const r3 = fillSmallGaps(data, 3);
    // After 3 iterations, center should be filled
    expect(r3[2][2]).not.toBeNull();
  });

  it('preserves non-null values', () => {
    const data: (number | null)[][] = [
      [10, 10, 10],
      [10, 5, 10],
      [10, 10, 10],
    ];
    const result = fillSmallGaps(data, 1);
    expect(result[1][1]).toBe(5);
  });

  it('does not mutate original data', () => {
    const data: (number | null)[][] = [
      [10, 10, 10],
      [10, null, 10],
      [10, 10, 10],
    ];
    fillSmallGaps(data, 1);
    expect(data[1][1]).toBeNull();
  });

  it('leaves large ND region edges unfilled', () => {
    // A large null region: only the outermost ring has enough neighbors
    const data: (number | null)[][] = [
      [10, 10, 10, 10, 10, 10, 10],
      [10, null, null, null, null, null, 10],
      [10, null, null, null, null, null, 10],
      [10, null, null, null, null, null, 10],
      [10, null, null, null, null, null, 10],
      [10, null, null, null, null, null, 10],
      [10, 10, 10, 10, 10, 10, 10],
    ];
    // With radius=1, only the edge nulls with ≥3 neighbors fill
    const result = fillSmallGaps(data, 1);
    // Deep interior should still be null
    expect(result[3][3]).toBeNull();
  });

  it('stops early when no cells are filled in an iteration', () => {
    // All-null interior with no neighbors → nothing to fill at any iteration
    const data: (number | null)[][] = [
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ];
    const result = fillSmallGaps(data, 5);
    expect(result[1][1]).toBeNull();
  });
});
