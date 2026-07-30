import { describe, it, expect } from 'vitest';
import { detectHalvedMetadataPattern } from '../metadataHalving';

describe('detectHalvedMetadataPattern', () => {
  // BRT V-1001 scan axis: metadata starts are 2x true; raw tiling leaves
  // 450-950mm holes, halved tiling is one contiguous interval.
  const brtScanStrips = [
    { start: 0, span: 550 },
    { start: 0, span: 1050 },
    { start: 1000, span: 550 },
    { start: 2000, span: 1050 },
    { start: 2000, span: 1050 },
    { start: 4000, span: 1275 },
    { start: 4000, span: 1275 },
  ];

  const brtIndexStrips = [
    { start: 1.5, span: 1000 },
    { start: 1.5, span: 1000 },
    { start: 1.5, span: 1000 },
    { start: 1.5, span: 1000 },
    { start: 2001.5, span: 680 },
    { start: 2001.5, span: 680 },
    { start: 2001.5, span: 390 }, // truncated tile
  ];

  it('flags the BRT scan-axis pattern', () => {
    expect(detectHalvedMetadataPattern(brtScanStrips)).toBe(true);
  });

  it('flags the BRT index-axis pattern', () => {
    expect(detectHalvedMetadataPattern(brtIndexStrips)).toBe(true);
  });

  it('does not flag a healthy contiguous tiling', () => {
    expect(
      detectHalvedMetadataPattern([
        { start: 0, span: 550 },
        { start: 500, span: 550 },
        { start: 1000, span: 1050 },
        { start: 2000, span: 1275 },
      ])
    ).toBe(false);
  });

  it('does not flag genuinely disjoint patches (halving does not close the holes)', () => {
    expect(
      detectHalvedMetadataPattern([
        { start: 0, span: 550 },
        { start: 4000, span: 1275 },
      ])
    ).toBe(false);
  });

  it('does not flag a single strip or all-zero starts', () => {
    expect(detectHalvedMetadataPattern([{ start: 4000, span: 1275 }])).toBe(false);
    expect(
      detectHalvedMetadataPattern([
        { start: 0, span: 550 },
        { start: 0, span: 1050 },
      ])
    ).toBe(false);
  });

  it('ignores strips without metadata starts', () => {
    expect(
      detectHalvedMetadataPattern([
        { start: null, span: 550 },
        { start: 4000, span: 1275 },
      ])
    ).toBe(false);
  });
});
