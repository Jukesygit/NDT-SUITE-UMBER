import { describe, it, expect } from 'vitest';
import { computeMeasurement } from '../topology-measurement';

describe('computeMeasurement', () => {
  it('computes true horizontal distance in mm', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: 10 },
      { scanMm: 30, indexMm: 40, thickness: 10 },
      12,
    );
    expect(result.horizontalDistance).toBeCloseTo(50); // 3-4-5 triangle
  });

  it('computes true thickness difference in mm', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: 10 },
      { scanMm: 0, indexMm: 0, thickness: 7 },
      12,
    );
    expect(result.depthDifference).toBeCloseTo(-3);
  });

  it('returns null depth when either point is ND', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: null },
      { scanMm: 10, indexMm: 0, thickness: 7 },
      12,
    );
    expect(result.depthDifference).toBeNull();
  });

  it('computes wall loss relative to nominal, clamped to zero', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: 10 },
      { scanMm: 0, indexMm: 0, thickness: 7 },
      12,
    );
    expect(result.wallLossA).toBeCloseTo(2);
    expect(result.wallLossB).toBeCloseTo(5);
  });

  it('clamps wall loss to zero when thickness exceeds nominal', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: 15 },
      { scanMm: 0, indexMm: 0, thickness: 7 },
      12,
    );
    expect(result.wallLossA).toBe(0);
    expect(result.wallLossB).toBeCloseTo(5);
  });

  it('returns null wall loss when point is ND', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: null },
      { scanMm: 0, indexMm: 0, thickness: 7 },
      12,
    );
    expect(result.wallLossA).toBeNull();
    expect(result.wallLossB).toBeCloseTo(5);
  });

  it('never includes visual exaggeration in any output', () => {
    const result = computeMeasurement(
      { scanMm: 0, indexMm: 0, thickness: 10 },
      { scanMm: 0, indexMm: 0, thickness: 5 },
      10,
    );
    expect(result.depthDifference).toBeCloseTo(-5);
  });
});
