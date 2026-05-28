/**
 * Apply a median filter to a 2D thickness grid.
 * Null cells stay null. Only non-null neighbors contribute to the median.
 * If a non-null cell has zero non-null neighbors (impossible for radius ≥ 1
 * since the cell itself is included), it becomes null.
 */
export function medianFilter(
  data: (number | null)[][],
  radius: number,
): (number | null)[][] {
  const rows = data.length;
  if (rows === 0) return [];
  const cols = data[0].length;

  const result: (number | null)[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: (number | null)[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      if (data[r][c] === null) {
        row[c] = null;
        continue;
      }

      const neighbors: number[] = [];
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const v = data[nr][nc];
            if (v !== null) neighbors.push(v);
          }
        }
      }

      if (neighbors.length === 0) {
        row[c] = null;
      } else {
        neighbors.sort((a, b) => a - b);
        const n = neighbors.length;
        row[c] = n % 2 === 1
          ? neighbors[Math.floor(n / 2)]
          : (neighbors[n / 2 - 1] + neighbors[n / 2]) / 2;
      }
    }
    result.push(row);
  }

  return result;
}
