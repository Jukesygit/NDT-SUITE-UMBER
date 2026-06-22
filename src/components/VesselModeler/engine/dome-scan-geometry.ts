// =============================================================================
// Dome Scan Geometry — Helpers & Mesh Factory
// =============================================================================
// Maps C-scan data onto ellipsoidal vessel heads using tangent-plane
// projection: a flat rectangular grid is laid out on the tangent plane at
// the scan center, then each point is projected radially onto the
// ellipsoid surface.  This avoids the polar singularity of spherical
// coordinates and keeps the scan rectangular regardless of position.
// =============================================================================

import * as THREE from 'three';
import { degToRad, radToDeg } from 'three/src/math/MathUtils.js';

import type { DomeScanConfig, VesselState } from '../types';
import { SCALE } from './materials';
import { createHeatmapTexture, type HeatmapTextureResult } from './heatmap-texture';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum phi in degrees — avoids singularity at the exact apex. */
export const PHI_EPSILON = 0.01;

/** Surface offset in mm (raises scan mesh slightly above the dome surface). */
const SURFACE_OFFSET = 2;

// ---------------------------------------------------------------------------
// Part 0 — Deserialization / Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a raw dome-scan composite (as restored from a saved project) into a
 * fully-formed {@link DomeScanConfig}.
 *
 * Projects are persisted WITHOUT the heavy `data`/`xAxis`/`yAxis` matrices, so
 * those fields are `undefined` on load. Every required field is backfilled with
 * a safe default here — the single source of truth for both load paths — so no
 * downstream consumer (structuralHash, geometry, stats) can read a property of
 * `undefined`. Mirrors the field-by-field defaulting the scan-composite loader
 * already performs.
 */
export function normalizeDomeScanComposite(raw: any): DomeScanConfig {
    return {
        ...raw,
        head: raw.head || (raw.sectionType === 'dome_left' ? 'left' : 'right'),
        orientationConfirmed: raw.orientationConfirmed ?? false,
        data: raw.data ?? [],
        xAxis: raw.xAxis ?? [],
        yAxis: raw.yAxis ?? [],
        stats: raw.stats ?? { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
    };
}

// ---------------------------------------------------------------------------
// Part A — Shared Helpers
// ---------------------------------------------------------------------------

/**
 * Forward mapping: polar dome coordinates → local mm-space Cartesian.
 *
 * Returns axial/radial distances and the outward-pointing ellipsoid normal.
 * All values are in mm — callers apply SCALE and vessel centering themselves.
 *
 * @param phiDeg    Polar angle from apex (0 = apex, 90 = equator) in degrees.
 * @param thetaDeg  Azimuthal angle around dome axis in degrees.
 * @param radius    Vessel inner radius in mm (= ID / 2).
 * @param headDepth Head depth in mm (= radius / headRatio).
 */
export function domeLocalFromPhiTheta(
  phiDeg: number,
  thetaDeg: number,
  radius: number,
  headDepth: number,
): { axialMm: number; rLocalMm: number; thetaRad: number; normal: THREE.Vector3 } {
  // Clamp phi to avoid the exact apex singularity
  const clampedPhi = Math.max(PHI_EPSILON, Math.min(90, phiDeg));
  const phiRad = degToRad(clampedPhi);
  const thetaRad = degToRad(thetaDeg);

  const cosPhi = Math.cos(phiRad);
  const sinPhi = Math.sin(phiRad);
  const cosTheta = Math.cos(thetaRad);
  const sinTheta = Math.sin(thetaRad);

  // Distance from tangent line toward apex
  const axialMm = headDepth * cosPhi;

  // Radial distance from dome axis
  const rLocalMm = radius * sinPhi;

  // Ellipsoid gradient normal: (cosPhi/D, sinPhi*sinTheta/R, sinPhi*cosTheta/R)
  const nx = cosPhi / headDepth;
  const ny = sinPhi * sinTheta / radius;
  const nz = sinPhi * cosTheta / radius;
  const normal = new THREE.Vector3(nx, ny, nz).normalize();

  return { axialMm, rLocalMm, thetaRad, normal };
}

/**
 * Inverse mapping: world-space 3D point → dome polar coordinates (phi, theta).
 *
 * Returns null if the point is on the shell side of the tangent line
 * (i.e. not on the dome).
 *
 * @param point           World-space position (already SCALE-ed).
 * @param radius          Vessel inner radius in mm.
 * @param headDepth       Head depth in mm.
 * @param tangentLineWorld Scaled world position of the tangent line on the axial axis.
 * @param headSign        +1 for right head, -1 for left head.
 * @param isVertical      True when vessel orientation is vertical.
 */
export function domePhiThetaFromPoint(
  point: THREE.Vector3,
  radius: number,
  headDepth: number,
  tangentLineWorld: number,
  headSign: number,
  isVertical: boolean,
): { phiDeg: number; thetaDeg: number } | null {
  // Extract axial and radial components based on orientation
  let axialWorld: number;
  let radialY: number;
  let radialZ: number;

  if (isVertical) {
    axialWorld = point.y;
    radialY = point.x;
    radialZ = point.z;
  } else {
    axialWorld = point.x;
    radialY = point.y;
    radialZ = point.z;
  }

  // Convert from scaled world to mm, relative to tangent line
  const axialFromTL = headSign * (axialWorld - tangentLineWorld) / SCALE;

  // If the point is on the shell side of the tangent line, it's not on the dome
  if (axialFromTL < 0) return null;

  // Radial distance in mm
  const rLocalMm = Math.sqrt(radialY * radialY + radialZ * radialZ) / SCALE;

  // Recover phi from the ellipsoid relationship
  // phi = atan2(rLocal/R, axial/D)
  const phiRad = Math.atan2(rLocalMm / radius, axialFromTL / headDepth);
  const phiDeg = radToDeg(phiRad);

  // Recover theta from the radial components
  let thetaRad: number;
  if (isVertical) {
    // Vertical: radialY = x, radialZ = z → theta = atan2(z, x)
    thetaRad = Math.atan2(radialZ, radialY);
  } else {
    // Horizontal: radialY = y, radialZ = z → theta = atan2(y, z)
    thetaRad = Math.atan2(radialY, radialZ);
  }

  // Normalize to [0, 360)
  let thetaDeg = radToDeg(thetaRad);
  thetaDeg = ((thetaDeg % 360) + 360) % 360;

  return { phiDeg, thetaDeg };
}

// ---------------------------------------------------------------------------
// Heatmap Cache (dome-specific, separate from shell scan cache)
// ---------------------------------------------------------------------------

const DOME_HEATMAP_CACHE_MAX = 10;
const domeHeatmapCache = new Map<string, HeatmapTextureResult>();

function domeCacheKey(config: DomeScanConfig): string {
  return `${config.id}_${config.colorScale}_${config.rangeMin}_${config.rangeMax}_${config.opacity}`;
}

function evictDomeHeatmapCache(): void {
  while (domeHeatmapCache.size > DOME_HEATMAP_CACHE_MAX) {
    const oldest = domeHeatmapCache.keys().next().value!;
    const entry = domeHeatmapCache.get(oldest);
    if (entry) entry.texture.dispose();
    domeHeatmapCache.delete(oldest);
  }
}

/**
 * Dispose cached dome heatmap texture(s) and free GPU / canvas memory.
 * If `configId` is provided, removes all entries for that dome scan;
 * otherwise the entire dome cache is cleared.
 */
export function clearDomeHeatmapCache(configId?: string): void {
  if (configId !== undefined) {
    for (const [key, entry] of domeHeatmapCache) {
      if (key.startsWith(configId + '_') || key === configId) {
        entry.texture.dispose();
        domeHeatmapCache.delete(key);
      }
    }
  } else {
    for (const entry of domeHeatmapCache.values()) {
      entry.texture.dispose();
    }
    domeHeatmapCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Part B — Mesh Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Three.js mesh that drapes a heatmap-textured surface over an
 * ellipsoidal dome head at the position described by `config`.
 *
 * Returns null when the data is empty or axes are too short to form a surface.
 */
export function createDomeScanPlane(
  config: DomeScanConfig,
  vesselState: VesselState,
  selectedId: string,
): THREE.Mesh | null {
  // --- Early exit for invalid data ---
  if (
    config.data.length === 0 ||
    (config.data.length > 0 && config.data[0].length === 0) ||
    config.xAxis.length < 2 ||
    config.yAxis.length < 2
  ) {
    return null;
  }

  // --- Vessel dimensions ---
  const RADIUS = vesselState.id / 2;
  const HEAD_DEPTH = RADIUS / (vesselState.headRatio || 2);
  const TAN_TAN = vesselState.length;
  const isVertical = vesselState.orientation === 'vertical';

  // --- Heatmap texture (cached) ---
  const cacheKey = domeCacheKey(config);
  let heatmapResult = domeHeatmapCache.get(cacheKey);
  if (!heatmapResult) {
    heatmapResult = createHeatmapTexture(config.data, config.stats, {
      colorScale: config.colorScale,
      rangeMin: config.rangeMin,
      rangeMax: config.rangeMax,
      opacity: config.opacity,
      reverseScale: true, // NDT convention: thin = red, thick = blue
    });
    domeHeatmapCache.set(cacheKey, heatmapResult);
    evictDomeHeatmapCache();
  }

  // --- Projection metrics at center point ---
  const centerPhiRad = degToRad(Math.max(PHI_EPSILON, config.centerPhi));
  const centerThetaRad = degToRad(config.centerTheta);
  const cCosPhi = Math.cos(centerPhiRad);
  const cSinPhi = Math.sin(centerPhiRad);
  const cCosTheta = Math.cos(centerThetaRad);
  const cSinTheta = Math.sin(centerThetaRad);

  const scanRangeMm = Math.abs(config.xAxis[config.xAxis.length - 1] - config.xAxis[0]);
  const indexRangeMm = Math.abs(config.yAxis[config.yAxis.length - 1] - config.yAxis[0]);

  // Segment count sizing (angular spans at center for mesh density)
  const hPhi = Math.sqrt(
    HEAD_DEPTH * HEAD_DEPTH * cSinPhi * cSinPhi +
    RADIUS * RADIUS * cCosPhi * cCosPhi,
  );
  const hThetaCenter = RADIUS * cSinPhi;
  const thetaSpanCenter = Math.min(
    hThetaCenter > 0.001 ? scanRangeMm / hThetaCenter : 2 * Math.PI,
    2 * Math.PI,
  );
  const phiSpan = Math.min(
    hPhi > 0.001 ? indexRangeMm / hPhi : Math.PI / 2,
    Math.PI,
  );

  // --- Segment counts (based on center-phi span for mesh density) ---
  const segmentsX = Math.max(16, Math.round(64 * thetaSpanCenter / Math.PI));
  const segmentsY = Math.max(16, Math.round(64 * phiSpan / Math.PI));

  // --- Build geometry ---
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const headSign = config.head === 'right' ? 1 : -1;
  const tangentLineMm = config.head === 'right' ? TAN_TAN : 0;

  // --- Tangent-plane basis at scan center ---
  // Dome-local 3D frame: origin at ellipsoid center (tangent-line ∩ dome axis),
  //   x = axial (toward apex), yz = radial plane.
  const cx = HEAD_DEPTH * cCosPhi;
  const cy = RADIUS * cSinPhi * cSinTheta;
  const cz = RADIUS * cSinPhi * cCosTheta;

  // ∂P/∂φ — meridional tangent (index direction, toward equator)
  const ePhiX = -HEAD_DEPTH * cSinPhi;
  const ePhiY = RADIUS * cCosPhi * cSinTheta;
  const ePhiZ = RADIUS * cCosPhi * cCosTheta;
  const phiTanLen = Math.sqrt(ePhiX ** 2 + ePhiY ** 2 + ePhiZ ** 2);

  // ∂P/∂θ — circumferential tangent (scan direction)
  const eThetaX = 0;
  let eThetaY = RADIUS * cSinPhi * cCosTheta;
  let eThetaZ = -RADIUS * cSinPhi * cSinTheta;
  let thetaTanLen = Math.sqrt(eThetaY ** 2 + eThetaZ ** 2);

  if (thetaTanLen < 0.001) {
    // Near-apex fallback: circumferential tangent degenerates
    eThetaY = -RADIUS * cCosTheta;
    eThetaZ = RADIUS * cSinTheta;
    thetaTanLen = RADIUS;
  }

  // Unit tangent vectors (per mm on dome surface)
  const uPhiX = ePhiX / phiTanLen;
  const uPhiY = ePhiY / phiTanLen;
  const uPhiZ = ePhiZ / phiTanLen;
  const uThetaX = eThetaX / thetaTanLen;
  const uThetaY = eThetaY / thetaTanLen;
  const uThetaZ = eThetaZ / thetaTanLen;

  const invD2 = 1 / (HEAD_DEPTH * HEAD_DEPTH);
  const invR2 = 1 / (RADIUS * RADIUS);

  for (let iy = 0; iy <= segmentsY; iy++) {
    const v = iy / segmentsY;
    const indexMm = (v - 0.5) * indexRangeMm;

    for (let ix = 0; ix <= segmentsX; ix++) {
      const u = ix / segmentsX;
      const scanMm = (u - 0.5) * scanRangeMm;

      // Point on tangent plane at scan center
      const px = cx + scanMm * uThetaX + indexMm * uPhiX;
      const py = cy + scanMm * uThetaY + indexMm * uPhiY;
      const pz = cz + scanMm * uThetaZ + indexMm * uPhiZ;

      // Central projection onto ellipsoid: scale so (x/D)²+(y²+z²)/R²=1
      const denom = Math.sqrt(px * px * invD2 + (py * py + pz * pz) * invR2);
      const sx = px / denom;
      const sy = py / denom;
      const sz = pz / denom;

      const rLocalMm = Math.sqrt(sy * sy + sz * sz);
      const localTheta = Math.atan2(sy, sz);
      const rScaled = (rLocalMm + SURFACE_OFFSET) * SCALE;
      const axialPosMm = tangentLineMm + headSign * sx;
      const axialGlobal = (axialPosMm - TAN_TAN / 2) * SCALE;

      let x: number, y: number, z: number;
      if (isVertical) {
        x = rScaled * Math.cos(localTheta);
        y = axialGlobal;
        z = rScaled * Math.sin(localTheta);
      } else {
        x = axialGlobal;
        y = rScaled * Math.sin(localTheta);
        z = rScaled * Math.cos(localTheta);
      }

      vertices.push(x, y, z);

      const scanMapped = config.scanDirection === 'ccw' ? u : 1 - u;
      const indexMapped = config.indexDirection === 'inward' ? v : 1 - v;
      uvs.push(scanMapped, indexMapped);
    }
  }

  // --- Index buffer (two triangles per quad) ---
  for (let iy = 0; iy < segmentsY; iy++) {
    for (let ix = 0; ix < segmentsX; ix++) {
      const a = ix + (segmentsX + 1) * iy;
      const b = ix + (segmentsX + 1) * (iy + 1);
      const c = ix + 1 + (segmentsX + 1) * (iy + 1);
      const d = ix + 1 + (segmentsX + 1) * iy;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // --- Material ---
  const material = new THREE.MeshBasicMaterial({
    map: heatmapResult.texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = {
    type: 'domeScan',
    id: config.id,
    data: config.data,
    xAxis: config.xAxis,
    yAxis: config.yAxis,
    stats: config.stats,
    width: config.xAxis.length,
    height: config.yAxis.length,
    scanDirection: config.scanDirection,
    indexDirection: config.indexDirection,
    head: config.head,
    centerPhi: config.centerPhi,
    centerTheta: config.centerTheta,
  };

  // --- Selection highlight border ---
  {
    const borderMaterial = new THREE.MeshBasicMaterial({
      color: 0x00bfff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const borderScale = 1.08;
    const borderOffset = 1;

    const borderGeometry = new THREE.BufferGeometry();
    const borderVertices: number[] = [];
    const borderIndices: number[] = [];

    for (let iy = 0; iy <= segmentsY; iy++) {
      const v = iy / segmentsY;
      const bIndexMm = (v - 0.5) * indexRangeMm * borderScale;

      for (let ix = 0; ix <= segmentsX; ix++) {
        const u = ix / segmentsX;
        const bScanMm = (u - 0.5) * scanRangeMm * borderScale;

        const px = cx + bScanMm * uThetaX + bIndexMm * uPhiX;
        const py = cy + bScanMm * uThetaY + bIndexMm * uPhiY;
        const pz = cz + bScanMm * uThetaZ + bIndexMm * uPhiZ;

        const denom = Math.sqrt(px * px * invD2 + (py * py + pz * pz) * invR2);
        const sx = px / denom;
        const sy = py / denom;
        const sz = pz / denom;

        const rLocalMm = Math.sqrt(sy * sy + sz * sz);
        const localTheta = Math.atan2(sy, sz);
        const rScaled = (rLocalMm + borderOffset) * SCALE;
        const axialPosMm = tangentLineMm + headSign * sx;
        const axialGlobal = (axialPosMm - TAN_TAN / 2) * SCALE;

        let bx: number, by: number, bz: number;
        if (isVertical) {
          bx = rScaled * Math.cos(localTheta);
          by = axialGlobal;
          bz = rScaled * Math.sin(localTheta);
        } else {
          bx = axialGlobal;
          by = rScaled * Math.sin(localTheta);
          bz = rScaled * Math.cos(localTheta);
        }

        borderVertices.push(bx, by, bz);
      }
    }

    for (let iy = 0; iy < segmentsY; iy++) {
      for (let ix = 0; ix < segmentsX; ix++) {
        const a = ix + (segmentsX + 1) * iy;
        const b = ix + (segmentsX + 1) * (iy + 1);
        const c = ix + 1 + (segmentsX + 1) * (iy + 1);
        const d = ix + 1 + (segmentsX + 1) * iy;
        borderIndices.push(a, b, d);
        borderIndices.push(b, c, d);
      }
    }

    borderGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(borderVertices, 3),
    );
    borderGeometry.setIndex(borderIndices);
    borderGeometry.computeVertexNormals();

    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    border.userData = { role: 'domeScan-border' };
    border.visible = config.id === selectedId;
    border.renderOrder = 1;
    mesh.add(border);
  }

  return mesh;
}
