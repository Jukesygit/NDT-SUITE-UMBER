import { describe, it, expect } from 'vitest';
import { decimateGridMinPreserving } from '../topology-decimation';

describe('decimateGridMinPreserving', () => {
  it('returns original when under maxResolution', () => {
    const data: (number | null)[][] = [[10, 11], [12, 13]];
    const result = decimateGridMinPreserving(data, [0, 1], [0, 1], 512);
    expect(result.data).toEqual(data);
  });

  it('preserves minimum value in each decimation block', () => {
    // 4x4 grid, decimated to 2x2 → each 2x2 block takes min
    const data: (number | null)[][] = [
      [10, 8,  12, 11],
      [9,  7,  14, 13],
      [15, 16, 3,  20],
      [18, 17, 5,  19],
    ];
    const xAxis = [0, 1, 2, 3];
    const yAxis = [0, 1, 2, 3];
    const result = decimateGridMinPreserving(data, xAxis, yAxis, 2);

    // Block [0:2, 0:2] min = 7
    expect(result.data[0][0]).toBe(7);
    // Block [0:2, 2:4] min = 11
    expect(result.data[0][1]).toBe(11);
    // Block [2:4, 0:2] min = 15
    expect(result.data[1][0]).toBe(15);
    // Block [2:4, 2:4] min = 3
    expect(result.data[1][1]).toBe(3);
  });

  it('treats null as transparent — min of non-null values in block', () => {
    const data: (number | null)[][] = [
      [null, 8],
      [9,    null],
    ];
    const result = decimateGridMinPreserving(data, [0, 1], [0, 1], 1);
    // Only block, non-null values are 8 and 9, min = 8
    expect(result.data[0][0]).toBe(8);
  });

  it('produces null when entire block is null', () => {
    const data: (number | null)[][] = [
      [null, null],
      [null, null],
    ];
    const result = decimateGridMinPreserving(data, [0, 1], [0, 1], 1);
    expect(result.data[0][0]).toBeNull();
  });

  it('assigns block-center axis coordinates (not block-start)', () => {
    const data: (number | null)[][] = [
      [10, 8],
      [9,  7],  // min is at [1][1]
    ];
    const xAxis = [0, 100];
    const yAxis = [0, 200];
    const result = decimateGridMinPreserving(data, xAxis, yAxis, 1);
    // Block center: X = (0+100)/2 = 50, Y = (0+200)/2 = 100
    expect(result.xAxis[0]).toBeCloseTo(50);
    expect(result.yAxis[0]).toBeCloseTo(100);
  });

  it('returns isDecimated flag', () => {
    const data4x4: (number | null)[][] = Array.from({ length: 4 }, () => [1, 2, 3, 4]);
    const decimated = decimateGridMinPreserving(data4x4, [0, 1, 2, 3], [0, 1, 2, 3], 2);
    expect(decimated.isDecimated).toBe(true);

    const passthrough = decimateGridMinPreserving(data4x4, [0, 1, 2, 3], [0, 1, 2, 3], 512);
    expect(passthrough.isDecimated).toBe(false);
  });
});
