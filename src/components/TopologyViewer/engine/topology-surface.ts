import * as THREE from 'three';
import { interpolateColor, getColorscale } from '../../../utils/colorscales';
import type { CscanData } from '../../CscanVisualizer/types';
import type { SurfaceOptions } from '../types';
import { resolveNominal } from '../types';
import { decimateGridMinPreserving } from './topology-decimation';
import { medianFilter } from './topology-median-filter';
import { fillSmallGaps } from './topology-gap-fill';

const ND_COLOR: [number, number, number] = [0.15, 0.15, 0.15];

/**
 * Compute display Y for a single value, applying the same clamp + exaggeration
 * that buildTopologySurface uses. Exported so viewport can place markers on
 * the clamped surface while keeping their numeric values raw.
 */
export function clampDisplayDisplacement(
  value: number | null,
  nominal: number,
  exaggeration: number,
  clampUpper: number | null,
): number {
  if (value == null) return 0;
  let d = value - nominal;
  if (clampUpper != null && d > clampUpper) d = clampUpper;
  return d * exaggeration;
}

/**
 * Build a Three.js BufferGeometry representing the scan data as a 3D surface.
 *
 * Coordinate convention (Y-up):
 *   X = scan axis (mm)
 *   Z = index axis (mm)
 *   Y = -(nominal - thickness) * exaggeration
 *       → 0 at nominal wall, negative for wall loss (valleys)
 *
 * Null vertices exist in the position buffer but no triangles reference them,
 * creating genuine holes in the mesh rather than fake plateaus.
 */
export function buildTopologySurface(
  cscan: CscanData,
  options: SurfaceOptions,
): THREE.BufferGeometry {
  const {
    exaggeration, colorScale: scaleName, reverseScale,
    rangeMin, rangeMax, maxDisplayResolution, nominalThickness,
    displacementClampUpper, denoiseRadius, gapFillRadius,
  } = options;
  const { data: srcData, xAxis: rawX, yAxis: rawY, stats } = cscan;
  let processedData = denoiseRadius != null ? medianFilter(srcData, denoiseRadius) : srcData;
  processedData = gapFillRadius > 0 ? fillSmallGaps(processedData, gapFillRadius) : processedData;
  const rawData = processedData;

  if (!stats) throw new Error('CscanData must have stats computed');

  const nominal = resolveNominal(nominalThickness, rawData);

  const { data, xAxis, yAxis } = decimateGridMinPreserving(
    rawData, rawX, rawY, maxDisplayResolution,
  );

  const rows = data.length;
  const cols = rows > 0 ? data[0].length : 0;
  if (rows < 2 || cols < 2) throw new Error('Grid must be at least 2x2');

  const vertexCount = rows * cols;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  const scale = getColorscale(scaleName);
  const cMin = rangeMin != null ? rangeMin : stats.min;
  const cMax = rangeMax != null ? rangeMax : stats.max;
  const cRange = cMax === cMin ? 1 : cMax - cMin;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const value = data[r][c];

      positions[idx * 3]     = xAxis[c];
      positions[idx * 3 + 2] = yAxis[r];

      if (value != null) {
        positions[idx * 3 + 1] = clampDisplayDisplacement(
          value, nominal, exaggeration, displacementClampUpper,
        );

        const t = (value - cMin) / cRange;
        const [cr, cg, cb] = interpolateColor(t, scale, reverseScale);
        colors[idx * 3]     = cr / 255;
        colors[idx * 3 + 1] = cg / 255;
        colors[idx * 3 + 2] = cb / 255;
      } else {
        positions[idx * 3 + 1] = 0;
        colors[idx * 3]     = ND_COLOR[0];
        colors[idx * 3 + 1] = ND_COLOR[1];
        colors[idx * 3 + 2] = ND_COLOR[2];
      }

      uvs[idx * 2]     = c / (cols - 1);
      uvs[idx * 2 + 1] = r / (rows - 1);
    }
  }

  const indexList: number[] = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = r * cols + c;
      const tr = tl + 1;
      const bl = (r + 1) * cols + c;
      const br = bl + 1;

      if (
        data[r][c] == null ||
        data[r][c + 1] == null ||
        data[r + 1][c] == null ||
        data[r + 1][c + 1] == null
      ) {
        continue;
      }

      indexList.push(tl, bl, tr);
      indexList.push(tr, bl, br);
    }
  }

  const indices = new Uint32Array(indexList);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.userData = { rows, cols, xAxis, yAxis, data };

  return geometry;
}

/**
 * Build the plate body (edge skirt + bottom face) from a surface geometry.
 *
 * The skirt connects the perimeter vertices of the top surface down to
 * `bottomY`, creating a wavy edge profile. The bottom face is a flat
 * fan-triangulated polygon at `bottomY`.
 */
export function buildPlateBody(
  topGeometry: THREE.BufferGeometry,
  bottomY: number,
): THREE.BufferGeometry {
  const topPos = topGeometry.getAttribute('position') as THREE.BufferAttribute;
  const { rows, cols, data } = topGeometry.userData as {
    rows: number; cols: number; data: (number | null)[][];
  };

  // Perimeter indices, clockwise when viewed from +Y
  const perim: number[] = [];
  for (let c = 0; c < cols; c++) perim.push(c);
  for (let r = 1; r < rows; r++) perim.push(r * cols + cols - 1);
  for (let c = cols - 2; c >= 0; c--) perim.push((rows - 1) * cols + c);
  for (let r = rows - 2; r >= 1; r--) perim.push(r * cols);

  const n = perim.length;

  // Mark which perimeter vertices are null in the data grid
  const isNull: boolean[] = perim.map((idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    return data[r][c] == null;
  });

  // Read raw top-ring Y values
  const topY = perim.map((idx) => topPos.getY(idx));

  // Interpolate null perimeter vertices from nearest non-null neighbors
  for (let i = 0; i < n; i++) {
    if (!isNull[i]) continue;
    let sumY = 0;
    let count = 0;
    // Search outward in both directions for non-null neighbors
    for (let d = 1; d <= Math.min(n / 2, 20); d++) {
      const prev = (i - d + n) % n;
      const next = (i + d) % n;
      if (!isNull[prev]) { sumY += topY[prev]; count++; }
      if (!isNull[next]) { sumY += topY[next]; count++; }
      if (count >= 2) break;
    }
    topY[i] = count > 0 ? sumY / count : bottomY;
  }

  const positions = new Float32Array(n * 2 * 3);

  for (let i = 0; i < n; i++) {
    const src = perim[i];
    const x = topPos.getX(src);
    const z = topPos.getZ(src);

    const ti = i * 2;
    positions[ti * 3]     = x;
    positions[ti * 3 + 1] = topY[i];
    positions[ti * 3 + 2] = z;

    const bi = ti + 1;
    positions[bi * 3]     = x;
    positions[bi * 3 + 1] = bottomY;
    positions[bi * 3 + 2] = z;
  }

  const indexList: number[] = [];

  // Skirt quads
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const topI = i * 2;
    const botI = topI + 1;
    const topN = next * 2;
    const botN = topN + 1;
    indexList.push(topI, topN, botI);
    indexList.push(topN, botN, botI);
  }

  // Bottom face: fan from first bottom vertex
  const b0 = 1;
  for (let i = 1; i < n - 1; i++) {
    indexList.push(b0, (i + 1) * 2 + 1, i * 2 + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3),
  );
  geometry.setIndex(
    new THREE.BufferAttribute(new Uint32Array(indexList), 1),
  );
  geometry.computeVertexNormals();

  return geometry;
}
