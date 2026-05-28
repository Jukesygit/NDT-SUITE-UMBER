import type { CscanData } from '../CscanVisualizer/types';

export type TopologyTool = 'orbit' | 'crossSection' | 'measure';

export interface SurfaceOptions {
  /** Vertical displacement exaggeration factor (1 = true scale) */
  exaggeration: number;
  /** Colorscale name from shared colorscales.ts */
  colorScale: string;
  /** Whether to reverse the colorscale */
  reverseScale: boolean;
  /** Override min for colorscale range (null = auto from stats) */
  rangeMin: number | null;
  /** Override max for colorscale range (null = auto from stats) */
  rangeMax: number | null;
  /** Max grid dimension before min-preserving display decimation */
  maxDisplayResolution: number;
  /**
   * Nominal wall thickness in mm — defines the "flat" reference plane.
   * null = auto-detect via 95th percentile of data.
   */
  nominalThickness: number | null;
  /**
   * Upper clamp for raw displacement (mm, pre-exaggeration).
   * Spikes where (value - nominal) exceeds this are flattened in geometry only.
   * null = no clamping (default).
   */
  displacementClampUpper: number | null;
  /**
   * Median filter radius applied before surface building.
   * 1 = 3×3 kernel, 2 = 5×5 kernel. null = no filtering (default).
   */
  denoiseRadius: number | null;
}

export interface TopologyViewState {
  cscanData: CscanData | null;
  surfaceOptions: SurfaceOptions;
  activeTool: TopologyTool;
  hoverInfo: HoverInfo | null;
  crossSection: CrossSectionData | null;
  measurement: MeasurementState | null;
}

export interface HoverInfo {
  /** Thickness in mm at hover point (from full-res grid, not display mesh) */
  thickness: number | null;
  /** Scan axis position in mm */
  scanMm: number;
  /** Index axis position in mm */
  indexMm: number;
  /** Screen position for tooltip */
  screenX: number;
  screenY: number;
  /** Grid row index (full-res) */
  row: number;
  /** Grid column index (full-res) */
  col: number;
}

export interface CrossSectionData {
  points: CrossSectionPoint[];
  totalDistance: number;
  startScanMm: number;
  startIndexMm: number;
  endScanMm: number;
  endIndexMm: number;
}

export interface CrossSectionPoint {
  /** Distance from start along the line in mm */
  distance: number;
  /** Thickness at this point in mm (null = no data) */
  thickness: number | null;
  /** Scan axis coordinate of this sample (mm) — for traceability */
  scanMm: number;
  /** Index axis coordinate of this sample (mm) — for traceability */
  indexMm: number;
}

export interface MeasurementState {
  pointA: MeasurementPoint | null;
  pointB: MeasurementPoint | null;
}

export interface MeasurementPoint {
  scanMm: number;
  indexMm: number;
  /** Thickness from full-res grid (null = ND) */
  thickness: number | null;
}

export interface MeasurementResult {
  /** True horizontal distance between points in mm */
  horizontalDistance: number;
  /** True thickness difference (B - A) in mm, null if either is ND */
  depthDifference: number | null;
  /** Wall loss at point A relative to nominal, null if ND or no nominal */
  wallLossA: number | null;
  /** Wall loss at point B relative to nominal, null if ND or no nominal */
  wallLossB: number | null;
}

export const DEFAULT_SURFACE_OPTIONS: SurfaceOptions = {
  exaggeration: 10,
  colorScale: 'Jet',
  reverseScale: true,
  rangeMin: null,
  rangeMax: null,
  maxDisplayResolution: 512,
  nominalThickness: null,
  displacementClampUpper: null,
  denoiseRadius: null,
};

/**
 * Compute the effective nominal baseline for displacement.
 * Uses explicit nominal if provided, otherwise 95th percentile of data.
 */
export function resolveNominal(
  explicitNominal: number | null,
  data: (number | null)[][],
): number {
  if (explicitNominal != null) return explicitNominal;

  const values: number[] = [];
  for (const row of data) {
    for (const v of row) {
      if (v != null) values.push(v);
    }
  }
  if (values.length === 0) return 0;

  values.sort((a, b) => a - b);
  const idx = Math.floor((values.length - 1) * 0.95);
  return values[idx];
}
