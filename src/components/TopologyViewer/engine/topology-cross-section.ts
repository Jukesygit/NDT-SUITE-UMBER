import type { CscanData } from '../../CscanVisualizer/types';
import type { CrossSectionData, CrossSectionPoint } from '../types';

/**
 * Bilinear interpolation on the full-resolution grid.
 * Returns null if any corner of the containing cell is null.
 */
export function bilinearSample(
  data: (number | null)[][],
  xAxis: number[],
  yAxis: number[],
  scanMm: number,
  indexMm: number,
): number | null {
  // Reject points outside the scan footprint — never fabricate edge values
  if (scanMm < xAxis[0] || scanMm > xAxis[xAxis.length - 1]) return null;
  if (indexMm < yAxis[0] || indexMm > yAxis[yAxis.length - 1]) return null;

  const col = findFractionalIndex(xAxis, scanMm);
  const row = findFractionalIndex(yAxis, indexMm);

  const c0 = Math.floor(col);
  const c1 = Math.min(c0 + 1, xAxis.length - 1);
  const r0 = Math.floor(row);
  const r1 = Math.min(r0 + 1, yAxis.length - 1);

  const v00 = data[r0]?.[c0];
  const v01 = data[r0]?.[c1];
  const v10 = data[r1]?.[c0];
  const v11 = data[r1]?.[c1];

  if (v00 == null || v01 == null || v10 == null || v11 == null) return null;

  const tx = c0 === c1 ? 0 : col - c0;
  const ty = r0 === r1 ? 0 : row - r0;

  return (
    v00 * (1 - tx) * (1 - ty) +
    v01 * tx * (1 - ty) +
    v10 * (1 - tx) * ty +
    v11 * tx * ty
  );
}

/**
 * Extract a cross-section profile along a line, using bilinear interpolation
 * on the full-resolution grid.
 *
 * Sample count is automatically derived from the finer axis spacing —
 * at least one sample per grid cell along the line.
 */
export function extractCrossSection(
  cscan: CscanData,
  startScanMm: number,
  startIndexMm: number,
  endScanMm: number,
  endIndexMm: number,
  numSamplesOverride?: number,
): CrossSectionData {
  const { data, xAxis, yAxis } = cscan;
  const dx = endScanMm - startScanMm;
  const dy = endIndexMm - startIndexMm;
  const totalDistance = Math.sqrt(dx * dx + dy * dy);

  let numSamples: number;
  if (numSamplesOverride != null) {
    numSamples = numSamplesOverride;
  } else {
    const minSpacing = computeMinSpacing(xAxis, yAxis);
    numSamples = Math.max(2, Math.ceil(totalDistance / minSpacing) + 1);
  }

  const points: CrossSectionPoint[] = [];

  for (let i = 0; i < numSamples; i++) {
    const t = numSamples <= 1 ? 0 : i / (numSamples - 1);
    const scanMm = startScanMm + dx * t;
    const indexMm = startIndexMm + dy * t;

    const thickness = bilinearSample(data, xAxis, yAxis, scanMm, indexMm);

    points.push({ distance: totalDistance * t, thickness, scanMm, indexMm });
  }

  return {
    points, totalDistance,
    startScanMm, startIndexMm, endScanMm, endIndexMm,
  };
}

function findFractionalIndex(axis: number[], value: number): number {
  if (value <= axis[0]) return 0;
  if (value >= axis[axis.length - 1]) return axis.length - 1;

  for (let i = 0; i < axis.length - 1; i++) {
    if (value >= axis[i] && value <= axis[i + 1]) {
      const span = axis[i + 1] - axis[i];
      return span === 0 ? i : i + (value - axis[i]) / span;
    }
  }
  return axis.length - 1;
}

function computeMinSpacing(xAxis: number[], yAxis: number[]): number {
  let minSp = Infinity;
  for (let i = 1; i < xAxis.length; i++) {
    const sp = Math.abs(xAxis[i] - xAxis[i - 1]);
    if (sp > 0 && sp < minSp) minSp = sp;
  }
  for (let i = 1; i < yAxis.length; i++) {
    const sp = Math.abs(yAxis[i] - yAxis[i - 1]);
    if (sp > 0 && sp < minSp) minSp = sp;
  }
  return minSp === Infinity ? 1 : minSp;
}
