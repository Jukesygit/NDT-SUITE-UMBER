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
 * Build the plate body (bottom face + boundary skirt) from a surface geometry.
 *
 * The bottom face mirrors the top surface's triangle connectivity at `bottomY`,
 * so it only covers regions that have data (no triangles over null holes).
 *
 * The skirt creates vertical walls along every boundary edge — both the outer
 * perimeter and internal hole edges — so the plate looks solid from any angle.
 */
export function buildPlateBody(
  topGeometry: THREE.BufferGeometry,
  bottomY: number,
): THREE.BufferGeometry {
  const topPos = topGeometry.getAttribute('position') as THREE.BufferAttribute;
  const topIdx = topGeometry.getIndex()!;
  const vertCount = topPos.count;

  // --- Find boundary edges (edges belonging to exactly one triangle) ---
  const edgeCounts = new Map<string, number>();
  const ek = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  for (let i = 0; i < topIdx.count; i += 3) {
    const a = topIdx.getX(i);
    const b = topIdx.getX(i + 1);
    const c = topIdx.getX(i + 2);
    edgeCounts.set(ek(a, b), (edgeCounts.get(ek(a, b)) ?? 0) + 1);
    edgeCounts.set(ek(b, c), (edgeCounts.get(ek(b, c)) ?? 0) + 1);
    edgeCounts.set(ek(c, a), (edgeCounts.get(ek(c, a)) ?? 0) + 1);
  }

  const boundaryEdges: [number, number][] = [];
  for (const [key, count] of edgeCounts) {
    if (count === 1) {
      const [a, b] = key.split('-').map(Number);
      boundaryEdges.push([a, b]);
    }
  }

  const numBE = boundaryEdges.length;

  // --- Vertex layout ---
  // [0 .. vertCount-1]              : bottom face (same XZ, Y = bottomY)
  // [vertCount .. vertCount+numBE*4] : skirt quads (topA, botA, topB, botB per edge)
  const totalVerts = vertCount + numBE * 4;
  const positions = new Float32Array(totalVerts * 3);

  // Bottom face vertices
  for (let i = 0; i < vertCount; i++) {
    positions[i * 3]     = topPos.getX(i);
    positions[i * 3 + 1] = bottomY;
    positions[i * 3 + 2] = topPos.getZ(i);
  }

  // Skirt vertices (4 per boundary edge)
  for (let e = 0; e < numBE; e++) {
    const [a, b] = boundaryEdges[e];
    const base = (vertCount + e * 4) * 3;

    positions[base]      = topPos.getX(a);
    positions[base + 1]  = topPos.getY(a);
    positions[base + 2]  = topPos.getZ(a);

    positions[base + 3]  = topPos.getX(a);
    positions[base + 4]  = bottomY;
    positions[base + 5]  = topPos.getZ(a);

    positions[base + 6]  = topPos.getX(b);
    positions[base + 7]  = topPos.getY(b);
    positions[base + 8]  = topPos.getZ(b);

    positions[base + 9]  = topPos.getX(b);
    positions[base + 10] = bottomY;
    positions[base + 11] = topPos.getZ(b);
  }

  // --- Index buffer ---
  const indexList: number[] = [];

  // Bottom face: same triangles as top surface, reversed winding for -Y normals
  for (let i = 0; i < topIdx.count; i += 3) {
    indexList.push(topIdx.getX(i), topIdx.getX(i + 2), topIdx.getX(i + 1));
  }

  // Skirt faces: 2 triangles per boundary edge
  for (let e = 0; e < numBE; e++) {
    const base = vertCount + e * 4;
    const tA = base, bA = base + 1, tB = base + 2, bB = base + 3;
    indexList.push(tA, tB, bA);
    indexList.push(tB, bB, bA);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexList), 1));
  geometry.computeVertexNormals();

  return geometry;
}
