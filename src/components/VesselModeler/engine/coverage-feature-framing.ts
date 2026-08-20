// ---------------------------------------------------------------------------
// Coverage-feature framing — "click a comparison row, look at that feature".
//
// `frame-entity.ts` frames ENTITIES and needs a live camera to do it (it works
// back from the camera's fov/aspect). A comparison row is not an entity: it is a
// whole surface region (the shell, a head, a boot's shell or its closure dome),
// and the surfaces that want to frame one — the projects Coverage section today,
// the client viewer later — hold no camera. So this module answers in the same
// currency `ReadOnlyViewport` already accepts: a {@link ViewBounds} that
// `canonicalPose` turns into a pose using the canonical `fitDistance`.
//
// Every anchor comes from `resolveBodyFrame` (the ONE (pos,angle)↔world source);
// nothing here re-derives an axis, a datum or a head depth. Radii are the
// feature's own bounding sphere, so a boot frames tight and the shell frames
// wide without any per-feature fudge factor.
//
// Pure apart from THREE vector maths — no React, no scene access.
// ---------------------------------------------------------------------------

import type { VesselState } from '../types';
import { resolveBodyFrame, type SurfaceFrame } from './body-frame';
import { canonicalPose, type CameraPose, type ViewBounds } from './canonical-views';
import type { FeatureTargetRef } from './coverage-comparison';
import { SCALE } from './materials';

/** Below this the bounding sphere is meaningless and the camera lands inside. */
const MIN_RADIUS_MM = 60;

/**
 * Axis point at an axial station INSIDE the cylinder, [0, axialLength]: the
 * surface point pushed in by the full radius. Only valid there — in a closure
 * the profile radius shrinks, so the same offset would overshoot past the axis
 * and land on the far side. Closure stations go through {@link axisDirection}
 * instead. `surfacePoint` applies SCALE, so the result is world units already.
 */
function axisPoint(frame: SurfaceFrame, posMm: number) {
  return frame.surfacePoint(posMm, 0, -frame.radius);
}

/**
 * Unit vector along the body's axis, from the near tangent to the far one.
 * Derived from the frame's own two tangent-plane axis points rather than from
 * `orientation` / mount angles, so a boot's tilt needs no special case. Null for
 * a degenerate zero-length body.
 */
function axisDirection(frame: SurfaceFrame) {
  const span = axisPoint(frame, frame.axialLength).sub(axisPoint(frame, 0));
  return span.lengthSq() > 0 ? span.normalize() : null;
}

/** Bounds of a body's cylindrical barrel: mid-length on the axis, half-diagonal. */
function barrelBounds(frame: SurfaceFrame): ViewBounds {
  return {
    center: axisPoint(frame, frame.axialLength / 2),
    radius: Math.max(Math.hypot(frame.axialLength / 2, frame.radius), MIN_RADIUS_MM) * SCALE,
  };
}

/** Bounds of one closure cap. `outward` is +1 for the far end, −1 for the near.
 *  The centre is half a head-depth OUTBOARD of the tangent plane, stepped along
 *  the axis — never `axisPoint` at a closure station (see its note). */
function capBounds(frame: SurfaceFrame, outward: 1 | -1): ViewBounds {
  const tangent = axisPoint(frame, outward > 0 ? frame.axialLength : 0);
  const axis = axisDirection(frame);
  const center = axis
    ? tangent.add(axis.multiplyScalar((outward * frame.headDepth * SCALE) / 2))
    : tangent;
  return {
    center,
    radius: Math.max(Math.hypot(frame.headDepth / 2, frame.radius), MIN_RADIUS_MM) * SCALE,
  };
}

/**
 * Bounds of a whole body: its barrel unioned with the closures it actually has.
 * Built from the very spheres {@link featureViewBounds} hands out, so the reset
 * view is guaranteed to contain every framing a row click can produce — a
 * "sphere around the geometry" would be tighter and could crop a head.
 */
function bodyBounds(frame: SurfaceFrame, nearCap: boolean, farCap: boolean): ViewBounds {
  let bounds = barrelBounds(frame);
  if (frame.headDepth > 0 && nearCap) bounds = unionBounds(bounds, capBounds(frame, -1));
  if (frame.headDepth > 0 && farCap) bounds = unionBounds(bounds, capBounds(frame, 1));
  return bounds;
}

/** Smallest sphere containing both — the standard two-sphere union. */
function unionBounds(a: ViewBounds, b: ViewBounds): ViewBounds {
  const gap = a.center.distanceTo(b.center);
  if (gap + b.radius <= a.radius) return a;
  if (gap + a.radius <= b.radius) return b;
  const radius = (gap + a.radius + b.radius) / 2;
  // Walk from a's far edge toward b by the new radius.
  const dir = b.center.clone().sub(a.center).normalize();
  const center = a.center.clone().add(dir.multiplyScalar(radius - a.radius));
  return { center, radius };
}

/**
 * World-space bounds of one comparison feature, or null when the feature's body
 * no longer exists (a boot deleted between a render and a click).
 *
 * A head/dome is bounded by its own cap; the cylindrical features by their
 * barrel. Both are computed on the body's own frame, so a boot's tilt and a
 * vertical vessel's axis swap are handled by construction.
 */
export function featureViewBounds(state: VesselState, ref: FeatureTargetRef): ViewBounds | null {
  const bodyId = ref.scope === 'main' ? undefined : ref.appendageId;
  if (bodyId !== undefined && !state.appendages?.some((a) => a.id === bodyId)) return null;

  const frame = resolveBodyFrame(state, bodyId);

  if (ref.scope === 'main') {
    if (ref.key === 'cylinder') return barrelBounds(frame);
    return capBounds(frame, ref.key === 'rightHead' ? 1 : -1);
  }
  // A boot's only closure is its far end; its shell is the barrel.
  return ref.slot === 'shell' ? barrelBounds(frame) : capBounds(frame, 1);
}

/**
 * Isometric pose framing one comparison feature, or null when it cannot be
 * resolved. Iso (rather than face-on) keeps the vessel readable as a whole while
 * the feature fills the frame — the same choice `ReadOnlyViewport` makes for its
 * opening pose, so a row click reads as a move, not a teleport.
 */
export function featureFramePose(state: VesselState, ref: FeatureTargetRef): CameraPose | null {
  const bounds = featureViewBounds(state, ref);
  return bounds ? canonicalPose('iso', state, bounds) : null;
}

/**
 * Bounds of the whole model: the main body unioned with every boot. A pipe has
 * no heads and a boot only closes at its far end, matching the features
 * `listComparisonFeatures` emits — the reset view frames exactly what the table
 * can frame, no more.
 */
export function wholeVesselBounds(state: VesselState): ViewBounds {
  const hasHeads = state.vesselShape !== 'pipe';
  let bounds = bodyBounds(resolveBodyFrame(state, undefined), hasHeads, hasHeads);
  for (const app of state.appendages ?? []) {
    bounds = unionBounds(bounds, bodyBounds(resolveBodyFrame(state, app.id), false, true));
  }
  return bounds;
}

/** Isometric pose framing the entire model — the section's "reset view". */
export function wholeVesselPose(state: VesselState): CameraPose {
  return canonicalPose('iso', state, wholeVesselBounds(state));
}

export type { CameraPose, ViewBounds };
