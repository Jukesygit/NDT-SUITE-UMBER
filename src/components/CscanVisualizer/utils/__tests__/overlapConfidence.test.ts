import { describe, it, expect } from 'vitest';
import { checkOverlapAgreement } from '../overlapConfidence';

// Build a simple regular grid scan: value everywhere, 1mm spacing.
const grid = (
  filename: string,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  value: (x: number, y: number) => number | null
) => {
  const xAxis = Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i);
  const yAxis = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
  const data = yAxis.map((y) => xAxis.map((x) => value(x, y)));
  return { filename, data, xAxis, yAxis };
};

describe('checkOverlapAgreement', () => {
  const field = (x: number, y: number) => 10 + Math.sin(x / 7) + Math.cos(y / 11);

  it('confirms overlapping tiles that measured the same physical field', () => {
    const a = grid('a', 0, 100, 0, 100, field);
    const b = grid('b', 80, 180, 0, 100, field);
    const checks = checkOverlapAgreement([a, b], { minPoints: 50 });
    expect(checks).toHaveLength(1);
    expect(checks[0].verdict).toBe('confirmed');
    expect(checks[0].meanAbsDiff).toBeLessThan(0.01);
  });

  it('flags overlapping tiles that disagree (misplaced strip)', () => {
    const a = grid('a', 0, 100, 0, 100, field);
    const b = grid('b', 80, 180, 0, 100, (x, y) => field(x, y) + 0.5);
    const checks = checkOverlapAgreement([a, b], { minPoints: 50 });
    expect(checks[0].verdict).toBe('mismatch');
  });

  it('reports insufficient data when the overlap is all-ND', () => {
    const a = grid('a', 0, 100, 0, 100, (x, y) => (x > 80 ? null : field(x, y)));
    const b = grid('b', 80, 180, 0, 100, (x, y) => (x < 100 ? null : field(x, y)));
    const checks = checkOverlapAgreement([a, b], { minPoints: 50 });
    expect(checks[0].verdict).toBe('insufficient');
  });

  it('emits nothing for tiles whose bounding boxes do not overlap', () => {
    const a = grid('a', 0, 100, 0, 100, field);
    const b = grid('b', 200, 300, 0, 100, field);
    expect(checkOverlapAgreement([a, b], { minPoints: 50 })).toHaveLength(0);
  });

  it('handles descending y axes (file row order)', () => {
    const a = grid('a', 0, 100, 0, 100, field);
    const b = grid('b', 80, 180, 0, 100, field);
    b.yAxis.reverse();
    b.data.reverse();
    const checks = checkOverlapAgreement([a, b], { minPoints: 50 });
    expect(checks[0].verdict).toBe('confirmed');
  });
});
