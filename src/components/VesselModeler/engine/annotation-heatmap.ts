// =============================================================================
// Annotation Heatmap - Cropped mini heatmap canvas for inspection panel
// =============================================================================
// Extracts the sub-region of scan composite data under an annotation footprint
// and renders it to a canvas element for display in the InspectionPanel.
// =============================================================================

import type { AnnotationShapeConfig, ScanCompositeConfig, VesselState } from '../types';
import { interpolateColor, COLOR_SCALES } from '../../../utils/colorscales';

// ---------------------------------------------------------------------------
// Helpers (shared with annotation-stats.ts)
// ---------------------------------------------------------------------------

/** Normalise an angle into the 0-360 range */
function normAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

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

// ---------------------------------------------------------------------------
// Composite overlap detection
// ---------------------------------------------------------------------------

/**
 * Check whether a scan composite's footprint overlaps the annotation's
 * bounding box on the vessel surface.
 */
function compositeOverlapsAnnotation(
  composite: ScanCompositeConfig,
  ann: AnnotationShapeConfig,
  circumference: number,
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

  // Composite scan (circumferential) extent in degrees
  const scanRangeMm = xAxis[xAxis.length - 1] - xAxis[0];
  const scanRangeDeg = (scanRangeMm / circumference) * 360;

  // Annotation bounds
  const halfWidthMm = ann.width / 2;
  const halfHeightDeg = ((ann.height / 2) / circumference) * 360;
  const annAxialStart = ann.pos - halfWidthMm;
  const annAxialEnd = ann.pos + halfWidthMm;

  // Check axial overlap
  if (annAxialEnd < compAxialStart || annAxialStart > compAxialEnd) return false;

  // Check circumferential overlap (simplified — check if any edge of the
  // annotation falls within the composite's angular range from datum)
  const annAngleMin = ann.angle - halfHeightDeg;
  const annAngleMax = ann.angle + halfHeightDeg;

  // Convert annotation angles to offset from datum in scan direction
  for (const testAngle of [annAngleMin, annAngleMax, ann.angle]) {
    const rawDelta = angularDelta(datumAngleDeg, testAngle);
    const scanOffsetDeg = scanDirection === 'cw' ? -rawDelta : rawDelta;
    if (scanOffsetDeg >= 0 && scanOffsetDeg <= scanRangeDeg) return true;
  }

  // Also test composite edges against annotation center
  const datumDelta = angularDelta(ann.angle, datumAngleDeg);
  const datumDeltaDeg = Math.abs(datumDelta);
  if (datumDeltaDeg <= halfHeightDeg) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Sample a single point from a composite (mirrors annotation-stats.ts)
// ---------------------------------------------------------------------------

function sampleComposite(
  composite: ScanCompositeConfig,
  posMm: number,
  angleDeg: number,
  circumference: number,
): number | undefined {
  const { data, xAxis, yAxis, indexStartMm, datumAngleDeg, scanDirection, indexDirection } =
    composite;

  if (data.length === 0 || data[0].length === 0) return undefined;
  if (yAxis.length === 0 || xAxis.length === 0) return undefined;

  const indexRangeMm = yAxis[yAxis.length - 1] - yAxis[0];
  let indexOffset: number;
  if (indexDirection === 'forward') {
    indexOffset = posMm - indexStartMm;
  } else {
    indexOffset = indexStartMm - posMm;
  }
  if (indexOffset < 0 || indexOffset > indexRangeMm) return undefined;

  const scanRangeMm = xAxis[xAxis.length - 1] - xAxis[0];
  const scanRangeDeg = (scanRangeMm / circumference) * 360;

  const rawDelta = angularDelta(datumAngleDeg, angleDeg);
  let scanOffsetDeg: number;
  if (scanDirection === 'cw') {
    scanOffsetDeg = -rawDelta;
  } else {
    scanOffsetDeg = rawDelta;
  }
  if (scanOffsetDeg < 0 || scanOffsetDeg > scanRangeDeg) return undefined;

  const rowFrac = indexRangeMm > 0 ? (indexOffset / indexRangeMm) * (data.length - 1) : 0;
  const scanOffsetMm = (scanOffsetDeg / 360) * circumference - xAxis[0];
  const colFrac = scanRangeMm > 0 ? (scanOffsetMm / scanRangeMm) * (data[0].length - 1) : 0;

  const row = Math.round(rowFrac);
  const col = Math.round(colFrac);

  if (row < 0 || row >= data.length || col < 0 || col >= data[0].length) return undefined;

  const value = data[row][col];
  return value ?? undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find the topmost confirmed scan composite that overlaps the annotation.
 * Returns the composite, or undefined if none overlap.
 */
export function findOverlappingComposite(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
): ScanCompositeConfig | undefined {
  const circumference = Math.PI * vesselState.id;
  const composites = vesselState.scanComposites;

  // Iterate in reverse — last (topmost) composite wins
  for (let i = composites.length - 1; i >= 0; i--) {
    const comp = composites[i];
    if (compositeOverlapsAnnotation(comp, ann, circumference)) {
      return comp;
    }
  }
  return undefined;
}

/**
 * Create an HTMLCanvasElement rendering a cropped mini-heatmap of the scan
 * composite data under an annotation footprint.
 *
 * Returns null if no confirmed composite overlaps the annotation.
 */
export function createAnnotationHeatmapCanvas(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  colorScale: string = 'Jet',
): HTMLCanvasElement | null {
  const circumference = Math.PI * vesselState.id;
  const composite = findOverlappingComposite(ann, vesselState);
  if (!composite) return null;

  const scale = COLOR_SCALES[colorScale] ?? COLOR_SCALES.Jet;

  // Determine color range (honour overrides)
  const rangeMin = composite.rangeMin ?? composite.stats.min;
  const rangeMax = composite.rangeMax ?? composite.stats.max;
  const range = rangeMax - rangeMin;

  // Annotation spatial bounds
  const halfWidthMm = ann.width / 2;
  const halfHeightDeg = ((ann.height / 2) / circumference) * 360;

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

  // Cap canvas size to prevent excessive memory usage
  const maxDim = 256;
  const canvasW = Math.min(cols, maxDim);
  const canvasH = Math.min(rows, maxDim);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imageData = ctx.createImageData(canvasW, canvasH);
  const pixels = imageData.data;

  const isCircle = ann.type === 'circle';
  const radius = ann.width / 2;

  const axialStep = (axialEnd - axialStart) / canvasW;
  const angleStep = (angleEnd - angleStart) / canvasH;

  for (let py = 0; py < canvasH; py++) {
    const angle = angleStart + (py + 0.5) * angleStep;
    for (let px = 0; px < canvasW; px++) {
      const axial = axialStart + (px + 0.5) * axialStep;
      const idx = (py * canvasW + px) * 4;

      // Circle hit test
      if (isCircle) {
        const dxMm = axial - ann.pos;
        const dyDeg = angularDelta(ann.angle, angle);
        const dyMm = (dyDeg / 360) * circumference;
        const dist = Math.sqrt(dxMm * dxMm + dyMm * dyMm);
        if (dist > radius) {
          // transparent
          pixels[idx] = 0;
          pixels[idx + 1] = 0;
          pixels[idx + 2] = 0;
          pixels[idx + 3] = 0;
          continue;
        }
      }

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

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
