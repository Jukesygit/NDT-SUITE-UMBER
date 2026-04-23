/**
 * Companion App Service
 *
 * Centralizes all communication with the NDT Companion (localhost).
 * Handles binary response parsing, zod validation, and error handling.
 */

import { z } from 'zod';
import type {
  CompositeData,
  CompanionFolder,
  GateSettings,
  BrowseDirectoryResult,
  EddifyConvertResult,
} from '../types/companion';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MIN_COMPANION_VERSION = 1;
export const MAX_COMPANION_VERSION = 1;

// ---------------------------------------------------------------------------
// Zod schemas — validate companion responses before use
// ---------------------------------------------------------------------------

export const CompositeStatsSchema = z.object({
  min: z.number(),
  max: z.number(),
  mean: z.number(),
  std: z.number(),
  validCount: z.number().int().nonnegative(),
  totalCount: z.number().int().positive(),
  coveragePct: z.number().min(0).max(100),
});

export const SourceFileSchema = z.object({
  filename: z.string(),
  minX: z.number(),
  maxX: z.number(),
  minY: z.number(),
  maxY: z.number(),
});
export const SourceFilesSchema = z.array(SourceFileSchema);

export const WarningSchema = z.object({
  filename: z.string(),
  reason: z.string(),
});
export const WarningsSchema = z.array(WarningSchema);

// ---------------------------------------------------------------------------
// Binary response parser
// ---------------------------------------------------------------------------

/**
 * Parse a binary composite response from POST /create-composite.
 *
 * Body = gzip(concat(float32_matrix, float32_amplitude, uint8_envelope, float32_xAxis, float32_yAxis))
 * When X-Has-Amplitude header is absent (old companion), amplitude is omitted.
 * When X-Has-Envelope header is present, uint8 envelope data follows amplitude.
 * Metadata in response headers: X-Matrix-Width, X-Matrix-Height, X-Stats, etc.
 */
export async function parseCompositeResponse(response: Response): Promise<CompositeData> {
  const width = parseInt(response.headers.get('X-Matrix-Width') ?? '0', 10);
  const height = parseInt(response.headers.get('X-Matrix-Height') ?? '0', 10);
  const hasAmplitude = response.headers.get('X-Has-Amplitude') === 'true';
  const hasEnvelope = response.headers.get('X-Has-Envelope') === 'true';
  const envelopeSamples = parseInt(response.headers.get('X-Envelope-Samples') ?? '0', 10);
  const timeStartUs = parseFloat(response.headers.get('X-Time-Start-Us') ?? '0');
  const timeEndUs = parseFloat(response.headers.get('X-Time-End-Us') ?? '1');
  const velocity = parseFloat(response.headers.get('X-Velocity') ?? '5900');

  if (!width || !height) {
    throw new Error('Missing X-Matrix-Width or X-Matrix-Height headers');
  }

  // Parse and validate metadata headers with zod
  const statsRaw = parseJsonHeader(response, 'X-Stats');
  if (!statsRaw) throw new Error('Missing X-Stats header');
  const stats = CompositeStatsSchema.parse(statsRaw);

  const sourceFilesRaw = parseJsonHeader(response, 'X-Source-Files');
  const sourceFiles = SourceFilesSchema.parse(sourceFilesRaw ?? []);

  const warningsRaw = parseJsonHeader(response, 'X-Warnings');
  const warnings = WarningsSchema.parse(warningsRaw ?? []);

  // Decompress and parse binary body
  // The response may come pre-decompressed by the browser (Content-Encoding: gzip),
  // or we may need to decompress manually
  const rawBuffer = await response.arrayBuffer();
  let buffer: ArrayBuffer;

  if (isGzipCompressed(rawBuffer)) {
    const stream = new Blob([rawBuffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    buffer = await new Response(stream).arrayBuffer();
  } else {
    buffer = rawBuffer;
  }

  // Validate buffer size (mixed types: float32 sections + uint8 envelope)
  const matrixSize = width * height;
  const amplitudeFloats = hasAmplitude ? matrixSize : 0;
  const envelopeBytes = hasEnvelope ? matrixSize * envelopeSamples : 0;
  // Float32 sections: matrix + amplitude + xAxis + yAxis (4 bytes each)
  // Uint8 section: envelope (1 byte each)
  const expectedBytes = (matrixSize + amplitudeFloats + width + height) * 4 + envelopeBytes;

  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Binary payload size mismatch: got ${buffer.byteLength} bytes, ` +
      `expected ${expectedBytes} (${width}x${height} matrix` +
      `${hasAmplitude ? ' + amplitude' : ''}${hasEnvelope ? ' + envelope' : ''} + axes)`
    );
  }

  // Parse using byte offsets (mixed float32/uint8 types)
  let byteOffset = 0;

  const matrix = new Float32Array(buffer, byteOffset, matrixSize);
  byteOffset += matrixSize * 4;

  const amplitude = hasAmplitude
    ? new Float32Array(buffer, byteOffset, matrixSize)
    : null;
  if (hasAmplitude) byteOffset += matrixSize * 4;

  const envelope = hasEnvelope
    ? new Uint8Array(buffer, byteOffset, envelopeBytes)
    : null;
  if (hasEnvelope) byteOffset += envelopeBytes;

  // After uint8 envelope, byteOffset may not be 4-byte aligned.
  // Use slice to create new aligned Float32Arrays for the axes.
  const xAxis = new Float32Array(buffer.slice(byteOffset, byteOffset + width * 4));
  byteOffset += width * 4;

  const yAxis = new Float32Array(buffer.slice(byteOffset, byteOffset + height * 4));

  return {
    matrix, amplitude, envelope, envelopeSamples, timeStartUs, timeEndUs, velocity,
    width, height, xAxis, yAxis, stats, sourceFiles, warnings,
  };
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Fetch available folders from the companion. */
export async function fetchCompanionFolders(
  port: number,
  query?: string,
  limit = 100,
  offset = 0,
): Promise<{ folders: CompanionFolder[]; total: number }> {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const res = await fetch(`http://localhost:${port}/folders?${params}`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch folders: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/** Generate a composite from the companion (binary format). */
export async function fetchComposite(
  port: number,
  folders: string[],
  gateSettings: GateSettings,
  signal?: AbortSignal,
): Promise<CompositeData> {
  const res = await fetch(`http://localhost:${port}/create-composite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/octet-stream',
    },
    body: JSON.stringify({ folders, gateSettings }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Composite generation failed: ${detail}`);
  }

  return parseCompositeResponse(res);
}

/** Fetch an axial B-scan image from the companion. */
export async function fetchBscanAxial(
  port: number,
  params: { folders: string[]; scanMm: number; indexMm: number; width?: number; height?: number; gateSettings?: GateSettings },
  signal?: AbortSignal,
): Promise<string> {
  return fetchImageEndpoint(port, '/bscan-axial', params, signal);
}

/** Fetch an index B-scan image from the companion. */
export async function fetchBscanIndex(
  port: number,
  params: { folders: string[]; scanMm: number; indexMm: number; width?: number; height?: number; gateSettings?: GateSettings },
  signal?: AbortSignal,
): Promise<string> {
  return fetchImageEndpoint(port, '/bscan-index', params, signal);
}

/** Fetch an A-scan image from the companion. */
export async function fetchAscan(
  port: number,
  params: { folders: string[]; scanMm: number; indexMm: number; width?: number; height?: number; gateSettings?: GateSettings },
  signal?: AbortSignal,
): Promise<string> {
  return fetchImageEndpoint(port, '/ascan', params, signal);
}

/** Open native folder picker on companion and set directory. */
export async function browseDirectory(
  port: number,
): Promise<BrowseDirectoryResult> {
  const res = await fetch(`http://localhost:${port}/browse-directory`, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    throw new Error(`Browse directory failed: ${res.status}`);
  }
  return res.json();
}

/** Set companion directory to a specific path. */
export async function setDirectory(
  port: number,
  path: string,
): Promise<{ fileCount: number }> {
  const res = await fetch(`http://localhost:${port}/set-directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`Set directory failed: ${res.status}`);
  }
  return res.json();
}

/** Convert eddify .capture_acq files to .nde in a named output folder. */
export async function convertEddify(
  port: number,
  captureDirs: string[],
  outputFolder: string,
): Promise<EddifyConvertResult> {
  const res = await fetch(`http://localhost:${port}/convert-eddify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capture_dirs: captureDirs, output_folder: outputFolder }),
    signal: AbortSignal.timeout(600000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Eddify conversion failed: ${detail}`);
  }
  return res.json();
}

/** Force-rescan the companion's current directory. */
export async function refreshIndex(
  port: number,
): Promise<{ folders: CompanionFolder[]; total: number; indexedAt: string }> {
  const res = await fetch(`http://localhost:${port}/refresh-index`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Refresh index failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST to an image endpoint, return a blob URL. */
async function fetchImageEndpoint(
  port: number,
  path: string,
  params: { folders: string[]; scanMm: number; indexMm: number; width?: number; height?: number; gateSettings?: GateSettings },
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Parse a JSON string from a response header. Returns null if missing or invalid. */
function parseJsonHeader(response: Response, headerName: string): unknown {
  const raw = response.headers.get(headerName);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Check if a buffer starts with the gzip magic number (1f 8b). */
function isGzipCompressed(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}
