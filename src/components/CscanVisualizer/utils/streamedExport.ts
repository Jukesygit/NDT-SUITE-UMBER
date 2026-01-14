/**
 * Memory-efficient heatmap export utility
 * Uses fast-png for direct PNG encoding - bypasses Canvas size limits entirely
 * Can handle 20k+ x 20k+ images (limited only by available RAM)
 */

import { encode as encodePng } from 'fast-png';
import { CscanData, DisplaySettings } from '../types';

// Color scale definitions matching Plotly's colorscales EXACTLY
// Source: https://github.com/plotly/plotly.js/blob/master/src/components/colorscale/scales.js
const COLOR_SCALES: Record<string, Array<[number, [number, number, number]]>> = {
  Jet: [
    [0.0, [0, 0, 131]],
    [0.125, [0, 60, 170]],
    [0.375, [5, 255, 255]],
    [0.625, [255, 255, 0]],
    [0.875, [250, 0, 0]],
    [1.0, [128, 0, 0]]
  ],
  Viridis: [
    [0.0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1.0, [253, 231, 37]]
  ],
  Plasma: [
    [0.0, [13, 8, 135]],
    [0.25, [126, 3, 168]],
    [0.5, [204, 71, 120]],
    [0.75, [248, 149, 64]],
    [1.0, [240, 249, 33]]
  ],
  Inferno: [
    [0.0, [0, 0, 4]],
    [0.25, [87, 16, 110]],
    [0.5, [188, 55, 84]],
    [0.75, [249, 142, 9]],
    [1.0, [252, 255, 164]]
  ],
  Magma: [
    [0.0, [0, 0, 4]],
    [0.25, [81, 18, 124]],
    [0.5, [183, 55, 121]],
    [0.75, [254, 136, 92]],
    [1.0, [252, 253, 191]]
  ],
  Hot: [
    [0.0, [11, 0, 0]],
    [0.33, [255, 0, 0]],
    [0.66, [255, 255, 0]],
    [1.0, [255, 255, 255]]
  ],
  Blues: [
    [0.0, [247, 251, 255]],
    [0.5, [107, 174, 214]],
    [1.0, [8, 48, 107]]
  ],
  Greens: [
    [0.0, [247, 252, 245]],
    [0.5, [116, 196, 118]],
    [1.0, [0, 68, 27]]
  ],
  Greys: [
    [0.0, [255, 255, 255]],
    [1.0, [0, 0, 0]]
  ],
  RdBu: [
    [0.0, [103, 0, 31]],
    [0.25, [214, 96, 77]],
    [0.5, [247, 247, 247]],
    [0.75, [67, 147, 195]],
    [1.0, [5, 48, 97]]
  ],
  YlOrRd: [
    [0.0, [255, 255, 204]],
    [0.25, [254, 217, 118]],
    [0.5, [254, 153, 41]],
    [0.75, [227, 74, 51]],
    [1.0, [128, 0, 38]]
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
    [1.0, [255, 0, 0]]
  ],
  Portland: [
    [0.0, [12, 51, 131]],
    [0.25, [10, 136, 186]],
    [0.5, [242, 211, 56]],
    [0.75, [242, 143, 56]],
    [1.0, [217, 30, 30]]
  ],
  Electric: [
    [0.0, [0, 0, 0]],
    [0.15, [30, 0, 100]],
    [0.4, [120, 0, 100]],
    [0.6, [160, 90, 0]],
    [0.8, [230, 200, 0]],
    [1.0, [255, 250, 220]]
  ]
};

/**
 * Interpolate between colors in a color scale
 */
function interpolateColor(
  t: number,
  scale: Array<[number, [number, number, number]]>,
  reverse: boolean
): [number, number, number] {
  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t));

  if (reverse) {
    t = 1 - t;
  }

  // Find the two stops to interpolate between
  let lowerIdx = 0;
  let upperIdx = scale.length - 1;

  for (let i = 0; i < scale.length - 1; i++) {
    if (t >= scale[i][0] && t <= scale[i + 1][0]) {
      lowerIdx = i;
      upperIdx = i + 1;
      break;
    }
  }

  const [lowerT, lowerColor] = scale[lowerIdx];
  const [upperT, upperColor] = scale[upperIdx];

  // Interpolation factor between the two stops
  const range = upperT - lowerT;
  const factor = range === 0 ? 0 : (t - lowerT) / range;

  return [
    Math.round(lowerColor[0] + factor * (upperColor[0] - lowerColor[0])),
    Math.round(lowerColor[1] + factor * (upperColor[1] - lowerColor[1])),
    Math.round(lowerColor[2] + factor * (upperColor[2] - lowerColor[2]))
  ];
}

/**
 * Export progress callback type
 */
export type ExportProgressCallback = (progress: number, message: string) => void;

/**
 * Export options for the streamed export
 */
export interface StreamedExportOptions {
  data: CscanData;
  displaySettings: DisplaySettings;
  onProgress?: ExportProgressCallback;
}

/**
 * Export the heatmap using fast-png for direct encoding
 * Bypasses Canvas size limits - can handle unlimited resolution
 * Returns a Blob that can be downloaded directly
 */
export async function exportHeatmapToBlob(
  options: StreamedExportOptions
): Promise<Blob | null> {
  const { data, displaySettings, onProgress } = options;

  if (!data || !data.data || data.data.length === 0) {
    return null;
  }

  const zData = data.data;
  const numRows = zData.length;
  const numCols = zData[0]?.length ?? 0;

  if (numCols === 0) {
    return null;
  }

  // True 1:1 resolution - each data point = 1 pixel
  const width = numCols;
  const height = numRows;

  onProgress?.(0, `Preparing ${width.toLocaleString()} x ${height.toLocaleString()} image...`);

  // Get color scale
  const scaleName = displaySettings.colorScale || 'Jet';
  const colorScale = COLOR_SCALES[scaleName] || COLOR_SCALES.Jet;
  const reverseScale = displaySettings.reverseScale ?? true;

  // Determine data range - use display settings if set, otherwise fall back to data stats
  // This ensures the exported image matches what the user sees on screen
  const statsMin = data.stats?.min ?? 0;
  const statsMax = data.stats?.max ?? 1;

  // Use explicit range if set (user clicked "Apply"), otherwise use data stats (auto mode)
  // Check specifically for number type to handle edge cases
  const zMin = typeof displaySettings.range.min === 'number' ? displaySettings.range.min : statsMin;
  const zMax = typeof displaySettings.range.max === 'number' ? displaySettings.range.max : statsMax;
  const zRange = zMax - zMin || 1; // Avoid division by zero

  console.log(`Export using range: ${zMin.toFixed(2)} - ${zMax.toFixed(2)}`);

  onProgress?.(2, 'Allocating pixel buffer...');

  // Allocate pixel buffer (RGBA format)
  // For very large images, this is where memory limits come into play
  const pixelCount = width * height;
  const bytesNeeded = pixelCount * 4;

  console.log(`Allocating ${(bytesNeeded / 1024 / 1024).toFixed(1)} MB for ${width}x${height} image`);

  let pixels: Uint8Array;
  try {
    pixels = new Uint8Array(bytesNeeded);
  } catch (e) {
    console.error('Failed to allocate pixel buffer - image too large for available memory');
    onProgress?.(0, 'Error: Image too large for available memory');
    return null;
  }

  onProgress?.(5, 'Rendering pixels...');

  // Process rows in chunks to keep UI responsive
  const ROWS_PER_CHUNK = 100;
  let processedRows = 0;

  for (let rowStart = 0; rowStart < numRows; rowStart += ROWS_PER_CHUNK) {
    const rowEnd = Math.min(rowStart + ROWS_PER_CHUNK, numRows);

    for (let row = rowStart; row < rowEnd; row++) {
      const rowData = zData[row];
      const rowOffset = row * width * 4;

      for (let col = 0; col < numCols; col++) {
        const value = rowData[col];
        const pixelOffset = rowOffset + col * 4;

        if (value === null || value === undefined || isNaN(value)) {
          // Transparent for null/invalid values
          pixels[pixelOffset] = 0;     // R
          pixels[pixelOffset + 1] = 0; // G
          pixels[pixelOffset + 2] = 0; // B
          pixels[pixelOffset + 3] = 0; // A (transparent)
        } else {
          // Normalize value to [0, 1] and get color
          const t = (value - zMin) / zRange;
          const [r, g, b] = interpolateColor(t, colorScale, reverseScale);
          pixels[pixelOffset] = r;
          pixels[pixelOffset + 1] = g;
          pixels[pixelOffset + 2] = b;
          pixels[pixelOffset + 3] = 255; // Fully opaque
        }
      }
    }

    processedRows = rowEnd;
    const progress = 5 + (processedRows / numRows) * 80;
    onProgress?.(progress, `Rendering row ${processedRows.toLocaleString()} of ${numRows.toLocaleString()}...`);

    // Yield to main thread to keep UI responsive
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  onProgress?.(88, 'Encoding PNG...');

  // Encode to PNG using fast-png (no Canvas needed!)
  let pngData: Uint8Array;
  try {
    pngData = encodePng({
      width,
      height,
      data: pixels,
      channels: 4 // RGBA
    });
  } catch (e) {
    console.error('Failed to encode PNG:', e);
    onProgress?.(0, 'Error: Failed to encode PNG');
    return null;
  }

  onProgress?.(98, 'Creating download...');

  // Create blob from PNG data
  const blob = new Blob([new Uint8Array(pngData)], { type: 'image/png' });

  // Help garbage collection by clearing the pixel buffer
  pixels = null as any;

  onProgress?.(100, 'Export complete');

  console.log(`Exported ${width}x${height} image (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);

  return blob;
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the object URL after a delay
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export and download the heatmap in one call
 * This is the main function to use for downloading large heatmaps
 */
export async function exportAndDownloadHeatmap(
  data: CscanData,
  displaySettings: DisplaySettings,
  onProgress?: ExportProgressCallback
): Promise<boolean> {
  try {
    const blob = await exportHeatmapToBlob({ data, displaySettings, onProgress });

    if (!blob) {
      console.error('Failed to generate heatmap blob');
      return false;
    }

    const filename = data.isComposite
      ? 'composite_heatmap.png'
      : `${data.filename?.replace(/\.[^/.]+$/, '') || 'cscan'}_heatmap.png`;

    downloadBlob(blob, filename);
    return true;
  } catch (error) {
    console.error('Error exporting heatmap:', error);
    return false;
  }
}
