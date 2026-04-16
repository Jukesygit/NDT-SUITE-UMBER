/**
 * MSW handlers for companion app endpoints.
 *
 * Mocks all companion API endpoints for testing without a running companion.
 * The /create-composite mock returns a real binary ArrayBuffer payload
 * to exercise the production binary parsing code path.
 */

import { http, HttpResponse } from 'msw';

const COMPANION_PORT = 18923;
const BASE = `http://localhost:${COMPANION_PORT}`;

// ---------------------------------------------------------------------------
// Mock data builders
// ---------------------------------------------------------------------------

/**
 * Build a valid structured binary composite payload.
 * Format: concat(float32_matrix, float32_xAxis, float32_yAxis)
 */
export function mockBinaryCompositeBuffer(
  width: number,
  height: number,
): { buffer: ArrayBuffer; xAxis: Float32Array; yAxis: Float32Array } {
  const matrixSize = width * height;
  const totalFloats = matrixSize + width + height;
  const buffer = new ArrayBuffer(totalFloats * 4);
  const view = new Float32Array(buffer);

  // Fill matrix with mock thickness values (15-25mm range, some NaN)
  for (let i = 0; i < matrixSize; i++) {
    if (i % 7 === 0) {
      view[i] = NaN; // ~14% null coverage
    } else {
      view[i] = 15 + (i % 100) / 10; // 15.0 - 24.9mm
    }
  }

  // Fill xAxis (scan axis in mm)
  const xAxis = new Float32Array(buffer, matrixSize * 4, width);
  for (let i = 0; i < width; i++) {
    xAxis[i] = i * 0.5; // 0.5mm resolution
  }

  // Fill yAxis (index axis in mm)
  const yAxis = new Float32Array(buffer, (matrixSize + width) * 4, height);
  for (let i = 0; i < height; i++) {
    yAxis[i] = i * 1.0; // 1mm resolution
  }

  return { buffer, xAxis, yAxis };
}

// ---------------------------------------------------------------------------
// Default mock values
// ---------------------------------------------------------------------------

const MOCK_WIDTH = 100;
const MOCK_HEIGHT = 50;
const { buffer: MOCK_COMPOSITE_BUFFER } = mockBinaryCompositeBuffer(MOCK_WIDTH, MOCK_HEIGHT);

const MOCK_STATS = {
  min: 15.0,
  max: 24.9,
  mean: 19.95,
  std: 2.87,
  validCount: 4286,
  totalCount: 5000,
  coveragePct: 85.72,
};

const MOCK_SOURCE_FILES = [
  { filename: 'scan_001.nde', minX: 0, maxX: 49.5, minY: 0, maxY: 49 },
];

const MOCK_FOLDERS = [
  { name: 'Shell Scan Files', fileCount: 12 },
  { name: 'Calibration scans', fileCount: 8 },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const companionHandlers = [
  // GET /status
  http.get(`${BASE}/status`, () => {
    return HttpResponse.json({
      app: 'matrix-ndt-companion',
      version: '1.0.0',
      apiVersion: 1,
      running: true,
      activeRequests: 0,
      directory: 'C:/mock/nde-files',
      fileCount: 12,
      calibrationDirectory: null,
      calibrationFileCount: 0,
    });
  }),

  // GET /folders
  http.get(`${BASE}/folders`, ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('query');
    let folders = MOCK_FOLDERS;
    if (query) {
      folders = folders.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));
    }
    return HttpResponse.json({ folders, total: folders.length });
  }),

  // POST /create-composite — returns binary with correct headers
  http.post(`${BASE}/create-composite`, () => {
    return new HttpResponse(MOCK_COMPOSITE_BUFFER, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Matrix-Width': String(MOCK_WIDTH),
        'X-Matrix-Height': String(MOCK_HEIGHT),
        'X-Matrix-Dtype': 'float32',
        'X-Stats': JSON.stringify(MOCK_STATS),
        'X-Source-Files': JSON.stringify(MOCK_SOURCE_FILES),
        'X-Warnings': JSON.stringify([]),
      },
    });
  }),

  // POST /bscan-axial — returns a 1x1 transparent PNG
  http.post(`${BASE}/bscan-axial`, () => {
    return new HttpResponse(MOCK_PNG, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        'X-Scan-Line-Mm': '250.0',
        'X-Index-Line-Mm': '25.0',
        'X-Render-Ms': '5.0',
      },
    });
  }),

  // POST /bscan-index
  http.post(`${BASE}/bscan-index`, () => {
    return new HttpResponse(MOCK_PNG, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        'X-Scan-Line-Mm': '250.0',
        'X-Index-Line-Mm': '25.0',
        'X-Render-Ms': '3.0',
      },
    });
  }),

  // POST /ascan
  http.post(`${BASE}/ascan`, () => {
    return new HttpResponse(MOCK_PNG, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        'X-Scan-Line-Mm': '250.0',
        'X-Index-Line-Mm': '25.0',
        'X-Render-Ms': '2.0',
      },
    });
  }),

  // POST /refresh-index
  http.post(`${BASE}/refresh-index`, () => {
    return HttpResponse.json({
      folders: MOCK_FOLDERS,
      total: MOCK_FOLDERS.length,
      indexedAt: new Date().toISOString(),
    });
  }),
];

// Minimal valid 1x1 transparent PNG (67 bytes)
const MOCK_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
  0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]).buffer;
