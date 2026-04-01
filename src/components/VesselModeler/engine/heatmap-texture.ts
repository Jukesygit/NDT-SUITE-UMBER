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
}

export interface HeatmapTextureResult {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
}

// ---------------------------------------------------------------------------
// Core rendering
// ---------------------------------------------------------------------------

function renderToCanvas(
  canvas: HTMLCanvasElement,
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
  } = options;

  const rows = data.length;
  const cols = rows > 0 ? data[0].length : 0;
  if (rows === 0 || cols === 0) return;

  canvas.width = cols;
  canvas.height = rows;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.createImageData(cols, rows);
  const pixels = imageData.data;

  const min = rangeMin != null ? rangeMin : stats.min;
  const max = rangeMax != null ? rangeMax : stats.max;
  const range = max === min ? 1 : max - min;

  const stops = COLOR_SCALES[colorScale] ?? COLOR_SCALES.Jet;
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = (row * cols + col) * 4;
      const value = data[row][col];

      if (value == null) {
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
