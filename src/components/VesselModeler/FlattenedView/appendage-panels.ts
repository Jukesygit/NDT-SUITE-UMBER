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

import type { VesselState } from '../types';

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
): StackLayout {
  const { titlePx, gapPx } = opts;
  const overheadPx = strips.length * (titlePx + gapPx);

  let contentWidthMm = mainLengthMm;
  for (const s of strips) contentWidthMm = Math.max(contentWidthMm, s.lengthMm);

  let contentHeightMm = mainCircumferenceMm;
  for (const s of strips) contentHeightMm += s.circumferenceMm;

  const availHeight = drawHeight - overheadPx;

  const degenerate =
    drawWidth <= 0 ||
    drawHeight <= 0 ||
    contentWidthMm <= 0 ||
    contentHeightMm <= 0 ||
    availHeight <= 0;

  if (degenerate) {
    return { pxPerMm: 0, marginX: 0, marginY: 0, panels: [], titlePx, gapPx };
  }

  const pxPerMm = Math.min(drawWidth / contentWidthMm, availHeight / contentHeightMm);
  const totalStackPx = contentHeightMm * pxPerMm + overheadPx;
  const marginX = (drawWidth - contentWidthMm * pxPerMm) / 2;
  const marginY = (drawHeight - totalStackPx) / 2;

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
