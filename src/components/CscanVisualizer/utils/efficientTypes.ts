/**
 * Memory-efficient data structures for large-scale C-scan processing
 * Uses TypedArrays instead of nested JS arrays for 4-8x memory reduction
 */

/**
 * Efficient C-scan data structure using TypedArrays
 * Memory comparison for 1000x1000 grid:
 * - Old: (number | null)[][] = ~16MB (boxed numbers + array overhead)
 * - New: Float32Array + Uint8Array = ~4.1MB
 */
export interface EfficientCscanData {
  id: string;
  filename: string;
  width: number;
  height: number;

  // Data stored as contiguous Float32Array (row-major order)
  // Index: row * width + col
  values: Float32Array;

  // Bitmask for null/invalid values (1 bit per cell, packed into bytes)
  // If bit is 1, the corresponding value is null/invalid
  nullMask: Uint8Array;

  // Axes as TypedArrays
  xAxis: Float32Array;
  yAxis: Float32Array;

  // Pre-computed statistics
  stats: EfficientStats;

  // Metadata (small, keep as object)
  metadata?: Record<string, unknown>;

  // Composite info
  isComposite?: boolean;
  sourceRegions?: SourceRegion[];

  timestamp?: number;
}

export interface EfficientStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  validPoints: number;
  totalPoints: number;
  totalArea: number;
  validArea: number;
  ndPercent: number;
  ndCount: number;
  ndArea: number;
}

export interface SourceRegion {
  filename: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

/**
 * Message types for Worker communication
 */
export type WorkerMessageType =
  | 'PARSE_FILES'
  | 'CREATE_COMPOSITE'
  | 'CREATE_COMPOSITE_FROM_DATA'
  | 'CLEAR_CACHE'
  | 'PARSE_PROGRESS'
  | 'PARSE_COMPLETE'
  | 'COMPOSITE_PROGRESS'
  | 'COMPOSITE_COMPLETE'
  | 'CACHE_CLEARED'
  | 'READY'
  | 'ERROR';

export interface WorkerMessage {
  type: WorkerMessageType;
  payload: unknown;
}

export interface ParseFilesMessage {
  type: 'PARSE_FILES';
  payload: {
    files: ArrayBuffer[];
    filenames: string[];
    batchSize: number;
  };
}

export interface CreateCompositeMessage {
  type: 'CREATE_COMPOSITE';
  payload: {
    scanIds: string[];
  };
}

export interface ProgressMessage {
  type: 'PARSE_PROGRESS' | 'COMPOSITE_PROGRESS';
  payload: {
    current: number;
    total: number;
    message: string;
    memoryUsage?: number;
  };
}

export interface ParseCompleteMessage {
  type: 'PARSE_COMPLETE';
  payload: {
    scans: EfficientCscanData[];
    hasOffsetIssues: boolean;
  };
}

export interface CompositeCompleteMessage {
  type: 'COMPOSITE_COMPLETE';
  payload: {
    composite: EfficientCscanData;
  };
}

export interface ErrorMessage {
  type: 'ERROR';
  payload: {
    message: string;
    filename?: string;
  };
}

/**
 * Helper functions for working with efficient data structures
 */

// Get value at (row, col), returns null if masked
export function getValue(data: EfficientCscanData, row: number, col: number): number | null {
  const idx = row * data.width + col;
  if (isNull(data.nullMask, idx)) {
    return null;
  }
  return data.values[idx];
}

// Set value at (row, col), use null to mark as invalid
export function setValue(
  values: Float32Array,
  nullMask: Uint8Array,
  width: number,
  row: number,
  col: number,
  value: number | null
): void {
  const idx = row * width + col;
  if (value === null || isNaN(value) || !isFinite(value)) {
    setNull(nullMask, idx, true);
    values[idx] = 0;
  } else {
    setNull(nullMask, idx, false);
    values[idx] = value;
  }
}

// Check if a value is null in the bitmask
export function isNull(nullMask: Uint8Array, idx: number): boolean {
  const byteIdx = Math.floor(idx / 8);
  const bitIdx = idx % 8;
  return (nullMask[byteIdx] & (1 << bitIdx)) !== 0;
}

// Set null status in bitmask
export function setNull(nullMask: Uint8Array, idx: number, isNullValue: boolean): void {
  const byteIdx = Math.floor(idx / 8);
  const bitIdx = idx % 8;
  if (isNullValue) {
    nullMask[byteIdx] |= (1 << bitIdx);
  } else {
    nullMask[byteIdx] &= ~(1 << bitIdx);
  }
}

// Create null mask for given size
export function createNullMask(totalCells: number): Uint8Array {
  const bytes = Math.ceil(totalCells / 8);
  return new Uint8Array(bytes);
}

/**
 * Convert legacy CscanData to efficient format
 */
export function toEfficientFormat(legacy: {
  id: string;
  filename: string;
  width: number;
  height: number;
  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
  stats?: Record<string, number>;
  metadata?: Record<string, unknown>;
  isComposite?: boolean;
  sourceRegions?: SourceRegion[];
}): EfficientCscanData {
  const totalCells = legacy.width * legacy.height;
  const values = new Float32Array(totalCells);
  const nullMask = createNullMask(totalCells);

  for (let row = 0; row < legacy.height; row++) {
    for (let col = 0; col < legacy.width; col++) {
      const val = legacy.data[row]?.[col];
      setValue(values, nullMask, legacy.width, row, col, val ?? null);
    }
  }

  return {
    id: legacy.id,
    filename: legacy.filename,
    width: legacy.width,
    height: legacy.height,
    values,
    nullMask,
    xAxis: Float32Array.from(legacy.xAxis),
    yAxis: Float32Array.from(legacy.yAxis),
    stats: (legacy.stats as unknown as EfficientStats) ?? {
      min: 0, max: 0, mean: 0, median: 0, stdDev: 0,
      validPoints: 0, totalPoints: totalCells, totalArea: 0,
      validArea: 0, ndPercent: 100, ndCount: totalCells, ndArea: 0
    },
    metadata: legacy.metadata,
    isComposite: legacy.isComposite,
    sourceRegions: legacy.sourceRegions,
    timestamp: Date.now()
  };
}

/**
 * Convert efficient format back to legacy format (for Plotly compatibility)
 * Note: This creates a new nested array - use sparingly!
 */
export function toLegacyFormat(efficient: EfficientCscanData): (number | null)[][] {
  const result: (number | null)[][] = [];

  for (let row = 0; row < efficient.height; row++) {
    const rowData: (number | null)[] = [];
    for (let col = 0; col < efficient.width; col++) {
      rowData.push(getValue(efficient, row, col));
    }
    result.push(rowData);
  }

  return result;
}

/**
 * Get transferable objects from EfficientCscanData for Worker postMessage
 */
export function getTransferables(data: EfficientCscanData): Transferable[] {
  return [
    data.values.buffer,
    data.nullMask.buffer,
    data.xAxis.buffer,
    data.yAxis.buffer
  ];
}
