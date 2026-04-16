/**
 * Types for the NDT Companion app API.
 *
 * The companion runs on localhost (port 18923-18932) and provides
 * NDE file processing, composite generation, and B-scan/A-scan rendering.
 */

// ---------------------------------------------------------------------------
// Composite data (binary format from POST /create-composite)
// ---------------------------------------------------------------------------

export interface CompositeData {
  matrix: Float32Array;
  width: number;
  height: number;
  xAxis: Float32Array;
  yAxis: Float32Array;
  stats: CompositeStats;
  sourceFiles: SourceFile[];
  warnings: Warning[];
}

export interface CompositeStats {
  min: number;
  max: number;
  mean: number;
  std: number;
  validCount: number;
  totalCount: number;
  coveragePct: number;
}

export interface SourceFile {
  filename: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Warning {
  filename: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Gate settings (sent to companion with composite/render requests)
// ---------------------------------------------------------------------------

export interface GateSettings {
  gateMode: string;
  refRecovery: string;
  measRecovery: string;
  minAmplitudeRef: number;
  minAmplitudeMeas: number;
  thicknessMin: number | null;
  thicknessMax: number | null;
}

// ---------------------------------------------------------------------------
// Folder listing (GET /folders)
// ---------------------------------------------------------------------------

export interface CompanionFolder {
  name: string;
  fileCount: number;
}

// ---------------------------------------------------------------------------
// Status (GET /status)
// ---------------------------------------------------------------------------

export interface CompanionStatus {
  app: string;
  version: string;
  apiVersion: number;
  running: boolean;
  activeRequests: number;
  directory: string | null;
  fileCount: number;
  calibrationDirectory: string | null;
  calibrationFileCount: number;
}

// ---------------------------------------------------------------------------
// Default gate settings
// ---------------------------------------------------------------------------

export const DEFAULT_GATE_SETTINGS: GateSettings = {
  gateMode: 'A-I',
  refRecovery: 'peak_fallback',
  measRecovery: 'crossing_only',
  minAmplitudeRef: 0,
  minAmplitudeMeas: 0,
  thicknessMin: null,
  thicknessMax: null,
};
