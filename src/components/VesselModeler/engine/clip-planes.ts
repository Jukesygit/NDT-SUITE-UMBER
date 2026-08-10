// =============================================================================
// Vessel Modeler — Section clip planes (C15, pure)
// =============================================================================
// Builds the world-space THREE.Plane the renderer clips against so the user can
// cut the vessel open and look inside. v1 = ONE plane at a time.
//
// CONVENTIONS (binding):
//   - three.js clips away every point whose SIGNED DISTANCE to the plane is
//     negative (`clipping_planes_fragment` discards `distanceToPoint < 0`), so
//     the plane normal points toward the half that is KEPT. `flip` negates the
//     normal and therefore keeps the other half.
//   - Directions are orientation-aware and mirror the body-frame basis exactly
//     (see body-frame.ts `buildMainFrame.surfacePoint`): the main shell is
//     centred on the world origin along its axis, radial θ=0 and θ=90 point at
//     fixed world axes per orientation. Nothing here re-derives a (pos,angle)→
//     world mapping and no ±90 conversion is spelled out.
//       horizontal: axis +X, θ=0 → +Z, θ=90 → +Y (top)
//       vertical:   axis +Y, θ=0 → +X, θ=90 → +Z
//   - `offsetMm` is measured in mm FROM THE VESSEL CENTRE (the world origin),
//     matching `surfacePoint`'s `(posMm - TAN_TAN/2)` centring, and converted
//     with the single SCALE constant from materials.ts.
//
// MODES
//   transverse      — normal along the vessel axis; cuts across the vessel and
//                     slides along it (offset = axial mm from mid-length).
//   longitudinal-h  — normal along the θ=90 ("top") direction; the lengthwise
//                     cut that separates top from bottom on a horizontal vessel,
//                     offset vertically. Contains the axis at offset 0.
//   longitudinal-v  — normal along the θ=0 direction; the lengthwise cut
//                     perpendicular to the above, offset laterally. Contains the
//                     axis at offset 0.
//   For a VERTICAL vessel both longitudinal planes are necessarily vertical
//   (every plane containing a vertical axis is); they stay two orthogonal
//   lengthwise cuts, keyed to the same vessel-frame basis so the labels keep
//   meaning relative to the vessel rather than the world.
//
// KNOWN v1 LIMITS (accepted, documented in the design doc):
//   - CSS2D labels (annotation/weld leader labels) are DOM overlays, not WebGL
//     geometry — they do not clip and stay visible over a sectioned vessel.
//   - Raycasting ignores clipping: geometry hidden by a plane can still be
//     picked/dragged. Clipping is a viewing aid, not an interaction filter.
//   - No cap/section-fill is rendered; the shell material is DoubleSide so a cut
//     shows the interior surface rather than a solid cross-section.
// =============================================================================

import * as THREE from 'three';
import type { VesselState } from '../types';
import { SCALE } from './materials';

export type ClipMode = 'transverse' | 'longitudinal-h' | 'longitudinal-v';

export interface ClipConfig {
  /** Master switch — disabled yields no planes at all (zero renderer cost). */
  enabled: boolean;
  mode: ClipMode;
  /** Offset in mm from the vessel centre along the mode's normal direction. */
  offsetMm: number;
  /** Keep the opposite half (negates the plane normal). */
  flip: boolean;
  /** Draw a faint THREE.PlaneHelper at the cut. */
  showHelper: boolean;
}

export const DEFAULT_CLIP_CONFIG: ClipConfig = {
  enabled: false,
  mode: 'transverse',
  offsetMm: 0,
  flip: false,
  showHelper: false,
};

/** Main-vessel +axis world direction. Mirrors `mainAxisDir` (frame-entity.ts)
 *  and `buildMainFrame`'s orientation branch — not an angle conversion. */
function axisDir(state: VesselState): THREE.Vector3 {
  return state.orientation === 'vertical' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
}

/** World direction of the θ=90 surface point ("top" on a horizontal vessel):
 *  surfacePoint puts sin(θ) on Y (horizontal) / Z (vertical). */
function topDir(state: VesselState): THREE.Vector3 {
  return state.orientation === 'vertical' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
}

/** World direction of the θ=0 surface point: surfacePoint puts cos(θ) on
 *  Z (horizontal) / X (vertical). */
function datumDir(state: VesselState): THREE.Vector3 {
  return state.orientation === 'vertical' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
}

/**
 * Unit world direction the plane offsets along for a mode. Exported so the
 * viewport can size/place the optional helper without duplicating the basis.
 */
export function clipAxisDirection(mode: ClipMode, state: VesselState): THREE.Vector3 {
  switch (mode) {
    case 'transverse':
      return axisDir(state);
    case 'longitudinal-h':
      return topDir(state);
    case 'longitudinal-v':
      return datumDir(state);
  }
}

/**
 * Build the clipping planes for a config. Returns `[]` when disabled (the
 * renderer treats an empty array as "clipping off"), otherwise exactly one
 * world-space plane whose normal points at the KEPT half.
 */
export function buildClipPlanes(cfg: ClipConfig, state: VesselState): THREE.Plane[] {
  if (!cfg.enabled) return [];

  const dir = clipAxisDirection(cfg.mode, state);
  const coplanarPoint = dir.clone().multiplyScalar(cfg.offsetMm * SCALE);
  const normal = cfg.flip ? dir.clone().negate() : dir.clone();

  return [new THREE.Plane().setFromNormalAndCoplanarPoint(normal, coplanarPoint)];
}
