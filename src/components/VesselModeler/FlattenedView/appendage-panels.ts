// =============================================================================
// Appendage Panels — stacked developed-view layout (pure)
// =============================================================================
// Below the main developed surface the flattened view stacks one developed strip
// per appendage that carries scan composites. Everything shares ONE pixel-per-mm
// scale so the whole page stays to-scale 1:1 (a smaller appendage renders as a
// proportionally smaller strip; overflow shrinks the shared scale uniformly,
// never a per-axis stretch — Decision Log 2026-06-22).
//
// Strip coordinate convention (stated once, here):
//   X = position along the appendage axis, 0 = the main-shell junction, on the
//       LEFT (physical axis — NOT mirrored with the main scan orientation).
//   Y = circumference around the appendage, cut at the appendage DATUM 0°
//       meridian at the TOP (0), increasing downward. Datum 0° = the main +axis
//       projection (engine/body-frame.ts).
//
// Pure module: no canvas/DOM.
// =============================================================================

import type { VesselState, Orientation } from '../types';

// ---------------------------------------------------------------------------
// Strip specs — which appendages get a panel, and their to-scale dimensions
// ---------------------------------------------------------------------------

export interface StripSpec {
  /** Appendage id (AppendageConfig.id). */
  id: string;
  /** Display name (panel title). */
  name: string;
  /** Appendage axial length in mm (strip content width). */
  lengthMm: number;
  /** Appendage inner circumference in mm, π × diameter (strip content height). */
  circumferenceMm: number;
}

/**
 * The appendages that should render a panel: those with at least one confirmed
 * scan composite that carries data. Ordered by the appendage array (stable). An
 * appendage's 3D visibility toggle is a scene concern and does NOT hide its panel
 * — the developed view is a data/inspection surface.
 */
export function buildStripSpecs(vesselState: VesselState): StripSpec[] {
  const withData = new Set<string>();
  for (const c of vesselState.scanComposites) {
    if (c.bodyId && c.orientationConfirmed && c.data.length > 0) withData.add(c.bodyId);
  }
  const specs: StripSpec[] = [];
  for (const app of vesselState.appendages) {
    if (!withData.has(app.id)) continue;
    specs.push({
      id: app.id,
      name: app.name,
      lengthMm: app.length,
      circumferenceMm: Math.PI * app.diameter,
    });
  }
  return specs;
}

// ---------------------------------------------------------------------------
// Stacked layout
// ---------------------------------------------------------------------------

export interface AppendagePanel {
  id: string;
  name: string;
  /**
   * Base (pre-zoom) pixel offset of the strip HEATMAP top from the stack anchor
   * (PADDING.top + marginY). Content offsets scale with zoom; the anchor/margin
   * do not — so the whole stack zooms as one glued unit.
   */
  topBasePx: number;
  lengthMm: number;
  circumferenceMm: number;
}

export interface StackLayout {
  /** Shared pixels-per-mm for the main surface AND every strip (1:1 both axes). */
  pxPerMm: number;
  /** Horizontal letterbox margin (px) — shared left origin with the main plot. */
  marginX: number;
  /** Vertical letterbox margin (px) centring the whole stack in the draw area. */
  marginY: number;
  /** The appendage strips, top-to-bottom. Empty ⇒ layout equals plain fitScale. */
  panels: AppendagePanel[];
  /** Title-strip height (px) reserved above each panel heatmap. */
  titlePx: number;
  /** Gap (px) above each panel (between it and the previous region). */
  gapPx: number;
}

export interface StackOptions {
  /** Title-strip height in px reserved above each panel heatmap. */
  titlePx: number;
  /** Gap in px above each panel. */
  gapPx: number;
}

/**
 * Compute the shared to-scale layout for the main developed surface plus a
 * vertical stack of appendage strips.
 *
 * ONE `pxPerMm` fits the whole stack: the content width is the widest of the main
 * surface and the strips; the content height is the sum of every circumference
 * plus a FIXED pixel overhead for the per-panel titles/gaps. The looser axis is
 * letterboxed (centred), never stretched.
 *
 * With no strips this reduces EXACTLY to `fitScale` over the main surface, so the
 * main plot is byte-identical to the pre-appendage layout (guarding the
 * main-surface golden for every model without appendage panels).
 *
 * `topBasePx` values are pre-zoom offsets from the stack anchor; the caller adds
 * `PADDING.top + marginY` and multiplies the content offset by `zoom`.
 */
export function computeStackLayout(
  drawWidth: number,
  drawHeight: number,
  mainLengthMm: number,
  mainCircumferenceMm: number,
  strips: StripSpec[],
  opts: StackOptions,
  orientation: Orientation = 'horizontal'
): StackLayout {
  const { titlePx, gapPx } = opts;
  const overheadPx = strips.length * (titlePx + gapPx);
  const vertical = orientation === 'vertical';

  // The developed page has two content extents: the AXIAL extent (shared, all
  // surfaces left-aligned at the junction/tangent) and the CIRC-STACK extent
  // (main circumference plus every strip's, the axis the panels stack along).
  let axialContentMm = mainLengthMm;
  for (const s of strips) axialContentMm = Math.max(axialContentMm, s.lengthMm);

  let circStackContentMm = mainCircumferenceMm;
  for (const s of strips) circStackContentMm += s.circumferenceMm;

  // For a vertical vessel the view is presented portrait: axial → screen-Y, circ
  // (and the panel stack) → screen-X. The fixed per-strip title/gap overhead is
  // always along the STACK (circ) screen axis. Horizontal keeps axial → screen-X.
  const screenXContentMm = vertical ? circStackContentMm : axialContentMm;
  const screenYContentMm = vertical ? axialContentMm : circStackContentMm;
  const availWidth = drawWidth - (vertical ? overheadPx : 0);
  const availHeight = drawHeight - (vertical ? 0 : overheadPx);

  const degenerate =
    drawWidth <= 0 ||
    drawHeight <= 0 ||
    screenXContentMm <= 0 ||
    screenYContentMm <= 0 ||
    availWidth <= 0 ||
    availHeight <= 0;

  if (degenerate) {
    return { pxPerMm: 0, marginX: 0, marginY: 0, panels: [], titlePx, gapPx };
  }

  const pxPerMm = Math.min(availWidth / screenXContentMm, availHeight / screenYContentMm);
  const stackAlongCircPx = circStackContentMm * pxPerMm + overheadPx;
  const totalXpx = vertical ? stackAlongCircPx : axialContentMm * pxPerMm;
  const totalYpx = vertical ? axialContentMm * pxPerMm : stackAlongCircPx;
  const marginX = (drawWidth - totalXpx) / 2;
  const marginY = (drawHeight - totalYpx) / 2;

  // Walk the stack: main surface first, then each strip (gap, title, heatmap).
  const panels: AppendagePanel[] = [];
  let cursorPx = mainCircumferenceMm * pxPerMm;
  for (const s of strips) {
    cursorPx += gapPx + titlePx; // gap + title band above the heatmap
    panels.push({
      id: s.id,
      name: s.name,
      topBasePx: cursorPx,
      lengthMm: s.lengthMm,
      circumferenceMm: s.circumferenceMm,
    });
    cursorPx += s.circumferenceMm * pxPerMm;
  }

  return { pxPerMm, marginX, marginY, panels, titlePx, gapPx };
}

// ---------------------------------------------------------------------------
// Strip canvas projection (hover round-trip + overlay placement)
// ---------------------------------------------------------------------------

/** Full-canvas view state for one strip (includes plot PADDING + the strip top). */
export interface StripCanvasView {
  pxPerMm: number;
  marginX: number;
  marginY: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  paddingLeft: number;
  paddingTop: number;
  /** Base (pre-zoom) heatmap-top offset of this strip (AppendagePanel.topBasePx). */
  topBasePx: number;
}

/** Appendage axial mm (0 = shell junction, left) → canvas X px. */
export function stripToCanvasX(posMm: number, v: StripCanvasView): number {
  return v.paddingLeft + v.marginX + posMm * v.pxPerMm * v.zoom + v.offsetX;
}

/** Appendage circumferential mm (0 = datum top) → canvas Y px. */
export function stripToCanvasY(circMm: number, v: StripCanvasView): number {
  return v.paddingTop + v.marginY + (v.topBasePx + circMm * v.pxPerMm) * v.zoom + v.offsetY;
}

/** Canvas X px → appendage axial mm. */
export function stripFromCanvasX(px: number, v: StripCanvasView): number {
  if (v.pxPerMm <= 0 || v.zoom <= 0) return 0;
  return (px - v.paddingLeft - v.marginX - v.offsetX) / (v.pxPerMm * v.zoom);
}

/** Canvas Y px → appendage circumferential mm from the datum top. */
export function stripFromCanvasY(py: number, v: StripCanvasView): number {
  if (v.pxPerMm <= 0 || v.zoom <= 0) return 0;
  return ((py - v.paddingTop - v.marginY - v.offsetY) / v.zoom - v.topBasePx) / v.pxPerMm;
}

// ---------------------------------------------------------------------------
// Orientation-aware strip projection (portrait transpose for vertical vessels)
// ---------------------------------------------------------------------------
// A strip is a self-contained developed surface (physical axial axis, datum-cut
// circumference). It transposes with the parent vessel exactly like the main
// surface: horizontal → axial on screen-X / circ (with the stack offset) on
// screen-Y; vertical → axial on screen-Y / circ on screen-X. The four functions
// above are the horizontal building blocks; these compose them per orientation so
// the whole page stays in ONE frame. Horizontal delegates to them verbatim, so the
// strip goldens are unchanged.

/** Screen pixel along the strip's AXIAL screen axis (X horizontal, Y vertical). */
export function stripAxialScreen(
  posMm: number,
  v: StripCanvasView,
  orientation: Orientation
): number {
  const base =
    orientation === 'vertical'
      ? v.paddingTop + v.marginY + v.offsetY
      : v.paddingLeft + v.marginX + v.offsetX;
  return base + posMm * v.pxPerMm * v.zoom;
}

/** Screen pixel along the strip's CIRC screen axis (Y horizontal, X vertical), incl. the stack offset. */
export function stripCircScreen(
  circMm: number,
  v: StripCanvasView,
  orientation: Orientation
): number {
  const base =
    orientation === 'vertical'
      ? v.paddingLeft + v.marginX + v.offsetX
      : v.paddingTop + v.marginY + v.offsetY;
  return base + (v.topBasePx + circMm * v.pxPerMm) * v.zoom;
}

/** Canvas X px of a strip point (appendage axial pos, circumferential mm). */
export function stripPx(
  posMm: number,
  circMm: number,
  v: StripCanvasView,
  orientation: Orientation
): number {
  return orientation === 'vertical'
    ? stripCircScreen(circMm, v, orientation)
    : stripAxialScreen(posMm, v, orientation);
}

/** Canvas Y px of a strip point (appendage axial pos, circumferential mm). */
export function stripPy(
  posMm: number,
  circMm: number,
  v: StripCanvasView,
  orientation: Orientation
): number {
  return orientation === 'vertical'
    ? stripAxialScreen(posMm, v, orientation)
    : stripCircScreen(circMm, v, orientation);
}

/** Inverse: canvas point → appendage axial mm. */
export function stripPosAt(
  px: number,
  py: number,
  v: StripCanvasView,
  orientation: Orientation
): number {
  if (v.pxPerMm <= 0 || v.zoom <= 0) return 0;
  const screen = orientation === 'vertical' ? py : px;
  const base =
    orientation === 'vertical'
      ? v.paddingTop + v.marginY + v.offsetY
      : v.paddingLeft + v.marginX + v.offsetX;
  return (screen - base) / (v.pxPerMm * v.zoom);
}

/** Inverse: canvas point → appendage circumferential mm from the datum. */
export function stripCircAt(
  px: number,
  py: number,
  v: StripCanvasView,
  orientation: Orientation
): number {
  if (v.pxPerMm <= 0 || v.zoom <= 0) return 0;
  const screen = orientation === 'vertical' ? px : py;
  const base =
    orientation === 'vertical'
      ? v.paddingLeft + v.marginX + v.offsetX
      : v.paddingTop + v.marginY + v.offsetY;
  return ((screen - base) / v.zoom - v.topBasePx) / v.pxPerMm;
}
