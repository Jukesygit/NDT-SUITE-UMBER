import { describe, it, expect } from 'vitest';
import { medianFilter } from '../topology-median-filter';

describe('medianFilter', () => {
  it('returns empty array for empty input', () => {
    expect(medianFilter([], 1)).toEqual([]);
  });

  it('preserves uniform data', () => {
    const data = [
      [10, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
    ];
    expect(medianFilter(data, 1)).toEqual(data);
  });

  it('removes isolated positive spike', () => {
    const data = [
      [10, 10, 10],
      [10, 99, 10],
      [10, 10, 10],
    ];
    const result = medianFilter(data, 1);
    expect(result[1][1]).toBe(10);
  });

  it('removes isolated negative spike', () => {
    const data = [
      [10, 10, 10],
      [10, 1, 10],
      [10, 10, 10],
    ];
    const result = medianFilter(data, 1);
    expect(result[1][1]).toBe(10);
  });

  it('preserves edge between two regions', () => {
    const data = [
      [10, 10, 10, 5, 5],
      [10, 10, 10, 5, 5],
      [10, 10, 10, 5, 5],
      [10, 10, 10, 5, 5],
      [10, 10, 10, 5, 5],
    ];
    const result = medianFilter(data, 1);
    expect(result[2][1]).toBe(10);
    expect(result[2][3]).toBe(5);
  });

  it('preserves null cells', () => {
    const data: (number | null)[][] = [
      [10, 10, 10],
      [10, null, 10],
      [10, 10, 10],
    ];
    const result = medianFilter(data, 1);
    expect(result[1][1]).toBeNull();
  });

  it('ignores null neighbors in median calculation', () => {
    const data: (number | null)[][] = [
      [null, null, null],
      [null, 10, 20],
      [null, 30, 40],
    ];
    // Non-null neighbors of [1][1]: self=10, [1][2]=20, [2][1]=30, [2][2]=40
    // Sorted: [10, 20, 30, 40], even count → avg of middle two = (20+30)/2 = 25
    const result = medianFilter(data, 1);
    expect(result[1][1]).toBe(25);
  });

  it('handles corner cells with reduced neighborhood', () => {
    const data = [
      [99, 10],
      [10, 10],
    ];
    // Corner [0][0]: neighbors = [99, 10, 10, 10], sorted = [10, 10, 10, 99]
    // Even count → avg of middle two = (10+10)/2 = 10
    const result = medianFilter(data, 1);
    expect(result[0][0]).toBe(10);
  });

  it('works with radius 2 (5×5 kernel)', () => {
    const data = [
      [10, 10, 10, 10, 10],
      [10, 10, 10, 10, 10],
      [10, 10, 99, 10, 10],
      [10, 10, 10, 10, 10],
      [10, 10, 10, 10, 10],
    ];
    const result = medianFilter(data, 2);
    expect(result[2][2]).toBe(10);
  });

  it('does not mutate original data', () => {
    const data = [
      [10, 10, 10],
      [10, 99, 10],
      [10, 10, 10],
    ];
    medianFilter(data, 1);
    expect(data[1][1]).toBe(99);
  });

  it('preserves broad real feature (pit wider than kernel)', () => {
    const data = [
      [10, 10, 10, 10, 10],
      [10, 5, 5, 5, 10],
      [10, 5, 5, 5, 10],
      [10, 5, 5, 5, 10],
      [10, 10, 10, 10, 10],
    ];
    const result = medianFilter(data, 1);
    // Center of pit: all 9 neighbors are 5 → stays 5
    expect(result[2][2]).toBe(5);
  });
});
