import { describe, it, expect } from 'vitest';

import {
  drawingClockToVesselAngle,
  placeExtractedNozzle,
  type ExtractedNozzle,
  type PlacementVessel,
} from '../head-nozzle-placement';

// id 2000 → R 1000; headRatio 2 → headDepth = 2000 / (2*2) = 500; length 6000.
const VESSEL: PlacementVessel = { id: 2000, length: 6000, headRatio: 2 };
const HEAD_DEPTH = 500;

// `angle` on ExtractedNozzle is drawing-native (0 = top, clockwise); default 0.
function noz(over: Partial<ExtractedNozzle> = {}): ExtractedNozzle {
  return { pos: 0, proj: 200, angle: 0, size: 150, ...over };
}

// ---------------------------------------------------------------------------
// drawingClockToVesselAngle — the one canonical drawing→engine conversion
// ---------------------------------------------------------------------------

describe('drawingClockToVesselAngle', () => {
  it('maps the four cardinals (drawing CW-from-top -> engine CCW-from-right)', () => {
    expect(drawingClockToVesselAngle(0)).toBe(90); // top
    expect(drawingClockToVesselAngle(90)).toBe(0); // right
    expect(drawingClockToVesselAngle(180)).toBe(270); // bottom
    expect(drawingClockToVesselAngle(270)).toBe(180); // left
  });

  it('normalizes negative and wraparound inputs into [0, 360)', () => {
    expect(drawingClockToVesselAngle(-90)).toBe(180);
    expect(drawingClockToVesselAngle(360)).toBe(90); // full turn == 0 == top
    expect(drawingClockToVesselAngle(450)).toBe(0); // 450 == 90 == right
  });
});

// ---------------------------------------------------------------------------
// Shell passthrough (angle converted; pos/proj/size untouched)
// ---------------------------------------------------------------------------

describe('placeExtractedNozzle — shell', () => {
  it('passes a shell nozzle through, converting only the angle', () => {
    // drawing 90 (3 o'clock, right) → engine 0.
    const out = placeExtractedNozzle(
      noz({ mount: 'shell', pos: 1234, proj: 250, angle: 90, size: 100 }),
      VESSEL
    );
    expect(out).toEqual({ pos: 1234, proj: 250, angle: 0, size: 100 });
    expect(out.orientationMode).toBeUndefined();
    expect(out.azimuthRotation).toBeUndefined();
  });

  it('treats an absent mount as legacy shell (passthrough, angle converted)', () => {
    // default drawing angle 0 (top) → engine 90.
    const out = placeExtractedNozzle(noz({ pos: 500 }), VESSEL);
    expect(out.orientationMode).toBeUndefined();
    expect(out.pos).toBe(500);
    expect(out.angle).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// Apex (offset 0) — both ends
// ---------------------------------------------------------------------------

describe('placeExtractedNozzle — apex (offset 0)', () => {
  it('places a head-left apex nozzle at -headDepth, axial out the left end', () => {
    const out = placeExtractedNozzle(
      noz({ mount: 'head-left', radialOffset: 0, angle: 0 }),
      VESSEL
    );
    expect(out.pos).toBe(-HEAD_DEPTH);
    expect(out.angle).toBe(90); // drawing top → engine 90
    expect(out.orientationMode).toBe('horizontal');
    expect(out.azimuthRotation).toBe(270); // +Z → -X (out the left end)
  });

  it('places a head-right apex nozzle at length + headDepth, axial out the right end', () => {
    const out = placeExtractedNozzle(
      noz({ mount: 'head-right', radialOffset: 0, angle: 0 }),
      VESSEL
    );
    expect(out.pos).toBe(VESSEL.length + HEAD_DEPTH);
    expect(out.orientationMode).toBe('horizontal');
    expect(out.azimuthRotation).toBe(90); // +Z → +X (out the right end)
  });
});

// ---------------------------------------------------------------------------
// Offset placement — d = headDepth * sqrt(1 - (r/R)^2)
// ---------------------------------------------------------------------------

describe('placeExtractedNozzle — offset', () => {
  it('computes the axial depth from the radial offset (head-left)', () => {
    // r/R = 600/1000 = 0.6 → sqrt(1-0.36)=0.8 → d = 500*0.8 = 400 → pos = -400
    const out = placeExtractedNozzle(
      noz({ mount: 'head-left', radialOffset: 600, angle: 0 }),
      VESSEL
    );
    expect(out.pos).toBeCloseTo(-400, 6);
    expect(out.orientationMode).toBe('horizontal');
  });

  it('computes the axial depth from the radial offset (head-right)', () => {
    // pos = length + 400 = 6400
    const out = placeExtractedNozzle(
      noz({ mount: 'head-right', radialOffset: 600, angle: 0 }),
      VESSEL
    );
    expect(out.pos).toBeCloseTo(6400, 6);
  });

  it('returns the converted engine-convention angle, positioning the offset round the head', () => {
    // drawing 137 → engine (90 - 137) mod 360 = 313.
    const out = placeExtractedNozzle(
      noz({ mount: 'head-left', radialOffset: 600, angle: 137 }),
      VESSEL
    );
    expect(out.angle).toBe(drawingClockToVesselAngle(137));
    expect(out.angle).toBe(313);
  });
});

// ---------------------------------------------------------------------------
// Offset >= R clamps the sqrt to 0 → tangent line
// ---------------------------------------------------------------------------

describe('placeExtractedNozzle — offset at/over the radius', () => {
  it('clamps a head-right offset == R to the right tangent line (pos = length)', () => {
    const out = placeExtractedNozzle(
      noz({ mount: 'head-right', radialOffset: 1000, angle: 0 }),
      VESSEL
    );
    expect(out.pos).toBe(VESSEL.length);
  });

  it('clamps a head-left offset > R to the left tangent line (pos = 0)', () => {
    const out = placeExtractedNozzle(
      noz({ mount: 'head-left', radialOffset: 1500, angle: 0 }),
      VESSEL
    );
    expect(Math.abs(out.pos)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Azimuth resolves outward from the clock angle (sign of cos)
// ---------------------------------------------------------------------------

describe('placeExtractedNozzle — outward azimuth vs converted angle', () => {
  it('flips azimuth for a left-side offset (cos(converted) < 0) to stay axial-outward', () => {
    // drawing 270 (9 o'clock, left) → engine 180 → cos(180°) < 0 →
    // head-left uses 90 (still -X), head-right uses 270 (still +X).
    const left = placeExtractedNozzle(
      noz({ mount: 'head-left', radialOffset: 300, angle: 270 }),
      VESSEL
    );
    const right = placeExtractedNozzle(
      noz({ mount: 'head-right', radialOffset: 300, angle: 270 }),
      VESSEL
    );
    expect(left.azimuthRotation).toBe(90);
    expect(right.azimuthRotation).toBe(270);
  });
});

// ---------------------------------------------------------------------------
// Horizontal (side-facing) shell nozzles — seated from elevation, not the
// converted clock angle. Engine convention: 90 = top, 0 = right, 180 = left,
// 270 = bottom. sin θ = elevation / R = 2·elevation/id.
// ---------------------------------------------------------------------------

describe('placeExtractedNozzle — horizontal shell', () => {
  // Facing side comes from the drawing angle: 90 (3 o'clock) faces right,
  // 270 (9 o'clock) faces left.
  const horiz = (over: Partial<ExtractedNozzle>): ExtractedNozzle =>
    noz({ mount: 'shell', nozzleOrientation: 'horizontal', ...over });

  it('EL 0 facing right (drawing 90) → engine 0 (right); pos/proj/size pass through', () => {
    const out = placeExtractedNozzle(
      horiz({ elevation: 0, angle: 90, pos: 1234, proj: 250, size: 100 }),
      VESSEL
    );
    expect(out.angle).toBe(0);
    expect(out.orientationMode).toBe('horizontal');
    expect(out.azimuthRotation).toBeUndefined();
    expect(out.pos).toBe(1234); // axial position (side elevation) unchanged
    expect(out.proj).toBe(250);
    expect(out.size).toBe(100);
  });

  it('EL 0 facing left (drawing 270) → engine 180 (left)', () => {
    const out = placeExtractedNozzle(horiz({ elevation: 0, angle: 270 }), VESSEL);
    expect(out.angle).toBe(180);
    expect(out.orientationMode).toBe('horizontal');
  });

  it('EL = +id/2 → engine 90 (top) from both facing sides (they converge)', () => {
    const right = placeExtractedNozzle(horiz({ elevation: 1000, angle: 90 }), VESSEL);
    const left = placeExtractedNozzle(horiz({ elevation: 1000, angle: 270 }), VESSEL);
    expect(right.angle).toBeCloseTo(90, 6);
    expect(left.angle).toBeCloseTo(90, 6);
  });

  it('negative EL seats below centerline (−id/2 → engine 270) from both sides', () => {
    const right = placeExtractedNozzle(horiz({ elevation: -1000, angle: 90 }), VESSEL);
    const left = placeExtractedNozzle(horiz({ elevation: -1000, angle: 270 }), VESSEL);
    expect(right.angle).toBeCloseTo(270, 6);
    expect(left.angle).toBeCloseTo(270, 6);
  });

  it('clamps an EL beyond the radius to the top (asin saturates at 90)', () => {
    const out = placeExtractedNozzle(horiz({ elevation: 5000, angle: 90 }), VESSEL);
    expect(out.angle).toBeCloseTo(90, 6);
  });

  it('computes an intermediate EL (600 → asin(0.6)) facing right', () => {
    const out = placeExtractedNozzle(horiz({ elevation: 600, angle: 90 }), VESSEL);
    expect(out.angle).toBeCloseTo((Math.asin(0.6) * 180) / Math.PI, 6);
  });

  it('throws for a horizontal nozzle with no elevation (never defaulted)', () => {
    expect(() => placeExtractedNozzle(horiz({ angle: 90 }), VESSEL)).toThrow(/elevation/);
  });

  // Projection: GA drawings measure a horizontal nozzle's outstand as the
  // horizontal distance from the vessel centre plane to the flange face. The
  // engine builds the pipe with length (proj − R) off a base seated √(R²−EL²)
  // from the centre plane, so proj_engine = proj_drawing + R − √(R²−EL²).
  it('passes projection through unchanged at EL 0 (radial-identical)', () => {
    const out = placeExtractedNozzle(horiz({ elevation: 0, angle: 90, proj: 350 }), VESSEL);
    expect(out.proj).toBe(350);
  });

  it('corrects projection at EL≠0 so the flange lands at the drawing distance', () => {
    // R 1000, EL 600 → halfChord √(1000²−600²) = 800. Drawing proj 1200 (centre
    // plane → flange). Engine proj = 1200 + 1000 − 800 = 1400; the engine then
    // seats the flange at halfChord + (proj_engine − R) = 800 + 400 = 1200.
    const out = placeExtractedNozzle(horiz({ elevation: 600, angle: 90, proj: 1200 }), VESSEL);
    expect(out.proj).toBeCloseTo(1400, 6);
    const halfChord = Math.sqrt(1000 * 1000 - 600 * 600);
    expect(halfChord + (out.proj - 1000)).toBeCloseTo(1200, 6);
  });

  it('applies the same projection correction on the left-facing side', () => {
    const out = placeExtractedNozzle(horiz({ elevation: 600, angle: 270, proj: 1200 }), VESSEL);
    expect(out.proj).toBeCloseTo(1400, 6);
  });
});

// ---------------------------------------------------------------------------
// Head mount takes precedence over nozzleOrientation
// ---------------------------------------------------------------------------

describe('placeExtractedNozzle — head mount precedence over orientation', () => {
  it('a head-mounted nozzle ignores nozzleOrientation=horizontal (uses head path)', () => {
    // No elevation provided: if orientation were consulted first this would
    // throw; instead the head path runs off radialOffset. Proves precedence.
    const out = placeExtractedNozzle(
      noz({ mount: 'head-left', radialOffset: 0, angle: 0, nozzleOrientation: 'horizontal' }),
      VESSEL
    );
    expect(out.pos).toBe(-HEAD_DEPTH); // axial dome-end, not elevation-seated
    expect(out.orientationMode).toBe('horizontal');
    expect(out.azimuthRotation).toBe(270); // out the left end (head path)
  });
});

// ---------------------------------------------------------------------------
// Missing radialOffset for a head mount is an error (never defaulted)
// ---------------------------------------------------------------------------

describe('placeExtractedNozzle — missing offset', () => {
  it('throws for a head mount with no radialOffset', () => {
    expect(() => placeExtractedNozzle(noz({ mount: 'head-left' }), VESSEL)).toThrow(/radialOffset/);
  });

  it('throws for a head-right mount with no radialOffset', () => {
    expect(() => placeExtractedNozzle(noz({ mount: 'head-right' }), VESSEL)).toThrow(
      /radialOffset/
    );
  });
});
