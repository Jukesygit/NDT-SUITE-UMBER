// =============================================================================
// Vessel Modeler - Dome Meridian Arc-Length Math
// =============================================================================
// Pure, Three-free helpers that reparametrize an ellipsoidal head by the
// arc length `s` measured along its meridian. They exist so annotations (and,
// later, appendage dished closures) can be sized in TRUE surface millimetres
// on a dome end instead of raw axial millimetres — while the stored schema
// keeps using axial `pos`.
//
// Meridian parametrized by phi in [0, pi/2] (0 = tangent line, pi/2 = apex):
//   axial-past-TL  u(phi) = D * sin(phi)      (mm past the tangent line)
//   local radius   r(phi) = R * cos(phi)      (cylindrical radius)
//   ds/dphi               = sqrt( (D*cos(phi))^2 + (R*sin(phi))^2 )
//
// The `s` coordinate is continuous across the whole body:
//   s in [0, L]  -> the cylinder, s === axial pos.
//   s < 0        -> the left head  (s = -arc(|axial|)).
//   s > L        -> the right head (s = L + arc(axial - L)).
//
// CRITICAL: `displayRadiusAtArc` reproduces body-frame.ts `radiusAt` EXACTLY,
// including its ratio clamp — now 1 (not 0.99), so the profile reaches the true
// pole (radius 0) at the apex in lock-step with body-frame. This keeps the
// circumferential-span math in agreement with where `shellPoint` actually
// places vertices right up to the pole (no flare mismatch, no forbidden disk).
//
// See design: docs/plans/2026-07-24-annotation-dome-mapping-design.md.
// =============================================================================

/**
 * Ratio clamp mirrored from body-frame.ts `radiusAt`. Clamped at 1 so the
 * profile reaches the true pole (radius 0) at the apex, in lock-step with
 * body-frame; the former 0.99 floor left a forbidden ~0.141*R disk at each apex.
 */
const RADIUS_RATIO_CLAMP = 1;

/** Meridian sample count (>= 128 per design; dense enough for <2% mesh fidelity). */
const SAMPLES = 512;

/**
 * Cached meridian profile for one (R, D) pair. The two internal tables are
 * strictly monotone (phi ascending), so `u <-> s` interpolation is invertible.
 */
export interface MeridianProfile {
  /** Body radius in mm. */
  readonly R: number;
  /** Head depth in mm (0 = no curved head). */
  readonly D: number;
  /** Total quarter-meridian arc length (tangent line -> apex), mm. */
  readonly apexArc: number;
  /** Axial-past-TL samples u = D*sin(phi), ascending 0..D. */
  readonly u: readonly number[];
  /** Cumulative arc samples, ascending 0..apexArc. */
  readonly s: readonly number[];
}

// ---------------------------------------------------------------------------
// Profile construction (cached per R:D)
// ---------------------------------------------------------------------------

const profileCache = new Map<string, MeridianProfile>();

/** Meridian arc-length integrand ds/dphi. */
function dsdphi(phi: number, R: number, D: number): number {
  const c = D * Math.cos(phi);
  const s = R * Math.sin(phi);
  return Math.sqrt(c * c + s * s);
}

/**
 * Build (or fetch from cache) the cumulative arc-length profile for a head of
 * radius `R` and depth `D`. For `D <= 0` (flat/open closure) returns a
 * degenerate profile whose helpers fall back to axial identity / radius R.
 */
export function buildMeridianProfile(R: number, D: number): MeridianProfile {
  const key = `${R}:${D}`;
  const cached = profileCache.get(key);
  if (cached) return cached;

  let profile: MeridianProfile;
  if (!(D > 0) || !(R > 0)) {
    profile = { R, D, apexArc: 0, u: [0], s: [0] };
  } else {
    const u: number[] = new Array(SAMPLES + 1);
    const s: number[] = new Array(SAMPLES + 1);
    u[0] = 0;
    s[0] = 0;
    let acc = 0;
    let prevDs = dsdphi(0, R, D);
    let prevPhi = 0;
    for (let i = 1; i <= SAMPLES; i++) {
      const phi = (i / SAMPLES) * (Math.PI / 2);
      const ds = dsdphi(phi, R, D);
      // Cumulative trapezoid — guaranteed monotone since ds/dphi > 0.
      acc += 0.5 * (prevDs + ds) * (phi - prevPhi);
      u[i] = D * Math.sin(phi);
      s[i] = acc;
      prevDs = ds;
      prevPhi = phi;
    }
    profile = { R, D, apexArc: s[SAMPLES], u, s };
  }

  profileCache.set(key, profile);
  return profile;
}

/** Total quarter-meridian arc length for a head of radius `R`, depth `D`. */
export function domeArcLength(R: number, D: number): number {
  return buildMeridianProfile(R, D).apexArc;
}

// ---------------------------------------------------------------------------
// Monotone table interpolation
// ---------------------------------------------------------------------------

/**
 * Linear interpolation of `ys` against a strictly-ascending `xs`, clamped to
 * the sampled range. Forward (u->s) and inverse (s->u) calls land in the same
 * interval for a given phi, so `axialFromArc(arcFromAxial(pos))` is an EXACT
 * identity within the head (no accumulated interpolation drift).
 */
function interpAscending(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (n === 1) return ys[0];
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  const t = span > 0 ? (x - xs[lo]) / span : 0;
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

/** Head arc length for an axial distance `a` (>= 0) past the tangent line. */
function headArcFromAxialPastTL(profile: MeridianProfile, a: number): number {
  if (!(profile.D > 0)) return a; // degenerate flat closure: identity fallback
  return interpAscending(profile.u, profile.s, Math.min(Math.max(a, 0), profile.D));
}

/** Axial distance past the tangent line for a head arc length `arcLen` (>= 0). */
function axialPastTLFromHeadArc(profile: MeridianProfile, arcLen: number): number {
  if (!(profile.D > 0)) return arcLen; // degenerate flat closure: identity fallback
  return interpAscending(profile.s, profile.u, Math.min(Math.max(arcLen, 0), profile.apexArc));
}

// ---------------------------------------------------------------------------
// Public arc <-> axial mapping
// ---------------------------------------------------------------------------

/**
 * Axial position (mm from left tangent line) -> meridian arc coordinate `s`.
 * Identity on the cylinder; continues along the meridian past both tangent
 * lines. Axial overshoot past an apex (|axial-past-TL| > D) clamps to the apex
 * arc.
 */
export function arcFromAxial(profile: MeridianProfile, L: number, posMm: number): number {
  if (posMm >= 0 && posMm <= L) return posMm;
  if (posMm < 0) return -headArcFromAxialPastTL(profile, -posMm);
  return L + headArcFromAxialPastTL(profile, posMm - L);
}

/**
 * Meridian arc coordinate `s` -> axial position (mm). Inverse of
 * {@link arcFromAxial}; clamps at the apex arc on both ends.
 */
export function axialFromArc(profile: MeridianProfile, L: number, sMm: number): number {
  if (sMm >= 0 && sMm <= L) return sMm;
  if (sMm < 0) return -axialPastTLFromHeadArc(profile, -sMm);
  return L + axialPastTLFromHeadArc(profile, sMm - L);
}

/**
 * Display radius the renderer will actually use at arc coordinate `s`.
 *
 * MUST equal body-frame.ts `radiusAt(axialFromArc(s))` exactly, INCLUDING the
 * ratio clamp — now 1, so the profile reaches the true pole (radius 0) at the
 * apex — otherwise the per-station circumferential span would disagree with
 * where `shellPoint` places vertices near the apex.
 */
export function displayRadiusAtArc(profile: MeridianProfile, L: number, sMm: number): number {
  if (!(profile.D > 0)) return profile.R;
  const axial = axialFromArc(profile, L, sMm);
  let u = 0;
  if (axial < 0) u = -axial;
  else if (axial > L) u = axial - L;
  const ratio = Math.min(RADIUS_RATIO_CLAMP, Math.abs(u) / profile.D);
  return profile.R * Math.sqrt(1 - ratio * ratio);
}
