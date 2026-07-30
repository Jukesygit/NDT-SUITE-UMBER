import { describe, it, expect } from 'vitest';

import {
  coerceRawExtraction,
  voteExtractions,
  type RawExtraction,
} from '../drawing-extraction-voting';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function sample(overrides: Partial<RawExtraction> = {}): RawExtraction {
  return {
    id: null,
    length: null,
    headRatio: null,
    orientation: null,
    nozzles: [],
    saddles: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Numeric median + tolerance voting
// ---------------------------------------------------------------------------

describe('voteExtractions — numeric median + tolerance', () => {
  it('takes the median and reports high when all three agree within tolerance', () => {
    const review = voteExtractions([
      sample({ id: 3000, length: 6000 }),
      sample({ id: 3005, length: 6000 }),
      sample({ id: 2998, length: 6000 }),
    ]);
    expect(review.id.value).toBe(3000);
    expect(review.id.confidence).toBe('high');
    expect(review.length.confidence).toBe('high');
  });

  it('uses the 1mm floor so tiny values only agree when within 1mm', () => {
    const review = voteExtractions([
      sample({ headRatio: 2.0 }),
      sample({ headRatio: 2.0 }),
      sample({ headRatio: 2.4 }),
    ]);
    // median 2.0, tol = max(1, 0.02) = 1 → 2.4 within 1 → all agree
    expect(review.headRatio.value).toBe(2);
    expect(review.headRatio.confidence).toBe('high');
  });

  it('reports low when the three numeric readings disagree beyond tolerance', () => {
    const review = voteExtractions([
      sample({ id: 3000 }),
      sample({ id: 4000 }),
      sample({ id: 5000 }),
    ]);
    expect(review.id.value).toBe(4000); // median
    expect(review.id.confidence).toBe('low');
  });

  it('reports medium when two of three agree and the third is null', () => {
    const review = voteExtractions([
      sample({ id: 3000 }),
      sample({ id: 3000 }),
      sample({ id: null }),
    ]);
    expect(review.id.value).toBe(3000);
    expect(review.id.confidence).toBe('medium');
  });

  it('reports missing when a strict majority read null', () => {
    const review = voteExtractions([
      sample({ id: 3000 }),
      sample({ id: null }),
      sample({ id: null }),
    ]);
    expect(review.id.value).toBeNull();
    expect(review.id.confidence).toBe('missing');
  });
});

// ---------------------------------------------------------------------------
// String / enum majority voting
// ---------------------------------------------------------------------------

describe('voteExtractions — string / enum majority', () => {
  it('picks the majority orientation and reports medium at 2/3', () => {
    const review = voteExtractions([
      sample({ orientation: 'horizontal' }),
      sample({ orientation: 'horizontal' }),
      sample({ orientation: 'vertical' }),
    ]);
    expect(review.orientation.value).toBe('horizontal');
    expect(review.orientation.confidence).toBe('medium');
  });

  it('reports high when all three enum votes agree', () => {
    const review = voteExtractions([
      sample({ orientation: 'vertical' }),
      sample({ orientation: 'vertical' }),
      sample({ orientation: 'vertical' }),
    ]);
    expect(review.orientation.value).toBe('vertical');
    expect(review.orientation.confidence).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Nozzle cross-sample matching
// ---------------------------------------------------------------------------

describe('voteExtractions — nozzle matching', () => {
  const noz = (name: string, pos: number, size: number): RawExtraction['nozzles'][number] => ({
    name,
    pos,
    proj: 200,
    angle: 90,
    size,
  });

  it('keeps a nozzle present in 2 of 3 samples and drops one present in only 1', () => {
    const review = voteExtractions([
      sample({ nozzles: [noz('N1', 1000, 150), noz('N2', 2000, 100)] }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
    ]);
    const names = review.nozzles.map((n) => n.name.value);
    expect(names).toEqual(['N1']);
    expect(review.nozzles[0].pos.value).toBe(1000);
    expect(review.nozzles[0].pos.confidence).toBe('high');
  });

  it('matches tags case- and whitespace-insensitively', () => {
    const review = voteExtractions([
      sample({ nozzles: [noz('N1', 1000, 150)] }),
      sample({ nozzles: [noz(' n1 ', 1000, 150)] }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
    ]);
    expect(review.nozzles).toHaveLength(1);
    expect(review.nozzles[0].name.confidence).toBe('high');
  });

  it('demotes a 2/3-present nozzle field to medium', () => {
    const review = voteExtractions([
      sample({ nozzles: [noz('N1', 1000, 150)] }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
      sample({ nozzles: [] }),
    ]);
    expect(review.nozzles[0].pos.confidence).toBe('medium');
  });

  it('propagates missing to a nozzle sub-field the majority could not read', () => {
    const review = voteExtractions([
      sample({ nozzles: [{ name: 'N1', pos: null, proj: 200, angle: 90, size: 150 }] }),
      sample({ nozzles: [{ name: 'N1', pos: null, proj: 200, angle: 90, size: 150 }] }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
    ]);
    expect(review.nozzles[0].name.confidence).toBe('high');
    expect(review.nozzles[0].pos.confidence).toBe('missing');
    expect(review.nozzles[0].pos.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// coerceRawExtraction
// ---------------------------------------------------------------------------

describe('coerceRawExtraction', () => {
  it('coerces wrong-typed and absent leaves to null, never to a default', () => {
    const raw = coerceRawExtraction({
      id: 2000,
      length: 'not a number',
      headRatio: null,
      orientation: 'sideways',
      nozzles: [{ name: '  N1  ', pos: 500, proj: '10', angle: 0, size: 50 }],
      saddles: 'nope',
    });
    expect(raw.id).toBe(2000);
    expect(raw.length).toBeNull();
    expect(raw.headRatio).toBeNull();
    expect(raw.orientation).toBeNull();
    expect(raw.nozzles[0].name).toBe('N1');
    expect(raw.nozzles[0].proj).toBeNull();
    expect(raw.saddles).toEqual([]);
  });

  it('returns an all-null sample for null input (failed-pass padding)', () => {
    const raw = coerceRawExtraction(null);
    expect(raw.id).toBeNull();
    expect(raw.nozzles).toEqual([]);
    expect(raw.saddles).toEqual([]);
  });
});
