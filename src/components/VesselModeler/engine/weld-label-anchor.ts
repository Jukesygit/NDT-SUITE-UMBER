// =============================================================================
// Vessel Modeler - Weld Label Anchor
// =============================================================================
// World-space anchor point for a weld's name label. Shared by the live CSS2D
// label (ThreeViewport.updateWeldLabelPositions) and the baked GLB sprite
// (text-sprite.createWeldLabelSprite) so an appendage-mounted weld's label
// follows the appendage body instead of floating on the main shell.
//
// A weld with `bodyId === undefined` keeps its byte-identical legacy main-shell
// placement inside each caller; only a weld carrying a bodyId is routed here.
// The anchor samples the body's SurfaceFrame exactly as the appendage weld MESH
// does (engine/weld-geometry.ts): `pos` (and `endPos`) are clamped to the
// cylinder span [0, length]; a circumferential label anchors at a chosen ring
// angle (default 90 deg = top of the ring in the body datum, matching the fixed
// main-shell export convention — the live view passes a camera-facing datum
// angle instead), and a longitudinal label anchors at the weld's axial midpoint
// on its own datum angle. Both sit WELD_LABEL_RADIAL_OFFSET_MM proud of the
// surface, the same "+30mm" the legacy main-shell label used.
//
// See design: docs/plans/2026-07-30-appendage-phase4-attachable-parity-design.md
// (4A left weld-label placement on appendages to a later pass).
// =============================================================================

import type { Vector3 } from 'three';
import type { WeldConfig, VesselState } from '../types';
import { resolveBodyFrame, type SurfaceFrame } from './body-frame';

/** Radial offset (mm) of a weld label above the body surface — the same "+30mm"
 *  the legacy main-shell label used, so appendage labels sit equally proud. */
export const WELD_LABEL_RADIAL_OFFSET_MM = 30;

/** Datum angle (deg) anchoring a circumferential-weld label on the ring when no
 *  camera-facing angle is supplied: 90 deg = top of the ring in the body datum,
 *  matching the fixed top anchor the main-shell export label uses. */
export const WELD_LABEL_DEFAULT_CIRC_ANGLE_DEG = 90;

/**
 * Compute the label anchor on an already-resolved body frame.
 *
 * Kept separate from {@link computeWeldLabelAnchor} so the live view can resolve
 * the frame once (it also needs it to derive the camera-facing angle) rather than
 * re-resolving. `circAngleDeg` is honoured for circumferential welds only;
 * longitudinal welds always anchor at their own `weld.angle`.
 */
export function weldLabelAnchorOnFrame(
  frame: SurfaceFrame,
  weld: WeldConfig,
  circAngleDeg: number = WELD_LABEL_DEFAULT_CIRC_ANGLE_DEG
): Vector3 {
  const offset = WELD_LABEL_RADIAL_OFFSET_MM;

  if (weld.type === 'circumferential') {
    const pos = Math.max(0, Math.min(frame.axialLength, weld.pos));
    return frame.surfacePoint(pos, circAngleDeg, offset);
  }

  const startPos = Math.max(0, Math.min(frame.axialLength, weld.pos));
  const endPos = Math.max(0, Math.min(frame.axialLength, weld.endPos ?? frame.axialLength));
  const midPos = (startPos + endPos) / 2;
  const angle = weld.angle ?? 90;
  return frame.surfacePoint(midPos, angle, offset);
}

/**
 * Resolve the weld's body frame and return its label anchor. Convenience wrapper
 * for callers that do not already hold the frame (e.g. the GLB export sprite).
 *
 * `weld.bodyId === undefined` resolves the main-shell frame, so the anchor is the
 * frame reproduction of the legacy main-shell top-of-ring / midpoint placement.
 */
export function computeWeldLabelAnchor(
  weld: WeldConfig,
  state: VesselState,
  circAngleDeg: number = WELD_LABEL_DEFAULT_CIRC_ANGLE_DEG
): Vector3 {
  return weldLabelAnchorOnFrame(resolveBodyFrame(state, weld.bodyId), weld, circAngleDeg);
}
