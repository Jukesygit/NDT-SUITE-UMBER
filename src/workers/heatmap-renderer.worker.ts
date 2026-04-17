/**
 * Heatmap rendering Web Worker.
 *
 * Receives a Float32Array thickness matrix (transferred, not copied),
 * applies a colormap, downsamples to viewport dimensions, and returns
 * an ImageData (also transferred).
 *
 * Colormaps are sourced from the shared Plotly-compatible definitions in
 * `src/utils/colorscales.ts` — the same scales used by the C-scan
 * compositor and vessel modeler.
 */

import { buildColorLut } from '../utils/colorscales';

// ---------------------------------------------------------------------------
// LUT cache — keyed by "name|reverse"
// ---------------------------------------------------------------------------

const lutCache = new Map<string, Uint8ClampedArray>();

function getLut(name: string, reverse = false): Uint8ClampedArray {
  const key = `${name}|${reverse}`;
  let lut = lutCache.get(key);
  if (!lut) {
    lut = buildColorLut(name, reverse);
    lutCache.set(key, lut);
  }
  return lut;
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface WorkerRequest {
  id: number;
  matrix: Float32Array;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  colormap: string;
  reverseColormap?: boolean;
  rangeMin?: number;
  rangeMax?: number;
  visibleRegion?: { x0: number; y0: number; x1: number; y1: number };
}

// ---------------------------------------------------------------------------
// Render logic
// ---------------------------------------------------------------------------

function render(msg: WorkerRequest): ImageData {
  const { matrix, width, height, viewportWidth, viewportHeight, colormap, visibleRegion } = msg;
  const lut = getLut(colormap, msg.reverseColormap);

  // Determine visible data window (in data coordinates, row/col indices)
  let srcX0 = 0, srcY0 = 0, srcX1 = width, srcY1 = height;
  if (visibleRegion) {
    srcX0 = Math.max(0, Math.floor(visibleRegion.x0));
    srcY0 = Math.max(0, Math.floor(visibleRegion.y0));
    srcX1 = Math.min(width, Math.ceil(visibleRegion.x1));
    srcY1 = Math.min(height, Math.ceil(visibleRegion.y1));
  }

  const srcW = srcX1 - srcX0;
  const srcH = srcY1 - srcY0;

  if (srcW <= 0 || srcH <= 0) {
    return new ImageData(viewportWidth, viewportHeight);
  }

  // Compute data range for normalization
  let dataMin = msg.rangeMin ?? Infinity;
  let dataMax = msg.rangeMax ?? -Infinity;

  if (dataMin === Infinity || dataMax === -Infinity) {
    // Auto-range from visible data
    for (let row = srcY0; row < srcY1; row++) {
      const rowOffset = row * width;
      for (let col = srcX0; col < srcX1; col++) {
        const val = matrix[rowOffset + col];
        if (!isNaN(val)) {
          if (val < dataMin) dataMin = val;
          if (val > dataMax) dataMax = val;
        }
      }
    }
  }

  const range = dataMax - dataMin;
  const invRange = range > 0 ? 255 / range : 0;

  // Output pixel buffer
  const imageData = new ImageData(viewportWidth, viewportHeight);
  const pixels = imageData.data;

  // Determine if downsampling or upsampling
  const scaleX = srcW / viewportWidth;
  const scaleY = srcH / viewportHeight;
  const needsDownsample = scaleX > 1 || scaleY > 1;

  for (let py = 0; py < viewportHeight; py++) {
    for (let px = 0; px < viewportWidth; px++) {
      const pixelOffset = (py * viewportWidth + px) * 4;

      if (needsDownsample) {
        // NaN-aware average pooling
        const binX0 = srcX0 + Math.floor(px * scaleX);
        const binX1 = srcX0 + Math.floor((px + 1) * scaleX);
        const binY0 = srcY0 + Math.floor(py * scaleY);
        const binY1 = srcY0 + Math.floor((py + 1) * scaleY);

        let sum = 0;
        let count = 0;
        for (let r = binY0; r < binY1 && r < srcY1; r++) {
          const rowOff = r * width;
          for (let c = binX0; c < binX1 && c < srcX1; c++) {
            const val = matrix[rowOff + c];
            if (!isNaN(val)) {
              sum += val;
              count++;
            }
          }
        }

        if (count === 0) {
          // All NaN — transparent
          pixels[pixelOffset + 3] = 0;
          continue;
        }

        const avg = sum / count;
        const idx = Math.round((avg - dataMin) * invRange);
        const lutIdx = Math.max(0, Math.min(255, idx)) * 4;
        pixels[pixelOffset] = lut[lutIdx];
        pixels[pixelOffset + 1] = lut[lutIdx + 1];
        pixels[pixelOffset + 2] = lut[lutIdx + 2];
        pixels[pixelOffset + 3] = 255;
      } else {
        // Nearest-neighbor (1:1 or zoomed in)
        const dataCol = srcX0 + Math.floor(px * scaleX);
        const dataRow = srcY0 + Math.floor(py * scaleY);

        if (dataCol >= width || dataRow >= height) {
          pixels[pixelOffset + 3] = 0;
          continue;
        }

        const val = matrix[dataRow * width + dataCol];
        if (isNaN(val)) {
          pixels[pixelOffset + 3] = 0;
          continue;
        }

        const idx = Math.round((val - dataMin) * invRange);
        const lutIdx = Math.max(0, Math.min(255, idx)) * 4;
        pixels[pixelOffset] = lut[lutIdx];
        pixels[pixelOffset + 1] = lut[lutIdx + 1];
        pixels[pixelOffset + 2] = lut[lutIdx + 2];
        pixels[pixelOffset + 3] = 255;
      }
    }
  }

  return imageData;
}

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  const imageData = render(msg);

  (self as unknown as Worker).postMessage(
    { id: msg.id, imageData },
    // Transfer the ImageData's buffer
    [imageData.data.buffer] as unknown as Transferable[],
  );
};
