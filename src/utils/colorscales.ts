/**
 * Shared colorscale definitions and interpolation.
 *
 * Single source of truth for all color-mapping in the application:
 *   - C-scan streamed PNG export (CscanVisualizer)
 *   - 3D heatmap textures (VesselModeler)
 *
 * Scale values sourced from Plotly.js:
 * https://github.com/plotly/plotly.js/blob/master/src/components/colorscale/scales.js
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColorStop = [number, [number, number, number]];

// ---------------------------------------------------------------------------
// Colorscale definitions (Plotly-compatible RGB values)
// ---------------------------------------------------------------------------

export const COLOR_SCALES: Record<string, ColorStop[]> = {
  Jet: [
    [0.0, [0, 0, 131]],
    [0.125, [0, 60, 170]],
    [0.375, [5, 255, 255]],
    [0.625, [255, 255, 0]],
    [0.875, [250, 0, 0]],
    [1.0, [128, 0, 0]],
  ],
  Viridis: [
    [0.0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1.0, [253, 231, 37]],
  ],
  Plasma: [
    [0.0, [13, 8, 135]],
    [0.25, [126, 3, 168]],
    [0.5, [204, 71, 120]],
    [0.75, [248, 149, 64]],
    [1.0, [240, 249, 33]],
  ],
  Inferno: [
    [0.0, [0, 0, 4]],
    [0.25, [87, 16, 110]],
    [0.5, [188, 55, 84]],
    [0.75, [249, 142, 9]],
    [1.0, [252, 255, 164]],
  ],
  Magma: [
    [0.0, [0, 0, 4]],
    [0.25, [81, 18, 124]],
    [0.5, [183, 55, 121]],
    [0.75, [254, 136, 92]],
    [1.0, [252, 253, 191]],
  ],
  Hot: [
    [0.0, [11, 0, 0]],
    [0.33, [255, 0, 0]],
    [0.66, [255, 255, 0]],
    [1.0, [255, 255, 255]],
  ],
  Blues: [
    [0.0, [247, 251, 255]],
    [0.5, [107, 174, 214]],
    [1.0, [8, 48, 107]],
  ],
  Greens: [
    [0.0, [247, 252, 245]],
    [0.5, [116, 196, 118]],
    [1.0, [0, 68, 27]],
  ],
  Greys: [
    [0.0, [255, 255, 255]],
    [1.0, [0, 0, 0]],
  ],
  RdBu: [
    [0.0, [103, 0, 31]],
    [0.25, [214, 96, 77]],
    [0.5, [247, 247, 247]],
    [0.75, [67, 147, 195]],
    [1.0, [5, 48, 97]],
  ],
  YlOrRd: [
    [0.0, [255, 255, 204]],
    [0.25, [254, 217, 118]],
    [0.5, [254, 153, 41]],
    [0.75, [227, 74, 51]],
    [1.0, [128, 0, 38]],
  ],
  Picnic: [
    [0.0, [0, 0, 255]],
    [0.1, [51, 153, 255]],
    [0.2, [102, 204, 255]],
    [0.3, [153, 204, 255]],
    [0.4, [204, 204, 255]],
    [0.5, [255, 255, 255]],
    [0.6, [255, 204, 255]],
    [0.7, [255, 153, 255]],
    [0.8, [255, 102, 204]],
    [0.9, [255, 102, 102]],
    [1.0, [255, 0, 0]],
  ],
  Portland: [
    [0.0, [12, 51, 131]],
    [0.25, [10, 136, 186]],
    [0.5, [242, 211, 56]],
    [0.75, [242, 143, 56]],
    [1.0, [217, 30, 30]],
  ],
  Electric: [
    [0.0, [0, 0, 0]],
    [0.15, [30, 0, 100]],
    [0.4, [120, 0, 100]],
    [0.6, [160, 90, 0]],
    [0.8, [230, 200, 0]],
    [1.0, [255, 250, 220]],
  ],
};

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Linearly interpolate between two RGB colors.
 */
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

/**
 * Map a normalized value [0,1] to an RGB color using the given colorscale.
 * Optionally reverses the scale direction.
 */
export function interpolateColor(
  t: number,
  scale: ColorStop[],
  reverse = false,
): [number, number, number] {
  let v = Math.max(0, Math.min(1, t));
  if (reverse) v = 1 - v;

  // At or beyond the last stop
  if (v >= scale[scale.length - 1][0]) {
    return scale[scale.length - 1][1];
  }

  for (let i = 0; i < scale.length - 1; i++) {
    const [pos0, col0] = scale[i];
    const [pos1, col1] = scale[i + 1];
    if (v >= pos0 && v < pos1) {
      const f = (v - pos0) / (pos1 - pos0);
      return lerpColor(col0, col1, f);
    }
  }

  return scale[0][1];
}

/**
 * Get the list of available colorscale names.
 */
export function getAvailableColorscales(): string[] {
  return Object.keys(COLOR_SCALES);
}

/**
 * Look up a colorscale by name, falling back to Jet.
 */
export function getColorscale(name: string): ColorStop[] {
  return COLOR_SCALES[name] ?? COLOR_SCALES.Jet;
}
