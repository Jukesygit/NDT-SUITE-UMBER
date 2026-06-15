export type Tool = 'pan' | 'zoom' | 'select' | 'measure';

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
}

export interface CscanStats {
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

export interface CscanData {
  id: string;
  filename: string;
  width: number;
  height: number;
  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
  stats?: CscanStats;
  metadata?: Record<string, any>;
  validPoints?: number;
  timestamp?: Date;
  isComposite?: boolean;
  sourceRegions?: SourceRegion[];
}

export interface DisplaySettings {
  colorScale: string;
  reverseScale: boolean;
  showGrid: boolean;
  whiteBackground: boolean;
  showFilenames: boolean;
  smoothing: 'none' | 'fast' | 'best';
  flipH: boolean;
  flipV: boolean;
  range: {
    min: number | null;
    max: number | null;
  };
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  selected: boolean;
  data?: CscanData;
  uploadDate: Date;
}

export interface RangeSettings {
  min: number | null;
  max: number | null;
  auto: boolean;
}

// Offset detection for bugged CSV correction
export interface OffsetDetection {
  fileId: string;
  filename: string;
  // Index axis (Y)
  expectedIndexStart: number | null;  // From metadata or filename
  actualIndexStart: number;           // First value in data
  indexOffset: number;                // Correction needed
  indexNeedsCorrection: boolean;
  indexSource?: 'metadata' | 'filename' | null; // Which source supplied the expected value
  // Scan axis (X)
  expectedScanStart: number | null;   // From metadata or filename
  actualScanStart: number;            // First value in data
  scanOffset: number;                 // Correction needed
  scanNeedsCorrection: boolean;
  scanSource?: 'metadata' | 'filename' | null;
}

export interface CsvRepairResult {
  correctedFiles: CscanData[];
  skippedFiles: string[];
}

// ---------------------------------------------------------------------------
// Distribution Stats Panel
// ---------------------------------------------------------------------------

export type DistributionMode = 'thickness' | 'wallLoss';

export interface DistributionConfig {
  /** Whether the distribution panel is visible */
  enabled: boolean;
  /** 'thickness' bins by raw mm ranges; 'wallLoss' bins by % wall loss */
  mode: DistributionMode;
  /** Number of equal-width bins (used when customBoundaries is absent) */
  binCount: number;
  /** Nominal wall thickness in mm — only used in wallLoss mode */
  nominalThickness: number;
  /** Sorted ascending boundary values — N+1 values define N bins. When set, binCount is ignored. */
  customBoundaries?: number[];
}

export interface DistributionBin {
  /** Lower bound (inclusive) */
  min: number;
  /** Upper bound (exclusive, except last bin which is inclusive) */
  max: number;
  /** Area in this bin (m²) */
  area: number;
  /** Percentage of total valid area */
  areaPercent: number;
  /** Number of data points in this bin */
  count: number;
}

export interface DistributionResult {
  bins: DistributionBin[];
  /** Total valid data area (m²) */
  totalArea: number;
  /** Total valid data points */
  totalPoints: number;
  /** The mode used for this computation */
  mode: DistributionMode;
  /** Unit label for display ('mm' or '%') */
  unit: string;
}
