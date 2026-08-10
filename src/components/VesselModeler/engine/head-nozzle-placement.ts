// =============================================================================
// Vessel Modeler - Head Nozzle Placement
// =============================================================================
// Pure mapping from an extracted GA-drawing nozzle to the NozzleConfig fields
// the engine needs, resolving head-mounted (dished-end) nozzles into the
// dome-end axial convention the engine already renders. Shell nozzles pass
// straight through. No value is ever defaulted: a head mount with no
// radialOffset is an error (thrown), never a guess.
//
// Angle convention (Phase F — one canonical conversion, see design doc
// 2026-07-30): the extracted `angle` is DRAWING-NATIVE — 0 = top dead centre
// (12 o'clock), increasing clockwise, exactly as labelled in the end view.
// Every applied nozzle passes through this mapper, so this is the single site
// where the drawing convention is converted to the engine convention
// (90 = top, 0 = right, CCW-from-right) via `drawingClockToVesselAngle`. The
// upstream layers (voting, verifier, review UI) keep the drawing-native value
// so the user checks cells directly against the drawing; only the NozzleConfig
// fields this mapper returns are engine-convention.
//
// Dome-end convention (mirrors engine/vessel-geometry.ts + the manual recipe in
// docs/plans/2026-06-19-nozzle-vertical-axis-rotation-design.md):
//
//   Placement (horizontal vessel, long axis = X; nozzle base sits on the
//   ellipsoidal head, derived inline in vessel-geometry.ts):
//     headDepth = id / (2 * headRatio)
//     d         = headDepth * sqrt(max(0, 1 - (radialOffset / (id/2))^2))
//     pos       = -d            (head-left,  base toward the LEFT  end)
//               =  length + d   (head-right, base toward the RIGHT end)
//   At offset 0 (apex) d = headDepth ⇒ pos = -headDepth / length + headDepth,
//   on the vessel axis. At offset >= id/2 the sqrt clamps to 0 ⇒ pos = 0 / length
//   (the tangent line). `pos` is clamped by validateVesselState to
//   [-headDepth, length + headDepth], which exactly contains this range.
//
//   Orientation: the nozzle must protrude straight out of its end (±X). The only
//   engine mode whose base normal lies in the horizontal plane (±Z) and can be
//   yawed about world +Y into ±X is `orientationMode: 'horizontal'`
//   (vessel-geometry.ts sets normal = (0,0,sign(cos(angle)))). The azimuth then
//   yaws that ±Z to the correct ±X, matching rotateNormalAboutVertical
//   (verified: +Z→+X at 90°, +Z→−X at 270°). Because the horizontal-mode base
//   normal's sign follows sign(cos(angle)), the azimuth is resolved from the
//   CONVERTED (engine-convention) angle so the result is axial-outward
//   regardless of where the offset sits around the head:
//     head-right (+X): cos(angle) >= 0 ? 90 : 270
//     head-left  (-X): cos(angle) >= 0 ? 270 : 90
//   The converted engine-convention `angle` is returned in NozzleConfig: it
//   positions the offset around the head (vessel-geometry uses sin/cos(angle)
//   for the base point).
// =============================================================================

import type { NozzleConfig } from '../types';
import type { NozzleMount, NozzleOrientation } from './drawing-extraction-voting';

/** The extracted nozzle fields relevant to placement (from ExtractionResult). */
export interface ExtractedNozzle {
  pos: number;
  proj: number;
  angle: number;
  size: number;
  mount?: NozzleMount;
  radialOffset?: number;
  /** Radial (default path) vs. side-facing horizontal. */
  nozzleOrientation?: NozzleOrientation;
  /** Signed mm from vessel centerline; required for a horizontal nozzle. */
  elevation?: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The vessel scalars placement needs (from the same ExtractionResult). */
export interface PlacementVessel {
  id: number;
  length: number;
  headRatio: number;
}

/** The engine-facing subset produced for each nozzle. */
export type PlacedNozzle = Pick<
  NozzleConfig,
  'pos' | 'proj' | 'angle' | 'size' | 'orientationMode' | 'azimuthRotation'
>;

/**
 * The one canonical drawing→engine angle conversion (Phase F).
 *
 * Input is drawing-native (0 = top / 12 o'clock, increasing clockwise); output
 * is engine convention (90 = top, 0 = right, CCW-from-right), normalized to
 * [0, 360). Cardinals: 0→90 (top), 90→0 (right), 180→270 (bottom), 270→180
 * (left). Applied inside `placeExtractedNozzle` for shell and head mounts alike;
 * never done model-side or ad-hoc anywhere else.
 */
export function drawingClockToVesselAngle(deg: number): number {
  return (((90 - deg) % 360) + 360) % 360;
}

/**
 * Place a horizontal (side-facing) shell nozzle from its elevation (Phase G).
 *
 * A horizontal nozzle sits on the shell where the horizontal line at its
 * `elevation` (signed mm from the vessel centerline) meets the cross-section
 * circle, protruding out the side it is drawn on. The engine's `horizontal`
 * mode places the base at cross-section angle θ (engine convention: 90 = top,
 * 0 = right, CCW-from-right) using sin θ for the vertical coordinate, so
 * sin θ = elevation / R = 2·elevation/id, and sign(cos θ) picks the side the
 * base normal (±Z) protrudes. So:
 *   θ = asin(clamp(2·elevation/id, −1, 1))         when facing RIGHT
 *   θ = 180 − asin(clamp(2·elevation/id, −1, 1))   when facing LEFT
 * both normalized to [0, 360). At elevation 0 → θ = 0 (right) / 180 (left); at
 * elevation +id/2 → θ = 90 (top) from both sides; negative elevation → below.
 *
 * Facing side comes from the drawing-native angle (0 = top, clockwise; reported
 * as 90 for the 3 o'clock cluster, 270 for 9 o'clock). Its horizontal component
 * is sin(drawingAngle) — positive over (0,180) (right half, 3 o'clock), negative
 * over (180,360) (left half, 9 o'clock); the degenerate pure top/bottom 0/180
 * (sin 0) default to facing right. Equivalently sin(drawingAngle) = cos of the
 * engine-converted angle, so the side falls out of the engine's cos convention.
 *
 * `pos` (axial, from the side elevation) and `size` pass through.
 *
 * Projection is CORRECTED, not passed through. GA drawings tabulate a horizontal
 * nozzle's projection/outstand as the horizontal distance from the vessel centre
 * plane (z = 0) to the flange face at height EL. The engine, however, builds the
 * pipe along the base normal with length (proj − R) (nozzle-geometry.ts:150) and
 * seats the base at horizontal distance √(R²−EL²) from the centre plane
 * (vessel-geometry.ts:521-524 place the base at z = R·cos θ; :534-549 protrude it
 * ±Z), so its flange lands at √(R²−EL²) + (proj_engine − R) from the centre
 * plane. Solving that = proj_drawing gives
 *     proj_engine = proj_drawing + R − √(R²−EL²)
 * (visible shell stick-out = proj_drawing − √(R²−EL²)). At EL 0 this collapses to
 * proj_drawing — identical to the radial case. |EL| > R clamps √ to 0.
 *
 * A horizontal nozzle with no `elevation` is an error (thrown) — never defaulted.
 */
function placeHorizontalShell(nozzle: ExtractedNozzle, vessel: PlacementVessel): PlacedNozzle {
  if (nozzle.elevation === undefined || nozzle.elevation === null) {
    throw new Error(
      "Horizontal nozzle (nozzleOrientation='horizontal') requires elevation; none was provided."
    );
  }
  const radius = vessel.id / 2;
  const el = nozzle.elevation;
  const facingLeft = Math.sin((nozzle.angle * Math.PI) / 180) < 0;
  const asinDeg = (Math.asin(clamp((2 * el) / vessel.id, -1, 1)) * 180) / Math.PI;
  const raw = facingLeft ? 180 - asinDeg : asinDeg;
  // Half-chord: horizontal distance from centre plane to the shell at height EL.
  const halfChord = Math.sqrt(Math.max(0, radius * radius - el * el));
  return {
    pos: nozzle.pos,
    proj: nozzle.proj + radius - halfChord,
    angle: ((raw % 360) + 360) % 360,
    size: nozzle.size,
    orientationMode: 'horizontal',
  };
}

/**
 * Map an extracted nozzle to its engine placement.
 *
 * - Head mount: axial dome-end placement per the convention above. A head mount
 *   with no `radialOffset` is an error (thrown) — never defaulted. Head mounts
 *   take precedence over `nozzleOrientation` (a head-mounted nozzle ignores it).
 * - Horizontal shell nozzle (nozzleOrientation === 'horizontal', shell/absent
 *   mount): side-facing placement from `elevation` (see placeHorizontalShell).
 * - Radial shell mount (or absent mount ⇒ legacy shell): passthrough of pos/
 *   proj/angle/size with no orientation fields.
 */
export function placeExtractedNozzle(
  nozzle: ExtractedNozzle,
  vessel: PlacementVessel
): PlacedNozzle {
  const { mount, pos, proj, size } = nozzle;
  // Convert the drawing-native clock angle to engine convention once, here.
  const angle = drawingClockToVesselAngle(nozzle.angle);

  if (mount === undefined || mount === 'shell') {
    // Horizontal shell nozzles seat from elevation, not the converted clock
    // angle; radial shell nozzles pass through unchanged.
    if (nozzle.nozzleOrientation === 'horizontal') {
      return placeHorizontalShell(nozzle, vessel);
    }
    return { pos, proj, angle, size };
  }

  if (nozzle.radialOffset === undefined || nozzle.radialOffset === null) {
    throw new Error(
      `Head-mounted nozzle (mount='${mount}') requires radialOffset; none was provided.`
    );
  }

  const radius = vessel.id / 2;
  const headDepth = vessel.id / (2 * vessel.headRatio);
  const ratio = radius > 0 ? nozzle.radialOffset / radius : 1;
  const axialDepth = headDepth * Math.sqrt(Math.max(0, 1 - ratio * ratio));
  const placedPos = mount === 'head-left' ? -axialDepth : vessel.length + axialDepth;

  // Horizontal-mode base normal is (0,0,sign(cos(angle))); yaw it to ±X.
  const cosSign = Math.cos((angle * Math.PI) / 180) >= 0 ? 1 : -1;
  const azimuthRotation =
    mount === 'head-right' ? (cosSign >= 0 ? 90 : 270) : cosSign >= 0 ? 270 : 90;

  return {
    pos: placedPos,
    proj,
    angle,
    size,
    orientationMode: 'horizontal',
    azimuthRotation,
  };
}
