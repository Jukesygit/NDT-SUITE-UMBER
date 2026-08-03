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
    mount: 'shell',
    radialOffset: null,
    nozzleOrientation: 'radial',
    elevation: null,
  });

  it('votes a nozzle present in 2 of 3 samples and appends a singleton after it', () => {
    const review = voteExtractions([
      sample({ nozzles: [noz('N1', 1000, 150), noz('N2', 2000, 100)] }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
    ]);
    // Voted nozzle first (existing order/behavior), singleton appended after.
    const names = review.nozzles.map((n) => n.name.value);
    expect(names).toEqual(['N1', 'N2']);
    expect(review.nozzles[0].pos.value).toBe(1000);
    expect(review.nozzles[0].pos.confidence).toBe('high');
    // The appended singleton is carried at low confidence with a 'single-pass' flag.
    const n2 = review.nozzles[1];
    expect(n2.pos.value).toBe(2000);
    expect(n2.pos.confidence).toBe('low');
    expect(n2.pos.flags).toContain('single-pass');
    expect(n2.name.confidence).toBe('low');
    expect(n2.name.flags).toContain('single-pass');
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
      sample({
        nozzles: [
          { name: 'N1', pos: null, proj: 200, angle: 90, size: 150, mount: 'shell', radialOffset: null, nozzleOrientation: 'radial', elevation: null },
        ],
      }),
      sample({
        nozzles: [
          { name: 'N1', pos: null, proj: 200, angle: 90, size: 150, mount: 'shell', radialOffset: null, nozzleOrientation: 'radial', elevation: null },
        ],
      }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
    ]);
    expect(review.nozzles[0].name.confidence).toBe('high');
    expect(review.nozzles[0].pos.confidence).toBe('missing');
    expect(review.nozzles[0].pos.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Singleton nozzle survival (no silent loss)
// ---------------------------------------------------------------------------

describe('voteExtractions — singleton nozzles survive', () => {
  const noz = (name: string, pos: number, size: number): RawExtraction['nozzles'][number] => ({
    name,
    pos,
    proj: 200,
    angle: 90,
    size,
    mount: 'shell',
    radialOffset: null,
    nozzleOrientation: 'radial',
    elevation: null,
  });

  it('keeps every nozzle as low/single-pass when each appears in only one sample', () => {
    // The field-failure case: inconsistent tags across passes → all singletons.
    // Previously the whole list vanished; now all survive.
    const review = voteExtractions([
      sample({ nozzles: [noz('N1', 1000, 150)] }),
      sample({ nozzles: [noz('2101/02', 2000, 100)] }),
      sample({ nozzles: [noz('N3', 3000, 50)] }),
    ]);
    expect(review.nozzles.map((n) => n.name.value)).toEqual(['N1', '2101/02', 'N3']);
    for (const n of review.nozzles) {
      expect(n.name.confidence).toBe('low');
      expect(n.name.flags).toContain('single-pass');
      expect(n.pos.confidence).toBe('low');
      expect(n.pos.flags).toContain('single-pass');
      expect(n.size.flags).toContain('single-pass');
      // A shell singleton keeps the non-blocking offset sentinel, unflagged.
      expect(n.radialOffset.confidence).toBe('high');
      expect(n.radialOffset.value).toBeNull();
      expect(n.radialOffset.flags).toEqual([]);
    }
  });

  it('leaves an unread field of a singleton as missing, not single-pass', () => {
    const review = voteExtractions([
      sample({ nozzles: [noz('N1', 1000, 150)] }),
      sample({
        nozzles: [
          { name: 'LONE', pos: null, proj: 200, angle: 90, size: 150, mount: 'shell', radialOffset: null, nozzleOrientation: 'radial', elevation: null },
        ],
      }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
    ]);
    const lone = review.nozzles.find((n) => n.name.value === 'LONE')!;
    expect(lone.name.confidence).toBe('low');
    expect(lone.name.flags).toContain('single-pass');
    // pos was null in its single sample → stays missing, no single-pass flag.
    expect(lone.pos.confidence).toBe('missing');
    expect(lone.pos.value).toBeNull();
    expect(lone.pos.flags).toEqual([]);
  });

  it('carries a head singleton offset at low/single-pass but shell offset stays sentinel', () => {
    const review = voteExtractions([
      sample({ nozzles: [noz('N1', 1000, 150)] }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
      sample({
        nozzles: [
          { name: 'HEAD1', pos: null, proj: 200, angle: 0, size: 600, mount: 'head-left', radialOffset: 300, nozzleOrientation: 'radial', elevation: null },
        ],
      }),
    ]);
    const head = review.nozzles.find((n) => n.name.value === 'HEAD1')!;
    expect(head.mount.value).toBe('head-left');
    expect(head.mount.flags).toContain('single-pass');
    expect(head.radialOffset.value).toBe(300);
    expect(head.radialOffset.confidence).toBe('low');
    expect(head.radialOffset.flags).toContain('single-pass');
  });

  it('does not duplicate a voted nozzle as a singleton (dedupe guard)', () => {
    const review = voteExtractions([
      sample({ nozzles: [noz('N1', 1000, 150), noz('N2', 2000, 100)] }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
      sample({ nozzles: [noz('N1', 1000, 150)] }),
    ]);
    const n1s = review.nozzles.filter((n) => n.name.value?.toLowerCase() === 'n1');
    expect(n1s).toHaveLength(1);
    expect(n1s[0].name.confidence).toBe('high'); // voted, never re-appended as low
  });
});

// ---------------------------------------------------------------------------
// Nozzle mount + radialOffset voting
// ---------------------------------------------------------------------------

describe('voteExtractions — mount + radialOffset', () => {
  const head = (
    name: string,
    mount: 'head-left' | 'head-right',
    radialOffset: number | null,
  ): RawExtraction['nozzles'][number] => ({
    name,
    pos: null,
    proj: 200,
    angle: 0,
    size: 600,
    mount,
    radialOffset,
    nozzleOrientation: 'radial',
    elevation: null,
  });

  const shell = (name: string): RawExtraction['nozzles'][number] => ({
    name,
    pos: 1000,
    proj: 200,
    angle: 90,
    size: 150,
    mount: 'shell',
    radialOffset: null,
    nozzleOrientation: 'radial',
    elevation: null,
  });

  it('votes the mount enum high when all three agree', () => {
    const review = voteExtractions([
      sample({ nozzles: [head('M1', 'head-left', 0)] }),
      sample({ nozzles: [head('M1', 'head-left', 0)] }),
      sample({ nozzles: [head('M1', 'head-left', 0)] }),
    ]);
    expect(review.nozzles[0].mount.value).toBe('head-left');
    expect(review.nozzles[0].mount.confidence).toBe('high');
  });

  it('votes the mount enum by 2/3 majority (medium)', () => {
    const review = voteExtractions([
      sample({ nozzles: [head('M1', 'head-left', 100)] }),
      sample({ nozzles: [head('M1', 'head-left', 100)] }),
      sample({ nozzles: [head('M1', 'head-right', 100)] }),
    ]);
    expect(review.nozzles[0].mount.value).toBe('head-left');
    expect(review.nozzles[0].mount.confidence).toBe('medium');
  });

  it('median-votes radialOffset only for a head mount', () => {
    // median 300, tol = max(1, 3) = 3 → 301 and 299 both within → all agree
    const review = voteExtractions([
      sample({ nozzles: [head('M1', 'head-left', 300)] }),
      sample({ nozzles: [head('M1', 'head-left', 301)] }),
      sample({ nozzles: [head('M1', 'head-left', 299)] }),
    ]);
    expect(review.nozzles[0].radialOffset.value).toBe(300);
    expect(review.nozzles[0].radialOffset.confidence).toBe('high');
  });

  it('gives a shell nozzle a non-blocking radialOffset (high, null) not "missing"', () => {
    const review = voteExtractions([
      sample({ nozzles: [shell('N1')] }),
      sample({ nozzles: [shell('N1')] }),
      sample({ nozzles: [shell('N1')] }),
    ]);
    expect(review.nozzles[0].mount.value).toBe('shell');
    expect(review.nozzles[0].radialOffset.value).toBeNull();
    expect(review.nozzles[0].radialOffset.confidence).toBe('high');
  });

  it('reports a head radialOffset the majority could not read as missing', () => {
    const review = voteExtractions([
      sample({ nozzles: [head('M1', 'head-left', null)] }),
      sample({ nozzles: [head('M1', 'head-left', null)] }),
      sample({ nozzles: [head('M1', 'head-left', 300)] }),
    ]);
    expect(review.nozzles[0].radialOffset.confidence).toBe('missing');
    expect(review.nozzles[0].radialOffset.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Nozzle nozzleOrientation + elevation voting
// ---------------------------------------------------------------------------

describe('voteExtractions — nozzleOrientation + elevation', () => {
  const horiz = (
    name: string,
    elevation: number | null,
    angle = 90,
  ): RawExtraction['nozzles'][number] => ({
    name,
    pos: 1000,
    proj: 200,
    angle,
    size: 150,
    mount: 'shell',
    radialOffset: null,
    nozzleOrientation: 'horizontal',
    elevation,
  });

  const radial = (name: string): RawExtraction['nozzles'][number] => ({
    name,
    pos: 1000,
    proj: 200,
    angle: 90,
    size: 150,
    mount: 'shell',
    radialOffset: null,
    nozzleOrientation: 'radial',
    elevation: null,
  });

  it('votes the nozzleOrientation enum high when all three agree', () => {
    const review = voteExtractions([
      sample({ nozzles: [horiz('N1', 300)] }),
      sample({ nozzles: [horiz('N1', 300)] }),
      sample({ nozzles: [horiz('N1', 300)] }),
    ]);
    expect(review.nozzles[0].nozzleOrientation.value).toBe('horizontal');
    expect(review.nozzles[0].nozzleOrientation.confidence).toBe('high');
  });

  it('votes the nozzleOrientation enum by 2/3 majority (medium)', () => {
    const review = voteExtractions([
      sample({ nozzles: [horiz('N1', 300)] }),
      sample({ nozzles: [horiz('N1', 300)] }),
      sample({ nozzles: [radial('N1')] }),
    ]);
    expect(review.nozzles[0].nozzleOrientation.value).toBe('horizontal');
    expect(review.nozzles[0].nozzleOrientation.confidence).toBe('medium');
  });

  it('median-votes elevation only for a horizontal nozzle', () => {
    // median 300, tol = max(1, 3) = 3 → 301 and 299 both within → all agree
    const review = voteExtractions([
      sample({ nozzles: [horiz('N1', 300)] }),
      sample({ nozzles: [horiz('N1', 301)] }),
      sample({ nozzles: [horiz('N1', 299)] }),
    ]);
    expect(review.nozzles[0].elevation.value).toBe(300);
    expect(review.nozzles[0].elevation.confidence).toBe('high');
  });

  it('gives a radial nozzle a non-blocking elevation sentinel (high, null) not "missing"', () => {
    const review = voteExtractions([
      sample({ nozzles: [radial('N1')] }),
      sample({ nozzles: [radial('N1')] }),
      sample({ nozzles: [radial('N1')] }),
    ]);
    expect(review.nozzles[0].nozzleOrientation.value).toBe('radial');
    expect(review.nozzles[0].elevation.value).toBeNull();
    expect(review.nozzles[0].elevation.confidence).toBe('high');
  });

  it('reports a horizontal elevation the majority could not read as missing', () => {
    const review = voteExtractions([
      sample({ nozzles: [horiz('N1', null)] }),
      sample({ nozzles: [horiz('N1', null)] }),
      sample({ nozzles: [horiz('N1', 300)] }),
    ]);
    expect(review.nozzles[0].elevation.confidence).toBe('missing');
    expect(review.nozzles[0].elevation.value).toBeNull();
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

  it('coerces the mount enum and radialOffset, rejecting an invalid mount', () => {
    const raw = coerceRawExtraction({
      nozzles: [
        { name: 'M1', pos: null, proj: 200, angle: 0, size: 600, mount: 'head-left', radialOffset: 300 },
        { name: 'N2', pos: 1000, proj: 200, angle: 90, size: 150, mount: 'sideways', radialOffset: 'x' },
      ],
    });
    expect(raw.nozzles[0].mount).toBe('head-left');
    expect(raw.nozzles[0].radialOffset).toBe(300);
    expect(raw.nozzles[1].mount).toBeNull();
    expect(raw.nozzles[1].radialOffset).toBeNull();
  });

  it('coerces nozzleOrientation + elevation, rejecting an invalid orientation', () => {
    const raw = coerceRawExtraction({
      nozzles: [
        { name: 'H1', pos: 1000, proj: 200, angle: 90, size: 150, nozzleOrientation: 'horizontal', elevation: -250 },
        { name: 'N2', pos: 1000, proj: 200, angle: 90, size: 150, nozzleOrientation: 'diagonal', elevation: 'x' },
      ],
    });
    expect(raw.nozzles[0].nozzleOrientation).toBe('horizontal');
    expect(raw.nozzles[0].elevation).toBe(-250);
    expect(raw.nozzles[1].nozzleOrientation).toBeNull();
    expect(raw.nozzles[1].elevation).toBeNull();
  });
});
