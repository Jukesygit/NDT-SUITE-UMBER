// =============================================================================
// Vessel Modeler — Entity framing (pure) for the command palette (C14)
// =============================================================================
// Given an entity reference and the vessel state, compute the camera pose that
// frames that entity front-on. The command palette dispatches the entity's
// SELECT_* action and then flies the camera to this pose.
//
// SINGLE-SOURCE MATH ONLY:
//   - Body-mounted (pos, angle) surface entities anchor via resolveBodyFrame
//     (body-frame.ts). The main-shell frame reproduces shellPoint() exactly, so
//     bodyId === undefined is byte-identical to the legacy surface path — we go
//     through resolveBodyFrame uniformly rather than hand-rolling shellPoint.
//   - Nozzles use canonical-views.nozzleNormalPose (radial-normal framing).
//   - The framing distance reuses camera-animation's framingDistanceForCamera
//     (the computeInspectionCameraTarget formula) so entity framing and
//     inspection mode cannot drift.
//   - Circumferential angle conventions go through vessel-coords only (scan
//     datumAngleDeg is 0 = TDC; entity .angle is 90 = TDC).
//
// No ±90 or (pos,angle)→world math is ever spelled here.
// =============================================================================

import * as THREE from 'three';
import type { NozzleConfig, VesselState } from '../types';
import { resolveBodyFrame } from './body-frame';
import { nozzleNormalPose } from './canonical-views';
import { framingDistanceForCamera } from './camera-animation';
import { datumToVesselAngle } from './vessel-coords';
import { SCALE } from './materials';

/** Reference to a single entity the palette can frame. Index for array-keyed
 *  collections, id for id-keyed ones — mirrors the outliner SELECT_* vocabulary. */
export type FrameEntityRef =
  | { type: 'nozzle'; index: number }
  | { type: 'appendage'; index: number }
  | { type: 'weld'; index: number }
  | { type: 'lug'; index: number }
  | { type: 'saddle'; index: number }
  | { type: 'annotation'; id: number }
  | { type: 'coverageRect'; id: number }
  | { type: 'ruler'; id: number }
  | { type: 'texture'; id: number }
  | { type: 'inspectionImage'; id: number }
  | { type: 'scanComposite'; id: string }
  | { type: 'domeScan'; id: string }
  | { type: 'pipeline'; id: string };

export interface FramePose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** Footprint (mm) used when an entity has no natural mm extent (texture, image). */
const FALLBACK_FOOTPRINT_MM = 600;
/** Never let a footprint collapse below this so the camera never ends up inside. */
const MIN_FOOTPRINT_MM = 60;

/** Main-vessel +axis world direction (toward the right tangent). Matches the
 *  mainAxisDir body-frame.ts uses internally — not an angle conversion. */
function mainAxisDir(state: VesselState): THREE.Vector3 {
  return state.orientation === 'vertical' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
}

/** True when bodyId is the main shell or an existing appendage (guards the
 *  resolveBodyFrame throw for dangling ids). */
function bodyExists(state: VesselState, bodyId?: string): boolean {
  return bodyId === undefined || state.appendages.some((a) => a.id === bodyId);
}

/**
 * Frame a (pos, angle) surface point on any body: anchor at the surface point,
 * push the camera out along the surface normal by the framing distance for the
 * given footprint. Returns null when the body no longer exists.
 */
function frameSurface(
  state: VesselState,
  bodyId: string | undefined,
  posMm: number,
  angleDeg: number,
  footprintMm: number,
  camera: THREE.PerspectiveCamera
): FramePose | null {
  if (!bodyExists(state, bodyId)) return null;
  const frame = resolveBodyFrame(state, bodyId);
  const anchor = frame.surfacePoint(posMm, angleDeg, 0);
  const normal = frame.surfaceNormal(posMm, angleDeg);
  const dist = framingDistanceForCamera(Math.max(footprintMm, MIN_FOOTPRINT_MM) * SCALE, camera);
  return {
    position: anchor.clone().add(normal.clone().multiplyScalar(dist)),
    target: anchor.clone(),
  };
}

/**
 * Frame a single nozzle. Main-shell nozzles use the canonical nozzle-normal pose
 * (frames the flange). Boot-mounted nozzles anchor on the boot surface via its
 * body frame (nozzleNormalPose is main-shell only).
 */
function frameNozzle(
  nozzle: NozzleConfig,
  state: VesselState,
  camera: THREE.PerspectiveCamera
): FramePose | null {
  if (nozzle.bodyId === undefined) {
    return nozzleNormalPose(nozzle, state);
  }
  const footprint = nozzle.flangeOD || nozzle.size;
  return frameSurface(state, nozzle.bodyId, nozzle.pos, nozzle.angle, footprint, camera);
}

/**
 * Frame a dome scan by its owning head's apex (the sanctioned fallback for the
 * disproportionate exact-drape math): anchor on the pole of the head/closure,
 * camera along the head axis outward. Main-shell heads use the vessel axis;
 * an appendage 'end' closure uses that appendage's outward axis.
 */
function frameDomeHead(
  state: VesselState,
  head: 'left' | 'right' | 'end',
  bodyId: string | undefined,
  camera: THREE.PerspectiveCamera
): FramePose | null {
  if (!bodyExists(state, bodyId)) return null;
  const frame = resolveBodyFrame(state, bodyId);
  const headDepth = frame.headDepth;

  let apexPos: number;
  let dir: THREE.Vector3;
  if (head === 'left') {
    apexPos = -headDepth;
    dir = mainAxisDir(state).negate();
  } else if (head === 'end' && bodyId !== undefined) {
    apexPos = frame.axialLength + headDepth;
    const app = state.appendages.find((a) => a.id === bodyId)!;
    // The appendage's outward axis = main-shell surface normal at its mount.
    dir = resolveBodyFrame(state, undefined).surfaceNormal(app.mountPos, app.mountAngle);
  } else {
    apexPos = frame.axialLength + headDepth;
    dir = mainAxisDir(state);
  }

  const apex = frame.surfacePoint(apexPos, 0, 0); // radius→0 at the pole ⇒ apex
  const footprintMm = Math.max(frame.radius * 2, MIN_FOOTPRINT_MM);
  const dist = framingDistanceForCamera(footprintMm * SCALE, camera);
  return {
    position: apex.clone().add(dir.clone().normalize().multiplyScalar(dist)),
    target: apex.clone(),
  };
}

/**
 * Compute the camera pose that frames the referenced entity, or null if the ref
 * cannot be resolved (missing entity / dangling body / free pipeline w/o origin).
 * All anchors come from the single-source geometry helpers — never hand-rolled.
 */
export function frameEntityPose(
  ref: FrameEntityRef,
  state: VesselState,
  camera: THREE.PerspectiveCamera
): FramePose | null {
  switch (ref.type) {
    case 'nozzle': {
      const n = state.nozzles[ref.index];
      return n ? frameNozzle(n, state, camera) : null;
    }
    case 'appendage': {
      const app = state.appendages[ref.index];
      if (!app) return null;
      // Frame the boot side-on: mid-cylinder surface point, camera along its
      // outward radial normal at the datum-quarter (90°).
      const footprint = Math.max(app.length, app.diameter);
      return frameSurface(state, app.id, app.length / 2, 90, footprint, camera);
    }
    case 'weld': {
      const w = state.welds[ref.index];
      if (!w) return null;
      if (!bodyExists(state, w.bodyId)) return null;
      const frame = resolveBodyFrame(state, w.bodyId);
      // Circ welds have no single angle → anchor at TDC (90°); long welds carry one.
      const angle = w.angle ?? 90;
      return frameSurface(state, w.bodyId, w.pos, angle, frame.radius * 2, camera);
    }
    case 'lug': {
      const l = state.liftingLugs[ref.index];
      if (!l) return null;
      const footprint = Math.max(l.width ?? 400, l.height ?? 400);
      return frameSurface(state, l.bodyId, l.pos, l.angle, footprint, camera);
    }
    case 'saddle': {
      const s = state.saddles[ref.index];
      if (!s) return null;
      // Saddles cradle the underside (270°), main shell only.
      return frameSurface(state, undefined, s.pos, 270, Math.max(s.depth ?? 400, 400), camera);
    }
    case 'annotation': {
      const a = state.annotations.find((x) => x.id === ref.id);
      if (!a) return null;
      return frameSurface(state, a.bodyId, a.pos, a.angle, Math.max(a.width, a.height), camera);
    }
    case 'coverageRect': {
      const c = state.coverageRects.find((x) => x.id === ref.id);
      if (!c) return null;
      return frameSurface(state, c.bodyId, c.pos, c.angle, Math.max(c.width, c.height), camera);
    }
    case 'ruler': {
      const r = state.rulers.find((x) => x.id === ref.id);
      if (!r) return null;
      const footprint = Math.max(Math.abs(r.endPos - r.startPos), FALLBACK_FOOTPRINT_MM);
      return frameSurface(state, undefined, r.startPos, r.startAngle, footprint, camera);
    }
    case 'texture': {
      const t = state.textures.find((x) => x.id === ref.id);
      if (!t) return null;
      return frameSurface(state, undefined, t.pos, t.angle, FALLBACK_FOOTPRINT_MM, camera);
    }
    case 'inspectionImage': {
      const img = state.inspectionImages.find((x) => x.id === ref.id);
      if (!img) return null;
      return frameSurface(state, undefined, img.pos, img.angle, FALLBACK_FOOTPRINT_MM, camera);
    }
    case 'scanComposite': {
      const s = state.scanComposites.find((x) => x.id === ref.id);
      if (!s) return null;
      if (!bodyExists(state, s.bodyId)) return null;
      const frame = resolveBodyFrame(state, s.bodyId);
      // datumAngleDeg is 0 = TDC (datum convention) → vessel convention via vessel-coords.
      const angle = datumToVesselAngle(s.datumAngleDeg);
      const footprint = Math.max(frame.radius * 2, FALLBACK_FOOTPRINT_MM);
      return frameSurface(state, s.bodyId, s.indexStartMm, angle, footprint, camera);
    }
    case 'domeScan': {
      const d = state.domeScanComposites.find((x) => x.id === ref.id);
      if (!d) return null;
      return frameDomeHead(state, d.head, d.bodyId, camera);
    }
    case 'pipeline': {
      const p = state.pipelines.find((x) => x.id === ref.id);
      if (!p) return null;
      if (p.nozzleId) {
        const nozzle = state.nozzles.find((n) => n.id === p.nozzleId);
        return nozzle ? frameNozzle(nozzle, state, camera) : null;
      }
      if (p.freeOrigin) {
        // First segment origin: the free-standing pipe start (mm → world) with
        // the camera along the pipe axis, mirroring computeFreeOriginFrame.
        const anchor = new THREE.Vector3(...p.freeOrigin.position).multiplyScalar(SCALE);
        const dir = new THREE.Vector3(...p.freeOrigin.direction).normalize();
        const dist = framingDistanceForCamera(
          Math.max(p.pipeDiameter * 4, MIN_FOOTPRINT_MM) * SCALE,
          camera
        );
        return { position: anchor.clone().add(dir.multiplyScalar(dist)), target: anchor.clone() };
      }
      return null;
    }
  }
}
