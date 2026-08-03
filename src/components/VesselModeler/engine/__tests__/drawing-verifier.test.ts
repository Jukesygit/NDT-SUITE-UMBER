import { describe, it, expect } from 'vitest';

import { verifyExtraction, STANDARD_BORES_MM } from '../drawing-verifier';
import type {
  ExtractedValue,
  ExtractionReview,
  NozzleMount,
  NozzleOrientation,
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
    mount: ev<NozzleMount>((over.mount as NozzleMount) ?? 'shell'),
    // Shell nozzles carry the non-applicable sentinel (never gated).
    radialOffset: { value: null, confidence: 'high', flags: [] },
    nozzleOrientation: ev<NozzleOrientation>((over.nozzleOrientation as NozzleOrientation) ?? 'radial'),
    // Radial nozzles carry the non-applicable elevation sentinel unless the test
    // supplies an explicit elevation (used for the horizontal range checks).
    elevation:
      over.elevation !== undefined
        ? ev(over.elevation as number)
        : { value: null, confidence: 'high', flags: [] },
  };
}

/** A head-mounted review nozzle with an explicit radial offset. A head nozzle
 *  may also carry a shell `pos` (models often emit both); placement ignores it. */
function headNozzle(mount: NozzleMount, radialOffset: number | null): ReviewNozzle {
  return {
    name: ev('M1'),
    pos: ev(0),
    proj: ev(200),
    angle: ev(0),
    size: ev(600),
    mount: ev<NozzleMount>(mount),
    radialOffset:
      radialOffset === null
        ? { value: null, confidence: 'missing', flags: [] }
        : ev(radialOffset),
    nozzleOrientation: ev<NozzleOrientation>('radial'),
    elevation: { value: null, confidence: 'high', flags: [] },
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
// Head-mounted nozzle radial offset
// ---------------------------------------------------------------------------

describe('verifyExtraction — head radial offset', () => {
  it('accepts an offset in [0, id/2)', () => {
    // id 2000 → id/2 = 1000
    const out = verifyExtraction(review({ nozzles: [headNozzle('head-left', 400)] }), false);
    expect(out.nozzles[0].radialOffset.flags).toEqual([]);
  });

  it('flags a negative offset', () => {
    const out = verifyExtraction(review({ nozzles: [headNozzle('head-right', -50)] }), false);
    expect(out.nozzles[0].radialOffset.flags).toContain('out-of-range');
    expect(out.nozzles[0].radialOffset.value).toBe(-50); // never clamped
  });

  it('flags an offset at/over id/2', () => {
    const out = verifyExtraction(review({ nozzles: [headNozzle('head-left', 1000)] }), false);
    expect(out.nozzles[0].radialOffset.flags).toContain('out-of-range');
  });

  it('does not flag a head nozzle that also carries an out-of-envelope shell pos', () => {
    const n = headNozzle('head-right', 200);
    n.pos = ev(99999); // a stray shell pos on a head nozzle is not an error
    const out = verifyExtraction(review({ nozzles: [n] }), false);
    expect(out.nozzles[0].pos.flags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Horizontal nozzle elevation range
// ---------------------------------------------------------------------------

describe('verifyExtraction — horizontal elevation', () => {
  // id 2000 → id/2 = 1000 (the shell radius the elevation must lie within).
  it('accepts an elevation within [-id/2, id/2]', () => {
    const out = verifyExtraction(
      review({ nozzles: [nozzle({ nozzleOrientation: 'horizontal', elevation: 800 })] }),
      false,
    );
    expect(out.nozzles[0].elevation.flags).toEqual([]);
  });

  it('accepts a negative (below-centerline) elevation within range', () => {
    const out = verifyExtraction(
      review({ nozzles: [nozzle({ nozzleOrientation: 'horizontal', elevation: -900 })] }),
      false,
    );
    expect(out.nozzles[0].elevation.flags).toEqual([]);
  });

  it('flags an |elevation| beyond id/2 and demotes without clamping', () => {
    const out = verifyExtraction(
      review({ nozzles: [nozzle({ nozzleOrientation: 'horizontal', elevation: 1500 })] }),
      false,
    );
    expect(out.nozzles[0].elevation.flags).toContain('out-of-range');
    expect(out.nozzles[0].elevation.confidence).toBe('low');
    expect(out.nozzles[0].elevation.value).toBe(1500); // never clamped
  });

  it('does not range-check elevation on a radial nozzle (sentinel is null)', () => {
    const out = verifyExtraction(review({ nozzles: [nozzle()] }), false);
    expect(out.nozzles[0].elevation.flags).toEqual([]);
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
            mount: ev<NozzleMount>('shell'),
            radialOffset: { value: null, confidence: 'high', flags: [] },
            nozzleOrientation: ev<NozzleOrientation>('radial'),
            elevation: { value: null, confidence: 'high', flags: [] },
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
            mount: ev<NozzleMount>('shell'),
            radialOffset: { value: null, confidence: 'high', flags: [] },
            nozzleOrientation: ev<NozzleOrientation>('radial'),
            elevation: { value: null, confidence: 'high', flags: [] },
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

// toExtractionResult / reviewToLenientResult conversions (incl. mount +
// radialOffset carry-through) live in drawing-verifier-conversion.test.ts.
