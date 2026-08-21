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
// CLOSURE RULE (2026-08-20): a cap row is framed from OUTBOARD of its own cap.
// A closure's bounding sphere is centred barely past its tangent plane — still
// well inside the vessel envelope — so the world-fixed iso direction put the
// camera on the INBOARD side of a left head or a boot dome, above the barrel,
// looking back along the shell with the head itself hidden behind it. Cap rows
// therefore keep iso's azimuth around the owning frame's axis but take the
// axial component's sign from the cap's own outboard direction (and its
// magnitude clamped to a three-quarter elevation), so the head reads as a 3D
// object from outside. Shell/barrel rows are untouched — still plain
// `canonicalPose('iso', …)`.
//
// Pure apart from THREE vector maths — no React, no scene access.
// ---------------------------------------------------------------------------

import type { VesselState } from '../types';
import { resolveBodyFrame, type SurfaceFrame } from './body-frame';
import {
  canonicalDirection,
  canonicalPose,
  fitDistance,
  type CameraPose,
  type ViewBounds,
} from './canonical-views';
import type { FeatureTargetRef } from './coverage-comparison';
import { SCALE } from './materials';

/** Below this the bounding sphere is meaningless and the camera lands inside. */
const MIN_RADIUS_MM = 60;

/**
 * Shell kept in a cap's frame INBOARD of the tangent plane, as a fraction of the
 * body radius. A head framed to its own silhouette floats contextless; a strip of
 * barrel behind it says which end of which vessel you are looking at.
 */
const CAP_SHELL_MARGIN_FRACTION = 0.15;

/**
 * Elevation of a cap view above its tangent plane, as a sine, clamped into a
 * three-quarter band: too shallow and the camera skims the barrel it is trying to
 * look past, too steep and the head is a flat-on bullseye with no depth cues.
 */
const MIN_CAP_ELEVATION_SIN = Math.sin((25 * Math.PI) / 180);
const MAX_CAP_ELEVATION_SIN = Math.sin((65 * Math.PI) / 180);

/**
 * Distance multiplier on `fitDistance` for cap rows. `fitDistance`'s 0.7 fill
 * factor assumes a loose bounding sphere (a whole vessel's silhouette sits well
 * inside its sphere); a cap's sphere is nearly TIGHT — its silhouette half-height
 * is the full body radius — so the shared factor crops ~25% of the head off the
 * frame (measured in the 2026-08-20 headless-Edge drive). 1.4 lands the cap
 * silhouette at ~90% of the frame across head ratios without touching the shared
 * constant, which the whole-vessel reset and report capture rely on.
 */
const CAP_FIT_FACTOR = 1.4;

/** Which closure of a body a row refers to: +1 = far end, −1 = near end. */
type CapEnd = 1 | -1;

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

/**
 * Unit vector pointing OUT of the body at one of its ends: the frame's own axis
 * for the far end, its negation for the near end. This — not the world axis and
 * not the main vessel's axis — is what "outboard" means for a boot dome, so a
 * tilted boot needs no special case. Null for a degenerate zero-length body.
 */
function outboardDirection(frame: SurfaceFrame, end: CapEnd) {
  const axis = axisDirection(frame);
  return axis ? axis.multiplyScalar(end) : null;
}

/**
 * Unit radial direction at the frame's own 0° datum, used only as the fallback
 * azimuth when the iso direction happens to lie along the body's axis (nothing
 * left to project). Taken from the frame so it obeys the body's datum, never a
 * hand-picked world axis.
 */
function datumRadial(frame: SurfaceFrame) {
  const mid = frame.axialLength / 2;
  const radial = frame.surfacePoint(mid, 0, 0).sub(axisPoint(frame, mid));
  return radial.lengthSq() > 0 ? radial.normalize() : null;
}

/** Bounds of a body's cylindrical barrel: mid-length on the axis, half-diagonal. */
function barrelBounds(frame: SurfaceFrame): ViewBounds {
  return {
    center: axisPoint(frame, frame.axialLength / 2),
    radius: Math.max(Math.hypot(frame.axialLength / 2, frame.radius), MIN_RADIUS_MM) * SCALE,
  };
}

/**
 * Bounds of one closure cap, `end` +1 for the far closure and −1 for the near.
 *
 * The sphere spans the WHOLE cap — tangent plane through apex — plus
 * {@link CAP_SHELL_MARGIN_FRACTION} of barrel behind it, so the axial extent runs
 * from `−margin` to `+headDepth` measured outboard from the tangent plane. Its
 * centre is the midpoint of that span, stepped along the frame's own axis — never
 * `axisPoint` at a closure station (see its note), where the profile radius has
 * already shrunk. Radially the cap never exceeds the body radius, so
 * hypot(half-span, radius) contains every point of it.
 */
function capBounds(frame: SurfaceFrame, end: CapEnd): ViewBounds {
  const tangent = axisPoint(frame, end > 0 ? frame.axialLength : 0);
  const outboard = outboardDirection(frame, end);
  const marginMm = frame.radius * CAP_SHELL_MARGIN_FRACTION;
  const halfSpanMm = (frame.headDepth + marginMm) / 2;
  const centreOffsetMm = (frame.headDepth - marginMm) / 2;
  const center = outboard ? tangent.addScaledVector(outboard, centreOffsetMm * SCALE) : tangent;
  return {
    center,
    radius: Math.max(Math.hypot(halfSpanMm, frame.radius), MIN_RADIUS_MM) * SCALE,
  };
}

/**
 * View direction (centre → camera) for a cap row: iso's azimuth around the body's
 * axis, iso's elevation magnitude clamped to the three-quarter band, and the
 * axial sign forced OUTBOARD. Mirroring iso per end rather than inventing a view
 * vocabulary keeps a row click reading as a move, not a teleport — the far head
 * of a horizontal vessel keeps the plain iso direction, stood further back by
 * {@link CAP_FIT_FACTOR}.
 *
 * Null only for a degenerate body with no resolvable axis; callers fall back to
 * the plain canonical pose there.
 */
function capViewDirection(frame: SurfaceFrame, end: CapEnd, state: VesselState) {
  const outboard = outboardDirection(frame, end);
  if (!outboard) return null;

  const iso = canonicalDirection('iso', state).normalize();
  const elevation = iso.dot(outboard);
  const azimuth = iso.clone().addScaledVector(outboard, -elevation);
  if (azimuth.lengthSq() < 1e-12) {
    const fallback = datumRadial(frame);
    if (!fallback) return outboard;
    azimuth.copy(fallback);
  }
  azimuth.normalize();

  const lift = Math.min(
    Math.max(Math.abs(elevation), MIN_CAP_ELEVATION_SIN),
    MAX_CAP_ELEVATION_SIN
  );
  return azimuth.multiplyScalar(Math.sqrt(1 - lift * lift)).addScaledVector(outboard, lift);
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
 * The body a comparison row lives on, and which of its closures the row is (null
 * for a cylindrical row). Null overall when the row's body no longer exists — a
 * boot deleted between a render and a click.
 */
function resolveFeature(
  state: VesselState,
  ref: FeatureTargetRef
): { frame: SurfaceFrame; cap: CapEnd | null } | null {
  const bodyId = ref.scope === 'main' ? undefined : ref.appendageId;
  if (bodyId !== undefined && !state.appendages?.some((a) => a.id === bodyId)) return null;

  const frame = resolveBodyFrame(state, bodyId);

  if (ref.scope === 'main') {
    if (ref.key === 'cylinder') return { frame, cap: null };
    return { frame, cap: ref.key === 'rightHead' ? 1 : -1 };
  }
  // A boot's only closure is its far end; its shell is the barrel.
  return { frame, cap: ref.slot === 'shell' ? null : 1 };
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
  const feature = resolveFeature(state, ref);
  if (!feature) return null;
  return feature.cap === null ? barrelBounds(feature.frame) : capBounds(feature.frame, feature.cap);
}

/**
 * Pose framing one comparison feature, or null when it cannot be resolved.
 *
 * A cylindrical row is the plain canonical iso pose: it keeps the vessel readable
 * as a whole while the feature fills the frame — the same choice
 * `ReadOnlyViewport` makes for its opening pose, so a row click reads as a move,
 * not a teleport. A cap row keeps that iso character but is taken from OUTBOARD
 * of its own closure (see {@link capViewDirection}); framed on the world-fixed
 * iso direction a near-end head sits behind its own barrel.
 */
export function featureFramePose(state: VesselState, ref: FeatureTargetRef): CameraPose | null {
  const feature = resolveFeature(state, ref);
  if (!feature) return null;

  if (feature.cap === null) return canonicalPose('iso', state, barrelBounds(feature.frame));

  const bounds = capBounds(feature.frame, feature.cap);
  const dir = capViewDirection(feature.frame, feature.cap, state);
  if (!dir) return canonicalPose('iso', state, bounds);

  return {
    position: bounds.center
      .clone()
      .addScaledVector(dir, fitDistance(bounds.radius) * CAP_FIT_FACTOR),
    target: bounds.center.clone(),
  };
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
