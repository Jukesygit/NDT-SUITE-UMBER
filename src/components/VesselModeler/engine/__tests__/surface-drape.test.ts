import { describe, it, expect } from 'vitest';

import { buildMeridianProfile, arcFromAxial, domeArcLength } from '../dome-arc';
import { buildDrapeGrid, lateralGeodesicEndpoint, type DrapeCell } from '../surface-drape';

// ---------------------------------------------------------------------------
// Reference geometry
// ---------------------------------------------------------------------------

const R = 1500; // vessel radius (mm)
const D = 750; // 2:1 head depth
const L = 8000; // tan-tan length (mm)
const DEG2RAD = Math.PI / 180;

/** Radius (mm) at an axial position, mirroring body-frame radiusAt (clamp = 1). */
function radiusAtMm(pos: number): number {
  if (pos >= 0 && pos <= L) return R;
  const u = pos < 0 ? -pos : pos - L;
  const ratio = Math.min(1, u / D);
  return R * Math.sqrt(1 - ratio * ratio);
}

/** World point (mm, horizontal orientation) for a surface coordinate. */
function worldMm(cell: DrapeCell): [number, number, number] {
  const r = radiusAtMm(cell.pos);
  const a = cell.angleDeg * DEG2RAD;
  return [cell.pos - L / 2, r * Math.sin(a), r * Math.cos(a)];
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ---------------------------------------------------------------------------
// (1) Sphere oracle — lateral geodesic vs analytic great circle (ODE signs)
// ---------------------------------------------------------------------------

describe('surface-drape — sphere oracle (lateral geodesic = great circle)', () => {
  // Hemispherical head: R === D so the head is a true unit sphere scaled by R.
  const SR = 1500;
  const profile = buildMeridianProfile(SR, SR);

  for (const alphaDeg of [20, 45, 70]) {
    for (const v of [200, 500, 800]) {
      it(`matches the great circle at colatitude ${alphaDeg}deg, arc ${v}mm`, () => {
        const alpha = alphaDeg * DEG2RAD;
        // Station at colatitude alpha on the right head, longitude 0.
        const posStation = L + SR * Math.cos(alpha);
        const stationArc = arcFromAxial(profile, L, posStation);

        const { pos, deltaAngleDeg } = lateralGeodesicEndpoint(profile, L, stationArc, v, +1);

        // Recovered colatitude/longitude of the walked endpoint.
        const colatW = Math.acos(Math.min(1, Math.max(-1, (pos - L) / SR)));
        const lonW = deltaAngleDeg * DEG2RAD;
        const Vw: [number, number, number] = [
          Math.sin(colatW) * Math.cos(lonW),
          Math.sin(colatW) * Math.sin(lonW),
          Math.cos(colatW),
        ];

        // Analytic great circle launched east from (alpha, lon 0): arc angle t = v/R.
        const t = v / SR;
        const X: [number, number, number] = [
          Math.cos(t) * Math.sin(alpha),
          Math.sin(t),
          Math.cos(t) * Math.cos(alpha),
        ];

        expect(dist(Vw, X)).toBeLessThan(1e-3);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// (2) Rigidity — a pole-centred rect keeps its stored dimensions, no NaN
// ---------------------------------------------------------------------------

describe('surface-drape — rigidity of a pole-centred rect', () => {
  const width = 1500;
  const height = 1200;
  const { grid } = buildDrapeGrid({
    R,
    D,
    L,
    pos: L + D, // apex/pole centred
    angleDeg: 90,
    widthMm: width,
    heightMm: height,
    cols: 32,
    rows: 32,
  });

  const cols = grid.length - 1;
  const rows = grid[0].length - 1;
  const mid = rows / 2;

  function edgeLen(pts: DrapeCell[]): number {
    let d = 0;
    for (let i = 0; i < pts.length - 1; i++) d += dist(worldMm(pts[i]), worldMm(pts[i + 1]));
    return d;
  }

  it('has no NaN vertices', () => {
    for (let c = 0; c <= cols; c++)
      for (let r = 0; r <= rows; r++) {
        const w = worldMm(grid[c][r]);
        expect(Number.isFinite(w[0] + w[1] + w[2])).toBe(true);
      }
  });

  // The centre lines are the rigid-by-construction dimensions: stations are
  // meridian-arc spaced (width) and each column walks the height as arc length.
  it('centre meridian length matches the stored width', () => {
    const centreMeridian = grid.map((col) => col[mid]);
    expect(Math.abs(edgeLen(centreMeridian) - width) / width).toBeLessThan(0.03);
  });

  it('centre column length matches the stored height', () => {
    expect(Math.abs(edgeLen(grid[mid]) - height) / height).toBeLessThan(0.03);
  });

  // The far edges cannot stay perfectly rigid across a pole (Gaussian curvature),
  // but they must NOT balloon into a full-circumference band/ring — the actual
  // user-visible regression. A ring would be ~2*pi*R (~9425mm); a rigid-ish edge
  // stays within a small multiple of the stored width.
  it('far width edges do not balloon into a ring', () => {
    const bottom = grid.map((col) => col[0]);
    const top = grid.map((col) => col[rows]);
    expect(edgeLen(bottom)).toBeLessThan(2 * width);
    expect(edgeLen(top)).toBeLessThan(2 * width);
  });

  it('side (height) edges stay close to the stored height', () => {
    expect(Math.abs(edgeLen(grid[0]) - height) / height).toBeLessThan(0.15);
    expect(Math.abs(edgeLen(grid[cols]) - height) / height).toBeLessThan(0.15);
  });
});

// ---------------------------------------------------------------------------
// (3) Mirror-match — (apex-eps, theta) and (apex-eps, theta+180) coincide
// ---------------------------------------------------------------------------

describe('surface-drape — pole-crossing mirror match', () => {
  it('footprints just short of the pole from opposite meridians cover the same points', () => {
    // eps must be genuinely tiny: near the pole a small AXIAL delta maps to a
    // large MERIDIAN-ARC delta (the meridian turns perpendicular to the axis),
    // so only a sub-micron axial offset keeps the two footprints coincident.
    const eps = 1e-3;
    const width = 800;
    const height = 600;
    const common = { R, D, L, widthMm: width, heightMm: height, cols: 24, rows: 24 };

    const a = buildDrapeGrid({ ...common, pos: L + D - eps, angleDeg: 90 }).grid;
    const b = buildDrapeGrid({ ...common, pos: L + D - eps, angleDeg: 270 }).grid;

    const cloudB: Array<[number, number, number]> = [];
    for (const col of b) for (const cell of col) cloudB.push(worldMm(cell));

    let maxNearest = 0;
    for (const col of a)
      for (const cell of col) {
        const p = worldMm(cell);
        let best = Infinity;
        for (const q of cloudB) best = Math.min(best, dist(p, q));
        maxNearest = Math.max(maxNearest, best);
      }

    // As eps -> 0 both rects tend to the same pole-centred footprint.
    expect(maxNearest).toBeLessThan(0.05 * Math.max(width, height));
  });
});

// ---------------------------------------------------------------------------
// (4) Cylinder identity — drape lattice equals the analytic (pos linear, v/R)
// ---------------------------------------------------------------------------

describe('surface-drape — cylinder identity', () => {
  it('a pure-cylinder rect equals the analytic lattice within float noise', () => {
    const profile = buildMeridianProfile(R, D);
    const pos = L / 2;
    const width = 400;
    const height = 300;
    const angle0 = 90;
    const cols = 32;
    const rows = 32;
    const mid = rows / 2;

    const { grid } = buildDrapeGrid({
      R,
      D,
      L,
      pos,
      angleDeg: angle0,
      widthMm: width,
      heightMm: height,
      cols,
      rows,
    });

    const s0 = arcFromAxial(profile, L, pos);
    for (let c = 0; c <= cols; c++) {
      const expectedPos = s0 + (c / cols - 0.5) * width;
      for (let r = 0; r <= rows; r++) {
        const v = ((r - mid) / mid) * (height / 2);
        const expectedAngle = angle0 + (v / R) * (180 / Math.PI);
        expect(Math.abs(grid[c][r].pos - expectedPos)).toBeLessThan(1e-6);
        expect(Math.abs(grid[c][r].angleDeg - ((expectedAngle % 360) + 360) % 360)).toBeLessThan(
          1e-6
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Sanity: apex arc is finite and the profile is usable
// ---------------------------------------------------------------------------

describe('surface-drape — profile sanity', () => {
  it('apex arc is finite and positive for a 2:1 head', () => {
    expect(domeArcLength(R, D)).toBeGreaterThan(0);
    expect(Number.isFinite(domeArcLength(R, D))).toBe(true);
  });
});
