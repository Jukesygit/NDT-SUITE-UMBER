/**
 * Batch-level detection of the "doubled metadata" export corruption.
 *
 * Some Evident/Olympus thickness exports write ScanStart/IndexStart at exactly
 * 2x the true strip position (BRT V-1001 2026-07; HP Sep NEV V-0201 2026-06).
 * When the corrupted value also matches the matrix column labels, per-file
 * offset detection sees agreement and can never flag the axis — but the
 * corruption is still detectable across the batch: raw starts leave
 * span-scale holes between strips, while halved starts tile the vessel
 * contiguously. Halving is only proposed when it actually closes the holes.
 *
 * Residual false-positive class: a genuinely disjoint layout whose gap
 * happens to equal what halving would close (e.g. two patches at 0 and 3000
 * with ~1600mm spans) is indistinguishable from the corruption by tiling
 * shape alone. That is why halving is (a) the LAST arbitration tier — any
 * validated range corroborating raw metadata vetoes it per-file, (b) always
 * operator-confirmed in the repair modal with its source shown, and
 * (c) cross-checked by the overlap-agreement panel, where a false halving
 * produces visible mismatch verdicts.
 */

import { axisExtents, axisSpan } from './axisMath';

export interface AxisStrip {
  /** Metadata start for this strip's axis (null when absent) */
  start: number | null;
  /** Actual data span of the strip on this axis, in mm */
  span: number;
}

export interface HalvedAxes {
  scan: boolean;
  index: boolean;
}

/** Max total hole length for a tiling to count as contiguous (mm). */
const HOLE_TOLERANCE = 100;
/** Min total hole length for the raw tiling to count as broken (mm). */
const RAW_HOLE_MIN = 200;
/** Halving must move at least one strip by more than the offset tolerance. */
const MIN_HALVABLE_START = 20;

/** Total uncovered length inside the union of [start, end] intervals. */
const totalHoles = (intervals: Array<[number, number]>): number => {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  let holes = 0;
  let coveredEnd = sorted[0][1];
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    if (start > coveredEnd) holes += start - coveredEnd;
    if (end > coveredEnd) coveredEnd = end;
  }
  return holes;
};

export const detectHalvedMetadataPattern = (strips: AxisStrip[]): boolean => {
  const valid = strips.filter(
    (s): s is { start: number; span: number } => s.start !== null && isFinite(s.start) && s.span > 0
  );
  if (valid.length < 2) return false;
  if (!valid.some((s) => s.start > MIN_HALVABLE_START)) return false;

  const rawHoles = totalHoles(valid.map((s) => [s.start, s.start + s.span]));
  const halvedHoles = totalHoles(valid.map((s) => [s.start / 2, s.start / 2 + s.span]));

  return rawHoles > RAW_HOLE_MIN && halvedHoles <= HOLE_TOLERANCE;
};

/**
 * Batch-level halving detection for a set of parsed scans. Shared by the
 * main-thread fileParser and the cscanProcessor worker so the worker's
 * "offset issues" gate and the repair modal's detection always agree.
 */
export interface ScanAxesLike {
  metadata?: Record<string, unknown>;
  xAxis: ArrayLike<number>;
  yAxis: ArrayLike<number>;
  isComposite?: boolean;
}

const numericStart = (value: unknown): number | null =>
  typeof value === 'number' && isFinite(value) ? value : null;

export const halvedAxesFromScans = (scans: ScanAxesLike[]): HalvedAxes => {
  const sources = scans.filter((s) => !s.isComposite);
  const strip = (start: unknown, axis: ArrayLike<number>): AxisStrip => ({
    start: numericStart(start),
    span: axisSpan(axisExtents(axis)),
  });
  return {
    scan: detectHalvedMetadataPattern(
      sources.map((s) => strip(s.metadata?.['ScanStart (mm)'], s.xAxis))
    ),
    index: detectHalvedMetadataPattern(
      sources.map((s) => strip(s.metadata?.['IndexStart (mm)'], s.yAxis))
    ),
  };
};
