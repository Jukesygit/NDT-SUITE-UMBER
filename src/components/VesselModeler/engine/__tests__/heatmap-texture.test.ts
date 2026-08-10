// =============================================================================
// heatmap-texture — cutout alpha stamp (P3-T2, design §9.4)
// =============================================================================
// jsdom has no 2D canvas context, so pixel behaviour is verified through the
// pure paintHeatmapPixels core that renderToCanvas wraps. The excludeMask marks
// main-shell pixels inside a junction footprint fully transparent (alpha 0);
// every other pixel must be untouched.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { paintHeatmapPixels } from '../heatmap-texture';

const stats = { min: 8, max: 13 };
// 2 rows × 3 cols; pixel (row,col) → buffer index (row*cols+col)*4.
const data: (number | null)[][] = [
  [8, 9, 10],
  [11, 12, 13],
];
const COLS = 3;
const alphaAt = (buf: Uint8ClampedArray, row: number, col: number) =>
  buf[(row * COLS + col) * 4 + 3];

describe('paintHeatmapPixels — excludeMask alpha stamp', () => {
  it('stamps masked pixels transparent and leaves the rest untouched', () => {
    const masked = new Uint8ClampedArray(2 * 3 * 4);
    const plain = new Uint8ClampedArray(2 * 3 * 4);
    // Mask a single pixel (0,1); everything else must match the unmasked render.
    paintHeatmapPixels(masked, data, stats, {
      opacity: 1,
      excludeMask: (r, c) => r === 0 && c === 1,
    });
    paintHeatmapPixels(plain, data, stats, { opacity: 1 });

    // Masked pixel: alpha 0 (and RGB zeroed).
    expect(alphaAt(masked, 0, 1)).toBe(0);
    expect(masked[(0 * 3 + 1) * 4]).toBe(0);
    // Same pixel is opaque in the unmasked render → the mask is what changed it.
    expect(alphaAt(plain, 0, 1)).toBe(255);

    // Every OTHER pixel is byte-identical between the two renders.
    for (let i = 0; i < masked.length; i++) {
      if (Math.floor(i / 4) === 0 * 3 + 1) continue; // skip the masked pixel
      expect(masked[i]).toBe(plain[i]);
    }
  });

  it('honours a mask that spans multiple pixels', () => {
    const buf = new Uint8ClampedArray(2 * 3 * 4);
    paintHeatmapPixels(buf, data, stats, { opacity: 1, excludeMask: (_r, c) => c === 2 });
    // Whole last column transparent, first two columns opaque.
    expect(alphaAt(buf, 0, 2)).toBe(0);
    expect(alphaAt(buf, 1, 2)).toBe(0);
    expect(alphaAt(buf, 0, 0)).toBe(255);
    expect(alphaAt(buf, 1, 1)).toBe(255);
  });

  it('keeps every pixel opaque with no mask (byte-identical legacy path)', () => {
    const buf = new Uint8ClampedArray(2 * 3 * 4);
    paintHeatmapPixels(buf, data, stats, { opacity: 1 });
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        expect(alphaAt(buf, row, col)).toBe(255);
      }
    }
  });

  it('still zeroes null data cells regardless of the mask', () => {
    const withNull: (number | null)[][] = [
      [8, null, 10],
      [11, 12, 13],
    ];
    const buf = new Uint8ClampedArray(2 * 3 * 4);
    paintHeatmapPixels(buf, withNull, stats, { opacity: 1, excludeMask: () => false });
    expect(alphaAt(buf, 0, 1)).toBe(0); // null → transparent
    expect(alphaAt(buf, 0, 0)).toBe(255);
  });
});
