import { describe, it, expect } from 'vitest';
import type { CscanData, DistributionConfig } from '../../types';
import { computeDistribution, autoBoundaries } from '../distributionEngine';

function makeScan(overrides?: Partial<CscanData>): CscanData {
  const data: (number | null)[][] = [
    [8, 8, 8],
    [8, 8, 8],
    [8, 8, 8],
  ];
  return {
    id: 'test',
    filename: 'test.csv',
    width: 3,
    height: 3,
    data,
    xAxis: [0, 100, 200],
    yAxis: [0, 100, 200],
    ...overrides,
  };
}

const THICKNESS_CONFIG: DistributionConfig = {
  enabled: true,
  mode: 'thickness',
  binCount: 5,
  nominalThickness: 10,
};

const WALL_LOSS_CONFIG: DistributionConfig = {
  enabled: true,
  mode: 'wallLoss',
  binCount: 5,
  nominalThickness: 10,
};

describe('computeDistribution', () => {
  it('returns null for empty data', () => {
    const scan = makeScan({ data: [] });
    expect(computeDistribution(scan, THICKNESS_CONFIG)).toBeNull();
  });

  it('returns null when all cells are null', () => {
    const scan = makeScan({
      data: [[null, null], [null, null]],
      xAxis: [0, 100],
      yAxis: [0, 100],
    });
    expect(computeDistribution(scan, THICKNESS_CONFIG)).toBeNull();
  });

  it('returns null for wallLoss mode with zero nominal', () => {
    const scan = makeScan();
    expect(computeDistribution(scan, { ...WALL_LOSS_CONFIG, nominalThickness: 0 })).toBeNull();
  });

  it('counts all valid points in thickness mode', () => {
    const scan = makeScan();
    const result = computeDistribution(scan, THICKNESS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.totalPoints).toBe(9);
    expect(result!.mode).toBe('thickness');
    expect(result!.unit).toBe('mm');
  });

  it('handles uniform data in thickness mode (single-value range)', () => {
    const scan = makeScan();
    const result = computeDistribution(scan, THICKNESS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.bins.length).toBe(1);
    expect(result!.bins[0].count).toBe(9);
    expect(result!.bins[0].areaPercent).toBeCloseTo(100, 0);
  });

  it('distributes varied thickness into correct bins', () => {
    const data: (number | null)[][] = [
      [2, 4, 6],
      [8, 10, 2],
      [4, 6, 8],
    ];
    const scan = makeScan({ data });
    const result = computeDistribution(scan, THICKNESS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.bins).toHaveLength(5);
    expect(result!.totalPoints).toBe(9);
    expect(result!.bins[0].count).toBe(2);
    expect(result!.bins[1].count).toBe(2);
    expect(result!.bins[2].count).toBe(2);
    expect(result!.bins[3].count).toBe(2);
    expect(result!.bins[4].count).toBe(1);
  });

  it('computes correct flat area (mm² to m²)', () => {
    const scan = makeScan();
    const result = computeDistribution(scan, THICKNESS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.totalArea).toBeCloseTo(0.09, 4);
  });

  it('skips null cells in area calculation', () => {
    const data: (number | null)[][] = [
      [8, null, 8],
      [null, 8, null],
      [8, null, 8],
    ];
    const scan = makeScan({ data });
    const result = computeDistribution(scan, THICKNESS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.totalPoints).toBe(5);
    expect(result!.totalArea).toBeCloseTo(0.05, 4);
  });

  it('bins wall loss correctly', () => {
    const data: (number | null)[][] = [
      [10, 8, 5],
      [3, 0, 10],
      [8, 5, 3],
    ];
    const scan = makeScan({ data });
    const result = computeDistribution(scan, WALL_LOSS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('wallLoss');
    expect(result!.unit).toBe('%');
    expect(result!.bins).toHaveLength(5);
    expect(result!.bins[0].count).toBe(2);
    expect(result!.bins[1].count).toBe(2);
    expect(result!.bins[2].count).toBe(2);
    expect(result!.bins[3].count).toBe(2);
    expect(result!.bins[4].count).toBe(1);
  });

  it('clamps negative wall loss (measured > nominal) to bin 0', () => {
    const data: (number | null)[][] = [[12, 15]];
    const scan = makeScan({ data, xAxis: [0, 100], yAxis: [0] });
    const result = computeDistribution(scan, WALL_LOSS_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.bins[0].count).toBe(2);
  });

  it('area percentages sum to ~100%', () => {
    const data: (number | null)[][] = [
      [10, 8, 5],
      [3, 0, 10],
      [8, 5, 3],
    ];
    const scan = makeScan({ data });
    const result = computeDistribution(scan, WALL_LOSS_CONFIG);
    expect(result).not.toBeNull();
    const sumPct = result!.bins.reduce((s, b) => s + b.areaPercent, 0);
    expect(sumPct).toBeCloseTo(100, 0);
  });

  it('respects bin count parameter', () => {
    const data: (number | null)[][] = [[2, 4, 6, 8, 10]];
    const scan = makeScan({ data, xAxis: [0, 100, 200, 300, 400], yAxis: [0] });
    const r3 = computeDistribution(scan, { ...THICKNESS_CONFIG, binCount: 3 });
    expect(r3).not.toBeNull();
    expect(r3!.bins).toHaveLength(3);
    const r10 = computeDistribution(scan, { ...THICKNESS_CONFIG, binCount: 10 });
    expect(r10).not.toBeNull();
    expect(r10!.bins).toHaveLength(10);
  });

  it('uses custom boundaries when provided', () => {
    const data: (number | null)[][] = [[2, 4, 6, 8, 10]];
    const scan = makeScan({ data, xAxis: [0, 100, 200, 300, 400], yAxis: [0] });
    const result = computeDistribution(scan, {
      ...THICKNESS_CONFIG,
      customBoundaries: [0, 5, 10],
    });
    expect(result).not.toBeNull();
    expect(result!.bins).toHaveLength(2);
    expect(result!.bins[0].min).toBe(0);
    expect(result!.bins[0].max).toBe(5);
    expect(result!.bins[0].count).toBe(2); // 2 and 4
    expect(result!.bins[1].min).toBe(5);
    expect(result!.bins[1].max).toBe(10);
    expect(result!.bins[1].count).toBe(3); // 6, 8, 10
  });

  it('custom boundaries clamp out-of-range values to edge bins', () => {
    const data: (number | null)[][] = [[1, 5, 15]];
    const scan = makeScan({ data, xAxis: [0, 100, 200], yAxis: [0] });
    const result = computeDistribution(scan, {
      ...THICKNESS_CONFIG,
      customBoundaries: [3, 7, 12],
    });
    expect(result).not.toBeNull();
    expect(result!.bins).toHaveLength(2);
    expect(result!.bins[0].count).toBe(2); // 1 (clamped) and 5
    expect(result!.bins[1].count).toBe(1); // 15 (clamped)
  });

  it('custom boundaries work in wallLoss mode', () => {
    const data: (number | null)[][] = [[10, 8, 5, 2]];
    const scan = makeScan({ data, xAxis: [0, 100, 200, 300], yAxis: [0] });
    // nom=10 → wl: 0%, 20%, 50%, 80%
    const result = computeDistribution(scan, {
      ...WALL_LOSS_CONFIG,
      customBoundaries: [0, 25, 60, 100],
    });
    expect(result).not.toBeNull();
    expect(result!.bins).toHaveLength(3);
    expect(result!.bins[0].count).toBe(2); // 0% and 20%
    expect(result!.bins[1].count).toBe(1); // 50%
    expect(result!.bins[2].count).toBe(1); // 80%
  });

  it('custom boundaries sort unsorted input', () => {
    const data: (number | null)[][] = [[2, 6, 10]];
    const scan = makeScan({ data, xAxis: [0, 100, 200], yAxis: [0] });
    const result = computeDistribution(scan, {
      ...THICKNESS_CONFIG,
      customBoundaries: [10, 0, 5], // unsorted
    });
    expect(result).not.toBeNull();
    expect(result!.bins[0].min).toBe(0);
    expect(result!.bins[0].max).toBe(5);
    expect(result!.bins[1].min).toBe(5);
    expect(result!.bins[1].max).toBe(10);
  });
});

describe('autoBoundaries', () => {
  it('generates correct number of boundaries', () => {
    const b = autoBoundaries(0, 100, 5);
    expect(b).toHaveLength(6);
    expect(b[0]).toBe(0);
    expect(b[5]).toBe(100);
  });

  it('produces equal-width bins', () => {
    const b = autoBoundaries(2, 10, 4);
    expect(b).toEqual([2, 4, 6, 8, 10]);
  });
});
