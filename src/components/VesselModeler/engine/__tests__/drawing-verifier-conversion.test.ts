import { describe, it, expect } from 'vitest';

import { toExtractionResult, reviewToLenientResult } from '../drawing-verifier';
import type {
  ExtractedValue,
  ExtractionReview,
  NozzleMount,
  NozzleOrientation,
  ReviewNozzle,
} from '../drawing-extraction-voting';

// ---------------------------------------------------------------------------
// Test helpers (mirrors drawing-verifier.test.ts)
// ---------------------------------------------------------------------------

function ev<T>(
  value: T | null,
  confidence: ExtractedValue<T>['confidence'] = 'high'
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
    radialOffset: { value: null, confidence: 'high', flags: [] },
    nozzleOrientation: ev<NozzleOrientation>(
      (over.nozzleOrientation as NozzleOrientation) ?? 'radial'
    ),
    elevation:
      over.elevation !== undefined
        ? ev(over.elevation as number)
        : { value: null, confidence: 'high', flags: [] },
  };
}

/** A head-mounted review nozzle; may also carry a shell pos (placement ignores it). */
function headNozzle(mount: NozzleMount, radialOffset: number | null): ReviewNozzle {
  return {
    name: ev('M1'),
    pos: ev(0),
    proj: ev(200),
    angle: ev(0),
    size: ev(600),
    mount: ev<NozzleMount>(mount),
    radialOffset:
      radialOffset === null ? { value: null, confidence: 'missing', flags: [] } : ev(radialOffset),
    nozzleOrientation: ev<NozzleOrientation>('radial'),
    elevation: { value: null, confidence: 'high', flags: [] },
  };
}

/** A horizontal (side-facing) shell review nozzle carrying an explicit elevation. */
function horizNozzle(elevation: number | null): ReviewNozzle {
  return {
    name: ev('H1'),
    pos: ev(1000),
    proj: ev(200),
    angle: ev(90),
    size: ev(150),
    mount: ev<NozzleMount>('shell'),
    radialOffset: { value: null, confidence: 'high', flags: [] },
    nozzleOrientation: ev<NozzleOrientation>('horizontal'),
    elevation:
      elevation === null ? { value: null, confidence: 'missing', flags: [] } : ev(elevation),
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

  it('carries mount through and leaves radialOffset undefined for a shell nozzle', () => {
    const result = toExtractionResult(review());
    expect(result.nozzles[0].mount).toBe('shell');
    expect(result.nozzles[0].radialOffset).toBeUndefined();
  });

  it('carries mount + radialOffset through for a head nozzle', () => {
    const result = toExtractionResult(review({ nozzles: [headNozzle('head-left', 300)] }));
    expect(result.nozzles[0].mount).toBe('head-left');
    expect(result.nozzles[0].radialOffset).toBe(300);
  });

  it('throws when a head nozzle is missing its radialOffset', () => {
    const input = review({ nozzles: [headNozzle('head-right', null)] });
    expect(() => toExtractionResult(input)).toThrow(/nozzles\[0\]\.radialOffset/);
  });

  it('does not require radialOffset for a shell nozzle (sentinel never blocks)', () => {
    expect(() => toExtractionResult(review())).not.toThrow();
  });

  it('carries nozzleOrientation through and leaves elevation undefined for a radial nozzle', () => {
    const result = toExtractionResult(review());
    expect(result.nozzles[0].nozzleOrientation).toBe('radial');
    expect(result.nozzles[0].elevation).toBeUndefined();
  });

  it('carries nozzleOrientation + elevation through for a horizontal nozzle', () => {
    const result = toExtractionResult(review({ nozzles: [horizNozzle(-300)] }));
    expect(result.nozzles[0].nozzleOrientation).toBe('horizontal');
    expect(result.nozzles[0].elevation).toBe(-300);
  });

  it('throws when nozzleOrientation is missing (no assumed-radial default)', () => {
    const n = nozzle();
    n.nozzleOrientation = { value: null, confidence: 'missing', flags: [] };
    const input = review({ nozzles: [n] });
    expect(() => toExtractionResult(input)).toThrow(/nozzles\[0\]\.nozzleOrientation/);
  });

  it('throws when a horizontal nozzle is missing its elevation', () => {
    const input = review({ nozzles: [horizNozzle(null)] });
    expect(() => toExtractionResult(input)).toThrow(/nozzles\[0\]\.elevation/);
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

  it('keeps a complete head nozzle with its mount + radialOffset', () => {
    const result = reviewToLenientResult(review({ nozzles: [headNozzle('head-right', 250)] }));
    expect(result.nozzles).toHaveLength(1);
    expect(result.nozzles[0].mount).toBe('head-right');
    expect(result.nozzles[0].radialOffset).toBe(250);
  });

  it('drops a head nozzle whose radialOffset was not read', () => {
    const result = reviewToLenientResult(review({ nozzles: [headNozzle('head-left', null)] }));
    expect(result.nozzles).toHaveLength(0);
  });

  it('keeps a complete horizontal nozzle with its orientation + elevation', () => {
    const result = reviewToLenientResult(review({ nozzles: [horizNozzle(400)] }));
    expect(result.nozzles).toHaveLength(1);
    expect(result.nozzles[0].nozzleOrientation).toBe('horizontal');
    expect(result.nozzles[0].elevation).toBe(400);
  });

  it('drops a horizontal nozzle whose elevation was not read', () => {
    const result = reviewToLenientResult(review({ nozzles: [horizNozzle(null)] }));
    expect(result.nozzles).toHaveLength(0);
  });

  it('drops a nozzle whose nozzleOrientation was not read', () => {
    const n = nozzle();
    n.nozzleOrientation = { value: null, confidence: 'missing', flags: [] };
    const result = reviewToLenientResult(review({ nozzles: [n] }));
    expect(result.nozzles).toHaveLength(0);
  });
});
