// =============================================================================
// Scan Surface — shared composite → developed-pixel mapping (pure)
// =============================================================================
// The ONE code path that turns a scan composite's row/col grid into developed
// heatmap cells, plus the body-routing and thickness-lookup helpers that go with
// it. The main shell surface and every appendage panel share this module: they
// differ ONLY in a SurfaceProjector (which supplies the body's circumference, its
// axial/circumferential pixel mapping and its datum origin), never in a forked
// copy of the loop. That guarantees an appendage strip renders measurement data
// with byte-identical nearest/blocky cell math to the main surface (inspection
// integrity — no per-body display distortion).
//
// Pure module: no canvas/DOM. The cell sink is the only effect; production writes
// pixels, tests collect cells.
// =============================================================================

import type { ScanCompositeConfig } from '../types';
import { interpolateColor, getColorscale } from '../../../utils/colorscales';
import { datumToCircumMm, circumDisplayMm, axialFrac } from './geometry-projection';

// ---------------------------------------------------------------------------
// Body routing — the single point that decides which surface a composite paints
// ---------------------------------------------------------------------------

/**
 * Select the composites that belong on one body's developed surface.
 *
 * `bodyId === undefined` → main-shell composites (those with no `bodyId`), the
 * legacy path. A defined `bodyId` → only that appendage's composites. This is the
 * single routing rule: a `bodyId` composite is therefore NEVER visible on the
 * main surface (it is routed to its appendage panel), and the main-surface pixel
 * output for a mixed model is byte-identical to the same model with the appendage
 * composites removed. Dome scans live in a separate array and never appear here.
 */
export function compositesForBody(
  composites: ScanCompositeConfig[],
  bodyId?: string,
): ScanCompositeConfig[] {
  return composites.filter((c) => (c.bodyId ?? undefined) === bodyId);
}

// ---------------------------------------------------------------------------
// Surface projector — the per-body parameters the shared loop needs
// ---------------------------------------------------------------------------

/**
 * Maps a body's developed (axial mm, circumferential mm) coordinates into the
 * heatmap BUFFER pixel space (relative to the plot's PADDING origin, matching the
 * existing offscreen-buffer blit). Built by the factories below so the main shell
 * and appendage strips stay to-scale on ONE shared pxPerMm.
 */
export interface SurfaceProjector {
  /** Inner circumference of this body (π × body OD), for wrap + seam-skip. */
  circumferenceMm: number;
  /** Zoomed circumferential span in px — the seam-skip threshold basis. */
  circSpanPx: number;
  /** Axial mm on this body → buffer X px. */
  axialToBufX(axialMm: number): number;
  /** Circumferential mm (0…circ, from this body's datum) → buffer Y px. */
  circumToBufY(circumMm: number): number;
  /** Circumferential mm of a composite datum angle (user 0° convention). */
  datumCircMm(datumAngleDeg: number): number;
}

/** View/scale inputs shared by every surface (all in the plot's own units). */
export interface SurfaceView {
  pxPerMm: number;
  marginX: number;
  marginY: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Main-shell projector — reproduces FlattenedViewport's legacy heatmap mapping
 * exactly: axial axis follows the reference scan index direction (`reversed`
 * mirror) and the circumferential axis flips handedness with it (circumDisplayMm).
 */
export function mainSurfaceProjector(
  view: SurfaceView,
  vesselLengthMm: number,
  vesselOD: number,
  reversed: boolean,
): SurfaceProjector {
  const { pxPerMm, marginX, marginY, zoom, offsetX, offsetY } = view;
  const circumferenceMm = Math.PI * vesselOD;
  return {
    circumferenceMm,
    circSpanPx: circumferenceMm * pxPerMm * zoom,
    axialToBufX(axialMm) {
      const pos = axialFrac(axialMm, vesselLengthMm, reversed) * vesselLengthMm;
      return marginX + pos * pxPerMm * zoom + offsetX;
    },
    circumToBufY(circumMm) {
      const yMm = circumDisplayMm(circumMm, circumferenceMm, reversed);
      return marginY + yMm * pxPerMm * zoom + offsetY;
    },
    datumCircMm(datumAngleDeg) {
      return datumToCircumMm(datumAngleDeg, vesselOD);
    },
  };
}

/**
 * Appendage-strip projector. The strip's X axis is the physical appendage axis
 * (0 = main-shell junction, on the LEFT) — it does NOT mirror with the main scan
 * orientation. Its Y axis is the appendage circumference cut at the appendage
 * DATUM 0° meridian (panel top), so a datum-0 composite lands at the top. The
 * strip is offset down the stacked canvas by `topBasePx` (a base/pre-zoom pixel
 * offset that scales with zoom so the whole stack stays glued together).
 */
export function stripSurfaceProjector(
  view: SurfaceView,
  topBasePx: number,
  appendageOD: number,
): SurfaceProjector {
  const { pxPerMm, marginX, marginY, zoom, offsetX, offsetY } = view;
  const circumferenceMm = Math.PI * appendageOD;
  return {
    circumferenceMm,
    circSpanPx: circumferenceMm * pxPerMm * zoom,
    axialToBufX(axialMm) {
      return marginX + axialMm * pxPerMm * zoom + offsetX;
    },
    circumToBufY(circumMm) {
      return marginY + (topBasePx + circumMm * pxPerMm) * zoom + offsetY;
    },
    datumCircMm(datumAngleDeg) {
      return datumToCircumMm(datumAngleDeg, appendageOD);
    },
  };
}

// ---------------------------------------------------------------------------
// Shared cell builder
// ---------------------------------------------------------------------------

/** A painted heatmap cell: an integer buffer rect (clamped) + its RGBA colour. */
export interface HeatCell {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Emit the developed heatmap cells of ONE confirmed composite through `sink`,
 * clamped to a `bufW × bufH` buffer. Nearest/blocky cells (no interpolation),
 * identical to the legacy main-surface loop; the only variation between the main
 * shell and an appendage strip is the injected {@link SurfaceProjector}.
 *
 * Cells whose adjacent circumferential pixels jump more than half a circumference
 * (a wrap across the seam) are skipped, exactly as before, so a scan straddling
 * the cut does not smear across the plot.
 */
export function forEachCompositeCell(
  composite: ScanCompositeConfig,
  projector: SurfaceProjector,
  bufW: number,
  bufH: number,
  sink: (cell: HeatCell) => void,
): void {
  if (!composite.orientationConfirmed || composite.data.length === 0) return;

  const { yAxis, xAxis, data, indexStartMm, indexDirection, scanDirection } = composite;
  const scale = getColorscale(composite.colorScale);
  const rMin = composite.rangeMin ?? composite.stats.min;
  const rMax = composite.rangeMax ?? composite.stats.max;
  const range = rMax === rMin ? 1 : rMax - rMin;
  const alpha = Math.round(Math.max(0, Math.min(1, composite.opacity)) * 255);

  const { circumferenceMm, circSpanPx } = projector;
  const datumCircMm = projector.datumCircMm(composite.datumAngleDeg);

  // Axial (row) buffer pixels.
  const rowPx: number[] = new Array(yAxis.length);
  const rowPxNext: number[] = new Array(yAxis.length);
  for (let row = 0; row < yAxis.length; row++) {
    const axialMm =
      indexDirection === 'forward' ? indexStartMm + yAxis[row] : indexStartMm - yAxis[row];
    const nextMm =
      row + 1 < yAxis.length
        ? indexDirection === 'forward'
          ? indexStartMm + yAxis[row + 1]
          : indexStartMm - yAxis[row + 1]
        : axialMm + (row > 0 ? Math.abs(yAxis[row] - yAxis[row - 1]) : 1);
    rowPx[row] = projector.axialToBufX(axialMm);
    rowPxNext[row] = projector.axialToBufX(nextMm);
  }

  // Circumferential (col) buffer pixels.
  const colPy: number[] = new Array(xAxis.length);
  const colPyNext: number[] = new Array(xAxis.length);
  for (let col = 0; col < xAxis.length; col++) {
    const circumOffset = scanDirection === 'cw' ? xAxis[col] : -xAxis[col];
    let circumMm = datumCircMm + circumOffset;
    circumMm = ((circumMm % circumferenceMm) + circumferenceMm) % circumferenceMm;

    const nextOffset =
      col + 1 < xAxis.length
        ? scanDirection === 'cw'
          ? xAxis[col + 1]
          : -xAxis[col + 1]
        : circumOffset +
          (col > 0
            ? scanDirection === 'cw'
              ? xAxis[col] - xAxis[col - 1]
              : xAxis[col - 1] - xAxis[col]
            : 1);
    let circumMmNext = datumCircMm + nextOffset;
    circumMmNext = ((circumMmNext % circumferenceMm) + circumferenceMm) % circumferenceMm;

    colPy[col] = projector.circumToBufY(circumMm);
    colPyNext[col] = projector.circumToBufY(circumMmNext);
  }

  for (let row = 0; row < data.length; row++) {
    const rowData = data[row];
    if (!rowData) continue;
    const px = rowPx[row];
    const pxNext = rowPxNext[row];
    const cellW = Math.abs(pxNext - px) || 1;
    const cellX = Math.min(px, pxNext);

    for (let col = 0; col < rowData.length; col++) {
      const value = rowData[col];
      if (value == null) continue;

      const py = colPy[col];
      const pyNext = colPyNext[col];
      // Seam wrap: skip a cell whose adjacent circ pixels jumped > half a circ.
      if (Math.abs(pyNext - py) > circSpanPx * 0.5) continue;

      const cellH = Math.abs(pyNext - py) || 1;
      const cellY = Math.min(py, pyNext);

      const t = Math.max(0, Math.min(1, (value - rMin) / range));
      const [r, g, b] = interpolateColor(t, scale, true);

      const x0 = Math.max(0, Math.floor(cellX));
      const y0 = Math.max(0, Math.floor(cellY));
      const x1 = Math.min(bufW, Math.ceil(cellX + cellW));
      const y1 = Math.min(bufH, Math.ceil(cellY + cellH));
      if (x1 <= x0 || y1 <= y0) continue;

      sink({ x0, y0, x1, y1, r, g, b, a: alpha });
    }
  }
}

// ---------------------------------------------------------------------------
// Thickness lookup — body-scoped hover readout
// ---------------------------------------------------------------------------

/**
 * Find the thickness value under a developed coordinate on one body's surface.
 *
 * `bodyId` scopes the search (via {@link compositesForBody}): the main surface
 * (`undefined`) ignores appendage composites, and an appendage panel finds ONLY
 * that body's composites. `circumference`/`bodyOD` are the queried body's, so the
 * datum→circ mapping and wrap distance match that body's panel. Returns the
 * nearest cell value within half a grid spacing, else null.
 */
export function findThicknessAt(
  composites: ScanCompositeConfig[],
  bodyId: string | undefined,
  axialMm: number,
  circumMm: number,
  circumference: number,
  bodyOD: number,
): number | null {
  for (const composite of compositesForBody(composites, bodyId)) {
    if (!composite.orientationConfirmed || composite.data.length === 0) continue;

    const { yAxis, xAxis, data, indexStartMm, indexDirection, scanDirection } = composite;
    const datumCircMm = datumToCircumMm(composite.datumAngleDeg, bodyOD);

    // Closest row (axial)
    let bestRow = -1;
    let bestRowDist = Infinity;
    for (let row = 0; row < yAxis.length; row++) {
      const rowAxial =
        indexDirection === 'forward' ? indexStartMm + yAxis[row] : indexStartMm - yAxis[row];
      const dist = Math.abs(rowAxial - axialMm);
      if (dist < bestRowDist) {
        bestRowDist = dist;
        bestRow = row;
      }
    }

    // Closest col (circumferential, wrap-aware)
    let bestCol = -1;
    let bestColDist = Infinity;
    for (let col = 0; col < xAxis.length; col++) {
      const offset = scanDirection === 'cw' ? xAxis[col] : -xAxis[col];
      let colCirc = datumCircMm + offset;
      colCirc = ((colCirc % circumference) + circumference) % circumference;
      let dist = Math.abs(colCirc - circumMm);
      if (dist > circumference / 2) dist = circumference - dist;
      if (dist < bestColDist) {
        bestColDist = dist;
        bestCol = col;
      }
    }

    if (bestRow < 0 || bestCol < 0) continue;

    const rowSpacing = yAxis.length > 1 ? Math.abs(yAxis[1] - yAxis[0]) : 10;
    const colSpacing = xAxis.length > 1 ? Math.abs(xAxis[1] - xAxis[0]) : 10;
    if (bestRowDist > rowSpacing || bestColDist > colSpacing) continue;

    const value = data[bestRow]?.[bestCol];
    if (value != null) return value;
  }

  return null;
}
