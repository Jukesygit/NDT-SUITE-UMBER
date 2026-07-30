import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import type { AnnotationShapeConfig, VesselState } from '../../types';
import { DEFAULT_VESSEL_STATE } from '../../types';
import { createRectOutline, createRectFill, shellPoint } from '../annotation-geometry';
import { SCALE } from '../materials';

// ---------------------------------------------------------------------------
// Fixtures — DEFAULT_VESSEL_STATE geometry: id 3000 (R 1500), headRatio 2
// (D 750), tan-tan length 8000.
// ---------------------------------------------------------------------------

const R = 1500;
const D = 750;
const L = 8000;
const OFFSET = 3;

// Geometry is stored in Float32BufferAttributes, so a float64 legacy reference
// can only match the read-back buffer to float32 precision (ULP ~1.8e-7 world
// at these coordinates). This bound is still ~1000x tighter than any real
// behavioural change (mm-scale => ~1e-3+ world), so it is a true regression lock.
const GOLDEN_EPS = 1e-5;

function makeState(): VesselState {
  return { ...DEFAULT_VESSEL_STATE, id: 2 * R, length: L, headRatio: 2, orientation: 'horizontal' };
}

function makeConfig(over: Partial<AnnotationShapeConfig>): AnnotationShapeConfig {
  return {
    id: 1,
    name: 'a',
    type: 'scan',
    pos: L / 2,
    angle: 90,
    width: 400,
    height: 300,
    color: '#ff0000',
    lineWidth: 1,
    showLabel: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Legacy reference math (the pre-dome constant-angular-span formulas). These
// reproduce annotation-geometry.ts exactly as it was before arc-space sampling,
// so the cylinder regression is a true golden comparison.
// ---------------------------------------------------------------------------

function legacyOutlinePoints(
  config: AnnotationShapeConfig,
  state: VesselState,
  offset: number
): THREE.Vector3[] {
  const circumference = Math.PI * state.id;
  const centerAngle = (config.angle * Math.PI) / 180;
  const halfW = config.width / 2;
  const halfH = config.height / 2;
  const angularHalfH = (halfH / circumference) * Math.PI * 2;
  const seg = 32;
  const pts: THREE.Vector3[] = [];

  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const pos = config.pos - halfW + t * config.width;
    pts.push(shellPoint(pos, centerAngle - angularHalfH, state, offset));
  }
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    const ang = centerAngle - angularHalfH + t * angularHalfH * 2;
    pts.push(shellPoint(config.pos + halfW, ang, state, offset));
  }
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    const pos = config.pos + halfW - t * config.width;
    pts.push(shellPoint(pos, centerAngle + angularHalfH, state, offset));
  }
  for (let i = 1; i < seg; i++) {
    const t = i / seg;
    const ang = centerAngle + angularHalfH - t * angularHalfH * 2;
    pts.push(shellPoint(config.pos - halfW, ang, state, offset));
  }
  return pts;
}

function legacyFillVertices(
  config: AnnotationShapeConfig,
  state: VesselState,
  offset: number
): number[] {
  const circumference = Math.PI * state.id;
  const centerAngle = (config.angle * Math.PI) / 180;
  const segX = 32;
  const segY = 32;
  const halfW = config.width / 2;
  const halfH = config.height / 2;
  const angularHalfH = (halfH / circumference) * Math.PI * 2;
  const verts: number[] = [];

  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY;
    const angOffset = -angularHalfH + v * angularHalfH * 2;
    for (let ix = 0; ix <= segX; ix++) {
      const u = ix / segX;
      const posOffset = -halfW + u * config.width;
      const pt = shellPoint(config.pos + posOffset, centerAngle + angOffset, state, offset - 0.5);
      verts.push(pt.x, pt.y, pt.z);
    }
  }
  return verts;
}

// ---------------------------------------------------------------------------
// Helpers to read geometry back out.
// ---------------------------------------------------------------------------

function outlinePoints(loop: THREE.LineLoop): THREE.Vector3[] {
  const attr = loop.geometry.getAttribute('position');
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < attr.count; i++) {
    pts.push(new THREE.Vector3(attr.getX(i), attr.getY(i), attr.getZ(i)));
  }
  return pts;
}

/** Surface path length (mm) along a contiguous slice of outline points. */
function pathLenMm(pts: THREE.Vector3[], from: number, to: number): number {
  let d = 0;
  for (let i = from; i < to; i++) d += pts[i].distanceTo(pts[i + 1]);
  return d / SCALE;
}

/** Radial distance from the vessel axis (horizontal orientation), in mm. */
function radialMm(p: THREE.Vector3): number {
  return Math.sqrt(p.y * p.y + p.z * p.z) / SCALE;
}

// ---------------------------------------------------------------------------
// (1) Shell regression — cylinder output identical to the legacy formula
// ---------------------------------------------------------------------------

describe('createRectOutline — shell regression (golden vs legacy)', () => {
  it('produces vertices identical to the legacy constant-span formula on the cylinder', () => {
    const state = makeState();
    const config = makeConfig({ pos: L / 2, width: 400, height: 300, angle: 90 });
    const got = outlinePoints(createRectOutline(config, state, OFFSET));
    const legacy = legacyOutlinePoints(config, state, OFFSET);

    expect(got.length).toBe(legacy.length);
    for (let i = 0; i < legacy.length; i++) {
      expect(Math.abs(got[i].x - legacy[i].x)).toBeLessThan(GOLDEN_EPS);
      expect(Math.abs(got[i].y - legacy[i].y)).toBeLessThan(GOLDEN_EPS);
      expect(Math.abs(got[i].z - legacy[i].z)).toBeLessThan(GOLDEN_EPS);
    }
  });

  it('matches legacy across several angles/positions still on the cylinder', () => {
    const state = makeState();
    for (const over of [
      { pos: 2000, angle: 0, width: 300, height: 200 },
      { pos: 4000, angle: 45, width: 500, height: 350 },
      { pos: 6000, angle: 270, width: 250, height: 150 },
    ]) {
      const config = makeConfig(over);
      const got = outlinePoints(createRectOutline(config, state, OFFSET));
      const legacy = legacyOutlinePoints(config, state, OFFSET);
      for (let i = 0; i < legacy.length; i++) {
        expect(got[i].distanceTo(legacy[i])).toBeLessThan(GOLDEN_EPS);
      }
    }
  });
});

describe('createRectFill — shell regression (golden vs legacy)', () => {
  it('produces fill vertices identical to the legacy formula on the cylinder', () => {
    const state = makeState();
    const config = makeConfig({ pos: L / 2, width: 400, height: 300 });
    const attr = createRectFill(config, state, OFFSET).geometry.getAttribute('position');
    const legacy = legacyFillVertices(config, state, OFFSET);

    expect(attr.count * 3).toBe(legacy.length);
    for (let i = 0; i < attr.count; i++) {
      expect(Math.abs(attr.getX(i) - legacy[i * 3])).toBeLessThan(GOLDEN_EPS);
      expect(Math.abs(attr.getY(i) - legacy[i * 3 + 1])).toBeLessThan(GOLDEN_EPS);
      expect(Math.abs(attr.getZ(i) - legacy[i * 3 + 2])).toBeLessThan(GOLDEN_EPS);
    }
  });
});

// ---------------------------------------------------------------------------
// (2) Dome fidelity — on a head, edge lengths honour the stored mm
// ---------------------------------------------------------------------------

describe('createRectOutline — dome mm fidelity', () => {
  it('meridian (width) and circumferential (height) edges keep their true mm on the head', () => {
    const state = makeState();
    // Centre well inside the right head (axial-past-TL = 0.4 D, clear of the apex).
    const config = makeConfig({ pos: L + 0.4 * D, width: 400, height: 200, angle: 90 });
    const pts = outlinePoints(createRectOutline(config, state, OFFSET));

    // Outline vertex layout: bottom 0..32 (33 pts, 32 segs), right edge sweeps
    // circumference from the bottom-right corner (idx 32) to the top-right
    // corner (idx 64). Bottom edge spans the meridian; right edge circumference.
    const bottomLen = pathLenMm(pts, 0, 32); // meridian-direction edge ~ width
    const rightLen = pathLenMm(pts, 32, 64); // circumferential edge ~ height

    expect(Math.abs(bottomLen - config.width) / config.width).toBeLessThan(0.02);
    expect(Math.abs(rightLen - config.height) / config.height).toBeLessThan(0.02);
  });

  it('all head vertices sit at a finite, positive radius', () => {
    const state = makeState();
    const config = makeConfig({ pos: L + 0.4 * D, width: 400, height: 200 });
    for (const p of outlinePoints(createRectOutline(config, state, OFFSET))) {
      const r = radialMm(p);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// (3) Straddle continuity — a rect crossing the tangent line stays connected
// ---------------------------------------------------------------------------

describe('createRectOutline — straddle continuity across the tangent line', () => {
  it('has bounded adjacent-vertex spacing and finite radii when crossing the TL', () => {
    const state = makeState();
    // Centred on the right tangent line; width reaches into both shell and head.
    const config = makeConfig({ pos: L, width: 800, height: 300, angle: 90 });
    const pts = outlinePoints(createRectOutline(config, state, OFFSET));

    const gaps: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      expect(Number.isFinite(a.x + a.y + a.z)).toBe(true);
      expect(radialMm(a)).toBeGreaterThan(0);
      gaps.push(a.distanceTo(b));
    }

    const sorted = [...gaps].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    const max = sorted[sorted.length - 1];
    // No detachment/jump: the largest step is close to the typical step.
    expect(max).toBeLessThan(5 * median);
  });
});

// ---------------------------------------------------------------------------
// (4) Rigid drape — head-touching rects keep their shape (no flare/ring wrap)
// ---------------------------------------------------------------------------

/** Axial position (mm) recovered from a horizontal-orientation world point. */
function posMm(p: THREE.Vector3): number {
  return p.x / SCALE + L / 2;
}

/** Reference body radius (mm) at an axial position (clamp = 1, mirrors body-frame). */
function radiusAtRef(pos: number): number {
  if (pos >= 0 && pos <= L) return R;
  const u = pos < 0 ? -pos : pos - L;
  const ratio = Math.min(1, u / D);
  return R * Math.sqrt(1 - ratio * ratio);
}

describe('createRectOutline — rigid drape on the head', () => {
  it('a head-covering rect outline has no NaN and every vertex sits on the shell', () => {
    const state = makeState();
    const config = makeConfig({ pos: L + D * 0.9, width: 1500, height: 800, angle: 90 });
    const pts = outlinePoints(createRectOutline(config, state, OFFSET));

    for (const p of pts) {
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      // Radial distance must equal the head radius at the vertex's axial position
      // (plus the surface offset) — i.e. the vertex lies exactly on the shell.
      const expected = radiusAtRef(posMm(p)) + OFFSET;
      expect(Math.abs(radialMm(p) - expected)).toBeLessThan(1);
    }
  });

  it('a pole-centred rect outline stays a bounded patch — no full-radius ring', () => {
    const state = makeState();
    const width = 800;
    const height = 600;
    const config = makeConfig({ pos: L + D, width, height, angle: 90 });
    const pts = outlinePoints(createRectOutline(config, state, OFFSET));
    const radii = pts.map(radialMm);
    const maxR = Math.max(...radii);
    const minR = Math.min(...radii);

    // Bounded patch: its circumferential footprint is on the order of the stored
    // dimensions, nowhere near a full-diameter (2R) wrap.
    expect(2 * maxR).toBeLessThan(1.6 * Math.max(width, height));
    expect(maxR).toBeLessThan(R);
    // Not a thin constant-radius ring (the old flare/ring bug): the drape's
    // outline radii vary as it wraps the pole.
    expect(maxR - minR).toBeGreaterThan(80);
  });
});

describe('createRectFill — apex reachability (pole-reaching clamp)', () => {
  it('no NaN vertices in fill for an apex-covering rect', () => {
    const state = makeState();
    const config = makeConfig({ pos: L + D * 0.9, width: 1500, height: 800, angle: 90 });
    const attr = createRectFill(config, state, OFFSET).geometry.getAttribute('position');
    for (let i = 0; i < attr.count; i++) {
      expect(Number.isFinite(attr.getX(i))).toBe(true);
      expect(Number.isFinite(attr.getY(i))).toBe(true);
      expect(Number.isFinite(attr.getZ(i))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// (5) Sagitta-aware segment density (Addendum 3 — striped-band fix)
// ---------------------------------------------------------------------------

/** Midpoint of two world-space points. */
function midpoint(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  return a.clone().add(b).multiplyScalar(0.5);
}

/** Fill mesh readback: position attribute + index buffer. */
function fillGeom(mesh: THREE.Mesh): { pos: THREE.BufferAttribute; index: THREE.BufferAttribute } {
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const index = mesh.geometry.getIndex();
  if (!index) throw new Error('fill mesh has no index buffer');
  return { pos, index: index as THREE.BufferAttribute };
}

describe('createRectOutline / createRectFill — full-circumference shell band (no chord dip)', () => {
  // Full-wrap band on the cylinder: width 400 (meridian), height = a whole
  // circumference. With fixed 32 sampling the chord sags ~7 mm below the wall and
  // clips; adaptive sampling must keep every mid-segment above the shell radius R.
  const state = makeState();
  const config = makeConfig({ pos: 4000, width: 400, height: Math.PI * 3000, angle: 90 });
  const sHiAxial = 4000 + 400 / 2; // 4200 — the right circumferential edge station
  const sLoAxial = 4000 - 400 / 2; // 3800 — the left circumferential edge station
  const atAxial = (p: THREE.Vector3, axial: number) => Math.abs(posMm(p) - axial) < 1;

  it('outline circumferential-edge midpoints never fall below the shell radius', () => {
    const pts = outlinePoints(createRectOutline(config, state, OFFSET));
    let checked = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const bothHi = atAxial(a, sHiAxial) && atAxial(b, sHiAxial);
      const bothLo = atAxial(a, sLoAxial) && atAxial(b, sLoAxial);
      if (!bothHi && !bothLo) continue; // meridian (axial) edges: skip
      expect(radialMm(midpoint(a, b))).toBeGreaterThanOrEqual(R);
      checked++;
    }
    expect(checked).toBeGreaterThan(60); // sanity: circumferential midpoints exercised
  });

  it('adaptive sampling engaged: the circumferential edge has > 33 points', () => {
    const pts = outlinePoints(createRectOutline(config, state, OFFSET));
    const circPts = pts.filter((p) => atAxial(p, sHiAxial)).length;
    expect(circPts).toBeGreaterThan(33);
  });

  it('fill: every adjacent-row midpoint stays at/above the shell radius', () => {
    const { pos, index } = fillGeom(createRectFill(config, state, OFFSET));
    const vec = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    let checked = 0;
    // Each quad's first triangle is (a, b, d); a and b are the same column in
    // consecutive rows, so their midpoint is a circumferential (lateral) mid.
    for (let t = 0; t < index.count; t += 6) {
      const mid = midpoint(vec(index.getX(t)), vec(index.getX(t + 1)));
      expect(radialMm(mid)).toBeGreaterThanOrEqual(R);
      checked++;
    }
    expect(checked).toBeGreaterThan(60);
  });
});

describe('createRectOutline — small-rect stability (min-32 clamp)', () => {
  it('a modest-height rect keeps exactly 33 circumferential-edge points', () => {
    const state = makeState();
    const config = makeConfig({ pos: L / 2, width: 400, height: 800, angle: 90 });
    const pts = outlinePoints(createRectOutline(config, state, OFFSET));
    const sHiAxial = L / 2 + 400 / 2;
    const circPts = pts.filter((p) => Math.abs(posMm(p) - sHiAxial) < 1).length;
    // 1 shared bottom-right corner + 32 right-edge sweep points = 33 (no adaptation).
    expect(circPts).toBe(33);
  });
});

describe('createRectFill — drape band straddling the right head', () => {
  it('no NaN and adjacent-row midpoints stay at/above the local surface radius', () => {
    const state = makeState();
    // Centre on the cylinder but wide enough (300 mm half-width) to poke past the
    // right tangent line, with a large circumferential height -> drape path.
    const config = makeConfig({ pos: 7900, width: 600, height: 6000, angle: 90 });
    const { pos, index } = fillGeom(createRectFill(config, state, OFFSET));
    const vec = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));

    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
    }

    // Chord sag is bounded to offset/2; 2 mm absorbs that plus the head normal's
    // non-radial tilt while still catching a gross (fixed-32) dip into the body.
    const TOL = 2;
    let checked = 0;
    for (let t = 0; t < index.count; t += 6) {
      const mid = midpoint(vec(index.getX(t)), vec(index.getX(t + 1)));
      const localR = radiusAtRef(posMm(mid)); // body-frame wall radius at the mid axial pos
      expect(radialMm(mid)).toBeGreaterThanOrEqual(localR - TOL);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
});
