// =============================================================================
// Vessel Modeler — Canonical camera views (pure)
// =============================================================================
// Pure camera-pose math for the view cube, canonical-view buttons, camera
// bookmarks and (later, C14) the command palette's "Frame N7". No renderer /
// scene-manager imports — only THREE's Vector3 math, exactly like
// camera-animation.ts and report-image-capture.ts.
//
// The cardinal / iso directions MIRROR report-image-capture.ts:getOverviewViews
// so a "Platform North" report render and an 'n' view-cube click frame the
// vessel identically. `fitDistance` is the SINGLE bounds-fit helper —
// report-image-capture imports it (passing the live camera.fov) so its capture
// output stays byte-identical to the previous inline formula.
// =============================================================================

import * as THREE from 'three';
import type { CameraBookmark, NozzleConfig, VesselState } from '../types';
import { SCALE } from './materials';
import { shellPoint } from './annotation-geometry';

/** The eight canonical view identifiers. */
export type CanonicalViewId = 'iso' | 'n' | 'e' | 's' | 'w' | 'top' | 'bottom' | 'tdc';

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** Bounding sphere the fit distance is computed from. */
export interface ViewBounds {
  center: THREE.Vector3;
  radius: number;
}

/** Scene camera FOV (PerspectiveCamera(45) in scene-manager.ts). */
export const CANONICAL_FOV_DEG = 45;

/** Capture / framing aspect used by report-image-capture's overview renders. */
export const CAPTURE_ASPECT = 16 / 10;

// ---------------------------------------------------------------------------
// Fit distance (shared with report-image-capture — keep byte-identical)
// ---------------------------------------------------------------------------

/**
 * Distance from a bounding sphere of `radius` that fills ~70% of the frame — the
 * EXACT formula report-image-capture.ts used inline
 * (`radius / sin(min(vFov,hFov)/2) * 0.7`). Extracted so the view cube and the
 * report capture cannot drift; the report passes the live `camera.fov` so its
 * numbers stay byte-identical.
 */
export function fitDistance(
  radius: number,
  fovDeg: number = CANONICAL_FOV_DEG,
  aspect: number = CAPTURE_ASPECT,
): number {
  const vFov = fovDeg * (Math.PI / 180);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  return (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 0.7;
}

/**
 * Distance that frames a footprint (world units) at ~70% of the viewport,
 * `computeInspectionCameraTarget`-style (tan-based). Used to frame a nozzle
 * flange in {@link nozzleNormalPose}.
 */
function framingDistance(
  footprintWorld: number,
  fovDeg: number = CANONICAL_FOV_DEG,
  aspect: number = CAPTURE_ASPECT,
): number {
  const vFov = fovDeg * (Math.PI / 180);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const fov = Math.min(vFov, hFov);
  return footprintWorld / 0.7 / (2 * Math.tan(fov / 2));
}

// ---------------------------------------------------------------------------
// Canonical direction
// ---------------------------------------------------------------------------

/** Radial outward normal at Top Dead Centre (angle 90°), orientation-aware. */
function tdcNormal(vesselState: VesselState): THREE.Vector3 {
  const a = Math.PI / 2; // 90° = TDC (vessel-coords convention)
  return vesselState.orientation === 'vertical'
    ? new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    : new THREE.Vector3(0, Math.sin(a), Math.cos(a));
}

/**
 * Unit view direction — from the vessel centre toward the camera — for a
 * canonical view. Cardinals / top / iso mirror `getOverviewViews`, honouring
 * `visuals.cardinalRotation`. `bottom` is the world underside; `tdc` looks
 * straight at the vessel's Top Dead Centre (90°) reference and is the only view
 * that depends on `orientation` (the cardinals/top/bottom/iso are world-fixed).
 */
export function canonicalDirection(
  viewId: CanonicalViewId,
  vesselState: VesselState,
): THREE.Vector3 {
  const rot = THREE.MathUtils.degToRad(vesselState.visuals.cardinalRotation ?? 0);
  const north = new THREE.Vector3(Math.sin(rot), 0, -Math.cos(rot));
  const east = new THREE.Vector3(Math.cos(rot), 0, Math.sin(rot));

  switch (viewId) {
    case 'n':
      return north;
    case 's':
      return north.clone().negate();
    case 'e':
      return east;
    case 'w':
      return east.clone().negate();
    case 'top':
      return new THREE.Vector3(0, 1, 0);
    case 'bottom':
      return new THREE.Vector3(0, -1, 0);
    case 'iso':
      return new THREE.Vector3(
        Math.sin(rot) + Math.cos(rot),
        1,
        -Math.cos(rot) + Math.sin(rot),
      ).normalize();
    case 'tdc':
      return tdcNormal(vesselState);
  }
}

// ---------------------------------------------------------------------------
// Canonical pose
// ---------------------------------------------------------------------------

/**
 * Camera pose for a canonical view: the camera sits along
 * {@link canonicalDirection} at {@link fitDistance} from the bounds centre,
 * looking at the centre.
 */
export function canonicalPose(
  viewId: CanonicalViewId,
  vesselState: VesselState,
  bounds: ViewBounds,
): CameraPose {
  const dir = canonicalDirection(viewId, vesselState).normalize();
  const dist = fitDistance(bounds.radius);
  return {
    position: bounds.center.clone().add(dir.multiplyScalar(dist)),
    target: bounds.center.clone(),
  };
}

// ---------------------------------------------------------------------------
// Nozzle-normal pose (consumed by C14 "Frame N7")
// ---------------------------------------------------------------------------

/**
 * Camera pose that frames a nozzle flange front-on, looking down the nozzle's
 * outward axis. The radial normal follows the same convention as
 * `computeInspectionCameraTarget`; the flange centre is the shell surface point
 * pushed out to the flange face (`proj` is the flange radius from the vessel
 * axis, the shell sits at `id/2`). Distance frames the flange OD ~70% of the
 * viewport.
 *
 * v1 uses the radial normal (the common radial-nozzle case). Non-radial
 * orientation modes / `azimuthRotation` are not modelled here — acceptable for
 * a framing helper (mirrors the nozzle-footprint v1 scope).
 */
export function nozzleNormalPose(nozzle: NozzleConfig, vesselState: VesselState): CameraPose {
  const angleRad = (nozzle.angle * Math.PI) / 180;
  const normal =
    vesselState.orientation === 'vertical'
      ? new THREE.Vector3(Math.cos(angleRad), 0, Math.sin(angleRad))
      : new THREE.Vector3(0, Math.sin(angleRad), Math.cos(angleRad));
  normal.normalize();

  const surface = shellPoint(nozzle.pos, angleRad, vesselState, 0);
  const flangeCenter = surface
    .clone()
    .add(normal.clone().multiplyScalar((nozzle.proj - vesselState.id / 2) * SCALE));

  const footprint = (nozzle.flangeOD || nozzle.size) * SCALE;
  const dist = framingDistance(footprint);
  return {
    position: flangeCenter.clone().add(normal.clone().multiplyScalar(dist)),
    target: flangeCenter,
  };
}

// ---------------------------------------------------------------------------
// Bookmark helpers
// ---------------------------------------------------------------------------

/**
 * Next stable bookmark id (`bm-<n>`), one past the highest existing numeric
 * suffix — mirrors the nozzle-id minting pattern but kept local/simple.
 */
export function nextBookmarkId(existing: readonly CameraBookmark[]): string {
  let max = 0;
  for (const b of existing) {
    const m = /^bm-(\d+)$/.exec(b.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `bm-${max + 1}`;
}

/** Convert a stored bookmark's arrays into a live {@link CameraPose}. */
export function poseFromBookmark(bm: CameraBookmark): CameraPose {
  return {
    position: new THREE.Vector3(...bm.position),
    target: new THREE.Vector3(...bm.target),
  };
}
