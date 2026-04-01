/**
 * Memory-efficient heatmap export utility
 * Uses fast-png for direct PNG encoding - bypasses Canvas size limits entirely
 * Can handle 20k+ x 20k+ images (limited only by available RAM)
 */

import { encode as encodePng } from 'fast-png';
import { CscanData, DisplaySettings } from '../types';
import { COLOR_SCALES, interpolateColor } from '../../../utils/colorscales';

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

  onProgress?.(2, 'Allocating pixel buffer...');

  // Allocate pixel buffer (RGBA format)
  // For very large images, this is where memory limits come into play
  const pixelCount = width * height;
  const bytesNeeded = pixelCount * 4;

  let pixels: Uint8Array;
  try {
    pixels = new Uint8Array(bytesNeeded);
  } catch (e) {
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
    onProgress?.(0, 'Error: Failed to encode PNG');
    return null;
  }

  onProgress?.(98, 'Creating download...');

  // Create blob from PNG data
  const blob = new Blob([new Uint8Array(pngData)], { type: 'image/png' });

  // Help garbage collection by clearing the pixel buffer
  pixels = null as any;

  onProgress?.(100, 'Export complete');

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
      return false;
    }

    const filename = data.isComposite
      ? 'composite_heatmap.png'
      : `${data.filename?.replace(/\.[^/.]+$/, '') || 'cscan'}_heatmap.png`;

    downloadBlob(blob, filename);
    return true;
  } catch (error) {
    return false;
  }
}
