/**
 * Iteratively fill small null gaps by averaging non-null neighbors.
 *
 * Each iteration fills one layer of gap edges: null cells with ≥3 non-null
 * neighbors in a 3×3 window are replaced with the neighbor average.
 * Repeated iterations close progressively wider gaps while leaving large
 * ND regions untouched.
 *
 * @param data   Source thickness grid (not mutated)
 * @param radius Number of fill iterations (0 = no-op, 1–5 typical)
 * @returns      New grid with small gaps filled
 */
export function fillSmallGaps(
  data: (number | null)[][],
  radius: number,
): (number | null)[][] {
  if (radius <= 0) return data;

  const rows = data.length;
  if (rows === 0) return [];
  const cols = data[0].length;

  let current = data.map((row) => [...row]);

  for (let iter = 0; iter < radius; iter++) {
    const next = current.map((row) => [...row]);
    let filled = false;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (current[r][c] !== null) continue;

        const neighbors: number[] = [];
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              const v = current[nr][nc];
              if (v !== null) neighbors.push(v);
            }
          }
        }

        if (neighbors.length >= 3) {
          let sum = 0;
          for (const n of neighbors) sum += n;
          next[r][c] = sum / neighbors.length;
          filled = true;
        }
      }
    }

    current = next;
    if (!filled) break;
  }

  return current;
}
