// =============================================================================
// Geometry Projection — Coordinate Mapping Utilities
// =============================================================================
// Pure functions that convert 3D vessel features to 2D flattened coordinates.
//
// Coordinate system:
//   X = axial position in mm (0 = left tangent line, max = vessel length)
//   Y = circumferential position in mm (0 = TDC / top dead center, max = π × ID)
//   The developed view is cut at TDC: Y = 0 is 12 o'clock, Y increases clockwise
//   (3 o'clock at ¼, 6 o'clock at ½, 9 o'clock at ¾).
//
// Angle conventions:
//   Geometry features (nozzles, welds, saddles, lugs) use the VESSEL convention
//     — 90° = top (TDC), 0° = right (3 o'clock), increases counter-clockwise —
//     and are fed straight into angleToCircumMm.
//   Scan composites use the USER convention (datumAngleDeg: 0° = TDC); convert
//     them with datumToCircumMm (which adds the +90° to reach vessel angle).
// =============================================================================

import type {
  NozzleConfig,
  SaddleConfig,
  WeldConfig,
  LiftingLugConfig,
  ScanCompositeConfig,
  VesselState,
} from '../types';

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface FlatRect {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlatCircle {
  label: string;
  cx: number;
  cy: number;
  radius: number;
}

export interface FlatLine {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FlatMarker {
  label: string;
  cx: number;
  cy: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the inner circumference of the vessel (π × ID).
 */
export function getCircumference(vesselState: VesselState): number {
  return Math.PI * vesselState.id;
}

/**
 * Convert a vessel angle (90° = TDC, CCW-positive) to circumferential mm
 * measured from TDC (y = 0).
 *
 * Mapping:  circumMm = ((90 - angleDeg) / 360) × circumference
 * The result is wrapped into [0, circumference).
 */
export function angleToCircumMm(angleDeg: number, outerDiameter: number): number {
  const circumference = Math.PI * outerDiameter;
  const raw = ((90 - angleDeg) / 360) * circumference;
  return ((raw % circumference) + circumference) % circumference;
}

/**
 * Convert a scan composite's datum angle (USER convention, 0° = TDC) to
 * circumferential mm from TDC (y = 0).
 *
 * The +90° converts the user datum to the vessel angle convention (90° = TDC)
 * that angleToCircumMm expects — the same conversion the 3D path applies
 * (texture-manager, scan-gizmo, scan-sampling, wall-loss all use datumAngleDeg + 90).
 * Keeping this in one place guarantees the developed scan overlay stays aligned
 * with the geometry overlays and with the 3D view.
 */
export function datumToCircumMm(datumAngleDeg: number, outerDiameter: number): number {
  return angleToCircumMm(datumAngleDeg + 90, outerDiameter);
}

// ---------------------------------------------------------------------------
// Axial axis orientation
// ---------------------------------------------------------------------------
// The developed view's horizontal axis is the scan INDEX: 0 = scan start on the
// left, increasing to the right. A forward scan (index 0 at a low vessel
// position) keeps the natural left-tangent-on-the-left layout; a reverse scan
// (index 0 at a high vessel position) mirrors the axis so the scan start still
// lands on the left. Orientation is taken from the first confirmed composite —
// the same reference the colour legend uses — so the scan overlay and the
// feature overlays share one axis. With no confirmed scan the axis falls back
// to raw vessel position (0 = left tangent).
// ---------------------------------------------------------------------------

export interface AxialOrientation {
  /** When true, higher vessel positions are drawn on the left (mirrored axis). */
  reversed: boolean;
  /** Vessel axial position (mm from left tangent) of the scan's index origin. */
  indexStartMm: number;
  indexDirection: 'forward' | 'reverse';
}

/**
 * Derive the developed-view axial orientation from the reference scan (the first
 * confirmed composite that carries data). Returns null when none exists.
 */
export function getAxialOrientation(
  composites: ScanCompositeConfig[],
): AxialOrientation | null {
  const ref = composites.find(
    (c) => c.orientationConfirmed && c.data.length > 0,
  );
  if (!ref) return null;
  return {
    reversed: ref.indexDirection === 'reverse',
    indexStartMm: ref.indexStartMm,
    indexDirection: ref.indexDirection,
  };
}

/**
 * Convert a vessel axial position (mm from left tangent) to scan-index distance
 * from the scan start (mm). Positive in the scan's index direction; negative for
 * positions reached before the scan start. Falls back to the raw position when
 * there is no orientation.
 */
export function axialToIndexMm(posMm: number, ori: AxialOrientation | null): number {
  if (!ori) return posMm;
  return ori.indexDirection === 'forward'
    ? posMm - ori.indexStartMm
    : ori.indexStartMm - posMm;
}

/**
 * Fraction (0..1) of a vessel axial position across the drawable width, before
 * zoom/pan. Mirrored when `reversed` so the scan start sits on the left.
 */
export function axialFrac(posMm: number, vesselLength: number, reversed: boolean): number {
  if (vesselLength <= 0) return 0;
  const f = posMm / vesselLength;
  return reversed ? 1 - f : f;
}

export interface PlotScale {
  /** Pixels per mm, applied equally to both axes (1:1 / to-scale). */
  pxPerMm: number;
  /** Horizontal letterbox margin (px) centring the plot in the draw area. */
  marginX: number;
  /** Vertical letterbox margin (px) centring the plot in the draw area. */
  marginY: number;
}

/**
 * Compute a single pixel-per-mm scale that fits the whole developed surface
 * (vesselLength × circumference) inside the draw area, with the looser axis
 * letterboxed (centred). Using one scale for both axes keeps the view to-scale,
 * so a round nozzle bore renders as a circle rather than an axis-stretched oval
 * and scan footprints are not distorted. Returns zeros for degenerate inputs.
 */
export function fitScale(
  drawWidth: number,
  drawHeight: number,
  vesselLength: number,
  circumference: number,
): PlotScale {
  if (drawWidth <= 0 || drawHeight <= 0 || vesselLength <= 0 || circumference <= 0) {
    return { pxPerMm: 0, marginX: 0, marginY: 0 };
  }
  const pxPerMm = Math.min(drawWidth / vesselLength, drawHeight / circumference);
  const marginX = (drawWidth - vesselLength * pxPerMm) / 2;
  const marginY = (drawHeight - circumference * pxPerMm) / 2;
  return { pxPerMm, marginX, marginY };
}

// ---------------------------------------------------------------------------
// Projection functions
// ---------------------------------------------------------------------------

/**
 * Circumferential centre positions (mm) at which a feature of the given radius
 * should be drawn so it wraps correctly across the TDC seam.
 *
 * The developed view is cut at TDC, so a feature whose extent crosses Y = 0 or
 * Y = circumference is physically split — part on the top edge, the rest wrapping
 * to the opposite edge. This returns the base centre plus, when the feature
 * crosses a seam, a copy shifted by ±circumference. Callers draw the feature once
 * per returned centre and let the viewport clip trim each copy.
 *
 * `cyMm` is expected to already be wrapped into [0, circumference) (as produced by
 * angleToCircumMm). Returns just `[cyMm]` when circumference is non-positive.
 */
export function wrapCircumCenters(
  cyMm: number,
  radiusMm: number,
  circumference: number,
): number[] {
  const centers = [cyMm];
  if (circumference <= 0) return centers;
  if (cyMm - radiusMm < 0) centers.push(cyMm + circumference);
  if (cyMm + radiusMm > circumference) centers.push(cyMm - circumference);
  return centers;
}

/**
 * Project a nozzle onto the flattened view as a circle.
 * Centre is at (axial pos, circumferential mm from TDC).
 * Radius equals half the nozzle bore (size / 2).
 */
export function projectNozzle(nozzle: NozzleConfig, vesselOD: number): FlatCircle {
  return {
    label: nozzle.name,
    cx: nozzle.pos,
    cy: angleToCircumMm(nozzle.angle, vesselOD),
    radius: nozzle.size / 2,
  };
}

/**
 * Project a circumferential weld as a vertical line spanning the full
 * circumference at x = pos.
 */
export function projectCircWeld(weld: WeldConfig, vesselOD: number): FlatLine {
  const circumference = Math.PI * vesselOD;
  return {
    label: weld.name,
    x1: weld.pos,
    y1: 0,
    x2: weld.pos,
    y2: circumference,
  };
}

/**
 * Project a longitudinal weld as a horizontal line at the weld's
 * circumferential angle, running from pos to endPos.
 */
export function projectLongWeld(weld: WeldConfig, vesselOD: number): FlatLine {
  const y = angleToCircumMm(weld.angle ?? 0, vesselOD);
  return {
    label: weld.name,
    x1: weld.pos,
    y1: y,
    x2: weld.endPos ?? weld.pos,
    y2: y,
  };
}

/**
 * Project a saddle as a rectangle centred at the bottom of the vessel
 * (270°) spanning approximately 120° of arc.
 *
 * Axial width uses a 100 mm placeholder (saddles don't carry width data).
 */
export function projectSaddle(saddle: SaddleConfig, vesselOD: number): FlatRect {
  const circumference = Math.PI * vesselOD;
  // 120° arc → 1/3 of circumference
  const arcHeight = circumference / 3;
  const axialWidth = 100; // placeholder mm

  // Centre at 270° vessel angle (bottom dead centre) → middle of the developed view
  const centreMm = angleToCircumMm(270, vesselOD);

  return {
    label: `Saddle @ ${saddle.pos} mm`,
    x: saddle.pos - axialWidth / 2,
    y: centreMm - arcHeight / 2,
    width: axialWidth,
    height: arcHeight,
  };
}

/**
 * Project a lifting lug as a point marker at (pos, angle→mm).
 */
export function projectLiftingLug(lug: LiftingLugConfig, vesselOD: number): FlatMarker {
  return {
    label: lug.name,
    cx: lug.pos,
    cy: angleToCircumMm(lug.angle, vesselOD),
  };
}
