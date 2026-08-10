/**
 * Loop-based axis helpers shared across arbitration, halving detection, and
 * the overlap cross-check. Never use `Math.min(...axis)` spreads on axis
 * arrays — they throw RangeError above ~100k elements and re-traverse the
 * array per call; compute extents once per axis with these instead.
 */

export interface AxisExtents {
  min: number;
  max: number;
}

export const axisExtents = (axis: ArrayLike<number>): AxisExtents | null => {
  if (axis.length === 0) return null;
  let min = axis[0];
  let max = axis[0];
  for (let i = 1; i < axis.length; i++) {
    const v = axis[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
};

export const axisSpan = (extents: AxisExtents | null): number =>
  extents === null ? 0 : extents.max - extents.min;
