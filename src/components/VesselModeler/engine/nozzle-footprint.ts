// =============================================================================
// Vessel Modeler - Nozzle Footprint (pure math)
// =============================================================================
// Nozzle bores are UNMAPPABLE openings: the hole cut in a cylindrical shell for
// a nozzle must not count toward the scannable shell area and must drop out of
// coverage / wall-loss sweeps, exactly like an appendage junction cutout
// (design 2026-08-05 §R1; parent 2026-07-21 §9.4 — ONE `containsCell` predicate
// drives stats AND visuals). This module maps a `NozzleConfig` onto the shared
// footprint geometry in junction-footprint.ts.
//
// Bore-radius / opening derivation:
//   The physical hole in the shell is the OUTER diameter of the pipe/stub that
//   penetrates it, NOT the nominal bore (`NozzleConfig.size` = inside diameter).
//   The 3D geometry cuts exactly that stub in `nozzle-geometry.ts`
//   (createFlangedNozzle): `pipeOD = nozzle.pipeOD ?? findClosestPipeSize(size).od`.
//   We mirror that derivation here so the stats cutout and its heatmap hole line
//   up with the opening the user sees in 3D.
//
// Radial vs non-radial:
//   - Radial nozzles (default): EXACT perpendicular cylinder-on-cylinder
//     intersection via `buildJunctionFootprint`, parameterised by the opening
//     diameter.
//   - Non-radial orientation modes (horizontal / vertical-up / vertical-down):
//     approximated by the projected bore ELLIPSE — see resolveNozzleFootprintParams.
//
// Scope v1: nozzles on cylindrical shells only (main shell + boot cylinders).
// Head/dome-mounted nozzles (main-shell `pos` outside the tan-tan span) are OUT
// of scope — head region totals use separate spherical-cap math — and produce NO
// footprint here.
//
// Pure module: TYPE imports plus the THREE-free `findClosestPipeSize` constant
// lookup (types.ts has no runtime dependencies). Safe for the worker bundle.
// =============================================================================

import { findClosestPipeSize, type NozzleConfig, type VesselState } from '../types';
import {
  buildFootprintFromParams,
  type EllipseFootprintAxes,
  type FootprintParams,
  type JunctionFootprint,
} from './junction-footprint';

/**
 * cos(α) floor for the projected-ellipse approximation. A near-tangent nozzle
 * (α → 90°) would blow the footprint up without bound; clamping cos(α) to
 * cos(75°) caps the stretched semi-axis at ~3.86 × the bore radius.
 */
const MIN_COS_TILT = Math.cos((75 * Math.PI) / 180);

/**
 * Shell OPENING diameter (mm) for a nozzle — the outer diameter of the stub that
 * penetrates the shell, derived EXACTLY as the 3D geometry does
 * (nozzle-geometry.ts:createFlangedNozzle). `nozzle.size` is the nominal bore
 * (inside diameter); the unmappable hole is the stub OD.
 */
export function nozzleOpeningDiameter(nozzle: Pick<NozzleConfig, 'size' | 'pipeOD'>): number {
  return nozzle.pipeOD || findClosestPipeSize(nozzle.size).od;
}

/**
 * Resolve a nozzle to its shell-opening footprint params in the mounting body's
 * developed coordinates (pos = mm along the body axis, angle 90 = TDC — the exact
 * `NozzleConfig.pos` / `NozzleConfig.angle` convention, which already matches the
 * junction-footprint convention).
 *
 * Radial → exact circle (diameter = opening). Non-radial → projected bore
 * ELLIPSE: the circular opening (radius r) tilts by α from the shell outward
 * normal, projecting to an axis-aligned ellipse whose semi-axis along the tilt
 * grows by 1/cos(α) (clamped) while the perpendicular semi-axis stays r. The tilt
 * geometry follows the orientation-modes design (2026-02-23) + vessel-geometry's
 * normal override:
 *   - Horizontal vessel: the mode's fixed world axis (vertical-up/down = ±Y,
 *     horizontal = ±Z) lies in the circumferential (Y-Z) plane, so the ellipse
 *     stretches CIRCUMFERENTIALLY; cos(α) = |sin(angle)| for the vertical modes
 *     and |cos(angle)| for horizontal mode (matching the geometry's fall-back to
 *     radial when the radial direction is already aligned).
 *   - Vertical vessel: vertical-up/down = ±Y is the vessel axis, so the ellipse
 *     stretches AXIALLY with cos(α) → 0 (clamped); horizontal mode is already
 *     radial (the geometry sets the normal to the radial direction), so no ellipse.
 *
 * Approximation notes (documented per design): the flat 1/cos(α) projection
 * ignores shell curvature over the opening, and `azimuthRotation` (an extra
 * world-vertical yaw, used mainly for dome-end nozzles) is not modelled — both
 * negligible for shell-mounted nozzles. Boot-mounted non-radial nozzles reuse the
 * main-vessel orientation heuristic; radial boot nozzles (the common case) are
 * exact regardless.
 */
export function resolveNozzleFootprintParams(
  nozzle: NozzleConfig,
  isVertical: boolean
): FootprintParams {
  const id = nozzle.id;
  const mountPos = nozzle.pos;
  const mountAngle = nozzle.angle;
  const diameter = nozzleOpeningDiameter(nozzle);
  const r = diameter / 2;
  const mode = nozzle.orientationMode ?? 'radial';

  if (mode === 'radial') {
    return { id, mountPos, mountAngle, diameter };
  }

  const rad = (nozzle.angle * Math.PI) / 180;
  let cosTilt: number;
  let stretch: 'axial' | 'circumferential';

  if (isVertical) {
    if (mode === 'horizontal') {
      // Horizontal mode on a vertical vessel is already radial (no tilt).
      return { id, mountPos, mountAngle, diameter };
    }
    // vertical-up / vertical-down = ±Y = vessel axis → fully axial tilt.
    cosTilt = 0;
    stretch = 'axial';
  } else {
    // Horizontal vessel: the fixed axis lies in the circumferential plane.
    cosTilt = mode === 'horizontal' ? Math.abs(Math.cos(rad)) : Math.abs(Math.sin(rad));
    stretch = 'circumferential';
    if (cosTilt >= 1 - 1e-9) {
      // Axis aligns with the radial normal → effectively radial (no ellipse).
      return { id, mountPos, mountAngle, diameter };
    }
  }

  const along = r / Math.max(MIN_COS_TILT, cosTilt);
  const ellipse: EllipseFootprintAxes =
    stretch === 'axial' ? { aPosMm: along, aCircMm: r } : { aPosMm: r, aCircMm: along };
  return { id, mountPos, mountAngle, diameter, ellipse };
}

/**
 * True when a main-shell nozzle sits on an ellipsoidal head (pos outside the
 * tan-tan cylinder). Head/dome-mounted nozzles are OUT of scope v1 (spherical-cap
 * math deferred), so they produce no footprint.
 */
export function isHeadMountedNozzle(pos: number, cylinderLength: number): boolean {
  return pos < 0 || pos > cylinderLength;
}

/**
 * Footprint params for every main-shell nozzle (bodyId undefined), skipping
 * head-mounted nozzles. Empty when the shell carries none → byte-identical to the
 * pre-nozzle-cutout behaviour.
 */
export function mainShellNozzleFootprintParams(vesselState: VesselState): FootprintParams[] {
  const nozzles = vesselState.nozzles ?? [];
  const isVertical = vesselState.orientation === 'vertical';
  const params: FootprintParams[] = [];
  for (const n of nozzles) {
    if (n.bodyId !== undefined) continue; // appendage-mounted → handled per body
    if (isHeadMountedNozzle(n.pos, vesselState.length)) continue; // dome nozzle → deferred
    params.push(resolveNozzleFootprintParams(n, isVertical));
  }
  return params;
}

/**
 * Footprint params for the nozzles mounted on a given appendage body. Boot
 * nozzles sit on the boot cylinder (pos ∈ [0, length]); no head skip.
 */
export function appendageNozzleFootprintParams(
  vesselState: VesselState,
  appendageId: string
): FootprintParams[] {
  const nozzles = vesselState.nozzles ?? [];
  const isVertical = vesselState.orientation === 'vertical';
  return nozzles
    .filter((n) => n.bodyId === appendageId)
    .map((n) => resolveNozzleFootprintParams(n, isVertical));
}

/**
 * Full {@link JunctionFootprint}s for the main-shell nozzles (direct consumers:
 * coverage totals/sweep and the heatmap mask). Radius = shell outer radius.
 */
export function buildMainShellNozzleFootprints(vesselState: VesselState): JunctionFootprint[] {
  const R = vesselState.id / 2;
  return mainShellNozzleFootprintParams(vesselState).map((p) => buildFootprintFromParams(R, p));
}

/**
 * Full {@link JunctionFootprint}s for one appendage's nozzles, on the boot
 * cylinder (radius = appendage.diameter / 2).
 */
export function buildAppendageNozzleFootprints(
  vesselState: VesselState,
  appendage: { id: string; diameter: number }
): JunctionFootprint[] {
  const R = appendage.diameter / 2;
  return appendageNozzleFootprintParams(vesselState, appendage.id).map((p) =>
    buildFootprintFromParams(R, p)
  );
}
