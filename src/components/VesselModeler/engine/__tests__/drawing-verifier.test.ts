import { describe, it, expect } from 'vitest';

import {
  verifyExtraction,
  toExtractionResult,
  reviewToLenientResult,
  STANDARD_BORES_MM,
} from '../drawing-verifier';
import type {
  ExtractedValue,
  ExtractionReview,
  ReviewNozzle,
} from '../drawing-extraction-voting';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function ev<T>(
  value: T | null,
  confidence: ExtractedValue<T>['confidence'] = 'high',
): ExtractedValue<T> {
  return { value, confidence, flags: [] };
}

function nozzle(over: Partial<Record<keyof ReviewNozzle, number | string>> = {}): ReviewNozzle {
  return {
    name: ev((over.name as string) ?? 'N1'),
    pos: ev((over.pos as number) ?? 1000),
    proj: ev((over.proj as number) ?? 200),
    angle: ev((over.angle as number) ?? 90),
    size: ev((over.size as number) ?? 150),
  };
}

function review(over: Partial<ExtractionReview> = {}): ExtractionReview {
  return {
    id: ev(2000),
    length: ev(6000),
    headRatio: ev(2),
    orientation: ev<'horizontal' | 'vertical'>('horizontal'),
    nozzles: [nozzle()],
    saddles: [{ pos: ev(1500) }],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Vessel plausibility
// ---------------------------------------------------------------------------

describe('verifyExtraction — vessel plausibility', () => {
  it('leaves in-range vessel fields unflagged', () => {
    const out = verifyExtraction(review(), false);
    expect(out.id.flags).toEqual([]);
    expect(out.length.flags).toEqual([]);
    expect(out.headRatio.flags).toEqual([]);
    expect(out.id.confidence).toBe('high');
  });

  it('flags and demotes an out-of-range diameter without changing the value', () => {
    const out = verifyExtraction(review({ id: ev(50) }), false);
    expect(out.id.flags).toContain('out-of-range');
    expect(out.id.confidence).toBe('low');
    expect(out.id.value).toBe(50); // never snapped / clamped
  });

  it('flags an out-of-range length', () => {
    const out = verifyExtraction(review({ length: ev(60000) }), false);
    expect(out.length.flags).toContain('out-of-range');
  });

  it('flags an out-of-range head ratio', () => {
    const out = verifyExtraction(review({ headRatio: ev(5) }), false);
    expect(out.headRatio.flags).toContain('out-of-range');
  });

  it('does not flag a missing field', () => {
    const out = verifyExtraction(
      review({ id: { value: null, confidence: 'missing', flags: [] } }),
      false,
    );
    expect(out.id.flags).toEqual([]);
    expect(out.id.confidence).toBe('missing');
  });
});

// ---------------------------------------------------------------------------
// Nozzle size vs standard bore
// ---------------------------------------------------------------------------

describe('verifyExtraction — nozzle size', () => {
  it('treats a standard bore as valid', () => {
    expect(STANDARD_BORES_MM).toContain(150);
    const out = verifyExtraction(review({ nozzles: [nozzle({ size: 150 })] }), false);
    expect(out.nozzles[0].size.flags).toEqual([]);
  });

  it('accepts a value within 5% of a standard bore', () => {
    const out = verifyExtraction(review({ nozzles: [nozzle({ size: 152 })] }), false);
    expect(out.nozzles[0].size.flags).toEqual([]);
  });

  it('flags a non-standard bore but never snaps it', () => {
    const out = verifyExtraction(review({ nozzles: [nozzle({ size: 175 })] }), false);
    expect(out.nozzles[0].size.flags).toContain('non-standard-size');
    expect(out.nozzles[0].size.confidence).toBe('low');
    expect(out.nozzles[0].size.value).toBe(175);
  });
});

// ---------------------------------------------------------------------------
// Nozzle position / projection ranges
// ---------------------------------------------------------------------------

describe('verifyExtraction — nozzle ranges', () => {
  it('accepts a position within [-headDepth, length + headDepth]', () => {
    // id 2000, headRatio 2 → headDepth 500; length 6000 → envelope [-500, 6500]
    const out = verifyExtraction(review({ nozzles: [nozzle({ pos: 6400 })] }), false);
    expect(out.nozzles[0].pos.flags).toEqual([]);
  });

  it('flags a position beyond the head envelope', () => {
    const out = verifyExtraction(review({ nozzles: [nozzle({ pos: 8000 })] }), false);
    expect(out.nozzles[0].pos.flags).toContain('out-of-range');
  });

  it('accepts a projection inside (0, 3 x id]', () => {
    const out = verifyExtraction(review({ nozzles: [nozzle({ proj: 300 })] }), false);
    expect(out.nozzles[0].proj.flags).toEqual([]);
  });

  it('flags a projection over 3 x id', () => {
    const out = verifyExtraction(review({ nozzles: [nozzle({ proj: 7000 })] }), false);
    expect(out.nozzles[0].proj.flags).toContain('out-of-range');
  });

  it('flags a non-positive projection', () => {
    const out = verifyExtraction(review({ nozzles: [nozzle({ proj: 0 })] }), false);
    expect(out.nozzles[0].proj.flags).toContain('out-of-range');
  });
});

// ---------------------------------------------------------------------------
// Duplicate tags
// ---------------------------------------------------------------------------

describe('verifyExtraction — duplicate tags', () => {
  it('does not flag unique tags', () => {
    const out = verifyExtraction(
      review({ nozzles: [nozzle({ name: 'N1' }), nozzle({ name: 'N2' })] }),
      false,
    );
    expect(out.nozzles[0].name.flags).toEqual([]);
    expect(out.nozzles[1].name.flags).toEqual([]);
  });

  it('flags both nozzles that share a tag (case-insensitively)', () => {
    const out = verifyExtraction(
      review({ nozzles: [nozzle({ name: 'N1' }), nozzle({ name: 'n1' })] }),
      false,
    );
    expect(out.nozzles[0].name.flags).toContain('duplicate-tag');
    expect(out.nozzles[1].name.flags).toContain('duplicate-tag');
  });
});

// ---------------------------------------------------------------------------
// Cross-view unmatched tags
// ---------------------------------------------------------------------------

describe('verifyExtraction — unmatched tags', () => {
  it('does not flag when a nozzle has both side and table fields', () => {
    const out = verifyExtraction(
      review({ nozzles: [nozzle({ pos: 1000, size: 150, proj: 200 })] }),
      true,
    );
    expect(out.nozzles[0].name.flags).toEqual([]);
  });

  it('flags a side-only nozzle (pos but no size/proj) when a table was provided', () => {
    const out = verifyExtraction(
      review({
        nozzles: [
          {
            name: ev('N1'),
            pos: ev(1000),
            proj: { value: null, confidence: 'missing', flags: [] },
            angle: ev(90),
            size: { value: null, confidence: 'missing', flags: [] },
          },
        ],
      }),
      true,
    );
    expect(out.nozzles[0].name.flags).toContain('unmatched-tag');
  });

  it('does not raise unmatched-tag when no table was provided', () => {
    const out = verifyExtraction(
      review({
        nozzles: [
          {
            name: ev('N1'),
            pos: ev(1000),
            proj: { value: null, confidence: 'missing', flags: [] },
            angle: ev(90),
            size: { value: null, confidence: 'missing', flags: [] },
          },
        ],
      }),
      false,
    );
    expect(out.nozzles[0].name.flags).not.toContain('unmatched-tag');
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('verifyExtraction — immutability', () => {
  it('does not mutate the input review', () => {
    const input = review({ id: ev(50) });
    verifyExtraction(input, false);
    expect(input.id.flags).toEqual([]);
    expect(input.id.confidence).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// toExtractionResult (strict)
// ---------------------------------------------------------------------------

describe('toExtractionResult', () => {
  it('returns a flat result when nothing is missing', () => {
    const result = toExtractionResult(review());
    expect(result.id).toBe(2000);
    expect(result.nozzles[0].name).toBe('N1');
    expect(result.saddles[0].pos).toBe(1500);
  });

  it('throws, naming the field, when any value is missing', () => {
    const input = review({ length: { value: null, confidence: 'missing', flags: [] } });
    expect(() => toExtractionResult(input)).toThrow(/length/);
  });

  it('throws when a nozzle sub-field is missing', () => {
    const n = nozzle();
    n.proj = { value: null, confidence: 'missing', flags: [] };
    const input = review({ nozzles: [n] });
    expect(() => toExtractionResult(input)).toThrow(/nozzles\[0\]\.proj/);
  });
});

// ---------------------------------------------------------------------------
// reviewToLenientResult
// ---------------------------------------------------------------------------

describe('reviewToLenientResult', () => {
  it('throws (substituting nothing) when a required vessel field is missing', () => {
    const input = review({ id: { value: null, confidence: 'missing', flags: [] } });
    expect(() => reviewToLenientResult(input)).toThrow(/required vessel fields/);
  });

  it('drops a nozzle with a missing sub-field but keeps the complete one', () => {
    const incomplete = nozzle({ name: 'N2' });
    incomplete.pos = { value: null, confidence: 'missing', flags: [] };
    const input = review({ nozzles: [nozzle({ name: 'N1' }), incomplete] });
    const result = reviewToLenientResult(input);
    expect(result.nozzles.map((n) => n.name)).toEqual(['N1']);
  });
});
