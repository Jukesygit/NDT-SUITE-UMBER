// =============================================================================
// Vessel Modeler - Texture / Decal Manager
// =============================================================================
// Creates texture planes (decals) that conform to the vessel shell surface.
// Ported from the standalone HTML tool's createTexturePlane() function with
// the following changes:
//   - No global appState: vessel parameters passed via VesselState
//   - No global textureObjects / selectedTextureIndex: passed as arguments
//   - THREE.SRGBColorSpace instead of deprecated THREE.sRGBEncoding
//   - Full TypeScript types
// =============================================================================

import * as THREE from 'three';
import type { TextureConfig, ScanCompositeConfig, VesselState } from '../types';
import { createHeatmapTexture, type HeatmapTextureResult } from './heatmap-texture';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// UV Transform Helper
// ---------------------------------------------------------------------------

/**
 * Transform UV coordinates according to rotation and flip settings.
 * Rotation values are 0, 90, 180, or 270 degrees.
 */
function transformUV(
  u: number,
  v: number,
  rotation: number,
  flipH: boolean,
  flipV: boolean,
): [number, number] {
  let tu = flipH ? 1 - u : u;
  let tv = flipV ? 1 - v : v;

  switch (rotation) {
    case 90:
      [tu, tv] = [1 - tv, tu];
      break;
    case 180:
      [tu, tv] = [1 - tu, 1 - tv];
      break;
    case 270:
      [tu, tv] = [tv, 1 - tu];
      break;
    default:
      break;
  }

  return [tu, tv];
}

// ---------------------------------------------------------------------------
// Selection Border Builder
// ---------------------------------------------------------------------------

/**
 * Build a slightly-larger yellow mesh behind the texture to indicate selection.
 * Uses the same vertex computation as the main texture plane but scaled by
 * `borderScale` and offset slightly behind the surface.
 */
function buildSelectionBorder(
  tex: TextureConfig,
  vesselState: VesselState,
  texWidth: number,
  angularSpan: number,
  segmentsX: number,
  segmentsY: number,
): THREE.Mesh {
  const shellRadius = vesselState.id / 2;
  const TAN_TAN = vesselState.length;
  const HEAD_DEPTH = vesselState.headRatio > 0 ? vesselState.id / (2 * vesselState.headRatio) : 0;
  const RADIUS = shellRadius;
  const isVertical = vesselState.orientation === 'vertical';

  const borderScale = 1.08;
  const borderOffset = 1; // surfaceOffset(2) - 1 = sits slightly behind the texture

  const borderWidth = texWidth * borderScale;
  const borderAngularSpan = angularSpan * borderScale;

  const centerAngle = (tex.angle * Math.PI) / 180;

  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= segmentsY; iy++) {
    const v = iy / segmentsY;
    const angleOffset = (v - 0.5) * borderAngularSpan;
    const currentAngle = centerAngle + angleOffset;

    for (let ix = 0; ix <= segmentsX; ix++) {
      const u = ix / segmentsX;
      const posOffset = (u - 0.5) * borderWidth;
      const currentPos = tex.pos + posOffset;

      let x: number, y: number, z: number;
      const posGlobal = (currentPos - TAN_TAN / 2) * SCALE;

      if (currentPos < 0) {
        const posLocal = currentPos;
        const ratio = Math.min(0.99, Math.abs(posLocal / HEAD_DEPTH));
        const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
        if (isVertical) {
          x = (rLocal + borderOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (rLocal + borderOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (rLocal + borderOffset) * SCALE * Math.sin(currentAngle);
          z = (rLocal + borderOffset) * SCALE * Math.cos(currentAngle);
        }
      } else if (currentPos > TAN_TAN) {
        const posLocal = currentPos - TAN_TAN;
        const ratio = Math.min(0.99, Math.abs(posLocal / HEAD_DEPTH));
        const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
        if (isVertical) {
          x = (rLocal + borderOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (rLocal + borderOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (rLocal + borderOffset) * SCALE * Math.sin(currentAngle);
          z = (rLocal + borderOffset) * SCALE * Math.cos(currentAngle);
        }
      } else {
        if (isVertical) {
          x = (RADIUS + borderOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (RADIUS + borderOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (RADIUS + borderOffset) * SCALE * Math.sin(currentAngle);
          z = (RADIUS + borderOffset) * SCALE * Math.cos(currentAngle);
        }
      }

      vertices.push(x, y, z);
    }
  }

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
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color: 0xffcc00,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}

// ---------------------------------------------------------------------------
// Main Texture Plane Factory
// ---------------------------------------------------------------------------

/**
 * Create a textured mesh that conforms to the vessel shell surface.
 *
 * The geometry is a dense grid whose vertices follow the cylindrical shell
 * along the tan-tan section and wrap onto the ellipsoidal heads.  This is
 * the exact algorithm from the standalone tool, adapted to receive vessel
 * state as an explicit parameter instead of reading global `appState`.
 *
 * @param tex             - Texture configuration (position, angle, scale, etc.)
 * @param vesselState     - Current vessel dimensions and orientation
 * @param textureObjects  - Map of texture id -> loaded THREE.Texture
 * @param selectedTextureId - ID of the currently selected texture (for highlight border)
 * @returns A THREE.Mesh (possibly with a selection-border child) or null
 */
export function createTexturePlane(
  tex: TextureConfig,
  vesselState: VesselState,
  textureObjects: Record<number, THREE.Texture>,
  selectedTextureId: number,
): THREE.Mesh | null {
  const threeTexture = textureObjects[tex.id];
  if (!threeTexture) return null;

  const img = threeTexture.image as HTMLImageElement;
  if (!img || !img.width || !img.height) return null;

  // --- Aspect ratio (swapped when rotated 90/270) ---
  let aspect = img.width / img.height;
  const rotation = tex.rotation || 0;
  if (rotation === 90 || rotation === 270) {
    aspect = 1 / aspect;
  }

  // --- Dimensions ---
  const shellRadius = vesselState.id / 2;
  const baseSize = shellRadius * 0.4;
  const texWidth = baseSize * tex.scaleX * aspect;
  const curvatureCompensation = 1.15;
  const texHeight = baseSize * tex.scaleY * curvatureCompensation;

  const TAN_TAN = vesselState.length;
  const HEAD_DEPTH = vesselState.headRatio > 0 ? vesselState.id / (2 * vesselState.headRatio) : 0;
  const RADIUS = shellRadius;

  const circumference = 2 * Math.PI * RADIUS;
  const angularSpan = (texHeight / circumference) * 2 * Math.PI;

  // --- Segment counts (higher for larger textures) ---
  const baseSegments = 64;
  const segmentsX = Math.ceil(baseSegments * Math.max(1, tex.scaleX * 1.5));
  const segmentsY = Math.ceil(baseSegments * Math.max(1, tex.scaleY * 2));

  // --- Build geometry ---
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const centerAngle = (tex.angle * Math.PI) / 180;
  const surfaceOffset = 2; // mm above the shell surface

  const flipH = tex.flipH || false;
  const flipV = tex.flipV || false;
  const isVertical = vesselState.orientation === 'vertical';

  for (let iy = 0; iy <= segmentsY; iy++) {
    const v = iy / segmentsY;
    const angleOffset = (v - 0.5) * angularSpan;
    const currentAngle = centerAngle + angleOffset;

    for (let ix = 0; ix <= segmentsX; ix++) {
      const u = ix / segmentsX;
      const posOffset = (u - 0.5) * texWidth;
      const currentPos = tex.pos + posOffset;

      let x: number, y: number, z: number;
      const posGlobal = (currentPos - TAN_TAN / 2) * SCALE;

      if (currentPos < 0) {
        // --- Left head (ellipsoidal) ---
        const posLocal = currentPos;
        const ratio = Math.min(0.99, Math.abs(posLocal / HEAD_DEPTH));
        const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
        if (isVertical) {
          x = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      } else if (currentPos > TAN_TAN) {
        // --- Right head (ellipsoidal) ---
        const posLocal = currentPos - TAN_TAN;
        const ratio = Math.min(0.99, Math.abs(posLocal / HEAD_DEPTH));
        const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
        if (isVertical) {
          x = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      } else {
        // --- Cylindrical shell ---
        if (isVertical) {
          x = (RADIUS + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (RADIUS + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (RADIUS + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (RADIUS + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      }

      vertices.push(x, y, z);

      const [tu, tv] = transformUV(u, 1 - v, rotation, flipH, flipV);
      uvs.push(tu, tv);
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
    map: threeTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { type: 'texture', id: tex.id };

  // --- Selection highlight border (always created, hidden when not selected) ---
  {
    const border = buildSelectionBorder(
      tex,
      vesselState,
      texWidth,
      angularSpan,
      segmentsX,
      segmentsY,
    );
    border.userData = { type: 'texture-border', id: tex.id };
    border.visible = tex.id === selectedTextureId;
    mesh.add(border);
  }

  return mesh;
}

// ---------------------------------------------------------------------------
// Scan Composite Heatmap Cache
// ---------------------------------------------------------------------------

const HEATMAP_CACHE_MAX = 10;
const heatmapCache = new Map<string, HeatmapTextureResult>();

/**
 * Build a cache key that includes visual parameters so colorscale/range/opacity
 * changes naturally invalidate the entry without explicit clearing.
 */
function heatmapCacheKey(composite: { id: string; colorScale: string; rangeMin: number | null; rangeMax: number | null; opacity: number }): string {
  return `${composite.id}_${composite.colorScale}_${composite.rangeMin}_${composite.rangeMax}_${composite.opacity}`;
}

/**
 * Evict oldest entries when cache exceeds max size (simple LRU via insertion order).
 */
function evictHeatmapCache(): void {
  while (heatmapCache.size > HEATMAP_CACHE_MAX) {
    const oldest = heatmapCache.keys().next().value!;
    const entry = heatmapCache.get(oldest);
    if (entry) entry.texture.dispose();
    heatmapCache.delete(oldest);
  }
}

/**
 * Dispose cached heatmap texture(s) and free GPU / canvas memory.
 * If `compositeId` is provided, removes all entries for that composite;
 * otherwise the entire cache is cleared.
 */
export function clearHeatmapCache(compositeId?: string): void {
  if (compositeId !== undefined) {
    // Remove all entries whose key starts with this composite ID
    for (const [key, entry] of heatmapCache) {
      if (key.startsWith(compositeId + '_') || key === compositeId) {
        entry.texture.dispose();
        heatmapCache.delete(key);
      }
    }
  } else {
    for (const entry of heatmapCache.values()) {
      entry.texture.dispose();
    }
    heatmapCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Scan Composite Plane Factory
// ---------------------------------------------------------------------------

/**
 * Create a heatmap-textured mesh that conforms to the vessel shell surface,
 * auto-sized from the scan axis and index axis coordinate arrays.
 *
 * The geometry algorithm is identical to {@link createTexturePlane} – the same
 * vertex loop handles the cylindrical shell and ellipsoidal heads.  The key
 * differences are:
 *   - Width and angular span are derived from real axis data (mm) instead of
 *     manual scale factors.
 *   - The texture is generated by `createHeatmapTexture()` and cached.
 *   - UVs are a simple linear mapping (data orientation is handled by axis
 *     mapping, not UV transforms).
 *
 * @param composite   - Scan composite configuration with axis data
 * @param vesselState - Current vessel dimensions and orientation
 * @param selectedId  - ID of the currently selected scan composite (for highlight)
 * @returns A THREE.Mesh or null if data is empty
 */
export function createScanCompositePlane(
  composite: ScanCompositeConfig,
  vesselState: VesselState,
  selectedId: string,
): THREE.Mesh | null {
  if (
    composite.data.length === 0 ||
    composite.data[0].length === 0 ||
    composite.xAxis.length < 2 ||
    composite.yAxis.length < 2
  ) {
    return null;
  }

  // --- Get or create cached heatmap texture (keyed by visual params) ---
  const cacheKey = heatmapCacheKey(composite);
  let heatmapResult = heatmapCache.get(cacheKey);
  if (!heatmapResult) {
    heatmapResult = createHeatmapTexture(composite.data, composite.stats, {
      colorScale: composite.colorScale,
      rangeMin: composite.rangeMin,
      rangeMax: composite.rangeMax,
      opacity: composite.opacity,
      reverseScale: true, // NDT convention: thin (low) = red (danger), thick (high) = blue (safe)
    });
    heatmapCache.set(cacheKey, heatmapResult);
    evictHeatmapCache();
  }

  // --- Vessel geometry constants ---
  const shellRadius = vesselState.id / 2;
  const RADIUS = shellRadius;
  const TAN_TAN = vesselState.length;
  const HEAD_DEPTH = vesselState.headRatio > 0 ? vesselState.id / (2 * vesselState.headRatio) : 0;
  const isVertical = vesselState.orientation === 'vertical';
  const circumference = 2 * Math.PI * RADIUS;

  // --- Dimensions from axis data ---
  const scanRange = Math.abs(
    composite.xAxis[composite.xAxis.length - 1] - composite.xAxis[0],
  ); // mm around circumference
  const angularSpan = (scanRange / circumference) * 2 * Math.PI; // radians

  const indexRange = Math.abs(
    composite.yAxis[composite.yAxis.length - 1] - composite.yAxis[0],
  ); // mm along vessel
  const texWidth = indexRange; // direct mm

  // --- Center position (longitudinal) ---
  const indexHalf = indexRange / 2;
  const indexCenter =
    composite.indexDirection === 'forward'
      ? composite.indexStartMm + indexHalf
      : composite.indexStartMm - indexHalf;

  // --- Center angle (circumferential) ---
  // datumAngleDeg is user-facing: 0° = TDC (12 o'clock). Add 90° to convert to
  // internal coordinates where 0° = 3 o'clock and 90° = TDC.
  // xAxis[0] is the circumferential distance (mm) from the datum where the scan starts.
  // The vertex loop maps v=1 → col 0 (xAxis[0]) at centerAngle + scanHalf,
  // so centerAngle = startAngle - scanHalf to place col 0 at the correct position.
  const datumRad = ((composite.datumAngleDeg + 90) * Math.PI) / 180;
  const scanStartMm = composite.xAxis[0];
  const scanStartRad = (scanStartMm / circumference) * 2 * Math.PI;
  const scanHalf = angularSpan / 2;
  const startAngle =
    composite.scanDirection === 'cw'
      ? datumRad - scanStartRad   // CW: angle decreases from datum
      : datumRad + scanStartRad;  // CCW: angle increases from datum
  const centerAngle = composite.scanDirection === 'cw'
    ? startAngle - scanHalf   // CW: scan extends toward decreasing angles
    : startAngle + scanHalf;  // CCW: scan extends toward increasing angles

  // --- Segment counts (scale with physical size) ---
  const baseSegments = 64;
  const segmentsX = Math.max(
    16,
    Math.ceil(baseSegments * Math.max(1, texWidth / RADIUS)),
  );
  const segmentsY = Math.max(
    16,
    Math.ceil(baseSegments * Math.max(1, (angularSpan / Math.PI) * 2)),
  );

  // --- Build geometry ---
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const surfaceOffset = 2; // mm above the shell surface

  for (let iy = 0; iy <= segmentsY; iy++) {
    const v = iy / segmentsY;
    const angleOffset = (v - 0.5) * angularSpan;
    const currentAngle = centerAngle + angleOffset;

    for (let ix = 0; ix <= segmentsX; ix++) {
      const u = ix / segmentsX;
      const posOffset = (u - 0.5) * texWidth;
      const currentPos = indexCenter + posOffset;

      let x: number, y: number, z: number;
      const posGlobal = (currentPos - TAN_TAN / 2) * SCALE;

      if (currentPos < 0) {
        // --- Left head (ellipsoidal) ---
        const posLocal = currentPos;
        const ratio = Math.min(0.99, Math.abs(posLocal / HEAD_DEPTH));
        const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
        if (isVertical) {
          x = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      } else if (currentPos > TAN_TAN) {
        // --- Right head (ellipsoidal) ---
        const posLocal = currentPos - TAN_TAN;
        const ratio = Math.min(0.99, Math.abs(posLocal / HEAD_DEPTH));
        const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
        if (isVertical) {
          x = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      } else {
        // --- Cylindrical shell ---
        if (isVertical) {
          x = (RADIUS + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (RADIUS + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (RADIUS + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (RADIUS + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      }

      vertices.push(x, y, z);

      // UV mapping: uv.x → circumferential (scan/xAxis), uv.y → longitudinal (index/yAxis)
      // CW: 1-v keeps column 0 at datum side; CCW: v flips so column 0 is still at datum
      // Forward: 1-u maps longitudinal rows; Reverse: u flips row order
      const vMapped = composite.scanDirection === 'ccw' ? v : 1 - v;
      const uMapped = composite.indexDirection === 'reverse' ? u : 1 - u;
      uvs.push(vMapped, uMapped);
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

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
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
    type: 'scanComposite',
    id: composite.id,
    data: composite.data,
    xAxis: composite.xAxis,
    yAxis: composite.yAxis,
    stats: composite.stats,
    width: composite.xAxis.length,
    height: composite.yAxis.length,
    scanDirection: composite.scanDirection,
    indexDirection: composite.indexDirection,
  };

  // --- Selection highlight border (always created, hidden when not selected) ---
  {
    const borderMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const borderScale = 1.08;
    const borderWidth = texWidth * borderScale;
    const borderAngularSpan = angularSpan * borderScale;
    const borderOffset = 1;

    const borderGeometry = new THREE.BufferGeometry();
    const borderVertices: number[] = [];
    const borderIndices: number[] = [];

    for (let iy = 0; iy <= segmentsY; iy++) {
      const v = iy / segmentsY;
      const angleOffset = (v - 0.5) * borderAngularSpan;
      const currentAngle = centerAngle + angleOffset;

      for (let ix = 0; ix <= segmentsX; ix++) {
        const u = ix / segmentsX;
        const posOffset = (u - 0.5) * borderWidth;
        const currentPos = indexCenter + posOffset;

        let bx: number, by: number, bz: number;
        const posGlobal = (currentPos - TAN_TAN / 2) * SCALE;

        if (currentPos < 0) {
          const posLocal = currentPos;
          const ratio = Math.min(0.99, Math.abs(posLocal / HEAD_DEPTH));
          const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
          if (isVertical) {
            bx = (rLocal + borderOffset) * SCALE * Math.cos(currentAngle);
            by = posGlobal;
            bz = (rLocal + borderOffset) * SCALE * Math.sin(currentAngle);
          } else {
            bx = posGlobal;
            by = (rLocal + borderOffset) * SCALE * Math.sin(currentAngle);
            bz = (rLocal + borderOffset) * SCALE * Math.cos(currentAngle);
          }
        } else if (currentPos > TAN_TAN) {
          const posLocal = currentPos - TAN_TAN;
          const ratio = Math.min(0.99, Math.abs(posLocal / HEAD_DEPTH));
          const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
          if (isVertical) {
            bx = (rLocal + borderOffset) * SCALE * Math.cos(currentAngle);
            by = posGlobal;
            bz = (rLocal + borderOffset) * SCALE * Math.sin(currentAngle);
          } else {
            bx = posGlobal;
            by = (rLocal + borderOffset) * SCALE * Math.sin(currentAngle);
            bz = (rLocal + borderOffset) * SCALE * Math.cos(currentAngle);
          }
        } else {
          if (isVertical) {
            bx = (RADIUS + borderOffset) * SCALE * Math.cos(currentAngle);
            by = posGlobal;
            bz = (RADIUS + borderOffset) * SCALE * Math.sin(currentAngle);
          } else {
            bx = posGlobal;
            by = (RADIUS + borderOffset) * SCALE * Math.sin(currentAngle);
            bz = (RADIUS + borderOffset) * SCALE * Math.cos(currentAngle);
          }
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
    border.userData = { type: 'scanComposite-border', id: composite.id };
    border.visible = composite.id === selectedId;
    mesh.add(border);
  }

  return mesh;
}

// ---------------------------------------------------------------------------
// Texture Loading
// ---------------------------------------------------------------------------

/**
 * Load an image file and create a Three.js texture from it.
 *
 * Steps:
 * 1. Read the File as a data URL via FileReader
 * 2. Create an HTMLImageElement from the data URL
 * 3. Build a THREE.Texture with correct color space and filtering
 * 4. Return the texture plus metadata needed to populate TextureConfig
 *
 * @param file     - User-selected image file
 * @param renderer - The active WebGLRenderer (used for max anisotropy)
 * @returns Texture, base64 imageData URL, original filename, and aspect ratio
 */
export function loadTextureFromFile(
  file: File,
  renderer: THREE.WebGLRenderer,
): Promise<{ texture: THREE.Texture; imageData: string; name: string; aspectRatio: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };

    reader.onload = () => {
      const imageData = reader.result as string;
      const img = new Image();

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${file.name}`));
      };

      img.onload = () => {
        const texture = new THREE.Texture(img);

        // Wrapping
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;

        // Mipmaps and filtering
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // Anisotropic filtering (use max supported by the GPU)
        const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.anisotropy = maxAnisotropy;

        // Color space (Three.js r152+ replaces sRGBEncoding with SRGBColorSpace)
        texture.colorSpace = THREE.SRGBColorSpace;

        // Mark the texture as needing upload to GPU
        texture.needsUpdate = true;

        const aspectRatio = img.width / img.height;

        resolve({
          texture,
          imageData,
          name: file.name,
          aspectRatio,
        });
      };

      img.src = imageData;
    };

    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Texture Loading from Project Data (base64 imageData → THREE.Texture)
// ---------------------------------------------------------------------------

/**
 * Recreate a THREE.Texture from a base64 data URL (used when loading a saved
 * project). Matches the same texture settings as loadTextureFromFile.
 *
 * @param imageData - Base64 data URL string (e.g. "data:image/png;base64,...")
 * @param renderer  - The active WebGLRenderer (used for max anisotropy)
 * @returns Promise with the THREE.Texture and calculated aspectRatio
 */
export function loadTextureFromData(
  imageData: string,
  renderer: THREE.WebGLRenderer,
): Promise<{ texture: THREE.Texture; aspectRatio: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onerror = () => {
      reject(new Error('Failed to load texture from saved data'));
    };

    img.onload = () => {
      const texture = new THREE.Texture(img);

      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.anisotropy = maxAnisotropy;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      resolve({
        texture,
        aspectRatio: img.width / img.height,
      });
    };

    img.src = imageData;
  });
}

// ---------------------------------------------------------------------------
// Texture Disposal
// ---------------------------------------------------------------------------

/**
 * Dispose a texture object and free GPU memory.
 * Safe to call on already-disposed textures.
 */
export function disposeTexture(texture: THREE.Texture): void {
  texture.dispose();
}

/**
 * Dispose all textures in a texture map and clear the map.
 */
export function disposeAllTextures(textureObjects: Record<string, THREE.Texture>): void {
  for (const key of Object.keys(textureObjects)) {
    textureObjects[key].dispose();
    delete textureObjects[key];
  }
}
