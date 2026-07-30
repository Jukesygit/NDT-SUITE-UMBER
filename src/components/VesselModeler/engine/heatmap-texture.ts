/**
 * heatmap-texture.ts
 *
 * Converts a 2D thickness matrix into a color-mapped CanvasTexture for Three.js.
 * Supports multiple Plotly-compatible colorscales with configurable range and opacity.
 */

import * as THREE from 'three';
import { COLOR_SCALES, interpolateColor } from '../../../utils/colorscales';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeatmapTextureOptions {
  colorScale?: string;
  rangeMin?: number | null;
  rangeMax?: number | null;
  reverseScale?: boolean;
  opacity?: number;
  /**
   * Optional per-cell exclusion for the appendage cutout (design §9.4). When it
   * returns true for a (row, col) the pixel is stamped fully transparent
   * (alpha = 0), matching the coverage/wall-loss exclusions so the visible hole
   * agrees with the stats. Callers build it from the SAME junction-footprint
   * `containsCell` predicate — never a re-derived one.
   */
  excludeMask?: (row: number, col: number) => boolean;
}

export interface HeatmapTextureResult {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
}

// ---------------------------------------------------------------------------
// Core rendering
// ---------------------------------------------------------------------------

/**
 * Paint a thickness matrix into a flat RGBA pixel buffer (row-major, one texel
 * per data cell, length = rows·cols·4). Pure and canvas-free so it is directly
 * unit-testable — jsdom has no 2D context, so this is where the pixel behaviour
 * (colour, null transparency, cutout alpha stamp) is verified. `renderToCanvas`
 * is a thin wrapper that hands it `ctx.createImageData(...).data`.
 */
export function paintHeatmapPixels(
  pixels: Uint8ClampedArray | number[],
  data: (number | null)[][],
  stats: { min: number; max: number },
  options: HeatmapTextureOptions = {},
): void {
  const {
    colorScale = 'Jet',
    rangeMin = null,
    rangeMax = null,
    reverseScale = false,
    opacity = 1,
    excludeMask,
  } = options;

  const rows = data.length;
  const cols = rows > 0 ? data[0].length : 0;
  if (rows === 0 || cols === 0) return;

  const min = rangeMin != null ? rangeMin : stats.min;
  const max = rangeMax != null ? rangeMax : stats.max;
  const range = max === min ? 1 : max - min;

  const stops = COLOR_SCALES[colorScale] ?? COLOR_SCALES.Jet;
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = (row * cols + col) * 4;
      const value = data[row][col];

      // Appendage cutout: stamp footprint pixels fully transparent (design §9.4).
      if (value == null || (excludeMask !== undefined && excludeMask(row, col))) {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      } else {
        const normalized = (value - min) / range;
        const [r, g, b] = interpolateColor(normalized, stops, reverseScale);
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = alpha;
      }
    }
  }
}

function renderToCanvas(
  canvas: HTMLCanvasElement,
  data: (number | null)[][],
  stats: { min: number; max: number },
  options: HeatmapTextureOptions = {},
): void {
  const rows = data.length;
  const cols = rows > 0 ? data[0].length : 0;
  if (rows === 0 || cols === 0) return;

  canvas.width = cols;
  canvas.height = rows;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.createImageData(cols, rows);
  paintHeatmapPixels(imageData.data, data, stats, options);
  ctx.putImageData(imageData, 0, 0);
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export function createHeatmapTexture(
  data: (number | null)[][],
  stats: { min: number; max: number },
  options?: HeatmapTextureOptions,
): HeatmapTextureResult {
  const canvas = document.createElement('canvas');

  renderToCanvas(canvas, data, stats, options);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  return { texture, canvas };
}

export function updateHeatmapTexture(
  result: HeatmapTextureResult,
  data: (number | null)[][],
  stats: { min: number; max: number },
  options?: HeatmapTextureOptions,
): void {
  renderToCanvas(result.canvas, data, stats, options);
  result.texture.needsUpdate = true;
}

export { getAvailableColorscales } from '../../../utils/colorscales';
