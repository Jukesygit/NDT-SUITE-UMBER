// =============================================================================
// Vessel Modeler - Body Frame (SurfaceFrame)
// =============================================================================
// Single source of truth for all (pos, angle) <-> world coordinate math on a
// vessel body. A body is either the main shell or a perpendicular appendage
// (sump/boot/riser). Every consumer that places, orients, or inverts a point on
// a body surface must go through a SurfaceFrame so the forward (build) and
// inverse (drag) paths can never drift apart.
//
// The main-shell frame reproduces the legacy math EXACTLY:
//   - surfacePoint  <- shellPoint()          (annotation-geometry.ts)
//   - surfaceNormal <- nozzle-mount normal   (vessel-geometry.ts L436-533)
// so it can replace those code paths with zero behavioural change (locked by
// the equivalence grid in body-frame.test.ts before any consumer migrates).
//
// See design: docs/plans/2026-07-21-secondary-appendage-body-design.md §6.
// =============================================================================

import * as THREE from 'three';
import type { VesselState } from '../types';
import { SCALE } from './materials';

const DEG2RAD = Math.PI / 180;

/** Normalize a degree value into the [0, 360) range. */
function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

// ---------------------------------------------------------------------------
// SurfaceFrame — the cornerstone abstraction
// ---------------------------------------------------------------------------

export interface SurfaceFrame {
  /** undefined = main shell; otherwise the appendage id */
  bodyId: string | undefined;
  /** body radius in mm */
  radius: number;
  /** tan-tan length (main) or cylinder length (appendage), in mm */
  axialLength: number;
  /** ellipsoidal head depth in mm; 0 for flat/open closures */
  headDepth: number;
  kind: 'main' | 'appendage';
  /** (posMm, angleDeg, radialOffsetMm) -> world point (SCALE applied) */
  surfacePoint(posMm: number, angleDeg: number, offsetMm?: number): THREE.Vector3;
  /** outward unit surface normal at (posMm, angleDeg) */
  surfaceNormal(posMm: number, angleDeg: number): THREE.Vector3;
  /** world point -> { pos (mm), angle (deg, [0,360)) } — the ONE inverse used by all drag handlers */
  toLocal(worldPoint: THREE.Vector3): { pos: number; angle: number };
}

/**
 * Parameters describing an appendage body, mirroring the (Phase 1) AppendageConfig
 * fields the frame needs. Kept local so Phase 0 does not add AppendageConfig to
 * types.ts prematurely.
 */
export interface AppendageFrameParams {
  /** Mount point on the main shell: mm from left tangent line */
  mountPos: number;
  /** Mount clock angle on the main shell: degrees, 90 = top */
  mountAngle: number;
  /** Inner diameter in mm */
  diameter: number;
  /** Cylinder length in mm (from main-shell surface to end-closure tangent) */
  length: number;
  endClosure: 'dished' | 'flat' | 'open';
  /** Head ratio for a dished closure (default 2.0); ignored otherwise */
  headRatio?: number;
}

// ---------------------------------------------------------------------------
// Main-shell frame
// ---------------------------------------------------------------------------

/**
 * Build the SurfaceFrame for the main vessel shell.
 *
 * `surfacePoint` is a line-for-line reproduction of `shellPoint()` and
 * `surfaceNormal` reproduces the nozzle-mount normal math, so a migrated
 * consumer is byte-identical to the legacy path.
 */
function buildMainFrame(state: VesselState): SurfaceFrame {
  const RADIUS = state.id / 2;
  const TAN_TAN = state.length;
  const HEAD_DEPTH = state.id / (2 * state.headRatio);
  const isVertical = state.orientation === 'vertical';

  /**
   * Cylindrical radius at an axial position (mirrors shellPoint). The head ratio
   * clamps at 1 (not 0.99), so the surface reaches the true pole (radius 0) at
   * the apex. The former 0.99 floor bottomed the radius out at ~0.141*R, leaving
   * a forbidden disk at each apex that coverage/annotation rects could not touch;
   * clamping at 1 lets the meridian close all the way to the pole.
   */
  function radiusAt(posMm: number): number {
    if (posMm < 0) {
      const ratio = Math.min(1, Math.abs(posMm / HEAD_DEPTH));
      return RADIUS * Math.sqrt(1 - ratio * ratio);
    }
    if (posMm > TAN_TAN) {
      const ratio = Math.min(1, Math.abs((posMm - TAN_TAN) / HEAD_DEPTH));
      return RADIUS * Math.sqrt(1 - ratio * ratio);
    }
    return RADIUS;
  }

  function surfacePoint(posMm: number, angleDeg: number, offsetMm = 0): THREE.Vector3 {
    const angleRad = angleDeg * DEG2RAD;
    const posGlobal = (posMm - TAN_TAN / 2) * SCALE;
    const r = (radiusAt(posMm) + offsetMm) * SCALE;

    if (isVertical) {
      return new THREE.Vector3(r * Math.cos(angleRad), posGlobal, r * Math.sin(angleRad));
    }
    return new THREE.Vector3(posGlobal, r * Math.sin(angleRad), r * Math.cos(angleRad));
  }

  function surfaceNormal(posMm: number, angleDeg: number): THREE.Vector3 {
    const rad = angleDeg * DEG2RAD;
    const normal = new THREE.Vector3();

    if (isVertical) {
      if (posMm < 0 || posMm > TAN_TAN) {
        // Head (ellipsoid): gradient normal. Nozzle math uses Math.min(1, ...).
        const yLocal = posMm < 0 ? posMm : posMm - TAN_TAN;
        const ratio = Math.min(1, Math.abs(yLocal / HEAD_DEPTH));
        const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
        const xU = rLocal * Math.cos(rad);
        const zU = rLocal * Math.sin(rad);
        normal
          .set(xU / (RADIUS * RADIUS), yLocal / (HEAD_DEPTH * HEAD_DEPTH), zU / (RADIUS * RADIUS))
          .normalize();
      } else {
        normal.set(Math.cos(rad), 0, Math.sin(rad)).normalize();
      }
    } else {
      if (posMm < 0 || posMm > TAN_TAN) {
        const xLocal = posMm < 0 ? posMm : posMm - TAN_TAN;
        const ratio = Math.min(1, Math.abs(xLocal / HEAD_DEPTH));
        const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
        const yU = rLocal * Math.sin(rad);
        const zU = rLocal * Math.cos(rad);
        normal
          .set(xLocal / (HEAD_DEPTH * HEAD_DEPTH), yU / (RADIUS * RADIUS), zU / (RADIUS * RADIUS))
          .normalize();
      } else {
        normal.set(0, Math.sin(rad), Math.cos(rad)).normalize();
      }
    }
    return normal;
  }

  function toLocal(worldPoint: THREE.Vector3): { pos: number; angle: number } {
    if (isVertical) {
      // point = (r cos, posGlobal, r sin)
      const pos = worldPoint.y / SCALE + TAN_TAN / 2;
      const angle = normalizeDeg(Math.atan2(worldPoint.z, worldPoint.x) / DEG2RAD);
      return { pos, angle };
    }
    // point = (posGlobal, r sin, r cos)
    const pos = worldPoint.x / SCALE + TAN_TAN / 2;
    const angle = normalizeDeg(Math.atan2(worldPoint.y, worldPoint.z) / DEG2RAD);
    return { pos, angle };
  }

  return {
    bodyId: undefined,
    radius: RADIUS,
    axialLength: TAN_TAN,
    headDepth: HEAD_DEPTH,
    kind: 'main',
    surfacePoint,
    surfaceNormal,
    toLocal,
  };
}

// ---------------------------------------------------------------------------
// Appendage frame
// ---------------------------------------------------------------------------

/**
 * Build the SurfaceFrame for a perpendicular appendage body.
 *
 * Geometry (design §6):
 *  - origin = main frame `surfacePoint(mountPos, mountAngle, 0)`
 *  - axis N = outward main-shell normal at the mount (perpendicular mount)
 *  - datum D (local 0°) = the main vessel's +axis direction (toward the right
 *    tangent) projected onto the appendage cross-section plane
 *  - handedness E = D × N, so angle increases clockwise viewed from OUTSIDE the
 *    end closure (looking along −N) — matching the main shell viewed from its
 *    +axis end. A local surface direction at angle θ is  cosθ·D + sinθ·E.
 *
 * The convention lives ONLY here (unit-tested) so it can never become the next
 * ±90° regression.
 */
export function buildAppendageFrame(
  state: VesselState,
  params: AppendageFrameParams,
  bodyId?: string
): SurfaceFrame {
  const main = buildMainFrame(state);
  const radius = params.diameter / 2;
  const headDepth =
    params.endClosure === 'dished' ? params.diameter / (2 * (params.headRatio ?? 2.0)) : 0;

  const origin = main.surfacePoint(params.mountPos, params.mountAngle, 0);
  const axis = main.surfaceNormal(params.mountPos, params.mountAngle); // N (unit)

  // Main vessel +axis direction (toward the right tangent line).
  const mainAxisDir =
    state.orientation === 'vertical' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);

  // Datum D = mainAxisDir projected onto the plane perpendicular to N.
  const datum = mainAxisDir.clone().addScaledVector(axis, -mainAxisDir.dot(axis));
  if (datum.lengthSq() < 1e-12) {
    // Degenerate (N parallel to mainAxisDir — not reachable for a perpendicular
    // cylinder mount, but guard so consumers never receive NaN). Pick any axis
    // perpendicular to N.
    const fallback =
      Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    datum.copy(fallback.addScaledVector(axis, -fallback.dot(axis)));
  }
  datum.normalize();

  // Handedness E = D × N (gives D × E = −N ⇒ clockwise from outside the closure).
  const cross = new THREE.Vector3().crossVectors(datum, axis).normalize();

  /** Outward radial unit direction in the cross-section at angle θ. */
  function radialDir(angleDeg: number): THREE.Vector3 {
    const t = angleDeg * DEG2RAD;
    return datum.clone().multiplyScalar(Math.cos(t)).addScaledVector(cross, Math.sin(t));
  }

  function surfacePoint(posMm: number, angleDeg: number, offsetMm = 0): THREE.Vector3 {
    const point = origin.clone();
    point.addScaledVector(axis, posMm * SCALE);
    point.addScaledVector(radialDir(angleDeg), (radius + offsetMm) * SCALE);
    return point;
  }

  function surfaceNormal(_posMm: number, angleDeg: number): THREE.Vector3 {
    // Cylindrical body: outward normal is the radial direction (independent of
    // axial position). End-closure normals are out of scope for v1.
    void _posMm;
    return radialDir(angleDeg);
  }

  function toLocal(worldPoint: THREE.Vector3): { pos: number; angle: number } {
    const rel = worldPoint.clone().sub(origin);
    const axial = rel.dot(axis);
    const planar = rel.clone().addScaledVector(axis, -axial);
    const x = planar.dot(datum);
    const y = planar.dot(cross);
    return {
      pos: axial / SCALE,
      angle: normalizeDeg(Math.atan2(y, x) / DEG2RAD),
    };
  }

  return {
    bodyId,
    radius,
    axialLength: params.length,
    headDepth,
    kind: 'appendage',
    surfacePoint,
    surfaceNormal,
    toLocal,
  };
}

// ---------------------------------------------------------------------------
// Public resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the SurfaceFrame for a body.
 *
 * `bodyId === undefined` returns the main-shell frame (the existing code path).
 * Otherwise the matching appendage is looked up on `state.appendages` and built
 * via `buildAppendageFrame`. `AppendageConfig` structurally satisfies
 * `AppendageFrameParams`, so the config is passed straight through.
 */
export function resolveBodyFrame(state: VesselState, bodyId?: string): SurfaceFrame {
  if (bodyId === undefined) {
    return buildMainFrame(state);
  }

  const body = state.appendages.find((b) => b.id === bodyId);
  if (!body) {
    throw new Error(`resolveBodyFrame: no appendage body with id "${bodyId}"`);
  }

  return buildAppendageFrame(state, body, body.id);
}
