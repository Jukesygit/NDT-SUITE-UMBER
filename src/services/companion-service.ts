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
 * Body = gzip(concat(float32_matrix, float32_xAxis, float32_yAxis))
 * Metadata in response headers: X-Matrix-Width, X-Matrix-Height, X-Stats, etc.
 */
export async function parseCompositeResponse(response: Response): Promise<CompositeData> {
  const width = parseInt(response.headers.get('X-Matrix-Width') ?? '0', 10);
  const height = parseInt(response.headers.get('X-Matrix-Height') ?? '0', 10);

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

  // Validate buffer size
  const matrixSize = width * height;
  const expectedFloats = matrixSize + width + height; // matrix + xAxis + yAxis
  const expectedBytes = expectedFloats * 4;

  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Binary payload size mismatch: got ${buffer.byteLength} bytes, ` +
      `expected ${expectedBytes} (${width}x${height} matrix + axes)`
    );
  }

  // Create Float32Array views (zero-copy via subarray)
  const fullArray = new Float32Array(buffer);
  const matrix = fullArray.subarray(0, matrixSize);
  const xAxis = fullArray.subarray(matrixSize, matrixSize + width);
  const yAxis = fullArray.subarray(matrixSize + width, matrixSize + width + height);

  return { matrix, width, height, xAxis, yAxis, stats, sourceFiles, warnings };
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
