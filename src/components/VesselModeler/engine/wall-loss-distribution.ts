import type {
  ScanCompositeConfig,
  VesselState,
  WallLossGroupConfig,
  WallLossGroupBin,
  WallLossDistribution,
} from '../types';
import { normAngle, sampleComposite } from './scan-sampling';

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
  composite: ScanCompositeConfig,
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

  return {
    posMin, posMax, angularSpan,
    posMid: (posMin + posMax) / 2,
    angleMid,
  };
}

export function computeWallLossDistribution(
  vesselState: VesselState,
  config: WallLossGroupConfig,
): WallLossDistribution {
  const { binCount, nominalThickness } = config;
  const binWidth = 100 / binCount;

  const bins: WallLossGroupBin[] = Array.from({ length: binCount }, (_, i) => ({
    minPct: i * binWidth,
    maxPct: i === binCount - 1 ? 100 : (i + 1) * binWidth,
    area: 0,
    areaPercent: 0,
    count: 0,
  }));

  const composites = vesselState.scanComposites.filter(c => c.orientationConfirmed);
  if (composites.length === 0 || nominalThickness <= 0) {
    return { bins, totalScannedArea: 0, totalDataPoints: 0, nominalThickness };
  }

  const radius = vesselState.id / 2;
  const headDepth = vesselState.id / (2 * vesselState.headRatio);
  const tanTan = vesselState.length;
  const circumference = Math.PI * vesselState.id;

  let totalArea = 0;
  let totalPoints = 0;

  for (let ci = composites.length - 1; ci >= 0; ci--) {
    const comp = composites[ci];
    const { data } = comp;
    if (data.length < 2 || data[0].length < 2) continue;

    const higherComps = composites.slice(ci + 1);

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

        let wallLossPct = ((nominalThickness - thickness) / nominalThickness) * 100;
        if (wallLossPct < 0) wallLossPct = 0;
        if (wallLossPct > 100) wallLossPct = 100;

        let binIdx = Math.floor(wallLossPct / binWidth);
        if (binIdx >= binCount) binIdx = binCount - 1;

        const area = cellAreaOnVessel(
          cell.posMin, cell.posMax, cell.angularSpan,
          radius, headDepth, tanTan,
        );
        const areaM2 = area / 1e6;

        bins[binIdx].area += areaM2;
        bins[binIdx].count += 1;
        totalArea += areaM2;
        totalPoints += 1;
      }
    }
  }

  if (totalArea > 0) {
    for (const bin of bins) {
      bin.areaPercent = (bin.area / totalArea) * 100;
    }
  }

  return { bins, totalScannedArea: totalArea, totalDataPoints: totalPoints, nominalThickness };
}
