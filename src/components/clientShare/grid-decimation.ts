// ---------------------------------------------------------------------------
// Thickness-grid decimation for published bundles — pure.
//
// A client gets a coarser grid than the inspector worked with: it is a
// deliverable, not a dataset. The only rule that matters is the pooling
// function.
//
// MIN-POOLED, NOT SAMPLED. Each output cell is the THINNEST real reading in its
// block, so downsampling can never hide a thin spot. A stride would keep every
// Nth reading and silently drop the minimum between them — for wall thickness
// that is the one direction in which being wrong is dangerous, so the published
// grid is deliberately conservative instead.
// ---------------------------------------------------------------------------

/** Largest grid dimension shipped to a client, per axis. */
export const MAX_GRID_DIMENSION = 192;

/**
 * The minimal shape decimation reads and rewrites: the grid plus its two axis
 * vectors. Both `ScanCompositeConfig` and `DomeScanConfig` satisfy it, and a
 * bundle ships both kinds of heatmap — a dome scan is no less a wall-thickness
 * deliverable than a shell scan, so it is min-pooled by the same rule.
 */
export interface DecimatableGrid {
  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
}

/** Block size that brings `length` to at most `max` output cells. */
function blockSizeFor(length: number, max: number): number {
  return length <= max ? 1 : Math.ceil(length / max);
}

/** Thinnest real reading in a block; null when the block held no reading. */
function minOfBlock(
  data: (number | null)[][],
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number
): number | null {
  let min: number | null = null;
  for (let r = rowStart; r < rowEnd; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = colStart; c < colEnd; c++) {
      const value = row[c];
      if (value === null || value === undefined || Number.isNaN(value)) continue;
      if (min === null || value < min) min = value;
    }
  }
  return min;
}

/** Midpoint of the axis samples a block spans — the cell's true coordinate. */
function axisBlockCentre(axis: number[], start: number, end: number): number {
  const first = axis[start] ?? 0;
  const last = axis[Math.min(end, axis.length) - 1] ?? first;
  return (first + last) / 2;
}

/**
 * Min-pool a composite's thickness grid down to at most {@link MAX_GRID_DIMENSION}
 * per axis. `stats` are NOT recomputed: they describe the real scan, and the
 * client must see the true minimum even when the grid it hovers is coarser.
 */
export function decimateComposite<T extends DecimatableGrid>(
  composite: T,
  maxDimension = MAX_GRID_DIMENSION
): T {
  const rows = composite.data.length;
  const cols = composite.data[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return composite;

  const rowBlock = blockSizeFor(rows, maxDimension);
  const colBlock = blockSizeFor(cols, maxDimension);
  if (rowBlock === 1 && colBlock === 1) return composite;

  const data: (number | null)[][] = [];
  const yAxis: number[] = [];
  for (let r = 0; r < rows; r += rowBlock) {
    const rowEnd = Math.min(r + rowBlock, rows);
    const out: (number | null)[] = [];
    for (let c = 0; c < cols; c += colBlock) {
      out.push(minOfBlock(composite.data, r, rowEnd, c, Math.min(c + colBlock, cols)));
    }
    data.push(out);
    yAxis.push(axisBlockCentre(composite.yAxis, r, rowEnd));
  }

  const xAxis: number[] = [];
  for (let c = 0; c < cols; c += colBlock) {
    xAxis.push(axisBlockCentre(composite.xAxis, c, Math.min(c + colBlock, cols)));
  }

  // Only the three grid fields change; everything else on the composite (stats
  // included — see above) rides through untouched. The cast is the usual generic
  // spread limitation: TS cannot see that overwriting three known keys of T
  // still yields a T.
  return { ...composite, data, xAxis, yAxis } as T;
}
