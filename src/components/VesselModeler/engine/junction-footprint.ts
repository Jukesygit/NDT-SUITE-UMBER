// =============================================================================
// Vessel Modeler - Junction Footprint (pure math)
// =============================================================================
// Exact footprint of a perpendicular appendage cylinder (outer radius r) mounted
// on the main shell (outer radius R) at (mountPos mm, mountAngle deg), expressed
// in the main shell's DEVELOPED coordinates (matching coverage-calculator.ts):
//   pos   = mm from the left tangent line
//   angle = degrees around the shell, 90 = TDC
//
// The junction curve is the EXACT perpendicular cylinder-on-cylinder
// intersection (design §16 review decision — no ellipse approximation).
// Parameterised by the appendage angle theta in [0, 2*pi):
//   u(theta)   = r * sin(theta)                 // axial offset from mountPos (mm)
//   phi(theta) = asin( (r * cos(theta)) / R )   // circumferential offset from
//                                               // mountAngle (radians)
// so at an axial offset u the circumferential half-width is
//   phi(u) = asin( sqrt(r^2 - u^2) / R ) .
//
// The excluded SHELL area uses the true shell surface element dA = R * dphi * du:
//   areaMm2 = integral_{-r}^{r} 2 * R * asin( sqrt(r^2 - u^2) / R ) du .
// This module evaluates that identical integral via the smooth substitution
// u = r * sin(psi) (which removes the sqrt endpoint singularity, giving a
// C-infinity integrand and full-order Simpson convergence) with a fine Simpson
// rule (>= 2048 intervals).
//
// Pure module: imports TYPES ONLY (no THREE). See design:
// docs/plans/2026-07-21-secondary-appendage-body-design.md §9, §16.
// =============================================================================

import type { AppendageConfig, VesselState } from '../types';

const RAD2DEG = 180 / Math.PI;

/**
 * The appendage radius may approach but never reach the shell radius, mirroring
 * appendage-geometry.ts's penetration clamp (`Math.min(radiusMm, mainRadius *
 * 0.999)`). Keeps asin(r/R) strictly below asin(1) so the intersection stays
 * well-defined (finite, no NaN) as r -> R.
 */
const MAX_RADIUS_RATIO = 0.999;

/** Boundary polyline sample count (design requires >= 128); the loop is closed. */
const BOUNDARY_SEGMENTS = 256;

/** Simpson intervals for the excluded-area integral (even; design requires >= 2048). */
const AREA_INTERVALS = 4096;

/**
 * Footprint of a perpendicular appendage on the main shell, in developed coords.
 */
export interface JunctionFootprint {
  /** Owning appendage id (mirrors AppendageConfig.id). */
  appendageId: string;
  /**
   * True when a developed-coordinate cell (posMm from the left tangent, angleDeg
   * with 90 = TDC) lies inside the junction footprint. Wrap-safe: it uses the
   * shortest angular distance from mountAngle, so a footprint straddling the
   * 0°/360° seam is handled correctly.
   */
  containsCell(posMm: number, angleDeg: number): boolean;
  /** True excluded shell surface area in mm². */
  areaMm2: number;
  /** Closed developed-coordinate polyline of the junction curve. */
  boundary: Array<{ pos: number; angle: number }>;
}

/** Normalize a degree value into the [0, 360) range. */
function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Shortest absolute angular distance (deg) between two shell angles. */
function angularDistanceDeg(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a - b));
  return Math.min(d, 360 - d);
}

/** Clamp the raw appendage radius so it stays strictly below the shell radius. */
function clampRadius(shellRadiusMm: number, rawRadiusMm: number): number {
  return Math.min(rawRadiusMm, shellRadiusMm * MAX_RADIUS_RATIO);
}

/**
 * Excluded shell area (mm²) for a clamped appendage radius r on shell radius R.
 *
 * Evaluates  ∫_{-r}^{r} 2R·asin(sqrt(r²-u²)/R) du  via the substitution
 * u = r·sin(psi):
 *   = ∫_{-pi/2}^{pi/2} 2R·r·cos(psi)·asin((r/R)·cos(psi)) dpsi
 * The integrand is even in psi, so composite Simpson runs over [0, pi/2] and the
 * result is doubled.
 */
function excludedAreaMm2(shellRadiusMm: number, radiusMm: number): number {
  const R = shellRadiusMm;
  const r = radiusMm;
  if (!(R > 0) || !(r > 0)) return 0;

  const ratio = r / R;
  const n = AREA_INTERVALS; // even
  const h = Math.PI / 2 / n;

  const integrand = (psi: number): number => {
    const c = Math.cos(psi);
    return 2 * R * r * c * Math.asin(ratio * c);
  };

  let sum = integrand(0) + integrand(Math.PI / 2);
  for (let i = 1; i < n; i++) {
    sum += (i % 2 === 0 ? 2 : 4) * integrand(i * h);
  }
  const halfIntegral = (h / 3) * sum;
  return 2 * halfIntegral;
}

/**
 * Build the junction footprint for a single appendage on a shell of the given
 * outer radius. `appendage` need only carry the four geometric fields.
 */
export function buildJunctionFootprint(
  shellRadiusMm: number,
  appendage: Pick<AppendageConfig, 'id' | 'mountPos' | 'mountAngle' | 'diameter'>
): JunctionFootprint {
  const R = shellRadiusMm;
  const r = clampRadius(R, appendage.diameter / 2);
  const { mountPos, mountAngle, id } = appendage;

  const degenerate = !(R > 0) || !(r > 0);

  // -- Excluded shell area --------------------------------------------------
  const areaMm2 = degenerate ? 0 : excludedAreaMm2(R, r);

  // -- Closed boundary polyline (developed coords) --------------------------
  const boundary: Array<{ pos: number; angle: number }> = [];
  if (!degenerate) {
    for (let i = 0; i < BOUNDARY_SEGMENTS; i++) {
      const theta = (i / BOUNDARY_SEGMENTS) * 2 * Math.PI;
      const u = r * Math.sin(theta);
      const phiRad = Math.asin((r * Math.cos(theta)) / R);
      boundary.push({
        pos: mountPos + u,
        angle: normalizeDeg(mountAngle + phiRad * RAD2DEG),
      });
    }
    // Close the loop explicitly (last point == first point).
    boundary.push({ ...boundary[0] });
  }

  // -- Membership predicate -------------------------------------------------
  const r2 = r * r;
  function containsCell(posMm: number, angleDeg: number): boolean {
    if (degenerate) return false;
    const u = posMm - mountPos;
    if (Math.abs(u) > r) return false; // outside the axial extent
    const chord = Math.sqrt(Math.max(0, r2 - u * u));
    const phiMaxDeg = Math.asin(chord / R) * RAD2DEG; // circumferential half-width
    return angularDistanceDeg(angleDeg, mountAngle) <= phiMaxDeg;
  }

  return { appendageId: id, containsCell, areaMm2, boundary };
}

/**
 * Build a footprint for every appendage on the vessel, one per appendage, with
 * `appendageId` matching each `AppendageConfig.id`.
 */
export function buildAllFootprints(state: VesselState): JunctionFootprint[] {
  const shellRadiusMm = state.id / 2;
  return state.appendages.map((appendage) => buildJunctionFootprint(shellRadiusMm, appendage));
}
