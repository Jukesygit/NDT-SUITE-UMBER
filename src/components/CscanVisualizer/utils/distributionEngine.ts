import type { CscanData, DistributionConfig, DistributionBin, DistributionResult } from '../types';

/**
 * Compute a binned distribution of the active scan data.
 *
 * - Thickness mode: bins span the data's [min, max] range in mm.
 * - Wall-loss mode: bins span 0–100 % wall loss, where
 *   wallLoss = (nominal - measured) / nominal × 100, clamped to [0, 100].
 *
 * Cell area is flat: xSpacing × ySpacing (mm²), converted to m².
 */
/**
 * Build equal-width auto boundaries for the given range and bin count.
 * Returns N+1 boundary values defining N bins.
 */
export function autoBoundaries(
  rangeMin: number,
  rangeMax: number,
  binCount: number,
): number[] {
  const span = rangeMax - rangeMin;
  const w = span / binCount;
  const b: number[] = [];
  for (let i = 0; i <= binCount; i++) {
    b.push(rangeMin + i * w);
  }
  return b;
}

export function computeDistribution(
  data: CscanData,
  config: DistributionConfig,
): DistributionResult | null {
  const { mode, binCount, nominalThickness, customBoundaries } = config;

  if (!data.data || data.data.length === 0) return null;
  if (mode === 'wallLoss' && nominalThickness <= 0) return null;

  // Determine cell area (mm²)
  const xSpacing = data.xAxis.length > 1
    ? Math.abs(data.xAxis[1] - data.xAxis[0])
    : 1.0;
  const ySpacing = data.yAxis.length > 1
    ? Math.abs(data.yAxis[1] - data.yAxis[0])
    : 1.0;
  const cellAreaMm2 = xSpacing * ySpacing;

  // Collect valid values
  const values: number[] = [];
  for (let row = 0; row < data.data.length; row++) {
    const rowData = data.data[row];
    for (let col = 0; col < rowData.length; col++) {
      const v = rowData[col];
      if (v != null && !isNaN(v)) values.push(v);
    }
  }

  if (values.length === 0) return null;

  const unit = mode === 'thickness' ? 'mm' : '%';

  // Determine boundaries
  let boundaries: number[];

  if (customBoundaries && customBoundaries.length >= 2) {
    boundaries = [...customBoundaries].sort((a, b) => a - b);
  } else {
    let rangeMin: number;
    let rangeMax: number;

    if (mode === 'thickness') {
      let dMin = Infinity;
      let dMax = -Infinity;
      for (const v of values) {
        if (v < dMin) dMin = v;
        if (v > dMax) dMax = v;
      }
      rangeMin = dMin;
      rangeMax = dMax;
    } else {
      rangeMin = 0;
      rangeMax = 100;
    }

    const rangeSpan = rangeMax - rangeMin;
    if (rangeSpan <= 0 && mode === 'thickness') {
      const totalAreaM2 = (values.length * cellAreaMm2) / 1e6;
      return {
        bins: [{
          min: rangeMin,
          max: rangeMax,
          area: totalAreaM2,
          areaPercent: 100,
          count: values.length,
        }],
        totalArea: totalAreaM2,
        totalPoints: values.length,
        mode,
        unit,
      };
    }

    boundaries = autoBoundaries(rangeMin, rangeMax, binCount);
  }

  const numBins = boundaries.length - 1;
  const bins: DistributionBin[] = Array.from({ length: numBins }, (_, i) => ({
    min: boundaries[i],
    max: boundaries[i + 1],
    area: 0,
    areaPercent: 0,
    count: 0,
  }));

  let totalArea = 0;

  for (const v of values) {
    let binValue: number;
    if (mode === 'wallLoss') {
      let wl = ((nominalThickness - v) / nominalThickness) * 100;
      if (wl < 0) wl = 0;
      if (wl > 100) wl = 100;
      binValue = wl;
    } else {
      binValue = v;
    }

    // Binary-ish search: find the bin this value belongs to
    let idx = -1;
    for (let i = 0; i < numBins; i++) {
      if (i === numBins - 1) {
        // Last bin is inclusive on both ends
        if (binValue >= bins[i].min && binValue <= bins[i].max) { idx = i; break; }
      } else {
        if (binValue >= bins[i].min && binValue < bins[i].max) { idx = i; break; }
      }
    }
    // Clamp out-of-range values to first/last bin
    if (idx < 0) {
      idx = binValue < bins[0].min ? 0 : numBins - 1;
    }

    const areaM2 = cellAreaMm2 / 1e6;
    bins[idx].area += areaM2;
    bins[idx].count += 1;
    totalArea += areaM2;
  }

  if (totalArea > 0) {
    for (const bin of bins) {
      bin.areaPercent = (bin.area / totalArea) * 100;
    }
  }

  return { bins, totalArea, totalPoints: values.length, mode, unit };
}
