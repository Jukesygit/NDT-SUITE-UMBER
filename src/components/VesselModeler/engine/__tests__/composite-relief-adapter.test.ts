import { describe, it, expect } from 'vitest';
import {
  compositeToCscanData,
  reliefSurfaceOptions,
  hasReliefGrid,
} from '../composite-relief-adapter';
import type { ScanCompositeConfig } from '../../types';

/** Build a composite fixture; only the fields under test need to be realistic. */
function makeComposite(overrides: Partial<ScanCompositeConfig> = {}): ScanCompositeConfig {
  return {
    id: 'sc-1',
    name: 'Strake 1',
    data: [
      [10, 9, 8],
      [10, null, 8],
    ],
    xAxis: [0, 12.5, 25], // scan axis, mm (non-uniform to prove no rescale)
    yAxis: [0, 40], // index axis, mm
    stats: { min: 8, max: 10, mean: 9, median: 9, stdDev: 0.8 },
    indexStartMm: 0,
    datumAngleDeg: 0,
    scanDirection: 'cw',
    indexDirection: 'forward',
    orientationConfirmed: true,
    colorScale: 'Viridis',
    rangeMin: 2,
    rangeMax: 12,
    opacity: 1,
    ...overrides,
  } as ScanCompositeConfig;
}

describe('compositeToCscanData', () => {
  it('passes the grid through with no transpose (rows=index/yAxis, cols=scan/xAxis)', () => {
    const sc = makeComposite();
    const cs = compositeToCscanData(sc);

    expect(cs.data).toBe(sc.data); // same reference, no re-orientation
    expect(cs.xAxis).toBe(sc.xAxis);
    expect(cs.yAxis).toBe(sc.yAxis);
    expect(cs.height).toBe(2); // rows = index-axis samples
    expect(cs.width).toBe(3); // cols = scan-axis samples
  });

  it('preserves mm axis coordinates verbatim (no rescaling)', () => {
    const cs = compositeToCscanData(makeComposite());
    expect(cs.xAxis).toEqual([0, 12.5, 25]);
    expect(cs.yAxis).toEqual([0, 40]);
  });

  it('counts null/ND cells straight from the grid', () => {
    const cs = compositeToCscanData(makeComposite());
    expect(cs.stats!.totalPoints).toBe(6);
    expect(cs.stats!.validPoints).toBe(5);
    expect(cs.stats!.ndCount).toBe(1);
    expect(cs.stats!.ndPercent).toBeCloseTo((1 / 6) * 100);
  });

  it('carries the composite pre-computed stats through as authoritative', () => {
    const cs = compositeToCscanData(makeComposite());
    expect(cs.stats!.min).toBe(8);
    expect(cs.stats!.max).toBe(10);
    expect(cs.stats!.mean).toBe(9);
    expect(cs.stats!.median).toBe(9);
    expect(cs.stats!.stdDev).toBe(0.8);
  });

  it('defaults missing area fields to 0 and passes them through when present', () => {
    expect(compositeToCscanData(makeComposite()).stats!.totalArea).toBe(0);
    expect(compositeToCscanData(makeComposite()).stats!.validArea).toBe(0);

    const withAreas = makeComposite({
      stats: { min: 8, max: 10, mean: 9, median: 9, stdDev: 0.8, totalArea: 5, validArea: 4 },
    });
    const cs = compositeToCscanData(withAreas);
    expect(cs.stats!.totalArea).toBe(5);
    expect(cs.stats!.validArea).toBe(4);
  });
});

describe('hasReliefGrid', () => {
  it('accepts a grid that is at least 2x2', () => {
    expect(hasReliefGrid(makeComposite())).toBe(true);
  });

  it('rejects an empty grid', () => {
    expect(hasReliefGrid(makeComposite({ data: [] }))).toBe(false);
  });

  it('rejects a single-row grid', () => {
    expect(hasReliefGrid(makeComposite({ data: [[1, 2, 3]] }))).toBe(false);
  });

  it('rejects a single-column grid', () => {
    expect(hasReliefGrid(makeComposite({ data: [[1], [2]] }))).toBe(false);
  });
});

describe('reliefSurfaceOptions', () => {
  it('carries palette (colorScale + range) over from the composite', () => {
    const opts = reliefSurfaceOptions(makeComposite());
    expect(opts.colorScale).toBe('Viridis');
    expect(opts.rangeMin).toBe(2);
    expect(opts.rangeMax).toBe(12);
  });

  it('leaves geometry-affecting options at true-scale / OFF defaults', () => {
    const opts = reliefSurfaceOptions(makeComposite());
    expect(opts.exaggeration).toBe(1);
    expect(opts.denoiseRadius).toBeNull();
    expect(opts.gapFillRadius).toBe(0);
    expect(opts.displacementClampUpper).toBeNull();
    expect(opts.nominalThickness).toBeNull();
    expect(opts.maxDisplayResolution).toBe(512);
    expect(opts.viewMode).toBe('flat');
  });

  it('falls back to the default colorScale when the composite has none', () => {
    const opts = reliefSurfaceOptions(makeComposite({ colorScale: '' }));
    expect(opts.colorScale).toBe('Jet');
  });
});
