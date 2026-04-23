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
  /** Measurement gate amplitude % (0-200) per point, or null if companion doesn't provide it. */
  amplitude: Float32Array | null;
  /** Rectified envelope data (height * width * envelopeSamples) uint8, or null if not provided. */
  envelope: Uint8Array | null;
  /** Time samples per point in the envelope (e.g. 30). */
  envelopeSamples: number;
  /** Start of the envelope time axis in microseconds. */
  timeStartUs: number;
  /** End of the envelope time axis in microseconds. */
  timeEndUs: number;
  /** Sound velocity in m/s (used to convert time ↔ depth). */
  velocity: number;
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
  type: 'nde' | 'eddify';
}

// ---------------------------------------------------------------------------
// Eddify conversion (POST /convert-eddify)
// ---------------------------------------------------------------------------

export interface EddifyConvertResult {
  output_folder: string;
  results: Array<{
    name: string;
    status: 'ok' | 'error';
    output?: string;
    sizeMb?: number;
    detail?: string;
  }>;
  files_converted: number;
  files_failed: number;
}

export interface BrowseDirectoryResult {
  path: string | null;
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
