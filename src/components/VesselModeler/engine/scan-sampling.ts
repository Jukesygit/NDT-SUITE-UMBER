import type { ScanCompositeConfig } from '../types';

/** Normalise an angle into the 0–360 range. */
export function normAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Look up a thickness value in a composite's data grid for a given vessel
 * surface point expressed as (posMm, angleDeg).
 *
 * Returns the thickness value, or undefined if the point is outside the
 * composite's footprint or the data cell is null.
 */
export function sampleComposite(
  composite: ScanCompositeConfig,
  posMm: number,
  angleDeg: number,
  circumference: number,
): number | undefined {
  const { data, xAxis, yAxis, indexStartMm, datumAngleDeg, scanDirection, indexDirection } =
    composite;

  if (data.length === 0 || data[0].length === 0) return undefined;
  if (yAxis.length === 0 || xAxis.length === 0) return undefined;

  // --- Index (longitudinal) axis ---
  const indexRangeMm = yAxis[yAxis.length - 1] - yAxis[0];
  let indexOffset: number;
  if (indexDirection === 'forward') {
    indexOffset = posMm - indexStartMm;
  } else {
    indexOffset = indexStartMm - posMm;
  }
  if (indexOffset < 0 || indexOffset > indexRangeMm) return undefined;

  // --- Scan (circumferential) axis ---
  const scanStartMm = xAxis[0];
  const scanEndMm = xAxis[xAxis.length - 1];
  const scanRangeMm = scanEndMm - scanStartMm;

  const datumInAnnConvention = normAngle(datumAngleDeg + 90);
  let scanOffsetDeg: number;
  if (scanDirection === 'cw') {
    scanOffsetDeg = ((datumInAnnConvention - angleDeg) % 360 + 360) % 360;
  } else {
    scanOffsetDeg = ((angleDeg - datumInAnnConvention) % 360 + 360) % 360;
  }
  const scanOffsetMm = (scanOffsetDeg / 360) * circumference;
  if (scanOffsetMm < scanStartMm || scanOffsetMm > scanEndMm) return undefined;

  const rowFrac = indexRangeMm > 0 ? (indexOffset / indexRangeMm) * (data.length - 1) : 0;
  const colFrac = scanRangeMm > 0 ? ((scanOffsetMm - scanStartMm) / scanRangeMm) * (data[0].length - 1) : 0;

  const row = Math.round(rowFrac);
  const col = Math.round(colFrac);

  if (row < 0 || row >= data.length || col < 0 || col >= data[0].length) return undefined;

  const value = data[row][col];
  return value ?? undefined;
}
