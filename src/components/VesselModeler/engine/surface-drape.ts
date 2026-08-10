// =============================================================================
// Vessel Modeler - Rigid Surface Drape (geodesic stencil)
// =============================================================================
// Pure, Three-free builder that drapes a rectangle onto the vessel body as a
// RIGID stencil: its lateral edges follow geodesics (not circles of latitude),
// so a rect keeps its shape on a dome end and can slide THROUGH the pole
// seamlessly. Returns SURFACE COORDINATES (pos mm, angle deg) only — world
// placement stays single-sourced through body-frame.ts `surfacePoint`, so this
// module never touches Three.js.
//
// Model (design: 2026-07-24-annotation-dome-mapping-design.md, Addendum 2):
//   - Centre meridian, extended THROUGH the pole: stations run u in [-w/2,+w/2]
//     of meridian arc from the rect centre. A station past an apex arc REFLECTS
//     through the pole onto the antipodal meridian (angle + 180), giving smooth
//     pole crossing (the meridian is C1 there).
//   - Lateral placement per station: walk +-v (up to h/2) perpendicular to the
//     meridian.
//       * Cylinder station (0 <= axial <= L): analytic — angle offset = v / R
//         (the geodesic there; keeps on-shell output byte-identical to legacy).
//       * Head station: integrate the surface-of-revolution geodesic in the
//         meridian-arc metric ds^2 = dm^2 + r(m)^2 dtheta^2 (m == the dome-arc
//         `s` coordinate, which IS meridian arc length), RK4 in arc length,
//         launched perpendicular (psi = +-90 deg). The metric is C1 across the
//         tangent line, so a walk that reaches the cylinder continues as the
//         correct helix with no special-casing.
//       * Pole station (r < epsilon): the lateral curve degenerates to the
//         meridian pair at angle0 +- 90; walk v as meridian arc from the pole.
//
// The lateral +v world-side is tied to the meridian's reflected/unreflected
// state (latSign) so the +v and -v edges stay continuous across the pole; the
// mirror-match test in surface-drape.test.ts is the oracle for that bookkeeping.
// =============================================================================

import {
  buildMeridianProfile,
  arcFromAxial,
  axialFromArc,
  displayRadiusAtArc,
  type MeridianProfile,
} from './dome-arc';

const HALF_PI = Math.PI / 2;
const RAD2DEG = 180 / Math.PI;
/** Denominator guard for the geodesic ODE; walks move away from the pole, so a
 *  station this close to the axis is handled by the explicit pole branch. */
const EPS_R = 1e-6;
/** Max RK4 sub-steps per outer step (bounds cost while taming near-pole stiffness). */
const SUB_MAX = 64;

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** A single draped grid vertex, in surface coordinates. */
export interface DrapeCell {
  /** Axial position in mm from the left tangent line (feeds shellPoint). */
  pos: number;
  /** Circumferential angle in degrees, normalized to [0, 360). */
  angleDeg: number;
}

export interface DrapeGridParams {
  /** Body radius (mm). */
  R: number;
  /** Head depth (mm); 0 for a flat/open closure. */
  D: number;
  /** Tan-tan / cylinder length (mm). */
  L: number;
  /** Rect centre axial position (mm from left tangent line). */
  pos: number;
  /** Rect centre circumferential angle (deg). */
  angleDeg: number;
  /** Rect extent along the meridian arc (mm). */
  widthMm: number;
  /** Rect extent around the circumference (mm). */
  heightMm: number;
  /** Station columns along the meridian = cols + 1. */
  cols: number;
  /** Lateral samples per column = rows + 1 (rows must be even). */
  rows: number;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Normalize a degree value into [0, 360). */
function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Near-pole radius threshold below which a station uses the meridian-pair walk. */
function poleEps(R: number): number {
  return Math.max(0.5, 0.005 * R);
}

/**
 * Local radius `r(m)` and its meridian-arc derivative `dr/dm` at meridian-arc
 * coordinate `sArc`. `m == sArc` because the dome-arc `s` coordinate is measured
 * as true meridian arc length, so the surface metric is ds^2 = dm^2 + r^2
 * dtheta^2 and `dr/dm` is exactly the meridian slope. Cylinder region: r = R,
 * dr/dm = 0 (so the geodesic ODE reduces to a helix). Head region: derived from
 * phi via r = R cos(phi), giving dr/dm = -+ R sin(phi) / sqrt(E).
 */
function meridianDeriv(
  profile: MeridianProfile,
  L: number,
  sArc: number
): { r: number; drdm: number } {
  const { R, D } = profile;
  const r = displayRadiusAtArc(profile, L, sArc);
  if (!(D > 0) || (sArc >= 0 && sArc <= L)) return { r, drdm: 0 };
  const cosphi = Math.min(1, Math.max(0, r / R));
  const sinphi = Math.sqrt(Math.max(0, 1 - cosphi * cosphi));
  const E = Math.sqrt((D * cosphi) ** 2 + (R * sinphi) ** 2);
  const mag = E > 1e-12 ? (R * sinphi) / E : 0;
  // Right head: r decreases as sArc increases toward the pole (drdm < 0).
  // Left head: r increases as sArc increases toward the tangent line (drdm > 0).
  return { r, drdm: sArc > L ? -mag : mag };
}

/**
 * Reflect an extended meridian-arc coordinate into the valid body band
 * [-apexArc, L + apexArc]. Each reflection off a pole flips the meridian angle
 * by 180 deg (`flip`), so a station past the apex continues down the antipodal
 * meridian — the mechanism that makes pole crossing seamless.
 */
function reflectExtendedArc(
  sExt: number,
  L: number,
  apexArc: number
): { arc: number; flip: boolean } {
  const sL = -apexArc;
  const sR = L + apexArc;
  let s = sExt;
  let flip = false;
  let guard = 0;
  while ((s > sR || s < sL) && guard++ < 1000) {
    if (s > sR) s = 2 * sR - s;
    else s = 2 * sL - s;
    flip = !flip;
  }
  return { arc: Math.max(sL, Math.min(sR, s)), flip };
}

// ---------------------------------------------------------------------------
// Geodesic integrator (arc-length parametrized, meridian-arc metric)
// ---------------------------------------------------------------------------
//
// State y = (sArc, theta, psi) where psi is the heading measured from the
// meridian (+m) direction. Derivatives (theta does not enter the RHS):
//   dsArc/dsigma = cos(psi)
//   dtheta/dsigma = sin(psi) / r
//   dpsi/dsigma   = -(dr/dm) sin(psi) / r
// launched with psi = +-90 deg (perpendicular to the meridian).

function deriv(
  profile: MeridianProfile,
  L: number,
  sArc: number,
  psi: number
): [number, number, number] {
  const { r, drdm } = meridianDeriv(profile, L, sArc);
  const rr = Math.max(r, EPS_R);
  const sp = Math.sin(psi);
  const cp = Math.cos(psi);
  return [cp, sp / rr, (-drdm * sp) / rr];
}

function rk4Step(
  profile: MeridianProfile,
  L: number,
  s: number,
  th: number,
  psi: number,
  h: number
): [number, number, number] {
  const k1 = deriv(profile, L, s, psi);
  const k2 = deriv(profile, L, s + 0.5 * h * k1[0], psi + 0.5 * h * k1[2]);
  const k3 = deriv(profile, L, s + 0.5 * h * k2[0], psi + 0.5 * h * k2[2]);
  const k4 = deriv(profile, L, s + h * k3[0], psi + h * k3[2]);
  return [
    s + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    th + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    psi + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
  ];
}

/**
 * Walk one lateral half from a station: integrate the geodesic over arc length
 * `halfLen` in `halfSteps` outer steps, adaptively sub-dividing each outer step
 * so the near-pole stiffness (large dtheta/dsigma at small r) stays resolved.
 * Records (sArc, theta) after each outer step -> `halfSteps` samples.
 */
function walkSide(
  profile: MeridianProfile,
  L: number,
  stationArc: number,
  halfLen: number,
  halfSteps: number,
  psi0: number
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let s = stationArc;
  let th = 0;
  let psi = psi0;
  const outer = halfLen / halfSteps;
  for (let k = 0; k < halfSteps; k++) {
    const { r } = meridianDeriv(profile, L, s);
    let sub = Math.ceil(outer / (0.25 * Math.max(r, 1e-3)));
    if (!Number.isFinite(sub) || sub < 1) sub = 1;
    if (sub > SUB_MAX) sub = SUB_MAX;
    const dsig = outer / sub;
    for (let j = 0; j < sub; j++) {
      [s, th, psi] = rk4Step(profile, L, s, th, psi, dsig);
    }
    out.push([s, th]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Column + grid construction
// ---------------------------------------------------------------------------

/**
 * Build one station column: `rows + 1` lateral samples from -h/2 to +h/2, with
 * the centre (row = rows/2) at the station itself. `flip` marks a station that
 * reflected onto the antipodal meridian; `latSign` flips the lateral direction
 * accordingly so the +v / -v edges stay continuous across the pole.
 */
function buildColumn(
  profile: MeridianProfile,
  L: number,
  R: number,
  stationArc: number,
  angle0Deg: number,
  flip: boolean,
  halfH: number,
  rows: number
): DrapeCell[] {
  const col: DrapeCell[] = new Array(rows + 1);
  const mid = rows >> 1;
  // A reflected station lives on the antipodal meridian (base angle + 180); its
  // lateral direction also flips (latSign) so the +v/-v edges stay continuous
  // across the pole. Both changes together are what makes the mirror-match hold.
  const latSign = flip ? -1 : 1;
  const baseAngle = flip ? angle0Deg + 180 : angle0Deg;
  const r0 = displayRadiusAtArc(profile, L, stationArc);
  const onCyl = stationArc >= 0 && stationArc <= L;
  const atPole = r0 < poleEps(R);

  col[mid] = { pos: axialFromArc(profile, L, stationArc), angleDeg: norm360(baseAngle) };

  for (const side of [1, -1] as const) {
    if (onCyl) {
      // Analytic circle of latitude — geodesic on the cylinder, byte-identical
      // to the legacy constant-span formula (angle offset = v / R).
      for (let k = 1; k <= mid; k++) {
        const v = (k / mid) * halfH;
        const ang = baseAngle + side * latSign * (v / R) * RAD2DEG;
        col[mid + side * k] = { pos: stationArc, angleDeg: norm360(ang) };
      }
    } else if (atPole) {
      // At/near the pole the lateral curve is the perpendicular meridian pair
      // (base angle +- 90); walk v as meridian arc from the pole.
      const poleArc = stationArc > L ? L + profile.apexArc : -profile.apexArc;
      const meridianAngle = baseAngle + side * latSign * 90;
      for (let k = 1; k <= mid; k++) {
        const v = (k / mid) * halfH;
        col[mid + side * k] = {
          pos: axialFromArc(profile, L, poleArc - v),
          angleDeg: norm360(meridianAngle),
        };
      }
    } else {
      // Head station: integrate the true geodesic perpendicular to the meridian.
      const psi0 = side === 1 ? latSign * HALF_PI : -latSign * HALF_PI;
      const samples = walkSide(profile, L, stationArc, halfH, mid, psi0);
      for (let k = 1; k <= mid; k++) {
        const [sArc, th] = samples[k - 1];
        col[mid + side * k] = {
          pos: axialFromArc(profile, L, sArc),
          angleDeg: norm360(baseAngle + th * RAD2DEG),
        };
      }
    }
  }

  return col;
}

/**
 * Drape a rectangle onto the body surface as a rigid geodesic stencil. Returns
 * `grid[col][row]` surface coordinates: `cols + 1` station columns along the
 * meridian (width), `rows + 1` lateral samples per column (height). Every vertex
 * is a (pos, angleDeg) pair to be placed by the caller through body-frame's
 * `surfacePoint`, so world placement is never duplicated here.
 */
export function buildDrapeGrid(params: DrapeGridParams): { grid: DrapeCell[][] } {
  const { R, D, L, pos, angleDeg, widthMm, heightMm, cols, rows } = params;
  const profile = buildMeridianProfile(R, D);
  const s0 = arcFromAxial(profile, L, pos);
  const halfH = heightMm / 2;

  const grid: DrapeCell[][] = new Array(cols + 1);
  for (let c = 0; c <= cols; c++) {
    const frac = cols > 0 ? c / cols : 0.5;
    const sExt = s0 + (frac - 0.5) * widthMm;
    const { arc, flip } = reflectExtendedArc(sExt, L, profile.apexArc);
    grid[c] = buildColumn(profile, L, R, arc, angleDeg, flip, halfH, rows);
  }
  return { grid };
}

// ---------------------------------------------------------------------------
// Test oracle
// ---------------------------------------------------------------------------

/**
 * Single lateral geodesic endpoint from a station, launched perpendicular to the
 * meridian. Exposed so tests can validate the ODE sign convention against the
 * analytic great circle on a sphere. `psiSign` = +1 (theta-increasing side) or
 * -1. Returns the walked endpoint's axial position and its angular offset (deg)
 * from the station meridian.
 */
export function lateralGeodesicEndpoint(
  profile: MeridianProfile,
  L: number,
  stationArc: number,
  walkArc: number,
  psiSign: number
): { pos: number; deltaAngleDeg: number } {
  const samples = walkSide(profile, L, stationArc, walkArc, 32, psiSign * HALF_PI);
  const [sArc, th] = samples[samples.length - 1];
  return { pos: axialFromArc(profile, L, sArc), deltaAngleDeg: th * RAD2DEG };
}
