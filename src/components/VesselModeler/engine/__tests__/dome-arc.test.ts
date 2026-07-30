import { describe, it, expect } from 'vitest';

import {
  buildMeridianProfile,
  domeArcLength,
  arcFromAxial,
  axialFromArc,
  displayRadiusAtArc,
} from '../dome-arc';

// ---------------------------------------------------------------------------
// Reference geometry (matches DEFAULT_VESSEL_STATE: id 3000, headRatio 2)
// ---------------------------------------------------------------------------

const R = 1500; // vessel radius (mm)
const D = 750; // 2:1 head depth (R / headRatio)
const L = 8000; // tan-tan length (mm)

const QUARTER = (Math.PI / 2) * R;

/** Re-implementation of body-frame.ts radiusAt() on the head (min(1, ...) clamp). */
function radiusAtRef(axialPastTL: number): number {
  const ratio = Math.min(1, Math.abs(axialPastTL) / D);
  return R * Math.sqrt(1 - ratio * ratio);
}

// ---------------------------------------------------------------------------
// (1) Hemisphere: D === R => quarter-meridian arc = (pi/2) R
// ---------------------------------------------------------------------------

describe('domeArcLength — hemisphere identity', () => {
  it('D === R gives a quarter arc of exactly (pi/2) R', () => {
    const arc = domeArcLength(R, R);
    expect(Math.abs(arc - (Math.PI / 2) * R) / ((Math.PI / 2) * R)).toBeLessThan(1e-3);
  });

  it('buildMeridianProfile exposes the same apex arc', () => {
    const profile = buildMeridianProfile(R, R);
    expect(profile.apexArc).toBeCloseTo((Math.PI / 2) * R, 3);
  });
});

// ---------------------------------------------------------------------------
// (2) 2:1 head: arc strictly between D and (pi/2) R; monotone
// ---------------------------------------------------------------------------

describe('domeArcLength — 2:1 head bounds and monotonicity', () => {
  it('quarter arc is strictly between the head depth and the hemisphere arc', () => {
    const arc = domeArcLength(R, D);
    expect(arc).toBeGreaterThan(D);
    expect(arc).toBeLessThan(QUARTER);
  });

  it('arc increases monotonically with axial distance past the tangent line', () => {
    const profile = buildMeridianProfile(R, D);
    let prev = 0;
    for (const a of [0, 50, 150, 300, 500, 700, D]) {
      const s = arcFromAxial(profile, L, L + a); // right head
      expect(s - L).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s - L;
    }
    // Final value equals the apex arc.
    expect(arcFromAxial(profile, L, L + D) - L).toBeCloseTo(profile.apexArc, 6);
  });
});

// ---------------------------------------------------------------------------
// (3) Round-trip axialFromArc(arcFromAxial(pos)) === pos, shell + dome
// ---------------------------------------------------------------------------

describe('arc <-> axial round-trip', () => {
  const profile = buildMeridianProfile(R, D);

  const shellSamples = [0, L / 8, L / 4, L / 2, (3 * L) / 4, L];
  const leftHead = [-D * 0.1, -D * 0.25, -D * 0.5, -D * 0.75, -D * 0.9];
  const rightHead = leftHead.map((p) => L - p);

  for (const pos of [...shellSamples, ...leftHead, ...rightHead]) {
    it(`recovers pos=${pos.toFixed(2)}`, () => {
      const round = axialFromArc(profile, L, arcFromAxial(profile, L, pos));
      expect(Math.abs(round - pos)).toBeLessThan(1e-6);
    });
  }
});

// ---------------------------------------------------------------------------
// (4) Shell identity: arcFromAxial(pos) === pos for 0 <= pos <= L
// ---------------------------------------------------------------------------

describe('shell identity', () => {
  const profile = buildMeridianProfile(R, D);
  it('arc length equals axial position on the cylinder', () => {
    for (const pos of [0, 1, L / 3, L / 2, (2 * L) / 3, L]) {
      expect(arcFromAxial(profile, L, pos)).toBe(pos);
      expect(axialFromArc(profile, L, pos)).toBe(pos);
    }
  });
});

// ---------------------------------------------------------------------------
// (5) Apex clamping on both ends
// ---------------------------------------------------------------------------

describe('apex clamping', () => {
  const profile = buildMeridianProfile(R, D);
  const apex = profile.apexArc;

  it('axial overshoot past the apex clamps to the apex arc', () => {
    expect(arcFromAxial(profile, L, -(D + 500))).toBeCloseTo(-apex, 6);
    expect(arcFromAxial(profile, L, L + D + 500)).toBeCloseTo(L + apex, 6);
  });

  it('arc overshoot past the apex clamps axial to +/- head depth', () => {
    expect(axialFromArc(profile, L, -(apex + 500))).toBeCloseTo(-D, 6);
    expect(axialFromArc(profile, L, L + apex + 500)).toBeCloseTo(L + D, 6);
  });
});

// ---------------------------------------------------------------------------
// (6) displayRadiusAtArc reproduces radiusAt() incl. the min(1, ...) ratio clamp
// ---------------------------------------------------------------------------

describe('displayRadiusAtArc matches body-frame radiusAt', () => {
  const profile = buildMeridianProfile(R, D);

  it('equals R on the cylinder', () => {
    for (const pos of [0, L / 2, L]) {
      const s = arcFromAxial(profile, L, pos);
      expect(displayRadiusAtArc(profile, L, s)).toBeCloseTo(R, 9);
    }
  });

  it('matches the clamped ellipsoid radius on the head', () => {
    for (const a of [50, 200, 400, 600, D * 0.99, D, D + 300]) {
      // right head at axial-past-TL = a
      const s = arcFromAxial(profile, L, L + a);
      const axial = axialFromArc(profile, L, s);
      const expected = radiusAtRef(axial - L);
      expect(displayRadiusAtArc(profile, L, s)).toBeCloseTo(expected, 6);
    }
  });

  it('reaches the true pole (radius 0) at and beyond the apex arc, decreasing toward it', () => {
    const sApex = arcFromAxial(profile, L, L + D);
    // At the apex the radius collapses to 0 (min(1, ...) clamp, no forbidden disk).
    expect(displayRadiusAtArc(profile, L, sApex)).toBeCloseTo(0, 6);
    // Overshooting past the apex stays clamped at the pole.
    expect(displayRadiusAtArc(profile, L, sApex + 500)).toBeCloseTo(0, 6);
    expect(displayRadiusAtArc(profile, L, L + profile.apexArc + 1000)).toBeCloseTo(0, 6);

    // Strictly decreasing along the meridian from the tangent line to the apex.
    let prev = Infinity;
    for (const f of [0, 0.25, 0.5, 0.75, 0.9, 1]) {
      const r = displayRadiusAtArc(profile, L, L + f * profile.apexArc);
      expect(r).toBeLessThan(prev);
      prev = r;
    }
  });
});
