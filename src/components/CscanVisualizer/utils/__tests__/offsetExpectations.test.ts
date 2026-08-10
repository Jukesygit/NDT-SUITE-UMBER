import { describe, it, expect } from 'vitest';
import { resolveExpectedStarts } from '../offsetExpectations';
import {
  detectOffsets,
  applyOffsetCorrection,
  detectOffsetsForScans,
  applyOffsetCorrections,
} from '../fileParser';
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

describe('resolveExpectedStarts with MM-less positional filenames (BRT V-1001)', () => {
  it('parses bare "{a}-{b} {c}-{d}" tokens and overrides doubled scan metadata', () => {
    const metadata = { 'ScanStart (mm)': 1000, 'IndexStart (mm)': 1.5 };
    const result = resolveExpectedStarts('500-1000 0-1000.txt', metadata, 550, 1000);
    expect(result.scanStart).toBe(500);
    expect(result.scanSource).toBe('filename');
    // 1.5mm disagreement is within tolerance — metadata kept
    expect(result.indexStart).toBe(1.5);
    expect(result.indexSource).toBe('metadata');
  });

  it('overrides doubled index metadata for the top band', () => {
    const metadata = { 'ScanStart (mm)': 0, 'IndexStart (mm)': 2001.5 };
    const result = resolveExpectedStarts('0-1000 1000-1680.txt', metadata, 1050, 680);
    expect(result.scanStart).toBe(0);
    expect(result.indexStart).toBe(1000);
    expect(result.indexSource).toBe('filename');
  });

  it('rejects date-like bare tokens (end < start), even under preferFilename', () => {
    const metadata = { 'ScanStart (mm)': 10, 'IndexStart (mm)': 250 };
    const result = resolveExpectedStarts('export 2026-07-18.txt', metadata, 800, 1001, true);
    expect(result.scanStart).toBe(10);
    expect(result.scanSource).toBe('metadata');
    expect(result.indexStart).toBe(250);
    expect(result.indexSource).toBe('metadata');
  });

  it('preferFilename works with validated bare tokens', () => {
    const metadata = { 'ScanStart (mm)': 1000, 'IndexStart (mm)': 1.5 };
    const result = resolveExpectedStarts('500-1000 0-1000.txt', metadata, 550, 1000, true);
    expect(result.scanStart).toBe(500);
    expect(result.scanSource).toBe('filename');
    expect(result.indexStart).toBe(0);
    expect(result.indexSource).toBe('filename');
  });
});

describe('resolveExpectedStarts with the metadata "Data File" header as a source', () => {
  it('uses MM ranges from "Data File" when the filename has no tokens', () => {
    const metadata = {
      'Data File': 'BRT V-1001 2000-3225MM 1000-1680MM 2_2026_07_19 08h42m00s',
      'ScanStart (mm)': 4000,
      'IndexStart (mm)': 2001.5,
    };
    const result = resolveExpectedStarts('renamed export.txt', metadata, 1275, 680);
    expect(result.scanStart).toBe(2000);
    expect(result.scanSource).toBe('datafile');
    expect(result.indexStart).toBe(1000);
    expect(result.indexSource).toBe('datafile');
  });

  it('a validated filename range outranks the Data File header', () => {
    const metadata = { 'Data File': 'X 100-900MM run', 'ScanStart (mm)': 1600 };
    const result = resolveExpectedStarts('S-200-1000 thing.txt', metadata, 800, 100);
    expect(result.scanStart).toBe(200);
    expect(result.scanSource).toBe('filename');
  });

  it('fills from Data File when metadata starts are absent', () => {
    const metadata = { 'Data File': 'BRT V-1001 500-1000MM 0-1000MM 1_2026_07_18' };
    const result = resolveExpectedStarts('renamed.txt', metadata, 550, 1000);
    expect(result.scanStart).toBe(500);
    expect(result.scanSource).toBe('datafile');
    expect(result.indexStart).toBe(0);
    expect(result.indexSource).toBe('datafile');
  });
});

describe('resolveExpectedStarts truncation-aware anchoring', () => {
  it('tail-validates a head-truncated local strip and anchors at local zero', () => {
    // Truncated export: rows local 290..680 survive of a 0..680 strip. The
    // header's declared sample count corroborates the nominal local span, so
    // the axis carries the truncation signature; the filename index span
    // (680) fails normal span validation (data span 390) but matches the
    // data max — labels are local with the head missing.
    const metadata = {
      'ScanStart (mm)': 4000,
      'Scan Qty.(sample)': 1276,
      'Scan Resol. (mm)': 1,
      'IndexStart (mm)': 2001.5,
      'Index Qty. (sample)': 681,
      'Index Resol. (mm)': 1,
    };
    const result = resolveExpectedStarts('2000-3225 1000-1680.txt', metadata, 1275, 390, false, {
      extents: { scanMin: 4000, scanMax: 5275, indexMin: 290, indexMax: 680 },
    });
    expect(result.scanStart).toBe(2000);
    expect(result.scanSource).toBe('filename');
    expect(result.scanAnchor).toBe('dataMin');
    expect(result.indexStart).toBe(1000);
    expect(result.indexSource).toBe('filename');
    expect(result.indexAnchor).toBe('localZero');
  });

  it('does not tail-validate absolute-labelled data (min matches expected)', () => {
    // Data already at absolute 1000..1680 with a matching filename — normal
    // span validation applies, anchor stays dataMin, nothing shifts.
    const metadata = { 'IndexStart (mm)': 1000 };
    const result = resolveExpectedStarts('2000-3225 1000-1680.txt', metadata, 1275, 680, false, {
      extents: { scanMin: 2000, scanMax: 3275, indexMin: 1000, indexMax: 1680 },
    });
    expect(result.indexStart).toBe(1000);
    expect(result.indexAnchor).toBe('dataMin');
  });
});

describe('resolveExpectedStarts with batch-detected halved metadata', () => {
  it('halves doubled metadata when flagged and no range source resolves', () => {
    const metadata = { 'ScanStart (mm)': 4000, 'IndexStart (mm)': 1.5 };
    const result = resolveExpectedStarts('tile_07.txt', metadata, 1275, 1000, false, {
      halvedAxes: { scan: true, index: true },
    });
    expect(result.scanStart).toBe(2000);
    expect(result.scanSource).toBe('metadata-halved');
    // 1.5 halved is sub-tolerance noise — raw metadata kept
    expect(result.indexStart).toBe(1.5);
    expect(result.indexSource).toBe('metadata');
  });

  it('a validated filename still outranks halving', () => {
    // MM-suffixed: a single bare token would be dropped by the bare-pair rule
    const metadata = { 'ScanStart (mm)': 4000, 'IndexStart (mm)': 1.5 };
    const result = resolveExpectedStarts('2100-3325MM tile.txt', metadata, 1225, 1000, false, {
      halvedAxes: { scan: true, index: false },
    });
    expect(result.scanStart).toBe(2100);
    expect(result.scanSource).toBe('filename');
  });

  it('does not halve when the pattern is not flagged', () => {
    const metadata = { 'ScanStart (mm)': 4000 };
    const result = resolveExpectedStarts('tile_07.txt', metadata, 1275, 1000);
    expect(result.scanStart).toBe(4000);
    expect(result.scanSource).toBe('metadata');
  });
});

describe('arbitration v2 review regressions', () => {
  // Metadata mirroring the real truncated BRT export: header promises 681
  // rows (nominal local span 680) but only rows 290..680 survive.
  const TRUNC_META = {
    'ScanStart (mm)': 2000,
    'Scan Qty.(sample)': 1276,
    'Scan Resol. (mm)': 1,
    'IndexStart (mm)': 1000,
    'Index Qty. (sample)': 681,
    'Index Resol. (mm)': 1,
  };

  it('keeps localZero anchoring when metadata AGREES with a tail-validated token', () => {
    // IndexStart metadata is CORRECT (1000) and agrees with the filename
    // token — the anchor must still be localZero or the surviving rows get
    // dragged down by the truncation amount (1000-290=710 instead of +1000).
    const result = resolveExpectedStarts('2000-3225 1000-1680.txt', TRUNC_META, 1275, 390, false, {
      extents: { scanMin: 2000, scanMax: 3275, indexMin: 290, indexMax: 680 },
    });
    expect(result.indexStart).toBe(1000);
    expect(result.indexAnchor).toBe('localZero');
  });

  it('does not tail-validate absolute-positioned data against an oversized token', () => {
    // Healthy absolute strip [3000..4000] whose header row count matches the
    // data. A renamed-file token '1000-5000MM' (span ≈ data max) must NOT
    // tail-validate and relocate a correctly positioned strip.
    const metadata = { 'ScanStart (mm)': 3000, 'Scan Qty.(sample)': 1001, 'Scan Resol. (mm)': 1 };
    const result = resolveExpectedStarts('1000-5000MM plate.txt', metadata, 1000, 100, false, {
      extents: { scanMin: 3000, scanMax: 4000, indexMin: 0, indexMax: 100 },
    });
    expect(result.scanStart).toBe(3000);
    expect(result.scanSource).toBe('metadata');
  });

  it('halving never overrides a validated range that corroborates metadata', () => {
    // Even when batch halving is flagged, a span-validated filename range
    // agreeing with raw metadata proves the strip's position.
    const metadata = { 'ScanStart (mm)': 3000 };
    const result = resolveExpectedStarts('3000-4600MM patch.txt', metadata, 1600, 100, false, {
      halvedAxes: { scan: true, index: false },
    });
    expect(result.scanStart).toBe(3000);
    expect(result.scanSource).toBe('metadata');
  });

  it('a lone bare date-like token is not eligible as a range', () => {
    // '07-21' passes end>start but is a date fragment; bare tokens are only
    // trusted when the name carries a bare range PAIR (the "{a}-{b} {c}-{d}"
    // convention).
    const metadata = { 'IndexStart (mm)': 1000, 'ScanStart (mm)': 0 };
    const result = resolveExpectedStarts('V-1001 07-21 3000-4000MM.csv', metadata, 1000, 80, false);
    expect(result.indexStart).toBe(1000);
    expect(result.indexSource).toBe('metadata');
  });

  it('decimal MM ranges parse as one token, not a bogus bare fragment', () => {
    const result = resolveExpectedStarts(
      '1237.5-2037.5MM tile.csv',
      { 'ScanStart (mm)': 2475 },
      800,
      100,
      false
    );
    expect(result.scanStart).toBe(1237.5);
    expect(result.scanSource).toBe('filename');
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

describe('BRT V-1001 batch regression (MM-less names, doubled metadata in labels too)', () => {
  // Mirrors the real dataset: matrix column labels embed the DOUBLED absolute
  // scan coords (agreeing with corrupted ScanStart), row labels are local.
  const tile = (
    filename: string,
    scanStartMeta: number,
    scanSpan: number,
    indexStartMeta: number,
    yMin: number,
    yMax: number,
    extraMeta: Record<string, number> = {}
  ): CscanData =>
    ({
      id: filename,
      filename,
      width: 2,
      height: 2,
      data: [
        [10, 10],
        [10, 10],
      ],
      xAxis: [scanStartMeta, scanStartMeta + scanSpan],
      yAxis: [yMax, yMin],
      metadata: {
        'ScanStart (mm)': scanStartMeta,
        'IndexStart (mm)': indexStartMeta,
        ...extraMeta,
      },
    }) as unknown as CscanData;

  const batch = () => [
    tile('0-500 0-1000.txt', 0, 550, 1.5, 0, 1000),
    tile('500-1000 0-1000.txt', 1000, 550, 1.5, 0, 1000),
    tile('1000-2000 0-1000.txt', 2000, 1050, 1.5, 0, 1000),
    tile('2000-3225 0-1000.txt', 4000, 1275, 1.5, 0, 1000),
    tile('0-1000 1000-1680.txt', 0, 1050, 2001.5, 0, 680),
    tile('1000-2000 1000-1680.txt', 2000, 1050, 2001.5, 0, 680),
    // truncated export: local rows 290..680 survive of 0..680; the header's
    // declared sample count carries the truncation signature
    tile('2000-3225 1000-1680.txt', 4000, 1275, 2001.5, 290, 680, {
      'Index Qty. (sample)': 681,
      'Index Resol. (mm)': 1,
    }),
  ];

  it('detects scan-axis doubling on every offset tile despite label/metadata agreement', () => {
    const detections = detectOffsetsForScans(batch());
    const byName = Object.fromEntries(detections.map((d) => [d.filename, d]));
    expect(byName['500-1000 0-1000.txt'].scanOffset).toBe(-500);
    expect(byName['1000-2000 0-1000.txt'].scanOffset).toBe(-1000);
    expect(byName['2000-3225 0-1000.txt'].scanOffset).toBe(-2000);
    expect(byName['0-1000 1000-1680.txt'].indexOffset).toBe(1000);
  });

  it('applyOffsetCorrections reassembles the true vessel extent', () => {
    const corrected = applyOffsetCorrections(batch(), true, true);
    const minX = Math.min(...corrected.map((s) => Math.min(...s.xAxis)));
    const maxX = Math.max(...corrected.map((s) => Math.max(...s.xAxis)));
    const minY = Math.min(...corrected.map((s) => Math.min(...s.yAxis)));
    const maxY = Math.max(...corrected.map((s) => Math.max(...s.yAxis)));
    expect(minX).toBe(0);
    expect(maxX).toBe(3275);
    expect(minY).toBe(0);
    expect(maxY).toBe(1680);
  });

  it('places the truncated tile via local-zero anchoring, not data-min', () => {
    const corrected = applyOffsetCorrections(batch(), true, true);
    const truncated = corrected.find((s) => s.filename === '2000-3225 1000-1680.txt')!;
    expect(Math.min(...truncated.yAxis)).toBe(1290);
    expect(Math.max(...truncated.yAxis)).toBe(1680);
  });
});
