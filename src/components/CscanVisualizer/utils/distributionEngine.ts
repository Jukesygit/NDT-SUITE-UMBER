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
export function computeDistribution(
  data: CscanData,
  config: DistributionConfig,
): DistributionResult | null {
  const { mode, binCount, nominalThickness } = config;

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

  // Determine bin range and width
  let rangeMin: number;
  let rangeMax: number;
  let unit: string;

  if (mode === 'thickness') {
    let dMin = Infinity;
    let dMax = -Infinity;
    for (const v of values) {
      if (v < dMin) dMin = v;
      if (v > dMax) dMax = v;
    }
    rangeMin = dMin;
    rangeMax = dMax;
    unit = 'mm';
  } else {
    rangeMin = 0;
    rangeMax = 100;
    unit = '%';
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

  const binWidth = rangeSpan / binCount;

  const bins: DistributionBin[] = Array.from({ length: binCount }, (_, i) => ({
    min: rangeMin + i * binWidth,
    max: i === binCount - 1 ? rangeMax : rangeMin + (i + 1) * binWidth,
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

    let idx = binWidth > 0 ? Math.floor((binValue - rangeMin) / binWidth) : 0;
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;

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
