/**
 * Wall-loss distribution Web Worker.
 *
 * Computes wall-loss bin statistics off the main thread.
 * Self-contained: duplicates the pure math from scan-sampling and
 * wall-loss-distribution to avoid cross-bundle import issues.
 *
 * Supports three bin modes:
 *   - 'equal': equal-width percentage bins (legacy default)
 *   - 'ca-based': 5 bins derived from Corrosion Allowance and NWT
 *   - 'custom': user-defined boundary thresholds in mm
 */

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface CompositeSlim {
  id: string;
  orientationConfirmed: boolean;
  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
  indexStartMm: number;
  datumAngleDeg: number;
  scanDirection: 'cw' | 'ccw';
  indexDirection: 'forward' | 'reverse';
}

type BinMode = 'equal' | 'ca-based' | 'custom';

interface WallLossRequest {
  id: number;
  composites: CompositeSlim[];
  vesselId: number;
  vesselLength: number;
  headRatio: number;
  nominalThickness: number;
  binCount: number;
  binMode: BinMode;
  customBoundaries?: number[];
  corrosionAllowance?: number;
  shellNominalThickness?: number;
  domeNominalThickness?: number;
}

interface BinResult {
  minPct: number;
  maxPct: number;
  minMm?: number;
  maxMm?: number;
  area: number;
  areaPercent: number;
  count: number;
  label?: string;
}

interface WallLossResponse {
  id: number;
  bins: BinResult[];
  totalScannedArea: number;
  totalDataPoints: number;
  nominalThickness: number;
  computeMs: number;
  spuriousArea: number;
  spuriousCount: number;
  spuriousAreaPercent: number;
}

// ---------------------------------------------------------------------------
// Pure math (inlined from scan-sampling.ts & wall-loss-distribution.ts)
// ---------------------------------------------------------------------------

function normAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function sampleComposite(
  composite: CompositeSlim,
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

  const scanStartMm = xAxis[0];
  const scanEndMm = xAxis[xAxis.length - 1];
  const scanRangeMm = scanEndMm - scanStartMm;

  const datumInAnnConvention = normAngle(datumAngleDeg + 90);
  let scanOffsetDeg: number;
  if (scanDirection === 'cw') {
    scanOffsetDeg = (((datumInAnnConvention - angleDeg) % 360) + 360) % 360;
  } else {
    scanOffsetDeg = (((angleDeg - datumInAnnConvention) % 360) + 360) % 360;
  }
  const scanOffsetMm = (scanOffsetDeg / 360) * circumference;
  if (scanOffsetMm < scanStartMm || scanOffsetMm > scanEndMm) return undefined;

  const rowFrac = indexRangeMm > 0 ? (indexOffset / indexRangeMm) * (data.length - 1) : 0;
  const colFrac =
    scanRangeMm > 0 ? ((scanOffsetMm - scanStartMm) / scanRangeMm) * (data[0].length - 1) : 0;

  const row = Math.round(rowFrac);
  const col = Math.round(colFrac);

  if (row < 0 || row >= data.length || col < 0 || col >= data[0].length) return undefined;

  const value = data[row][col];
  return value ?? undefined;
}

const ELLIPSOID_SUBSTEPS = 8;

function regionCellArea(
  posMin: number,
  posMax: number,
  dTheta: number,
  radius: number,
  headDepth: number,
  tanTan: number,
): number {
  if (dTheta <= 0 || posMax <= posMin) return 0;

  const midPos = (posMin + posMax) / 2;

  if (midPos >= 0 && midPos <= tanTan) {
    return radius * dTheta * (posMax - posMin);
  }

  const isLeft = midPos < 0;
  const dz = (posMax - posMin) / ELLIPSOID_SUBSTEPS;
  let area = 0;
  for (let i = 0; i < ELLIPSOID_SUBSTEPS; i++) {
    const pos = posMin + (i + 0.5) * dz;
    const zLocal = isLeft ? -pos : pos - tanTan;
    const ratio = Math.min(0.999, Math.abs(zLocal / headDepth));
    const rLocal = radius * Math.sqrt(1 - ratio * ratio);
    const drdz = (radius * ratio) / (headDepth * Math.sqrt(1 - ratio * ratio));
    area += rLocal * Math.sqrt(1 + drdz * drdz) * dTheta * Math.abs(dz);
  }
  return area;
}

function cellAreaOnVessel(
  posMin: number,
  posMax: number,
  angularSpanDeg: number,
  radius: number,
  headDepth: number,
  tanTan: number,
): number {
  const dTheta = (angularSpanDeg / 360) * 2 * Math.PI;
  if (dTheta <= 0 || posMax <= posMin) return 0;

  const splits: number[] = [posMin];
  if (posMin < 0 && posMax > 0) splits.push(0);
  if (posMin < tanTan && posMax > tanTan) splits.push(tanTan);
  splits.push(posMax);

  let total = 0;
  for (let i = 0; i < splits.length - 1; i++) {
    total += regionCellArea(splits[i], splits[i + 1], dTheta, radius, headDepth, tanTan);
  }
  return total;
}

interface CellInfo {
  posMin: number;
  posMax: number;
  angularSpan: number;
  posMid: number;
  angleMid: number;
}

function cellToVessel(
  composite: CompositeSlim,
  row: number,
  col: number,
  circumference: number,
): CellInfo {
  const { xAxis, yAxis, indexStartMm, datumAngleDeg, scanDirection, indexDirection } = composite;

  const idxOffsetMin = yAxis[row] - yAxis[0];
  const idxOffsetMax = yAxis[row + 1] - yAxis[0];
  let posMin: number, posMax: number;
  if (indexDirection === 'forward') {
    posMin = indexStartMm + idxOffsetMin;
    posMax = indexStartMm + idxOffsetMax;
  } else {
    posMin = indexStartMm - idxOffsetMax;
    posMax = indexStartMm - idxOffsetMin;
  }

  const scanMin = xAxis[col];
  const scanMax = xAxis[col + 1];
  const degPerMm = 360 / circumference;
  const angularSpan = (scanMax - scanMin) * degPerMm;

  const scanMidMm = (scanMin + scanMax) / 2;
  const datumConv = normAngle(datumAngleDeg + 90);
  let angleMid: number;
  if (scanDirection === 'cw') {
    angleMid = normAngle(datumConv - scanMidMm * degPerMm);
  } else {
    angleMid = normAngle(datumConv + scanMidMm * degPerMm);
  }

  return { posMin, posMax, angularSpan, posMid: (posMin + posMax) / 2, angleMid };
}

// ---------------------------------------------------------------------------
// Bin builders
// ---------------------------------------------------------------------------

function isOnHead(posMm: number, tanTan: number): boolean {
  return posMm < 0 || posMm > tanTan;
}

function buildEqualBins(binCount: number): BinResult[] {
  const binWidth = 100 / binCount;
  return Array.from({ length: binCount }, (_, i) => ({
    minPct: i * binWidth,
    maxPct: i === binCount - 1 ? 100 : (i + 1) * binWidth,
    area: 0,
    areaPercent: 0,
    count: 0,
  }));
}

function buildCABins(nwt: number, ca: number): BinResult[] {
  const t = [
    nwt,
    nwt - 0.33 * ca,
    nwt - 0.67 * ca,
    nwt - ca,
  ];
  return [
    { minMm: t[0], maxMm: Infinity, minPct: 0, maxPct: 0, area: 0, areaPercent: 0, count: 0, label: `≥${t[0].toFixed(1)}` },
    { minMm: t[1], maxMm: t[0], minPct: 0, maxPct: 33, area: 0, areaPercent: 0, count: 0, label: `≥${t[1].toFixed(1)}` },
    { minMm: t[2], maxMm: t[1], minPct: 33, maxPct: 67, area: 0, areaPercent: 0, count: 0, label: `≥${t[2].toFixed(1)}` },
    { minMm: t[3], maxMm: t[2], minPct: 67, maxPct: 100, area: 0, areaPercent: 0, count: 0, label: `≥${t[3].toFixed(1)}` },
    { minMm: -Infinity, maxMm: t[3], minPct: 100, maxPct: 100, area: 0, areaPercent: 0, count: 0, label: `<${t[3].toFixed(1)}` },
  ];
}

function buildCustomBins(boundaries: number[]): BinResult[] {
  const sorted = [...boundaries].sort((a, b) => b - a);
  const bins: BinResult[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    bins.push({
      minMm: sorted[i + 1],
      maxMm: sorted[i],
      minPct: 0,
      maxPct: 0,
      area: 0,
      areaPercent: 0,
      count: 0,
      label: `${sorted[i + 1].toFixed(1)} – ${sorted[i].toFixed(1)} mm`,
    });
  }
  return bins;
}

function assignEqualBin(wallLossPct: number, binCount: number, binWidth: number): number | -1 {
  if (wallLossPct < 0 || wallLossPct > 100) return -1;
  let idx = Math.floor(wallLossPct / binWidth);
  if (idx >= binCount) idx = binCount - 1;
  return idx;
}

function assignCABin(thickness: number, bins: BinResult[]): number | -1 {
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i];
    if (i === 0 && thickness >= (b.minMm ?? 0)) return 0;
    if (i > 0 && thickness >= (b.minMm ?? 0) && thickness < (bins[i - 1].minMm ?? 0)) return i;
  }
  return bins.length - 1;
}

function assignCustomBin(thickness: number, bins: BinResult[]): number | -1 {
  for (let i = 0; i < bins.length; i++) {
    const lo = bins[i].minMm ?? -Infinity;
    const hi = bins[i].maxMm ?? Infinity;
    if (i === 0 && thickness >= hi) return -1;
    if (thickness >= lo && (i === bins.length - 1 ? thickness >= lo : thickness < hi)) return i;
  }
  if (bins.length > 0) {
    const lastLo = bins[bins.length - 1].minMm ?? -Infinity;
    if (thickness < lastLo) return -1;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

function compute(req: WallLossRequest): WallLossResponse {
  const t0 = performance.now();
  const {
    composites, vesselId, vesselLength, headRatio, nominalThickness,
    binCount, binMode, customBoundaries,
    corrosionAllowance, shellNominalThickness, domeNominalThickness,
  } = req;

  const mode = binMode || 'equal';
  const ca = corrosionAllowance ?? 0;
  const shellNwt = shellNominalThickness ?? nominalThickness;
  const domeNwt = domeNominalThickness ?? shellNwt;

  let bins: BinResult[];
  if (mode === 'ca-based') {
    bins = buildCABins(shellNwt, ca);
  } else if (mode === 'custom' && customBoundaries && customBoundaries.length >= 2) {
    bins = buildCustomBins(customBoundaries);
  } else {
    bins = buildEqualBins(binCount);
  }

  const binWidth = mode === 'equal' ? 100 / binCount : 0;

  const confirmed = composites.filter(c => c.orientationConfirmed);
  if (confirmed.length === 0 || nominalThickness <= 0) {
    return {
      id: req.id, bins,
      totalScannedArea: 0, totalDataPoints: 0, nominalThickness,
      computeMs: performance.now() - t0,
      spuriousArea: 0, spuriousCount: 0, spuriousAreaPercent: 0,
    };
  }

  const radius = vesselId / 2;
  const headDepth = vesselId / (2 * headRatio);
  const tanTan = vesselLength;
  const circumference = Math.PI * vesselId;

  let totalArea = 0;
  let totalPoints = 0;
  let spuriousArea = 0;
  let spuriousCount = 0;

  for (let ci = confirmed.length - 1; ci >= 0; ci--) {
    const comp = confirmed[ci];
    const { data } = comp;
    if (data.length < 2 || data[0].length < 2) continue;

    const higherComps = confirmed.slice(ci + 1);

    for (let row = 0; row < data.length - 1; row++) {
      for (let col = 0; col < data[row].length - 1; col++) {
        const thickness = data[row][col];
        if (thickness == null) continue;

        const cell = cellToVessel(comp, row, col, circumference);

        if (higherComps.length > 0) {
          let occluded = false;
          for (const higher of higherComps) {
            if (!higher.orientationConfirmed) continue;
            if (sampleComposite(higher, cell.posMid, cell.angleMid, circumference) !== undefined) {
              occluded = true;
              break;
            }
          }
          if (occluded) continue;
        }

        const area = cellAreaOnVessel(
          cell.posMin, cell.posMax, cell.angularSpan,
          radius, headDepth, tanTan,
        );
        const areaM2 = area / 1e6;

        totalArea += areaM2;
        totalPoints += 1;

        // Determine which NWT to use based on position (dome vs shell)
        const nwt = (mode === 'ca-based' && isOnHead(cell.posMid, tanTan)) ? domeNwt : shellNwt;

        let binIdx: number | -1;
        if (mode === 'equal') {
          let wallLossPct = ((nwt - thickness) / nwt) * 100;
          if (wallLossPct < 0) wallLossPct = 0;
          if (wallLossPct > 100) wallLossPct = 100;
          binIdx = assignEqualBin(wallLossPct, binCount, binWidth);
        } else if (mode === 'ca-based') {
          binIdx = assignCABin(thickness, bins);
        } else {
          binIdx = assignCustomBin(thickness, bins);
        }

        if (binIdx === -1 || binIdx < 0 || binIdx >= bins.length) {
          spuriousArea += areaM2;
          spuriousCount += 1;
        } else {
          bins[binIdx].area += areaM2;
          bins[binIdx].count += 1;
        }
      }
    }
  }

  if (totalArea > 0) {
    for (const bin of bins) {
      bin.areaPercent = (bin.area / totalArea) * 100;
    }
  }

  const spuriousAreaPercent = totalArea > 0 ? (spuriousArea / totalArea) * 100 : 0;

  return {
    id: req.id,
    bins,
    totalScannedArea: totalArea,
    totalDataPoints: totalPoints,
    nominalThickness,
    computeMs: performance.now() - t0,
    spuriousArea,
    spuriousCount,
    spuriousAreaPercent,
  };
}

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = (e: MessageEvent<WallLossRequest>) => {
  const result = compute(e.data);
  self.postMessage(result);
};
