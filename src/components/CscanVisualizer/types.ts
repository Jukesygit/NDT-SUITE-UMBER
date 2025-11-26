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
}

export interface DisplaySettings {
  colorScale: string;
  reverseScale: boolean;
  showGrid: boolean;
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