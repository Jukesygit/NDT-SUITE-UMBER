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
  Orientation,
} from '../types';
import { datumToVesselAngle, vesselAngleToCircumMm } from '../engine/vessel-coords';

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
 * The result is wrapped into [0, circumference). Delegates the arc-length math
 * to the shared engine/vessel-coords.ts (`vesselAngleToCircumMm`) so the 2D and
 * 3D paths share one convention; the exported signature/behaviour is unchanged.
 */
export function angleToCircumMm(angleDeg: number, outerDiameter: number): number {
  return vesselAngleToCircumMm(angleDeg, Math.PI * outerDiameter);
}

/**
 * Convert a scan composite's datum angle (USER convention, 0° = TDC) to
 * circumferential mm from TDC (y = 0).
 *
 * The +90° (via the shared `datumToVesselAngle`) converts the user datum to the
 * vessel angle convention (90° = TDC) that angleToCircumMm expects — the same
 * conversion the 3D path applies (texture-manager, scan-gizmo, scan-sampling,
 * wall-loss all route through vessel-coords now). Keeping this in one place
 * guarantees the developed scan overlay stays aligned with the geometry overlays
 * and with the 3D view.
 */
export function datumToCircumMm(datumAngleDeg: number, outerDiameter: number): number {
  return angleToCircumMm(datumToVesselAngle(datumAngleDeg), outerDiameter);
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

/**
 * Apply the circumferential handedness flip used when the axial axis is mirrored
 * (reverse scan → the developed view is read from the opposite end). This is a
 * 180° rotation about the vertical axis: TDC (0) and BDC (½ circumference) stay
 * put while 3 o'clock and 9 o'clock swap, so the view stays a proper rotation
 * instead of a mirror image. It is its own inverse. No-op when not reversed or
 * when circumference is non-positive.
 */
export function circumDisplayMm(circumMm: number, circumference: number, reversed: boolean): number {
  if (!reversed || circumference <= 0) return circumMm;
  return ((circumference - circumMm) % circumference + circumference) % circumference;
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
// Developed frame — orientation-aware screen mapping (the single projection source)
// ---------------------------------------------------------------------------
// The developed surface has intrinsic coordinates (axialMm ∈ [0, vesselLength],
// circumMm ∈ [0, circumference]). How those map to canvas pixels depends on the
// vessel orientation:
//
//   horizontal → axial runs along screen-X (left→right), circumferential along
//                screen-Y (top→bottom, cut at TDC). This is the historical layout
//                and the frame reproduces it BYTE-FOR-BYTE.
//   vertical   → the view is presented PORTRAIT so an inspector reads a standing
//                vessel naturally: axial runs along screen-Y (top of vessel at the
//                top), circumferential along screen-X. TDC (circ = 0) is the LEFT
//                seam edge. Longitudinal scan strips therefore render as vertical
//                bands, matching the axis they were physically scanned on.
//
// This is a pure transpose of the developed plane — NOT a bitmap rotation — so
// labels/scales stay upright. Both the geometry overlays (FlattenedViewport) and
// the heatmap projector (scan-surface.ts) compose the SAME axial/circumferential
// content scalars through this frame, so they always agree in one frame. The
// axial mirror (reverse scan) and the circumferential handedness flip
// (circumDisplayMm) still apply, exactly as before, along whichever screen axis
// each content occupies. NEVER re-introduce a manual ±90 (Decision Log 2026-06-22 /
// 06-23).
// ---------------------------------------------------------------------------

/**
 * Axial content position (mm) after the reverse-scan mirror — the distance along
 * the developed axial axis, before it is placed on a screen axis. Reused by the
 * geometry frame and the heatmap projector so both mirror identically.
 */
export function axialContentMm(
  axialMm: number,
  vesselLength: number,
  reversed: boolean,
): number {
  return axialFrac(axialMm, vesselLength, reversed) * vesselLength;
}

export interface DevelopedFrameParams {
  orientation: Orientation;
  /** Shared pixels-per-mm (to-scale 1:1). */
  pxPerMm: number;
  /** Screen-X letterbox margin (px). */
  marginX: number;
  /** Screen-Y letterbox margin (px). */
  marginY: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  /** Screen-X origin (canvas PADDING.left, or 0 for a padding-relative buffer). */
  originX: number;
  /** Screen-Y origin (canvas PADDING.top, or 0 for a padding-relative buffer). */
  originY: number;
  vesselLength: number;
  circumference: number;
  /** Reverse-scan axial mirror + coupled circumferential handedness flip. */
  reversed: boolean;
}

/**
 * The orientation-aware developed→canvas mapping. `px`/`py` place a developed
 * point; `axialMmAt`/`circMmAt` invert a canvas point (hover). `axialScreen`/
 * `circScreen` expose the per-content screen scalar (used by the heatmap cell
 * builder, which assembles rects from the two scalars and swaps them for a
 * vertical view). `axialDeltaPx`/`circDeltaPx` give the on-screen pixel span of a
 * developed-mm delta (marker radii). For `orientation === 'horizontal'` every
 * method reduces to the historical toCanvasX/toCanvasY/fromCanvasX/fromCanvasY
 * arithmetic.
 */
export interface DevelopedFrame {
  orientation: Orientation;
  px(axialMm: number, circMm: number): number;
  py(axialMm: number, circMm: number): number;
  axialMmAt(canvasX: number, canvasY: number): number;
  circMmAt(canvasX: number, canvasY: number): number;
  /** Screen pixel along axial's screen axis (X for horizontal, Y for vertical). */
  axialScreen(axialMm: number): number;
  /** Screen pixel along circ's screen axis (Y for horizontal, X for vertical). */
  circScreen(circMm: number): number;
  /** |Δpx| for a Δmm along the axial axis. */
  axialDeltaPx(mm: number): number;
  /** |Δpx| for a Δmm along the circumferential axis. */
  circDeltaPx(mm: number): number;
}

/**
 * Build a {@link DevelopedFrame}. Pure — no canvas/DOM. Degenerate scale
 * (pxPerMm ≤ 0) makes `px`/`py` collapse to the plot origin and the inverses to
 * 0, matching the historical guards in FlattenedViewport.
 */
export function makeDevelopedFrame(p: DevelopedFrameParams): DevelopedFrame {
  const {
    orientation,
    pxPerMm,
    marginX,
    marginY,
    zoom,
    offsetX,
    offsetY,
    originX,
    originY,
    vesselLength,
    circumference,
    reversed,
  } = p;
  const vertical = orientation === 'vertical';
  const k = pxPerMm * zoom;

  // Screen origins for each content axis (fold in margin + pan once).
  const xBase = originX + marginX + offsetX;
  const yBase = originY + marginY + offsetY;

  const axialScreen = (axialMm: number): number => {
    const content = axialContentMm(axialMm, vesselLength, reversed);
    return (vertical ? yBase : xBase) + content * k;
  };
  const circScreen = (circMm: number): number => {
    const content = circumDisplayMm(circMm, circumference, reversed);
    return (vertical ? xBase : yBase) + content * k;
  };

  return {
    orientation,
    axialScreen,
    circScreen,
    px(axialMm, circMm) {
      if (pxPerMm <= 0) return originX;
      return vertical ? circScreen(circMm) : axialScreen(axialMm);
    },
    py(axialMm, circMm) {
      if (pxPerMm <= 0) return originY;
      return vertical ? axialScreen(axialMm) : circScreen(circMm);
    },
    axialMmAt(canvasX, canvasY) {
      if (pxPerMm <= 0 || zoom <= 0) return 0;
      const screen = vertical ? canvasY : canvasX;
      const base = vertical ? yBase : xBase;
      const content = (screen - base) / k;
      return reversed ? vesselLength - content : content;
    },
    circMmAt(canvasX, canvasY) {
      if (pxPerMm <= 0 || zoom <= 0) return 0;
      const screen = vertical ? canvasX : canvasY;
      const base = vertical ? xBase : yBase;
      const content = (screen - base) / k;
      return circumDisplayMm(content, circumference, reversed);
    },
    axialDeltaPx(mm) {
      return Math.abs(mm) * k;
    },
    circDeltaPx(mm) {
      return Math.abs(mm) * k;
    },
  };
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

// ---------------------------------------------------------------------------
// Appendage strip variants (developed onto an appendage's own developed strip)
// ---------------------------------------------------------------------------
// A weld/lug/nozzle tagged with an appendage `bodyId` lives on that appendage's
// strip, not the main shell. On a strip `pos` is mm along the appendage axis (0 =
// the shell junction, the strip's LEFT — the PHYSICAL axis, never the mirrored scan
// index) and `angle` is the appendage DATUM convention (0 = datum meridian at the
// strip top). That is the SAME convention the strip's scan overlay (datumToCircumMm)
// and coverage rects use, and the SAME angle engine/body-frame.ts feeds to the
// 3D `surfacePoint` (verified: weld-geometry.ts + vessel-geometry.ts pass `.angle`
// straight to the frame — the appendage nozzle branch does
// `bodyFrame.surfacePoint(posMm, n.angle)` with NO ±90, vessel-geometry.ts:469) —
// so a strip weld/lug/nozzle lines up with the body's scan and its 3D placement.
// These mirror projectLongWeld / projectLiftingLug / projectNozzle but swap
// angleToCircumMm (vessel 90 = TDC) for datumToCircumMm (appendage 0 = datum);
// never re-introduce a manual ±90 (Decision Log 2026-06-22 / 06-23). A circumferential
// weld is angle-free (a full ring), so it reuses projectCircWeld with the appendage OD.

/**
 * Project a longitudinal weld onto an appendage developed strip: a horizontal line
 * at the weld's appendage-datum angle, running from `pos` to `endPos` along the
 * appendage axis. The angle default (90) matches the appendage weld builder in
 * engine/weld-geometry.ts so the strip agrees with the 3D scene.
 */
export function projectStripLongWeld(weld: WeldConfig, appendageOD: number): FlatLine {
  const y = datumToCircumMm(weld.angle ?? 90, appendageOD);
  return {
    label: weld.name,
    x1: weld.pos,
    y1: y,
    x2: weld.endPos ?? weld.pos,
    y2: y,
  };
}

/**
 * Project a lifting lug onto an appendage developed strip as a point marker at
 * (appendage-axial pos, appendage-datum angle → strip circumferential mm).
 */
export function projectStripLiftingLug(lug: LiftingLugConfig, appendageOD: number): FlatMarker {
  return {
    label: lug.name,
    cx: lug.pos,
    cy: datumToCircumMm(lug.angle, appendageOD),
  };
}

/**
 * Project a nozzle onto an appendage developed strip as a circle at
 * (appendage-axial pos, appendage-datum angle → strip circumferential mm). The
 * bore radius is derived identically to the main-surface {@link projectNozzle}
 * (size / 2). `angle` is the appendage DATUM convention — the SAME value
 * vessel-geometry.ts feeds straight into `bodyFrame.surfacePoint(posMm, n.angle)`
 * for the 3D appendage nozzle (vessel-geometry.ts:469, no ±90) — so the strip
 * marker sits under the 3D nozzle. `NozzleConfig.angle` is required, so (unlike the
 * weld/lug builders) there is no default.
 */
export function projectStripNozzle(nozzle: NozzleConfig, appendageOD: number): FlatCircle {
  return {
    label: nozzle.name,
    cx: nozzle.pos,
    cy: datumToCircumMm(nozzle.angle, appendageOD),
    radius: nozzle.size / 2,
  };
}

// ---------------------------------------------------------------------------
// Appendage junction footprints (developed onto the MAIN shell surface)
// ---------------------------------------------------------------------------
// A JunctionFootprint (engine/junction-footprint.ts) is the exact cylinder-on-
// cylinder intersection expressed in the main shell's DEVELOPED coordinates:
//   pos   = mm from the left tangent line
//   angle = degrees around the shell, 90 = TDC   (the VESSEL clock convention)
// That is the SAME convention projectNozzle/projectLiftingLug feed into
// `angleToCircumMm` — so a footprint boundary point maps to circumferential mm
// with `angleToCircumMm(angle, vesselOD)`, NEVER `datumToCircumMm` (that helper
// is only for scan composites, whose datum uses the user 0°=TDC convention).
// ---------------------------------------------------------------------------

export interface DevelopedPolyline {
  /** Wrapped [0, circumference) circumferential mm of the footprint centre. */
  centerMm: number;
  /** Largest |yMm − centerMm| across the polyline (mm), i.e. the circ half-span. */
  halfExtentMm: number;
  /**
   * Footprint boundary in developed mm. `x` = axial mm (from the left tangent).
   * `yMm` is CONTINUOUS about `centerMm` — points may fall outside
   * [0, circumference) by design so the polyline never tears at the TDC seam. The
   * caller draws it once per `wrapCircumCenters(centerMm, halfExtentMm, circ)`
   * copy (shifting yMm by `copyCenter − centerMm`) and lets the plot clip trim it.
   */
  points: Array<{ x: number; yMm: number }>;
}

/**
 * Develop a junction-footprint boundary (vessel-convention angles, 90 = TDC)
 * into a continuous developed polyline centred on the appendage's mount meridian.
 *
 * The centre uses `angleToCircumMm(mountAngle, …)` — identical to how a nozzle at
 * the same clock angle is placed — and every boundary point is unwrapped toward
 * that centre, so a footprint straddling Y = 0 / Y = circumference stays a single
 * unbroken curve (no manual ±90; see Decision Log 2026-06-22 / 06-23).
 */
export function developFootprintBoundary(
  boundary: Array<{ pos: number; angle: number }>,
  mountAngleDeg: number,
  vesselOD: number,
): DevelopedPolyline {
  const circumference = Math.PI * vesselOD;
  const centerMm = angleToCircumMm(mountAngleDeg, vesselOD);
  const points: Array<{ x: number; yMm: number }> = [];
  let halfExtentMm = 0;

  for (const bp of boundary) {
    let yMm = angleToCircumMm(bp.angle, vesselOD);
    if (circumference > 0) {
      // Unwrap toward the centre (shortest way round the seam).
      while (yMm - centerMm > circumference / 2) yMm -= circumference;
      while (yMm - centerMm < -circumference / 2) yMm += circumference;
    }
    halfExtentMm = Math.max(halfExtentMm, Math.abs(yMm - centerMm));
    points.push({ x: bp.pos, yMm });
  }

  return { centerMm, halfExtentMm, points };
}

/**
 * Apply the circumferential handedness flip (reverse-scan view-from-the-other-end,
 * see circumDisplayMm) to a developed footprint polyline.
 *
 * circumDisplayMm is the reflection y → circumference − y. Applied to a centred
 * polyline it reflects the CENTRE (mod circumference) and negates each point's
 * signed offset about it, so the curve stays continuous across the seam (the mod
 * is applied only to the centre, exactly as circumDisplayMm does for one marker).
 * The reflected centre equals `circumDisplayMm(centerMm, …)` — the same value a
 * nozzle at the mount angle uses — so footprints move with the nozzle markers.
 * A no-op when not reversed.
 */
export function displayFootprintPolyline(
  developed: DevelopedPolyline,
  circumference: number,
  reversed: boolean,
): DevelopedPolyline {
  if (!reversed || circumference <= 0) return developed;
  const centerDisp = circumDisplayMm(developed.centerMm, circumference, reversed);
  const points = developed.points.map((p) => ({
    x: p.x,
    yMm: centerDisp - (p.yMm - developed.centerMm),
  }));
  return { centerMm: centerDisp, halfExtentMm: developed.halfExtentMm, points };
}
