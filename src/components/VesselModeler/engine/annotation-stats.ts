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
import { sampleAnnotationFootprint } from './scan-sampling';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute thickness statistics for an annotation by sampling every confirmed
 * scan composite under its footprint on the vessel surface.
 *
 * Sampling is delegated to the shared region-aware sampler
 * ({@link sampleAnnotationFootprint}): a pure-cylinder rect reads cylindrical
 * composites over the legacy axial×circumferential grid (byte-identical to the
 * pre-dome behaviour), while a head-touching rect follows its rigid drape onto
 * the dome and reads `domeScanComposites`. `body` (undefined = main shell)
 * scopes the composites, replacing the former interim `!bodyId` filter.
 */
export function computeAnnotationThicknessStats(
  ann: AnnotationShapeConfig,
  vesselState: VesselState,
  body?: string
): AnnotationThicknessStats | undefined {
  const samples = sampleAnnotationFootprint(ann, vesselState, body);
  if (samples.length === 0) return undefined;

  // Compute statistics (first strict extreme wins its index, as before).
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let minIdx = 0;
  let maxIdx = 0;

  for (let i = 0; i < samples.length; i++) {
    const v = samples[i].value;
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

  const avg = sum / samples.length;

  // Standard deviation
  let sumSqDiff = 0;
  for (let i = 0; i < samples.length; i++) {
    const d = samples[i].value - avg;
    sumSqDiff += d * d;
  }
  const stdDev = Math.sqrt(sumSqDiff / samples.length);

  return {
    min,
    max,
    avg,
    stdDev,
    minPoint: { pos: samples[minIdx].pos, angle: samples[minIdx].angle },
    maxPoint: { pos: samples[maxIdx].pos, angle: samples[maxIdx].angle },
    sampleCount: samples.length,
  };
}

/**
 * Determine severity level for an annotation based on its thickness stats
 * and the configured thresholds.
 */
export function computeSeverityLevel(
  stats: AnnotationThicknessStats | undefined,
  thresholds: ThicknessThresholds | undefined
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
export function recomputeAllAnnotationStats(vesselState: VesselState): AnnotationShapeConfig[] {
  return vesselState.annotations.map((ann) => {
    // Sample the annotation's own body (undefined = main shell) so an appendage
    // annotation reads that body's composites / dished-closure dome scans.
    const thicknessStats = computeAnnotationThicknessStats(ann, vesselState, ann.bodyId);
    const severityLevel = computeSeverityLevel(thicknessStats, vesselState.thicknessThresholds);
    return { ...ann, thicknessStats, severityLevel };
  });
}
