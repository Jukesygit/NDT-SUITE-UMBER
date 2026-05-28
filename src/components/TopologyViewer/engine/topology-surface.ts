import * as THREE from 'three';
import { interpolateColor, getColorscale } from '../../../utils/colorscales';
import type { CscanData } from '../../CscanVisualizer/types';
import type { SurfaceOptions } from '../types';
import { resolveNominal } from '../types';
import { decimateGridMinPreserving } from './topology-decimation';

const ND_COLOR: [number, number, number] = [0.15, 0.15, 0.15];

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
  } = options;
  const { data: rawData, xAxis: rawX, yAxis: rawY, stats } = cscan;

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
        positions[idx * 3 + 1] = -(nominal - value) * exaggeration;

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

  return geometry;
}
