import { describe, it, expect } from 'vitest';
import { resolveExpectedStarts } from '../offsetExpectations';
import { detectOffsets, applyOffsetCorrection } from '../fileParser';
import type { CscanData } from '../../types';

// Mirrors the Grid 1 dataset: Evident/Olympus exports where data rows are in
// local coordinates (0..span), the filename carries the true strip ranges as
// "{scanStart}-{scanEnd}MM {indexStart}-{indexEnd}MM", and the instrument
// metadata IndexStart is corrupted (doubled).
const STRIP2_FILENAME =
  'NEV HP SEP V-0201 0-800MM 1000-2000MM 4 2026_06_08 11h14m07s_2026_06_10 09h24m40s.txt';

describe('resolveExpectedStarts', () => {
  it('parses "{a}-{b}MM {c}-{d}MM" filename convention, assigning ranges by data span', () => {
    const result = resolveExpectedStarts(STRIP2_FILENAME, {}, 800, 1001);
    expect(result.scanStart).toBe(0);
    expect(result.indexStart).toBe(1000);
    expect(result.indexSource).toBe('filename');
  });

  it('handles MM suffix on both range numbers ("3000MM-4000MM")', () => {
    const filename =
      'NEV HP SEP V-0201 0-800MM 3000MM-4000MM 5 2026_06_08 14h14m20s_2026_06_10 09h32m56s.txt';
    const result = resolveExpectedStarts(filename, {}, 800, 1001);
    expect(result.scanStart).toBe(0);
    expect(result.indexStart).toBe(3000);
  });

  it('prefers span-validated filename range over implausible (doubled) metadata', () => {
    const metadata = { 'IndexStart (mm)': 2004.5, 'ScanStart (mm)': 0 };
    const result = resolveExpectedStarts(STRIP2_FILENAME, metadata, 800, 1001);
    expect(result.indexStart).toBe(1000);
    expect(result.indexSource).toBe('filename');
  });

  it('keeps metadata when it agrees with the filename within tolerance', () => {
    const metadata = { 'IndexStart (mm)': 1004.5, 'ScanStart (mm)': 0 };
    const result = resolveExpectedStarts(STRIP2_FILENAME, metadata, 800, 1001);
    expect(result.indexStart).toBe(1004.5);
    expect(result.indexSource).toBe('metadata');
  });

  it('keeps metadata when the filename range does not match the data span', () => {
    // Index token says 1000mm strip but actual data spans only 500mm —
    // filename is not trustworthy for this axis.
    const metadata = { 'IndexStart (mm)': 2004.5 };
    const result = resolveExpectedStarts(STRIP2_FILENAME, metadata, 800, 500);
    expect(result.indexStart).toBe(2004.5);
    expect(result.indexSource).toBe('metadata');
  });

  it('falls back to metadata when filename has no range tokens', () => {
    const metadata = { 'IndexStart (mm)': 250, 'ScanStart (mm)': 10 };
    const result = resolveExpectedStarts('plain scan file.csv', metadata, 800, 1001);
    expect(result.indexStart).toBe(250);
    expect(result.scanStart).toBe(10);
  });

  it('returns nulls when neither filename nor metadata provide starts', () => {
    const result = resolveExpectedStarts('plain scan file.csv', {}, 800, 1001);
    expect(result.indexStart).toBeNull();
    expect(result.scanStart).toBeNull();
  });

  it('still supports the legacy I-{a}-{b} / S-{a}-{b} convention', () => {
    const result = resolveExpectedStarts('vessel S-0-800 I-2000-3000.csv', {}, 800, 1000);
    expect(result.scanStart).toBe(0);
    expect(result.indexStart).toBe(2000);
  });

  it('prefers filename scan range over doubled metadata ScanStart (Grid 4)', () => {
    const filename =
      'NEV HP SEP V-0201 8160-8960MM 0-1000MM 5 2026_06_08 16h03m08s_2026_06_10 10h40m05s.txt';
    const metadata = { 'ScanStart (mm)': 16320, 'IndexStart (mm)': 4.5 };
    const result = resolveExpectedStarts(filename, metadata, 800, 1001);
    expect(result.scanStart).toBe(8160);
    expect(result.scanSource).toBe('filename');
  });

  it('tolerates loosely-named ranges: "8160-8990MM" for an 800mm-wide scan', () => {
    // Operators type nominal end positions; the span is 830 vs actual 800.
    // The range must still validate and override the doubled metadata.
    const filename =
      'NEV HP SEP V-0201 8160-8990MM 4000-4900MM 6 2026_06_09 10h43m36s_2026_06_10 11h02m48s.txt';
    const metadata = { 'ScanStart (mm)': 16320, 'IndexStart (mm)': 8004.5 };
    const result = resolveExpectedStarts(filename, metadata, 800, 901);
    expect(result.scanStart).toBe(8160);
    expect(result.scanSource).toBe('filename');
    expect(result.indexStart).toBe(4000);
    expect(result.indexSource).toBe('filename');
  });

  it('assigns equal-span MM tokens by order: scan range first, index range second', () => {
    const result = resolveExpectedStarts('plate 0-1000MM 2000-3000MM.txt', {}, 1000, 1000);
    expect(result.scanStart).toBe(0);
    expect(result.indexStart).toBe(2000);
  });
});

describe('resolveExpectedStarts with preferFilename (operator placement override)', () => {
  it('uses an unvalidated filename range over metadata when preferFilename is on', () => {
    // Index token says a 1000mm strip but actual data spans only 500mm, so the
    // range is NOT span-validated. Default arbitration keeps metadata; the
    // operator override trusts the filename anyway.
    const metadata = { 'IndexStart (mm)': 2004.5 };
    const result = resolveExpectedStarts(STRIP2_FILENAME, metadata, 800, 500, true);
    expect(result.indexStart).toBe(1000);
    expect(result.indexSource).toBe('filename');
  });

  it('resolves to filename even when metadata agrees within tolerance', () => {
    const metadata = { 'IndexStart (mm)': 1004.5, 'ScanStart (mm)': 0 };
    const result = resolveExpectedStarts(STRIP2_FILENAME, metadata, 800, 1001, true);
    expect(result.indexStart).toBe(1000);
    expect(result.indexSource).toBe('filename');
  });

  it('falls back to metadata for axes the filename has no range for', () => {
    // "plain scan file.csv" has no range tokens — metadata still fills both axes.
    const metadata = { 'IndexStart (mm)': 250, 'ScanStart (mm)': 10 };
    const result = resolveExpectedStarts('plain scan file.csv', metadata, 800, 1001, true);
    expect(result.indexStart).toBe(250);
    expect(result.indexSource).toBe('metadata');
    expect(result.scanStart).toBe(10);
    expect(result.scanSource).toBe('metadata');
  });

  it('leaves default arbitration unchanged when preferFilename is off', () => {
    // Same loosely-span case as above but flag off → metadata wins.
    const metadata = { 'IndexStart (mm)': 2004.5 };
    const result = resolveExpectedStarts(STRIP2_FILENAME, metadata, 800, 500, false);
    expect(result.indexStart).toBe(2004.5);
    expect(result.indexSource).toBe('metadata');
  });
});

describe('detectOffsets with corrupted instrument metadata (Grid 1 regression)', () => {
  const makeStrip2 = (): CscanData => {
    const width = 801;
    const height = 1002;
    // Descending local row labels exactly as exported: 1001.00 .. 0.00
    const yAxis = Array.from({ length: height }, (_, i) => height - 1 - i);
    const xAxis = Array.from({ length: width }, (_, i) => i);
    return {
      id: 'strip2',
      filename: STRIP2_FILENAME,
      width,
      height,
      data: Array.from({ length: height }, () => Array(width).fill(50)),
      xAxis,
      yAxis,
      metadata: { 'IndexStart (mm)': 2004.5, 'ScanStart (mm)': 0 },
    } as unknown as CscanData;
  };

  it('computes the offset from the filename, not the doubled metadata', () => {
    const detection = detectOffsets(makeStrip2());
    expect(detection.expectedIndexStart).toBe(1000);
    expect(detection.indexOffset).toBe(1000);
    expect(detection.indexNeedsCorrection).toBe(true);
    expect(detection.scanNeedsCorrection).toBe(false);
  });

  it('applyOffsetCorrection places the strip at its true filename range', () => {
    const corrected = applyOffsetCorrection(makeStrip2(), true, false);
    expect(Math.min(...corrected.yAxis)).toBe(1000);
    expect(Math.max(...corrected.yAxis)).toBe(2001);
  });
});
