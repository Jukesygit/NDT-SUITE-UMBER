// =============================================================================
// Vessel Modeler - Dome Scan Tangent-Plane Coordinate Math
// =============================================================================
// Pure, Three-free forward/inverse for the DOME SCAN grid mapping. The dome
// scan overlay (`engine/dome-scan-geometry.ts` `createDomeScanPlane`) lays the
// flat scan grid on the tangent plane at the scan centre `(centerPhi,
// centerTheta)` and central-projects each grid point radially onto the
// ellipsoid. This module reproduces that projection EXACTLY (forward) and
// inverts it (surface point -> tangent-plane offsets), so the annotation
// sampler can ask "which scan cell does the overlay draw at this surface
// point?" without duplicating the projection inline and without pulling Three
// into the sampler (keeps it worker-safe).
//
// Frame: dome-local mm coordinates, identical to createDomeScanPlane's basis
//   x = axial distance from the tangent line toward the apex (0 = TL, D = apex)
//   (y, z) = radial plane, with the vessel angle theta = atan2(y, z)
// This frame is orientation-independent: createDomeScanPlane applies the
// horizontal/vertical world axis swap only AFTER computing it, and the vessel
// `(pos, angle)` convention (body-frame.ts) collapses to the same theta in both
// orientations, so the inverse below needs no `isVertical` branch.
//
// The forward here is asserted byte-for-vertex against createDomeScanPlane in
// dome-tangent.test.ts, so the mirror can never drift silently.
//
// See: engine/dome-scan-geometry.ts (createDomeScanPlane L256-365),
//      docs/plans/2026-06-16-dome-scan-overlay-design.md.
// =============================================================================

const DEG2RAD = Math.PI / 180;

/**
 * Minimum polar angle in degrees for the scan centre — mirrors
 * `PHI_EPSILON` in dome-scan-geometry.ts (avoids the exact-apex singularity in
 * the tangent-plane basis). Duplicated as a bare number so this module stays
 * Three-free / worker-safe rather than importing the Three-carrying geometry.
 */
const PHI_EPSILON_DEG = 0.01;

/** Denominator guard for the central-projection inverse (grazing rays). */
const GRAZE_EPS = 1e-9;

type Vec3 = readonly [number, number, number];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// ---------------------------------------------------------------------------
// Tangent-plane basis at the scan centre
// ---------------------------------------------------------------------------

/**
 * Orthonormal tangent-plane basis at the scan centre, in dome-local mm coords.
 * `C` is the centre point on the ellipsoid; `uPhi` is the unit meridional
 * (index) tangent; `uTheta` the unit circumferential (scan) tangent. Mirrors
 * createDomeScanPlane L256-326, including the near-apex `uTheta` fallback.
 */
export interface DomeTangentBasis {
  C: Vec3;
  /** unit meridional (index-direction) tangent */
  uPhi: Vec3;
  /** unit circumferential (scan-direction) tangent */
  uTheta: Vec3;
}

/**
 * Build the tangent-plane basis for a head of radius `R`, depth `D` at scan
 * centre `(centerPhiDeg, centerThetaDeg)`.
 */
export function buildDomeTangentBasis(
  R: number,
  D: number,
  centerPhiDeg: number,
  centerThetaDeg: number
): DomeTangentBasis {
  const phiC = Math.max(PHI_EPSILON_DEG, centerPhiDeg) * DEG2RAD;
  const thetaC = centerThetaDeg * DEG2RAD;
  const cosPhi = Math.cos(phiC);
  const sinPhi = Math.sin(phiC);
  const cosTheta = Math.cos(thetaC);
  const sinTheta = Math.sin(thetaC);

  const C: Vec3 = [D * cosPhi, R * sinPhi * sinTheta, R * sinPhi * cosTheta];

  // dP/dphi — meridional tangent (index direction, toward equator)
  const ePhi: Vec3 = [-D * sinPhi, R * cosPhi * sinTheta, R * cosPhi * cosTheta];
  const phiLen = Math.sqrt(ePhi[0] ** 2 + ePhi[1] ** 2 + ePhi[2] ** 2);
  const uPhi: Vec3 = [ePhi[0] / phiLen, ePhi[1] / phiLen, ePhi[2] / phiLen];

  // dP/dtheta — circumferential tangent (scan direction), with the near-apex
  // degeneracy fallback identical to createDomeScanPlane.
  let eThetaY = R * sinPhi * cosTheta;
  let eThetaZ = -R * sinPhi * sinTheta;
  let thetaLen = Math.sqrt(eThetaY * eThetaY + eThetaZ * eThetaZ);
  if (thetaLen < 0.001) {
    eThetaY = -R * cosTheta;
    eThetaZ = R * sinTheta;
    thetaLen = R;
  }
  const uTheta: Vec3 = [0, eThetaY / thetaLen, eThetaZ / thetaLen];

  return { C, uPhi, uTheta };
}

// ---------------------------------------------------------------------------
// Central projection: tangent-plane offsets -> dome-local surface point
// ---------------------------------------------------------------------------

/**
 * Central-project a tangent-plane point `(scanMm, indexMm)` (offsets from the
 * scan centre along `uTheta` / `uPhi`) onto the ellipsoid, returning the
 * dome-local mm coordinate `[x, y, z]` (x = axial toward the apex, (y,z) = radial
 * plane). This is the single projection step shared by the surface-coordinate
 * conversion below AND the appendage dome-scan overlay geometry
 * (`createAppendageDomeScanPlane`), so the drawn mesh and the sampler project
 * identically for any head/closure — parameterised purely by `(R, D)`.
 */
export function tangentOffsetToDomeLocal(
  basis: DomeTangentBasis,
  R: number,
  D: number,
  scanMm: number,
  indexMm: number
): Vec3 {
  const { C, uPhi, uTheta } = basis;
  const px = C[0] + scanMm * uTheta[0] + indexMm * uPhi[0];
  const py = C[1] + scanMm * uTheta[1] + indexMm * uPhi[1];
  const pz = C[2] + scanMm * uTheta[2] + indexMm * uPhi[2];

  const denom = Math.sqrt((px * px) / (D * D) + (py * py + pz * pz) / (R * R));
  return [px / denom, py / denom, pz / denom];
}

// ---------------------------------------------------------------------------
// Forward: tangent-plane offsets -> surface (pos, angle)
// ---------------------------------------------------------------------------

/**
 * Central-project a tangent-plane point `(scanMm, indexMm)` (offsets from the
 * scan centre along `uTheta` / `uPhi`) onto the ellipsoid and return the vessel
 * surface coordinate `(pos, angle)`. Mirrors createDomeScanPlane L339-365.
 *
 * @param head 'left' | 'right' — selects the head sign and tangent line. An
 *   appendage closure is the 'right'-analog (apex outward, tangent line at the
 *   cylinder length), so callers pass `head: 'right'` with `L = cylinder length`.
 * @param L    tan-tan (cylinder) length in mm.
 */
export function tangentOffsetsToSurface(
  basis: DomeTangentBasis,
  R: number,
  D: number,
  L: number,
  head: 'left' | 'right',
  scanMm: number,
  indexMm: number
): { pos: number; angle: number } {
  const [sx, sy, sz] = tangentOffsetToDomeLocal(basis, R, D, scanMm, indexMm);

  const headSign = head === 'right' ? 1 : -1;
  const tangentLineMm = head === 'right' ? L : 0;
  const pos = tangentLineMm + headSign * sx;
  let angle = Math.atan2(sy, sz) / DEG2RAD;
  angle = ((angle % 360) + 360) % 360;
  return { pos, angle };
}

// ---------------------------------------------------------------------------
// Inverse: surface (pos, angle) -> tangent-plane offsets
// ---------------------------------------------------------------------------

/**
 * Invert {@link tangentOffsetsToSurface}: given a vessel surface point
 * `(posMm, angleDeg)` on the head, recover the tangent-plane offsets
 * `(scanMm, indexMm)` from the scan centre.
 *
 * Returns `null` when the point is on the shell side of the tangent line, past
 * the apex on the wrong axial side, or when the projection ray grazes the
 * tangent plane (both mean the point is not addressable by this scan grid).
 *
 * Method: the surface point `S` lies on the ellipsoid and its tangent-plane
 * pre-image `P` is colinear with `S` through the origin (that is what the
 * central projection is). `P = t·S` with `t` chosen so `P` lands on the plane
 * through `C` spanned by the orthonormal `{uTheta, uPhi}`. Then the offsets are
 * the components of `P − C` along that basis.
 */
export function surfaceToTangentOffsets(
  basis: DomeTangentBasis,
  R: number,
  D: number,
  L: number,
  head: 'left' | 'right',
  posMm: number,
  angleDeg: number
): { scanMm: number; indexMm: number } | null {
  const headSign = head === 'right' ? 1 : -1;
  const tangentLineMm = head === 'right' ? L : 0;

  // Axial distance from the tangent line toward the apex; must be on the head.
  const sxRaw = headSign * (posMm - tangentLineMm);
  if (sxRaw < 0) return null; // shell side of the tangent line
  const sx = Math.min(sxRaw, D); // clamp overshoot to the apex

  // Ellipsoid radius at this axial station (mirrors body-frame radiusAt clamp=1).
  const ratio = D > 0 ? Math.min(1, sx / D) : 1;
  const rLocal = R * Math.sqrt(Math.max(0, 1 - ratio * ratio));

  const angleRad = angleDeg * DEG2RAD;
  const S: Vec3 = [sx, rLocal * Math.sin(angleRad), rLocal * Math.cos(angleRad)];

  const { C, uPhi, uTheta } = basis;
  const n = cross(uTheta, uPhi); // unit plane normal ({uTheta,uPhi} orthonormal)

  const sDotN = dot(S, n);
  if (Math.abs(sDotN) < GRAZE_EPS) return null;
  const t = dot(C, n) / sDotN;
  if (t <= 0) return null; // projects behind the ellipsoid centre

  const d: Vec3 = [t * S[0] - C[0], t * S[1] - C[1], t * S[2] - C[2]];
  return { scanMm: dot(d, uTheta), indexMm: dot(d, uPhi) };
}
