// =============================================================================
// Vessel Modeler - Cross-Body Drag Resolution
// =============================================================================
// Pure decision + math for cursor-first, cross-body attachable drags (R2). The
// vessel shell and every boot body form ONE continuous surface set: a drag
// raycasts ALL of them and the nearest hit wins, so an item follows the cursor
// straight across a junction and live-reassigns its `bodyId`.
//
// Two concerns live here, both pure so they can be unit-tested without THREE's
// raycaster or the DOM:
//
//   1. resolveCrossingHit — seam hysteresis. Given the per-body hits for one
//      pointer-move (nearest-first, as THREE.Raycaster returns them) and the
//      body the drag is currently on, decide which body wins. The incumbent body
//      holds the drag through a small deadband so the item does not flap between
//      bodies when the cursor rides the interpenetration seam. Mirrors the
//      hold-through-a-threshold idea of interaction-manager's `resolveDrapeDrag`
//      (which holds the angle reference while the cursor is within 0.2R of a dome
//      pole); here the held quantity is the mounted body and the threshold is a
//      camera-distance margin.
//
//   2. reprojectBetweenBodies — the frame conversion invariant. A surface point
//      is body-agnostic in world space, so converting (pos, angle) from one body
//      to another is: fromFrame.surfacePoint(pos, angle) -> world -> toFrame
//      .toLocal(world). The drag path normally re-inverts the live world hit on
//      the winning body directly (identical result, no extra math); this helper
//      documents and tests the invariant and is available to any non-raycast
//      reprojection.
// =============================================================================

import * as THREE from 'three';
import { SCALE } from './materials';
import type { SurfaceFrame } from './body-frame';

/**
 * Seam hysteresis deadband, in millimetres. A competing body's nearest hit must
 * be nearer to the camera than the incumbent body's nearest hit by MORE than
 * this before the drag switches bodies. Tuned conservatively: large enough that
 * the tiny camera-distance difference between two interpenetrating shells at the
 * junction cannot cause frame-to-frame flapping, small enough that a deliberate
 * cursor move across the seam still switches within a pixel or two of travel.
 */
export const SEAM_HYSTERESIS_MM = 6;

/** {@link SEAM_HYSTERESIS_MM} expressed in world units (SCALE = 1mm -> 0.001). */
export const SEAM_HYSTERESIS_WORLD = SEAM_HYSTERESIS_MM * SCALE;

/** One raycast hit reduced to the fields the crossing decision needs. */
export interface BodyHit {
  /** undefined = main shell; otherwise the appendage id the hit surface belongs to. */
  bodyId: string | undefined;
  /** Camera-ray distance to the hit (world units). Smaller = nearer the camera. */
  distance: number;
}

export interface CrossingOptions {
  /**
   * Distance (world units) by which a competing body must beat the incumbent
   * before the drag switches to it. Defaults to {@link SEAM_HYSTERESIS_WORLD}.
   */
  marginWorld?: number;
}

/**
 * Choose which hit a cross-body drag should follow this frame.
 *
 * `hits` MUST be ordered nearest-first (the order THREE.Raycaster returns), so
 * the first hit carrying a given bodyId is that body's nearest surface. Rules:
 *
 *  - No hits -> `null` (caller keeps the item where it is).
 *  - The incumbent body (`currentBodyId`) was not hit this frame -> the globally
 *    nearest hit wins. The cursor has left the incumbent surface entirely, so
 *    there is nothing to hold onto and no deadband applies.
 *  - Both the incumbent and a competitor were hit -> the competitor wins ONLY if
 *    it is nearer than the incumbent by more than `marginWorld`; otherwise the
 *    incumbent holds (the deadband that kills seam flapping). A tie holds the
 *    incumbent.
 *
 * Returns the winning hit (the exact array element, so the caller can read its
 * `.point`/`.object` off the same object), never a copy.
 */
export function resolveCrossingHit<T extends BodyHit>(
  hits: readonly T[],
  currentBodyId: string | undefined,
  opts: CrossingOptions = {}
): T | null {
  if (hits.length === 0) return null;
  const margin = opts.marginWorld ?? SEAM_HYSTERESIS_WORLD;

  // Nearest hit on the incumbent body (hits are nearest-first, so the first match).
  const incumbent = hits.find((h) => h.bodyId === currentBodyId) ?? null;
  // Nearest hit on any OTHER body.
  const challenger = hits.find((h) => h.bodyId !== currentBodyId) ?? null;

  // Cursor left the incumbent surface: take the globally nearest hit.
  if (!incumbent) return challenger ?? hits[0];
  // No competitor in play: the incumbent keeps the drag.
  if (!challenger) return incumbent;

  // Competitor must clear the deadband to steal the drag.
  return challenger.distance < incumbent.distance - margin ? challenger : incumbent;
}

/**
 * Convert a surface coordinate on one body to the equivalent coordinate on
 * another via the shared world point. The world location of a surface point is
 * body-agnostic, so `fromFrame.surfacePoint(pos, angle)` and
 * `toFrame.toLocal(...)` compose to the destination (pos, angle). Reprojecting a
 * frame onto itself is the identity (within floating-point tolerance).
 *
 * The live drag path does not call this — it re-inverts the raycast's world hit
 * on the winning frame, which is the same computation with the world point it
 * already has. This helper exists to document and lock the invariant, and for
 * any reprojection that has (pos, angle) but no live hit point.
 */
export function reprojectBetweenBodies(
  fromFrame: SurfaceFrame,
  toFrame: SurfaceFrame,
  pos: number,
  angle: number
): { pos: number; angle: number } {
  const world: THREE.Vector3 = fromFrame.surfacePoint(pos, angle, 0);
  return toFrame.toLocal(world);
}
