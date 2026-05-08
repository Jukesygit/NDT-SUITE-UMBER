// =============================================================================
// Annotation Thickness Stats Computation Engine
// =============================================================================
// Computes thickness statistics for annotations that overlap scan composite
// data on the vessel surface. Handles spatial mapping between annotation
// footprints and scan composite data grids.
// =============================================================================

import type {
  AnnotationShapeConfig,
  AnnotationThicknessStats,
  VesselState,
  ThicknessThresholds,
} from '../types';
import { normAngle, sampleComposite } from './scan-sampling';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute thickness statistics for an annotation by sampling all confirmed
 * scan composites that fall under its footprint on the vessel surface.
 */
export function computeAnnotationThicknessStats(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
): AnnotationThicknessStats | undefined {
  const circumference = Math.PI * vesselState.id;
  const composites = vesselState.scanComposites;
  const STEP = 2; // mm spacing for sample grid

  // Annotation dimensions
  const centerPos = ann.pos; // axial mm
  const centerAngle = ann.angle; // degrees
  const halfWidthMm = ann.width / 2; // axial half-extent
  const halfHeightMm = ann.height / 2; // circumferential half-extent in mm

  // Convert circumferential half-extent from mm to degrees
  const halfHeightDeg = (halfHeightMm / circumference) * 360;

  // Determine sample grid bounds
  const axialStart = centerPos - halfWidthMm;
  const axialEnd = centerPos + halfWidthMm;
  const angleStart = centerAngle - halfHeightDeg;
  const angleEnd = centerAngle + halfHeightDeg;

  // Step size in degrees for circumferential sampling (~2mm)
  const degPerMm = 360 / circumference;
  const angleDegStep = STEP * degPerMm;

  // Collect readings (all annotations are rectangular — grid bounds constrain the shape)
  const values: number[] = [];
  const positions: Array<{ pos: number; angle: number }> = [];

  for (let axial = axialStart; axial <= axialEnd; axial += STEP) {
    for (let angle = angleStart; angle <= angleEnd; angle += angleDegStep) {

      const sampleAngle = normAngle(angle);

      // Iterate composites in reverse (last = topmost wins)
      let found = false;
      for (let i = composites.length - 1; i >= 0; i--) {
        const comp = composites[i];
        if (!comp.orientationConfirmed) continue;

        const val = sampleComposite(comp, axial, sampleAngle, circumference);
        if (val !== undefined) {
          values.push(val);
          positions.push({ pos: axial, angle: sampleAngle });
          found = true;
          break; // topmost composite wins
        }
      }
      // If no composite had data at this point, skip (no reading)
      if (!found) continue;
    }
  }

  if (values.length === 0) return undefined;

  // Compute statistics
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let minIdx = 0;
  let maxIdx = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    sum += v;
    if (v < min) {
      min = v;
      minIdx = i;
    }
    if (v > max) {
      max = v;
      maxIdx = i;
    }
  }

  const avg = sum / values.length;

  // Standard deviation
  let sumSqDiff = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - avg;
    sumSqDiff += d * d;
  }
  const stdDev = Math.sqrt(sumSqDiff / values.length);

  return {
    min,
    max,
    avg,
    stdDev,
    minPoint: positions[minIdx],
    maxPoint: positions[maxIdx],
    sampleCount: values.length,
  };
}

/**
 * Determine severity level for an annotation based on its thickness stats
 * and the configured thresholds.
 */
export function computeSeverityLevel(
  stats: AnnotationThicknessStats | undefined,
  thresholds: ThicknessThresholds | undefined,
): 'red' | 'yellow' | 'green' | null {
  if (!stats || !thresholds) return null;

  if (thresholds.mode === 'absolute') {
    const { redBelow, yellowBelow } = thresholds;
    if (redBelow == null || yellowBelow == null) return null;
    if (stats.min < redBelow) return 'red';
    if (stats.min < yellowBelow) return 'yellow';
    return 'green';
  }

  if (thresholds.mode === 'percentage') {
    const { nominalThickness, redBelowPct, yellowBelowPct } = thresholds;
    if (nominalThickness == null || redBelowPct == null || yellowBelowPct == null) return null;
    const redThreshold = nominalThickness * (redBelowPct / 100);
    const yellowThreshold = nominalThickness * (yellowBelowPct / 100);
    if (stats.min < redThreshold) return 'red';
    if (stats.min < yellowThreshold) return 'yellow';
    return 'green';
  }

  return null;
}

/**
 * Recompute thickness stats and severity levels for all annotations in the
 * vessel state. Returns a new array of annotations with updated fields.
 */
export function recomputeAllAnnotationStats(
  vesselState: VesselState,
): AnnotationShapeConfig[] {
  return vesselState.annotations.map((ann) => {
    const thicknessStats = computeAnnotationThicknessStats(ann, vesselState);
    const severityLevel = computeSeverityLevel(thicknessStats, vesselState.thicknessThresholds);
    return { ...ann, thicknessStats, severityLevel };
  });
}
