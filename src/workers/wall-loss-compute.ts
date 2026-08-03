/**
 * Wall-loss distribution — pure computation.
 *
 * Extracted from the Web Worker so it can be unit-tested directly (the worker
 * itself is a thin `self.onmessage` wrapper around `compute`). Self-contained:
 * duplicates the pure math from scan-sampling and wall-loss-distribution to
 * avoid pulling DOM/Three.js into the worker bundle.
 *
 * Supports three bin modes:
 *   - 'equal': equal-width percentage bins (legacy default)
 *   - 'ca-based': 5 bins derived from Corrosion Allowance and NWT
 *   - 'custom': user-defined boundary thresholds in mm
 *
 * Shell scans are unwrapped onto the cylinder/heads and use true surface area
 * per cell. Dome scans are measured *along* the ellipsoidal head surface, so
 * their grid spacing already equals surface distance — each dome data point
 * contributes a flat grid-cell area (xSpacing × ySpacing), matching the C-scan
 * distribution engine and the `validArea` used by Scan Coverage.
 *
 * Appendage cutout (design §9.4): where a perpendicular appendage body meets the
 * shell there is no main-shell surface, so main-shell cells whose centre lies
 * inside a junction footprint contribute ZERO area. The footprints are rebuilt
 * here from serialisable params via the SAME `buildJunctionFootprint` predicate
 * that drives the coverage sweep and the heatmap alpha mask — no re-derived
 * geometry — so stats and visuals always agree. junction-footprint.ts is a pure
 * math module (types-only imports, no THREE/DOM), safe for the worker bundle.
 */

import { buildJunctionFootprint } from '../components/VesselModeler/engine/junction-footprint';
import {
  normAngle,
  datumToVesselAngle,
  scanArcDeg,
  scanAngleFromArcDeg,
} from '../components/VesselModeler/engine/vessel-coords';

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export interface CompositeSlim {
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

/**
 * Dome scans live in ellipsoid-local polar space (centerPhi/centerTheta), not
 * the cylindrical unwrap shell scans use, so they cannot reuse CompositeSlim.
 * For wall-loss binning only the thickness grid and its mm spacing are needed.
 */
export interface DomeCompositeSlim {
  id: string;
  orientationConfirmed: boolean;
  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
}

export type BinMode = 'equal' | 'ca-based' | 'custom';

/**
 * Serialisable junction-footprint parameters. Functions cannot cross the worker
 * boundary, so the shell-side geometry of each appendage is passed as data and
 * the `containsCell` predicate is rebuilt inside `compute` via
 * `buildJunctionFootprint`. Structurally a subset of `AppendageConfig`.
 */
export interface FootprintParamsSlim {
  id: string;
  mountPos: number;
  mountAngle: number;
  diameter: number;
}

/**
 * One appendage body for the per-body distribution (design §9.3, §16). The MAIN
 * shell stays described by the flat `WallLossRequest` fields (byte-identical to
 * the pre-appendage path); each appendage cylinder is its own body here, carrying
 * only its own scans + geometry. Appendages have no dome scans and no footprints
 * in v1 (design §9.2). Its scans are pre-grouped by bodyId, so the occlusion
 * sweep — which only ever looks within the body's own composite list — can never
 * let a main-shell scan occlude an appendage cell (or vice versa).
 */
export interface WallLossBodyInput {
  /** Appendage id (mirrors AppendageConfig.id). */
  bodyId: string;
  /** Display name for the per-body selector. */
  name: string;
  /** Scans mounted on this appendage (bodyId === this.bodyId). */
  composites: CompositeSlim[];
  /** Appendage inner diameter in mm. */
  vesselId: number;
  /** Appendage cylinder length in mm (tan-tan for the body). */
  vesselLength: number;
  /** Appendage head ratio (for headDepth; v1 appendage scans stay on the cylinder). */
  headRatio: number;
  /** Appendage nominal wall thickness in mm (defaults to shell NWT upstream). */
  nominalThickness: number;
}

export interface WallLossRequest {
  id: number;
  composites: CompositeSlim[];
  /** Confirmed dome scans to fold into the same distribution. */
  domeComposites?: DomeCompositeSlim[];
  /**
   * Appendage junction footprints on the main shell. Main-shell cells inside a
   * footprint are the shell cutout and contribute zero area (design §9.4).
   * Absent/empty → no cutout → byte-identical to the pre-appendage behaviour.
   */
  footprints?: FootprintParamsSlim[];
  /**
   * Appendage bodies (design §9.3). The flat fields below describe the MAIN
   * shell; each entry here is an appendage cylinder with its own scans/geometry.
   * Absent/empty → one body (main) → byte-identical to the pre-appendage path.
   */
  bodies?: WallLossBodyInput[];
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

export interface BinResult {
  minPct: number;
  maxPct: number;
  minMm?: number;
  maxMm?: number;
  area: number;
  areaPercent: number;
  count: number;
  label?: string;
}

/**
 * One body's wall-loss distribution. `bins` share the request's bin template
 * (identical boundaries) so they merge index-for-index into the combined result.
 * `bodyId === undefined` is the main shell.
 */
export interface WallLossBodyResult {
  bodyId?: string;
  /** Display name for the selector; undefined for the main shell. */
  name?: string;
  bins: BinResult[];
  totalScannedArea: number;
  totalDataPoints: number;
  spuriousArea: number;
  spuriousCount: number;
  spuriousAreaPercent: number;
}

export interface WallLossResponse {
  id: number;
  /**
   * Combined distribution (design §16 default view) — the per-body bins summed
   * index-for-index. For a main-only model this equals the single body's result,
   * byte-identical to the pre-appendage behaviour.
   */
  bins: BinResult[];
  totalScannedArea: number;
  totalDataPoints: number;
  nominalThickness: number;
  computeMs: number;
  spuriousArea: number;
  spuriousCount: number;
  spuriousAreaPercent: number;
  /** Per-body breakdown for the selector; main shell first, then appendages. */
  bodies: WallLossBodyResult[];
}

// ---------------------------------------------------------------------------
// Pure math (inlined from scan-sampling.ts & wall-loss-distribution.ts)
// ---------------------------------------------------------------------------
// Angle conventions (normAngle / datum→vessel / cw-ccw scan offset) come from
// the shared engine/vessel-coords.ts — the single source, imported above — so
// the worker's cell mapping can never drift from the 3D / flattened paths.

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

  const datumInAnnConvention = normAngle(datumToVesselAngle(datumAngleDeg));
  const scanOffsetDeg = scanArcDeg(datumInAnnConvention, angleDeg, scanDirection);
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
  const datumConv = normAngle(datumToVesselAngle(datumAngleDeg));
  const angleMid = normAngle(scanAngleFromArcDeg(datumConv, scanMidMm * degPerMm, scanDirection));

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

/** Shared bin assignment so shell and dome cells classify identically. */
function assignBin(
  thickness: number,
  nwt: number,
  mode: BinMode,
  bins: BinResult[],
  binCount: number,
  binWidth: number,
): number | -1 {
  if (mode === 'equal') {
    let wallLossPct = ((nwt - thickness) / nwt) * 100;
    if (wallLossPct < 0) wallLossPct = 0;
    if (wallLossPct > 100) wallLossPct = 100;
    return assignEqualBin(wallLossPct, binCount, binWidth);
  }
  if (mode === 'ca-based') {
    return assignCABin(thickness, bins);
  }
  return assignCustomBin(thickness, bins);
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/** Build the shared bin template for a request (boundaries only; areas zeroed). */
function buildBinTemplate(
  mode: BinMode,
  shellNwt: number,
  ca: number,
  customBoundaries: number[] | undefined,
  binCount: number,
): BinResult[] {
  if (mode === 'ca-based') return buildCABins(shellNwt, ca);
  if (mode === 'custom' && customBoundaries && customBoundaries.length >= 2) {
    return buildCustomBins(customBoundaries);
  }
  return buildEqualBins(binCount);
}

/** Fresh zeroed copy of a bin template so each body accumulates independently. */
function cloneBins(bins: BinResult[]): BinResult[] {
  return bins.map((b) => ({ ...b, area: 0, areaPercent: 0, count: 0 }));
}

/**
 * All parameters `computeBodyDistribution` needs for ONE body. Composites are
 * pre-filtered to confirmed and pre-grouped by body — that grouping is exactly
 * what scopes occlusion: `higherComps` is sliced from this body's own list, so a
 * main-shell scan can never occlude an appendage cell (design §9.3).
 */
interface BodyComputeInput {
  bodyId?: string;
  name?: string;
  shellComposites: CompositeSlim[];
  domeComposites: DomeCompositeSlim[];
  footprints: ReturnType<typeof buildJunctionFootprint>[];
  radius: number;
  headDepth: number;
  tanTan: number;
  circumference: number;
  shellNwt: number;
  domeNwt: number;
  mode: BinMode;
  /** Fresh (already cloned) bins this body accumulates into. */
  bins: BinResult[];
  binCount: number;
  binWidth: number;
}

/**
 * Wall-loss distribution for a single body. Line-for-line the same shell + dome
 * loops as the pre-appendage `compute`, parameterised by body geometry — so the
 * main shell (called with the flat request fields) stays byte-identical.
 */
function computeBodyDistribution(input: BodyComputeInput): WallLossBodyResult {
  const {
    bodyId, name, shellComposites: confirmed, domeComposites: domeConfirmed, footprints,
    radius, headDepth, tanTan, circumference, shellNwt, domeNwt, mode, bins, binCount, binWidth,
  } = input;

  let totalArea = 0;
  let totalPoints = 0;
  let spuriousArea = 0;
  let spuriousCount = 0;

  // --- Shell scans: cylindrical unwrap, true surface area per cell ---
  for (let ci = confirmed.length - 1; ci >= 0; ci--) {
    const comp = confirmed[ci];
    const { data } = comp;
    if (data.length < 2 || data[0].length < 2) continue;

    // Occlusion is scoped to THIS body: higherComps comes from this body's own
    // composite list, so a scan on another body is never considered here.
    const higherComps = confirmed.slice(ci + 1);

    for (let row = 0; row < data.length - 1; row++) {
      for (let col = 0; col < data[row].length - 1; col++) {
        const thickness = data[row][col];
        if (thickness == null) continue;

        const cell = cellToVessel(comp, row, col, circumference);

        // Appendage cutout: main-shell cells whose centre lies inside a junction
        // footprint are the shell opening — no shell surface there — so they
        // contribute zero area (design §9.4). Same predicate as the coverage
        // sweep and heatmap mask. No footprints ⇒ never taken ⇒ byte-identical.
        if (footprints.length > 0 && footprints.some((fp) => fp.containsCell(cell.posMid, cell.angleMid))) {
          continue;
        }

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

        const binIdx = assignBin(thickness, nwt, mode, bins, binCount, binWidth);

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

  // --- Dome scans: measured along the head surface, so the grid spacing IS
  //     surface distance. Each valid point contributes a flat grid-cell area
  //     (xSpacing × ySpacing), matching validArea and the C-scan distribution
  //     engine. Dome cells are always on a head → use domeNwt. ---
  for (const dome of domeConfirmed) {
    const { data, xAxis, yAxis } = dome;
    if (data.length === 0 || data[0].length === 0) continue;

    const xSpacing = xAxis.length > 1 ? Math.abs(xAxis[1] - xAxis[0]) : 1;
    const ySpacing = yAxis.length > 1 ? Math.abs(yAxis[1] - yAxis[0]) : 1;
    const cellAreaM2 = (xSpacing * ySpacing) / 1e6;
    if (cellAreaM2 <= 0) continue;

    for (let row = 0; row < data.length; row++) {
      const rowData = data[row];
      for (let col = 0; col < rowData.length; col++) {
        const thickness = rowData[col];
        if (thickness == null || Number.isNaN(thickness)) continue;

        totalArea += cellAreaM2;
        totalPoints += 1;

        const binIdx = assignBin(thickness, domeNwt, mode, bins, binCount, binWidth);

        if (binIdx === -1 || binIdx < 0 || binIdx >= bins.length) {
          spuriousArea += cellAreaM2;
          spuriousCount += 1;
        } else {
          bins[binIdx].area += cellAreaM2;
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
    bodyId,
    name,
    bins,
    totalScannedArea: totalArea,
    totalDataPoints: totalPoints,
    spuriousArea,
    spuriousCount,
    spuriousAreaPercent,
  };
}

export function compute(req: WallLossRequest): WallLossResponse {
  const t0 = performance.now();
  const {
    composites, domeComposites, footprints: footprintParams, bodies: appendageBodies,
    vesselId, vesselLength, headRatio,
    nominalThickness, binCount, binMode, customBoundaries,
    corrosionAllowance, shellNominalThickness, domeNominalThickness,
  } = req;

  const mode = binMode || 'equal';
  const ca = corrosionAllowance ?? 0;
  const shellNwt = shellNominalThickness ?? nominalThickness;
  const domeNwt = domeNominalThickness ?? shellNwt;

  // One shared bin template — identical boundaries across every body so the
  // per-body bins merge index-for-index into the combined result (design §16).
  const template = buildBinTemplate(mode, shellNwt, ca, customBoundaries, binCount);
  const binWidth = mode === 'equal' ? 100 / binCount : 0;

  const mainConfirmed = composites.filter((c) => c.orientationConfirmed);
  const domeConfirmed = (domeComposites ?? []).filter((d) => d.orientationConfirmed);
  const appBodies = (appendageBodies ?? []).map((b) => ({
    ...b,
    confirmed: b.composites.filter((c) => c.orientationConfirmed),
  }));

  const anyScans =
    mainConfirmed.length > 0 ||
    domeConfirmed.length > 0 ||
    appBodies.some((b) => b.confirmed.length > 0);

  if (!anyScans || nominalThickness <= 0) {
    return {
      id: req.id, bins: template,
      totalScannedArea: 0, totalDataPoints: 0, nominalThickness,
      computeMs: performance.now() - t0,
      spuriousArea: 0, spuriousCount: 0, spuriousAreaPercent: 0,
      bodies: [],
    };
  }

  const bodyResults: WallLossBodyResult[] = [];

  // --- Main shell (flat request fields; footprints + dome scans live here) ---
  const mainRadius = vesselId / 2;
  bodyResults.push(
    computeBodyDistribution({
      bodyId: undefined,
      name: undefined,
      shellComposites: mainConfirmed,
      domeComposites: domeConfirmed,
      footprints: (footprintParams ?? []).map((f) => buildJunctionFootprint(mainRadius, f)),
      radius: mainRadius,
      headDepth: vesselId / (2 * headRatio),
      tanTan: vesselLength,
      circumference: Math.PI * vesselId,
      shellNwt,
      domeNwt,
      mode,
      bins: cloneBins(template),
      binCount,
      binWidth,
    })
  );

  // --- Appendage bodies: own cylinder geometry, own scans, no dome/footprints
  //     (design §9.2). Each body's own scan list scopes occlusion. ---
  for (const b of appBodies) {
    bodyResults.push(
      computeBodyDistribution({
        bodyId: b.bodyId,
        name: b.name,
        shellComposites: b.confirmed,
        domeComposites: [],
        footprints: [],
        radius: b.vesselId / 2,
        headDepth: b.vesselId / (2 * b.headRatio),
        tanTan: b.vesselLength,
        circumference: Math.PI * b.vesselId,
        shellNwt: b.nominalThickness,
        domeNwt: b.nominalThickness,
        mode,
        bins: cloneBins(template),
        binCount,
        binWidth,
      })
    );
  }

  // --- Combined = per-body bins summed index-for-index (design §16 default). A
  //     main-only model has one body, so combined === main (byte-identical). ---
  const combinedBins = cloneBins(template);
  let totalArea = 0;
  let totalPoints = 0;
  let spuriousArea = 0;
  let spuriousCount = 0;
  for (const body of bodyResults) {
    for (let i = 0; i < combinedBins.length; i++) {
      combinedBins[i].area += body.bins[i].area;
      combinedBins[i].count += body.bins[i].count;
    }
    totalArea += body.totalScannedArea;
    totalPoints += body.totalDataPoints;
    spuriousArea += body.spuriousArea;
    spuriousCount += body.spuriousCount;
  }
  if (totalArea > 0) {
    for (const bin of combinedBins) {
      bin.areaPercent = (bin.area / totalArea) * 100;
    }
  }
  const spuriousAreaPercent = totalArea > 0 ? (spuriousArea / totalArea) * 100 : 0;

  return {
    id: req.id,
    bins: combinedBins,
    totalScannedArea: totalArea,
    totalDataPoints: totalPoints,
    nominalThickness,
    computeMs: performance.now() - t0,
    spuriousArea,
    spuriousCount,
    spuriousAreaPercent,
    bodies: bodyResults,
  };
}
