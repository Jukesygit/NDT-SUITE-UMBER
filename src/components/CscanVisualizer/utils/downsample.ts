/**
 * Downsampling utilities for large C-scan datasets
 *
 * Reduces data size for display while maintaining visual quality.
 * Uses area averaging for smooth downsampling.
 */

// Maximum dimensions for display (prevents OOM while maintaining quality)
export const MAX_DISPLAY_WIDTH = 1000;
export const MAX_DISPLAY_HEIGHT = 1000;

export interface DownsampledData {
  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
  scale: number; // How much we downsampled (1 = no change, 2 = half size, etc.)
  originalWidth: number;
  originalHeight: number;
}

/**
 * Downsample a 2D data array using area averaging
 * This provides better visual quality than simple point sampling
 */
export function downsampleForDisplay(
  data: (number | null)[][],
  xAxis: number[],
  yAxis: number[],
  maxWidth: number = MAX_DISPLAY_WIDTH,
  maxHeight: number = MAX_DISPLAY_HEIGHT
): DownsampledData {
  const originalHeight = data.length;
  const originalWidth = data[0]?.length ?? 0;

  // Check if downsampling is needed
  if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
    return {
      data,
      xAxis,
      yAxis,
      scale: 1,
      originalWidth,
      originalHeight
    };
  }

  // Calculate scale factor
  const scaleX = Math.ceil(originalWidth / maxWidth);
  const scaleY = Math.ceil(originalHeight / maxHeight);
  const scale = Math.max(scaleX, scaleY);

  const newWidth = Math.ceil(originalWidth / scale);
  const newHeight = Math.ceil(originalHeight / scale);

  // Create downsampled arrays
  const newData: (number | null)[][] = [];
  const newXAxis: number[] = [];
  const newYAxis: number[] = [];

  // Downsample Y axis
  for (let newY = 0; newY < newHeight; newY++) {
    const origY = Math.min(newY * scale, originalHeight - 1);
    newYAxis.push(yAxis[origY] ?? origY);
  }

  // Downsample X axis
  for (let newX = 0; newX < newWidth; newX++) {
    const origX = Math.min(newX * scale, originalWidth - 1);
    newXAxis.push(xAxis[origX] ?? origX);
  }

  // Downsample data using area averaging
  for (let newY = 0; newY < newHeight; newY++) {
    const row: (number | null)[] = [];
    const startY = newY * scale;
    const endY = Math.min(startY + scale, originalHeight);

    for (let newX = 0; newX < newWidth; newX++) {
      const startX = newX * scale;
      const endX = Math.min(startX + scale, originalWidth);

      // Average all values in the block
      let sum = 0;
      let count = 0;
      let hasNull = false;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const val = data[y]?.[x];
          if (val === null || val === undefined) {
            hasNull = true;
          } else {
            sum += val;
            count++;
          }
        }
      }

      // If more than half the block is null, mark as null
      // Otherwise use the average of valid values
      const blockSize = (endY - startY) * (endX - startX);
      if (count === 0 || (hasNull && count < blockSize / 2)) {
        row.push(null);
      } else {
        row.push(sum / count);
      }
    }
    newData.push(row);
  }

  return {
    data: newData,
    xAxis: newXAxis,
    yAxis: newYAxis,
    scale,
    originalWidth,
    originalHeight
  };
}

/**
 * Check if data needs downsampling
 */
export function needsDownsampling(
  width: number,
  height: number,
  maxWidth: number = MAX_DISPLAY_WIDTH,
  maxHeight: number = MAX_DISPLAY_HEIGHT
): boolean {
  return width > maxWidth || height > maxHeight;
}

/**
 * Get recommended max dimensions based on available memory
 * This is a heuristic - adjust based on target devices
 */
export function getRecommendedMaxDimensions(): { width: number; height: number } {
  // Try to detect available memory (not available in all browsers)
  const memory = (performance as any).memory;
  if (memory) {
    const availableMB = (memory.jsHeapSizeLimit - memory.usedJSHeapSize) / 1024 / 1024;

    // Be conservative - large heatmaps need ~16 bytes per cell minimum
    // For 1000x1000 = 1M cells = ~16MB base + Plotly overhead
    if (availableMB < 500) {
      return { width: 500, height: 500 };
    } else if (availableMB < 1000) {
      return { width: 750, height: 750 };
    }
  }

  return { width: MAX_DISPLAY_WIDTH, height: MAX_DISPLAY_HEIGHT };
}
