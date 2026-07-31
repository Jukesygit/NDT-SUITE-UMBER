// =============================================================================
// Annotation Heatmap - Cropped mini heatmap canvas for inspection panel
// =============================================================================
// Extracts the sub-region of scan data under an annotation footprint and
// renders it to a canvas for the InspectionPanel. Sampling is delegated to the
// shared engine (scan-sampling.ts) — the SAME sampler annotation stats use — so
// the two agree cell-for-cell:
//   - pure-cylinder rect  -> cropped view of the topmost cylindrical composite
//                            (byte-identical to the pre-dome behaviour).
//   - head-touching rect  -> the rigid drape grid sampled region-aware, so an
//                            annotation on a dome end reads `domeScanComposites`.
// The pixel buffer is produced by a pure, canvas-free builder
// ({@link buildAnnotationHeatmapPixels}) — jsdom has no 2D context — with a thin
// canvas wrapper for the DOM.
// =============================================================================

import type { AnnotationShapeConfig, ScanCompositeConfig, VesselState } from '../types';
import { interpolateColor, COLOR_SCALES } from '../../../utils/colorscales';
import {
  normAngle,
  sampleComposite,
  sampleAnnotationDrapeGrid,
  rectIsPureCylinder,
  resolveBodyDims,
} from './scan-sampling';

// ---------------------------------------------------------------------------
// Composite overlap detection
// ---------------------------------------------------------------------------

/**
 * Signed shortest angular distance from `a` to `b` on a 360-degree circle.
 * Positive = counter-clockwise, Negative = clockwise.
 */
function angularDelta(a: number, b: number): number {
  let d = normAngle(b) - normAngle(a);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** True when the composite's body matches the target body (undefined = main shell). */
function bodyMatches(compBodyId: string | undefined, body: string | undefined): boolean {
  return (compBodyId ?? undefined) === (body ?? undefined);
}

/**
 * Check whether a scan composite's footprint overlaps the annotation's
 * bounding box on the vessel surface.
 */
function compositeOverlapsAnnotation(
  composite: ScanCompositeConfig,
  ann: AnnotationShapeConfig,
  circumference: number
): boolean {
  if (!composite.orientationConfirmed) return false;

  const { xAxis, yAxis, indexStartMm, datumAngleDeg, scanDirection, indexDirection } = composite;
  if (yAxis.length === 0 || xAxis.length === 0) return false;

  // Composite index (longitudinal) extent
  const indexRangeMm = yAxis[yAxis.length - 1] - yAxis[0];
  let compAxialStart: number;
  let compAxialEnd: number;
  if (indexDirection === 'forward') {
    compAxialStart = indexStartMm;
    compAxialEnd = indexStartMm + indexRangeMm;
  } else {
    compAxialStart = indexStartMm - indexRangeMm;
    compAxialEnd = indexStartMm;
  }

  // Composite scan (circumferential) extent — xAxis values are mm from datum
  const scanStartMm = xAxis[0];
  const scanEndMm = xAxis[xAxis.length - 1];

  // Annotation bounds
  const halfWidthMm = ann.width / 2;
  const halfHeightDeg = (ann.height / 2 / circumference) * 360;
  const annAxialStart = ann.pos - halfWidthMm;
  const annAxialEnd = ann.pos + halfWidthMm;

  // Check axial overlap
  if (annAxialEnd < compAxialStart || annAxialStart > compAxialEnd) return false;

  // Check circumferential overlap — convert annotation angles to mm offset from datum
  const annAngleMin = ann.angle - halfHeightDeg;
  const annAngleMax = ann.angle + halfHeightDeg;

  // datumAngleDeg uses 0=TDC, annotation angles use 90=TDC — convert.
  // Use directed angular distance (not shortest path) in scan direction.
  const datumConv = normAngle(datumAngleDeg + 90);
  for (const testAngle of [annAngleMin, annAngleMax, ann.angle]) {
    let scanOffsetDeg: number;
    if (scanDirection === 'cw') {
      scanOffsetDeg = (((datumConv - testAngle) % 360) + 360) % 360;
    } else {
      scanOffsetDeg = (((testAngle - datumConv) % 360) + 360) % 360;
    }
    const scanOffsetMm = (scanOffsetDeg / 360) * circumference;
    if (scanOffsetMm >= scanStartMm && scanOffsetMm <= scanEndMm) return true;
  }

  // Also test: does the composite's scan range overlap the annotation's angular range?
  // Check if composite start or end angle falls within the annotation
  for (const edgeMm of [scanStartMm, scanEndMm]) {
    const edgeDeg = (edgeMm / circumference) * 360;
    let edgeAngle: number;
    if (scanDirection === 'cw') {
      edgeAngle = normAngle(datumConv - edgeDeg);
    } else {
      edgeAngle = normAngle(datumConv + edgeDeg);
    }
    const delta = angularDelta(ann.angle, edgeAngle);
    if (Math.abs(delta) <= halfHeightDeg) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find the topmost confirmed cylindrical composite that overlaps the
 * annotation. Composites are scoped by `body` (undefined = main shell),
 * replacing the former interim `!bodyId` exclusion. Returns undefined if none
 * overlap (e.g. a head-only annotation — those read dome scans instead).
 */
export function findOverlappingComposite(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  body?: string
): ScanCompositeConfig | undefined {
  const circumference = resolveBodyDims(vesselState, body).circumference;
  const composites = vesselState.scanComposites;
  // Iterate in reverse — last (topmost) composite wins
  for (let i = composites.length - 1; i >= 0; i--) {
    const comp = composites[i];
    if (!bodyMatches(comp.bodyId, body)) continue;
    if (compositeOverlapsAnnotation(comp, ann, circumference)) {
      return comp;
    }
  }
  return undefined;
}

/** A pure (canvas-free) heatmap pixel buffer plus its colour domain. */
export interface HeatmapPixelResult {
  /** RGBA pixels, row-major, length = width·height·4. */
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** Colour-domain minimum (thinnest reading painted). */
  dataMin: number;
  /** Colour-domain maximum (thickest reading painted). */
  dataMax: number;
}

/** Cropped view of the topmost overlapping cylindrical composite (legacy path). */
function buildCylinderCropPixels(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  colorScale: string,
  body: string | undefined
): HeatmapPixelResult | null {
  const circumference = resolveBodyDims(vesselState, body).circumference;
  const composite = findOverlappingComposite(ann, vesselState, body);
  if (!composite) return null;

  const scale = COLOR_SCALES[colorScale] ?? COLOR_SCALES.Jet;

  // Determine color range (honour overrides)
  const rangeMin = composite.rangeMin ?? composite.stats.min;
  const rangeMax = composite.rangeMax ?? composite.stats.max;
  const range = rangeMax - rangeMin;

  // Annotation spatial bounds
  const halfWidthMm = ann.width / 2;
  const halfHeightDeg = (ann.height / 2 / circumference) * 360;

  const axialStart = ann.pos - halfWidthMm;
  const axialEnd = ann.pos + halfWidthMm;
  const angleStart = ann.angle - halfHeightDeg;
  const angleEnd = ann.angle + halfHeightDeg;

  // Sampling resolution — aim for ~2mm per pixel, capped for sanity
  const STEP = 2; // mm
  const degPerMm = 360 / circumference;
  const angleDegStep = STEP * degPerMm;

  const cols = Math.max(1, Math.ceil((axialEnd - axialStart) / STEP));
  const rows = Math.max(1, Math.ceil((angleEnd - angleStart) / angleDegStep));

  // Cap size to prevent excessive memory usage
  const maxDim = 256;
  const canvasW = Math.min(cols, maxDim);
  const canvasH = Math.min(rows, maxDim);

  const pixels = new Uint8ClampedArray(canvasW * canvasH * 4);

  const axialStep = (axialEnd - axialStart) / canvasW;
  const angleStep = (angleEnd - angleStart) / canvasH;

  // 2D preview orientation: vertical (circumferential) is inverted from
  // the 3D texture because wrapping around the outside mirrors that axis.
  // Horizontal (axial) keeps the same direction as the 3D texture.
  const flipV = composite.scanDirection !== 'cw';
  const flipU = composite.indexDirection === 'forward';

  for (let py = 0; py < canvasH; py++) {
    const yFrac = flipV ? canvasH - 1 - py : py;
    const angle = angleStart + (yFrac + 0.5) * angleStep;
    for (let px = 0; px < canvasW; px++) {
      const xFrac = flipU ? canvasW - 1 - px : px;
      const axial = axialStart + (xFrac + 0.5) * axialStep;
      const idx = (py * canvasW + px) * 4;

      const sampleAngle = normAngle(angle);
      const val = sampleComposite(composite, axial, sampleAngle, circumference);

      if (val === undefined) {
        // transparent for null/missing data
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      } else {
        // Normalize and colorize
        const t = range > 0 ? (val - rangeMin) / range : 0.5;
        const [r, g, b] = interpolateColor(t, scale, true); // reverse: thin=red, thick=blue
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = 255;
      }
    }
  }

  return { pixels, width: canvasW, height: canvasH, dataMin: rangeMin, dataMax: rangeMax };
}

/**
 * Rigid-drape heatmap for a head-touching annotation: colour each drape-grid
 * vertex by the region-aware sample. The colour domain is the sampled min/max,
 * so the thinnest sampled cell (which drives the stats min) sits at one end —
 * the heatmap's min equals the stats min by construction (same cell set).
 * Image axes: `x` = meridian (width), `y` = lateral (height).
 */
function buildDrapeHeatmapPixels(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  colorScale: string,
  body: string | undefined
): HeatmapPixelResult | null {
  const { values, cols, rows } = sampleAnnotationDrapeGrid(ann, vesselState, body);

  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r <= rows; r++) {
      const v = values[c][r];
      if (v === undefined) continue;
      if (v < dataMin) dataMin = v;
      if (v > dataMax) dataMax = v;
    }
  }
  if (dataMin === Infinity) return null; // no data under the footprint

  const scale = COLOR_SCALES[colorScale] ?? COLOR_SCALES.Jet;
  const range = dataMax - dataMin;

  const width = cols + 1;
  const height = rows + 1;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const idx = (r * width + c) * 4;
      const v = values[c][r];
      if (v === undefined) {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      } else {
        const t = range > 0 ? (v - dataMin) / range : 0.5;
        const [rr, gg, bb] = interpolateColor(t, scale, true); // reverse: thin=red, thick=blue
        pixels[idx] = rr;
        pixels[idx + 1] = gg;
        pixels[idx + 2] = bb;
        pixels[idx + 3] = 255;
      }
    }
  }

  return { pixels, width, height, dataMin, dataMax };
}

/**
 * Build the RGBA pixel buffer for an annotation's mini-heatmap without touching
 * the DOM (pure — jsdom has no 2D context). Routes pure-cylinder rects to the
 * legacy composite crop and head-touching rects to the rigid drape sampler.
 * Returns null when no scan data lies under the footprint.
 */
export function buildAnnotationHeatmapPixels(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  colorScale: string = 'Jet',
  body?: string
): HeatmapPixelResult | null {
  if (rectIsPureCylinder(ann, vesselState)) {
    return buildCylinderCropPixels(ann, vesselState, colorScale, body);
  }
  return buildDrapeHeatmapPixels(ann, vesselState, colorScale, body);
}

/**
 * Create an HTMLCanvasElement rendering a cropped mini-heatmap of the scan data
 * under an annotation footprint. Thin canvas wrapper over
 * {@link buildAnnotationHeatmapPixels}.
 *
 * Returns null if no scan data lies under the annotation, or when no 2D canvas
 * context is available (e.g. jsdom).
 */
export function createAnnotationHeatmapCanvas(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  colorScale: string = 'Jet',
  body?: string
): HTMLCanvasElement | null {
  const result = buildAnnotationHeatmapPixels(ann, vesselState, colorScale, body);
  if (!result) return null;

  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imageData = ctx.createImageData(result.width, result.height);
  imageData.data.set(result.pixels);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
