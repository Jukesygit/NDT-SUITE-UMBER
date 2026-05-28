export interface DecimationResult {
  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
  /** True if the grid was actually decimated (not a passthrough). */
  isDecimated: boolean;
}

/**
 * Downsample a grid using min-of-block so that the thinnest point
 * in each decimation block survives. This is critical for inspection —
 * average or nearest-neighbor decimation can erase corrosion pits.
 *
 * Null values are ignored within blocks. A block that is entirely null
 * produces a null output cell.
 */
export function decimateGridMinPreserving(
  data: (number | null)[][],
  xAxis: number[],
  yAxis: number[],
  maxResolution: number,
): DecimationResult {
  const rows = data.length;
  const cols = rows > 0 ? data[0].length : 0;

  if (rows <= maxResolution && cols <= maxResolution) {
    return { data, xAxis, yAxis, isDecimated: false };
  }

  const stepR = Math.max(1, Math.ceil(rows / maxResolution));
  const stepC = Math.max(1, Math.ceil(cols / maxResolution));

  const newData: (number | null)[][] = [];
  const newYAxis: number[] = [];
  const newXAxis: number[] = [];

  // Compute output axes using block-center coordinates.
  // Block-start would shift displayed pit locations by up to one block width.
  for (let c = 0; c < cols; c += stepC) {
    const cEnd = Math.min(c + stepC - 1, cols - 1);
    newXAxis.push((xAxis[c] + xAxis[cEnd]) / 2);
  }

  for (let r = 0; r < rows; r += stepR) {
    const rEnd = Math.min(r + stepR - 1, rows - 1);
    newYAxis.push((yAxis[r] + yAxis[rEnd]) / 2);
    const outRow: (number | null)[] = [];

    for (let c = 0; c < cols; c += stepC) {
      // Find min of non-null values in this block
      let blockMin: number | null = null;
      const rEnd = Math.min(r + stepR, rows);
      const cEnd = Math.min(c + stepC, cols);

      for (let br = r; br < rEnd; br++) {
        for (let bc = c; bc < cEnd; bc++) {
          const v = data[br][bc];
          if (v != null && (blockMin === null || v < blockMin)) {
            blockMin = v;
          }
        }
      }

      outRow.push(blockMin);
    }

    newData.push(outRow);
  }

  return { data: newData, xAxis: newXAxis, yAxis: newYAxis, isDecimated: true };
}
