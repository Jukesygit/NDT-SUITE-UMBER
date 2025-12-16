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
  showFilenames: boolean;
  smoothing: 'none' | 'fast' | 'best';
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
  // Scan axis (X)
  expectedScanStart: number | null;   // From metadata or filename
  actualScanStart: number;            // First value in data
  scanOffset: number;                 // Correction needed
  scanNeedsCorrection: boolean;
}

export interface CsvRepairResult {
  correctedFiles: CscanData[];
  skippedFiles: string[];
}