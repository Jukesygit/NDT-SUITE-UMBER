/**
 * Overlap cross-check: score how well overlapping tiles agree where they
 * cover the same physical region.
 *
 * Adjacent strips of one vessel scan overlap by design (typically ~50mm).
 * When tiles are placed correctly, repeat measurements of the same region
 * agree to instrument repeatability; when a tile is misplaced, the "overlap"
 * compares different physical regions and disagrees strongly. Measured on
 * the BRT V-1001 dataset (2026-07): correct placement ≈ 0.06–0.10mm mean
 * absolute difference, wrong placement ≈ 0.24–0.30mm.
 *
 * This is a verification layer only — it never proposes or applies shifts
 * (registration as a placement source proved unreliable: near-flat score
 * surfaces on uniform corrosion, zero signal on all-ND band seams).
 */

import type { CscanData } from '../types';
import { axisExtents, AxisExtents } from './axisMath';

export interface OverlapCheck {
  fileA: string;
  fileB: string;
  /** Cells valid in both tiles inside the overlap window */
  points: number;
  /** Mean absolute thickness difference over those cells (mm) */
  meanAbsDiff: number;
  verdict: 'confirmed' | 'mismatch' | 'insufficient';
}

/** Agreement at or below this mean |diff| confirms a placement (mm). */
export const OVERLAP_CONFIRM_MM = 0.15;
/** Fewer co-valid cells than this cannot support a verdict. */
export const OVERLAP_MIN_POINTS = 500;
/** Cap sampled rows/cols per pair so large batches stay interactive. */
const MAX_SAMPLES_PER_DIM = 200;

type ScanLike = Pick<CscanData, 'filename' | 'data' | 'xAxis' | 'yAxis'>;

interface AxisLookup {
  axis: number[];
  step: number;
}

const makeLookup = (axis: number[]): AxisLookup | null => {
  if (axis.length < 2) return null;
  const step = (axis[axis.length - 1] - axis[0]) / (axis.length - 1);
  if (step === 0) return null;
  return { axis, step };
};

/** Nearest index on a near-regular (possibly descending) axis, or -1. */
const nearestIndex = (lookup: AxisLookup, value: number, tol: number): number => {
  const idx = Math.round((value - lookup.axis[0]) / lookup.step);
  if (idx < 0 || idx >= lookup.axis.length) return -1;
  return Math.abs(lookup.axis[idx] - value) <= tol ? idx : -1;
};

const indicesWithin = (axis: number[], lo: number, hi: number): number[] => {
  const inside: number[] = [];
  for (let i = 0; i < axis.length; i++) {
    if (axis[i] >= lo && axis[i] <= hi) inside.push(i);
  }
  const stride = Math.max(1, Math.ceil(inside.length / MAX_SAMPLES_PER_DIM));
  return stride === 1 ? inside : inside.filter((_, i) => i % stride === 0);
};

export const checkOverlapAgreement = (
  scans: ScanLike[],
  opts?: { minPoints?: number; confirmMm?: number }
): OverlapCheck[] => {
  const minPoints = opts?.minPoints ?? OVERLAP_MIN_POINTS;
  const confirmMm = opts?.confirmMm ?? OVERLAP_CONFIRM_MM;
  const checks: OverlapCheck[] = [];

  // Extents once per scan, loop-based — not per pair, and never via spreads
  // (RangeError on large axes).
  const extents = scans.map((s) => ({
    x: axisExtents(s.xAxis) as AxisExtents | null,
    y: axisExtents(s.yAxis) as AxisExtents | null,
  }));

  for (let i = 0; i < scans.length; i++) {
    for (let j = i + 1; j < scans.length; j++) {
      const a = scans[i];
      const b = scans[j];
      const ea = extents[i];
      const eb = extents[j];
      if (!ea.x || !ea.y || !eb.x || !eb.y) continue;

      const xLo = Math.max(ea.x.min, eb.x.min);
      const xHi = Math.min(ea.x.max, eb.x.max);
      const yLo = Math.max(ea.y.min, eb.y.min);
      const yHi = Math.min(ea.y.max, eb.y.max);
      if (xHi < xLo || yHi < yLo) continue;

      const bx = makeLookup(b.xAxis);
      const by = makeLookup(b.yAxis);
      if (!bx || !by) continue;
      const xTol = Math.abs(bx.step) / 2;
      const yTol = Math.abs(by.step) / 2;

      const colPairs: Array<[number, number]> = [];
      for (const colA of indicesWithin(a.xAxis, xLo, xHi)) {
        const colB = nearestIndex(bx, a.xAxis[colA], xTol);
        if (colB >= 0) colPairs.push([colA, colB]);
      }

      let points = 0;
      let diffSum = 0;
      for (const rowA of indicesWithin(a.yAxis, yLo, yHi)) {
        const rowB = nearestIndex(by, a.yAxis[rowA], yTol);
        if (rowB < 0) continue;
        const aRow = a.data[rowA];
        const bRow = b.data[rowB];
        if (!aRow || !bRow) continue;
        for (const [colA, colB] of colPairs) {
          const va = aRow[colA];
          const vb = bRow[colB];
          if (va === null || vb === null || !isFinite(va) || !isFinite(vb)) continue;
          points++;
          diffSum += Math.abs(va - vb);
        }
      }

      const meanAbsDiff = points > 0 ? diffSum / points : 0;
      checks.push({
        fileA: a.filename,
        fileB: b.filename,
        points,
        meanAbsDiff,
        verdict:
          points < minPoints ? 'insufficient' : meanAbsDiff <= confirmMm ? 'confirmed' : 'mismatch',
      });
    }
  }
  return checks;
};
