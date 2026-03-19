/**
 * heatmap-texture.ts
 *
 * Converts a 2D thickness matrix into a color-mapped CanvasTexture for Three.js.
 * Supports multiple Plotly-compatible colorscales with configurable range and opacity.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ColorStop = [number, [number, number, number]];

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
// Colorscale definitions (Plotly-compatible RGB values)
// ---------------------------------------------------------------------------

const COLORSCALES: Record<string, ColorStop[]> = {
  Jet: [
    [0.0, [0, 0, 131]],
    [0.167, [0, 60, 170]],
    [0.333, [0, 255, 255]],
    [0.5, [0, 255, 0]],
    [0.667, [255, 255, 0]],
    [0.833, [255, 0, 0]],
    [1.0, [128, 0, 0]],
  ],
  Viridis: [
    [0.0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1.0, [253, 231, 37]],
  ],
  Hot: [
    [0.0, [10, 0, 0]],
    [0.333, [255, 0, 0]],
    [0.667, [255, 255, 0]],
    [1.0, [255, 255, 255]],
  ],
  Blues: [
    [0.0, [247, 251, 255]],
    [0.5, [107, 174, 214]],
    [1.0, [8, 48, 107]],
  ],
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function lerpColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function valueToColor(
  normalizedValue: number,
  colorscale: ColorStop[],
): [number, number, number] {
  const v = Math.max(0, Math.min(1, normalizedValue));

  // If at or beyond the last stop, return the final color
  if (v >= colorscale[colorscale.length - 1][0]) {
    return colorscale[colorscale.length - 1][1];
  }

  for (let i = 0; i < colorscale.length - 1; i++) {
    const [pos0, col0] = colorscale[i];
    const [pos1, col1] = colorscale[i + 1];

    if (v >= pos0 && v < pos1) {
      const t = (v - pos0) / (pos1 - pos0);
      return lerpColor(col0, col1, t);
    }
  }

  // Fallback (should not reach here)
  return colorscale[0][1];
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

  let stops = COLORSCALES[colorScale] ?? COLORSCALES.Jet;

  if (reverseScale) {
    stops = stops
      .map<ColorStop>(([pos, col]) => [1 - pos, col])
      .reverse();
  }

  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = (row * cols + col) * 4;
      const value = data[row][col];

      if (value == null) {
        // Transparent pixel for null values
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      } else {
        const normalized = (value - min) / range;
        const [r, g, b] = valueToColor(normalized, stops);
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

export function getAvailableColorscales(): string[] {
  return Object.keys(COLORSCALES);
}
