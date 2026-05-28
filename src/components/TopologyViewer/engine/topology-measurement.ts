import type { MeasurementPoint, MeasurementResult } from '../types';

/**
 * Compute true physical measurements between two surface points.
 *
 * All outputs are in real mm — visual exaggeration is never applied.
 * The nominal parameter is used only to compute wall-loss context.
 */
export function computeMeasurement(
  a: MeasurementPoint,
  b: MeasurementPoint,
  nominal: number,
): MeasurementResult {
  const dx = b.scanMm - a.scanMm;
  const dy = b.indexMm - a.indexMm;
  const horizontalDistance = Math.sqrt(dx * dx + dy * dy);

  const depthDifference = (a.thickness != null && b.thickness != null)
    ? b.thickness - a.thickness
    : null;

  // Clamp to zero: negative wall loss (thickness > nominal) is not meaningful.
  // Matches existing convention in distributionEngine.ts.
  const wallLossA = a.thickness != null ? Math.max(0, nominal - a.thickness) : null;
  const wallLossB = b.thickness != null ? Math.max(0, nominal - b.thickness) : null;

  return { horizontalDistance, depthDifference, wallLossA, wallLossB };
}
