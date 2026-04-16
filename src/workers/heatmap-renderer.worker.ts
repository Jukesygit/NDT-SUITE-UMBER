/**
 * Heatmap rendering Web Worker.
 *
 * Receives a Float32Array thickness matrix (transferred, not copied),
 * applies a colormap, downsamples to viewport dimensions, and returns
 * an ImageData (also transferred).
 */

// ---------------------------------------------------------------------------
// Colormap LUTs — 256 RGBA entries
// ---------------------------------------------------------------------------

type ColormapName = 'viridis' | 'jet' | 'plasma' | 'okabe-ito';

function buildLut(name: ColormapName): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r: number, g: number, b: number;

    switch (name) {
      case 'jet':
        r = clamp(1.5 - Math.abs(4.0 * t - 3.0));
        g = clamp(1.5 - Math.abs(4.0 * t - 2.0));
        b = clamp(1.5 - Math.abs(4.0 * t - 1.0));
        break;
      case 'plasma':
        r = clamp(0.05 + 1.45 * t - 0.7 * t * t);
        g = clamp(-0.2 + 1.5 * t * t);
        b = clamp(0.55 - 0.5 * t + 0.7 * t * t);
        break;
      case 'okabe-ito':
        // Diverging colormap: blue → white → orange
        if (t < 0.5) {
          const s = t * 2;
          r = clamp(0.23 + 0.77 * s);
          g = clamp(0.35 + 0.65 * s);
          b = clamp(0.82 + 0.18 * s);
        } else {
          const s = (t - 0.5) * 2;
          r = clamp(1.0 - 0.1 * s);
          g = clamp(1.0 - 0.4 * s);
          b = clamp(1.0 - 0.85 * s);
        }
        break;
      case 'viridis':
      default:
        r = clamp(0.267 + 0.004 * t + 1.26 * t * t - 1.53 * t * t * t);
        g = clamp(0.004 + 1.01 * t - 0.66 * t * t + 0.31 * t * t * t);
        b = clamp(0.33 + 0.21 * t + 1.97 * t * t - 2.51 * t * t * t);
        break;
    }

    const offset = i * 4;
    lut[offset] = Math.round(r * 255);
    lut[offset + 1] = Math.round(g * 255);
    lut[offset + 2] = Math.round(b * 255);
    lut[offset + 3] = 255;
  }

  return lut;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Cache LUTs
const lutCache = new Map<string, Uint8ClampedArray>();

function getLut(name: ColormapName): Uint8ClampedArray {
  let lut = lutCache.get(name);
  if (!lut) {
    lut = buildLut(name);
    lutCache.set(name, lut);
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
  colormap: ColormapName;
  rangeMin?: number;
  rangeMax?: number;
  visibleRegion?: { x0: number; y0: number; x1: number; y1: number };
}

// ---------------------------------------------------------------------------
// Render logic
// ---------------------------------------------------------------------------

function render(msg: WorkerRequest): ImageData {
  const { matrix, width, height, viewportWidth, viewportHeight, colormap, visibleRegion } = msg;
  const lut = getLut(colormap);

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
