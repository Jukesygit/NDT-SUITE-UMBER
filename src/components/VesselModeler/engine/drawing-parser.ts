/**
 * Drawing Parser Module
 *
 * Handles loading engineering drawings (PDF), cropping regions,
 * and extracting vessel data via Gemini Vision API.
 */

import { callGeminiProxy } from '../services/gemini-proxy';
import type { Orientation } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DrawingRegions {
  side: { x: number; y: number; width: number; height: number } | null;
  end: { x: number; y: number; width: number; height: number } | null;
  table: { x: number; y: number; width: number; height: number } | null;
}

export interface ExtractionResult {
  id: number;
  length: number;
  headRatio: number;
  orientation: Orientation;
  nozzles: Array<{
    name: string;
    pos: number;
    proj: number;
    angle: number;
    size: number;
  }>;
  saddles: Array<{ pos: number }>;
}

// ---------------------------------------------------------------------------
// PDF Rendering
// ---------------------------------------------------------------------------

/**
 * Render a PDF file page to an image data URL.
 * Uses dynamic import of pdfjs-dist to avoid loading the library until needed.
 */
export async function renderPdfPage(
  file: File,
  pageNum = 1,
): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');

  // Set worker source (Vite resolves the ?url import to a static asset path)
  const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const page = await pdf.getPage(pageNum);

  // Render at 2x scale for crisp detail in engineering drawings
  const scale = 2.0;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get canvas 2D context');
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvas, canvasContext: context, viewport }).promise;

  return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Region Cropping
// ---------------------------------------------------------------------------

/**
 * Crop a rectangular region from a data-URL image.
 *
 * The `region` coordinates are expressed in the *display* coordinate system
 * (i.e. relative to the canvas element the user interacted with).
 * `canvasWidth` / `canvasHeight` are the display dimensions so we can map
 * back to the full-resolution image.
 */
export function cropRegion(
  imageDataUrl: string,
  region: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // Scale factor between display canvas and actual image pixels
      const sx = img.naturalWidth / canvasWidth;
      const sy = img.naturalHeight / canvasHeight;

      const srcX = Math.round(region.x * sx);
      const srcY = Math.round(region.y * sy);
      const srcW = Math.round(region.width * sx);
      const srcH = Math.round(region.height * sy);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas 2D context'));
        return;
      }

      canvas.width = srcW;
      canvas.height = srcH;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = imageDataUrl;
  });
}

// ---------------------------------------------------------------------------
// Gemini Extraction
// ---------------------------------------------------------------------------

/** Strip the data-URL prefix and return raw base64 */
function dataUrlToBase64(dataUrl: string): string {
  const marker = ';base64,';
  const idx = dataUrl.indexOf(marker);
  if (idx === -1) throw new Error('Invalid data URL format');
  return dataUrl.substring(idx + marker.length);
}

/**
 * Build region description strings for the prompt, mirroring the original
 * tool's verbose image-labelling convention.
 *
 * Images always arrive in order: [side, end?, table?]
 */
function buildRegionDescriptions(
  hasEnd: boolean,
  hasTable: boolean,
): string[] {
  const descs: string[] = [
    'IMAGE 1: Side Elevation View (longitudinal view showing nozzle positions along vessel length)',
  ];
  let idx = 2;
  if (hasEnd) {
    descs.push(
      `IMAGE ${idx}: End View / Section A-A (circular view showing nozzle angular positions)`,
    );
    idx++;
  }
  if (hasTable) {
    descs.push(
      `IMAGE ${idx}: Nozzle Schedule Table (containing sizes, projections, ratings)`,
    );
  }
  return descs;
}

/**
 * Send one or more cropped drawing region images to Gemini via the Supabase
 * edge function proxy and parse the returned JSON into an ExtractionResult.
 *
 * @param croppedImages  Data-URL images in order: [side, end?, table?]
 * @param hasEnd         Whether an end-view region was included
 * @param hasTable       Whether a nozzle-schedule-table region was included
 */
export async function extractVesselFromDrawing(
  croppedImages: string[],
  hasEnd = croppedImages.length >= 2,
  hasTable = croppedImages.length >= 3,
): Promise<ExtractionResult> {
  const imageParts = croppedImages.map((dataUrl) => ({
    mimeType: 'image/png',
    data: dataUrlToBase64(dataUrl),
  }));

  const regionDescriptions = buildRegionDescriptions(hasEnd, hasTable);

  const prompt = `You are analyzing HIGH-RESOLUTION CROPPED SECTIONS of a Pressure Vessel GA Drawing.
Each image is a specific region extracted at full resolution for accurate text reading.

**IMAGES PROVIDED:**
${regionDescriptions.join('\n')}

**EXTRACTION INSTRUCTIONS:**

1. **From Side Elevation View:**
   - Find vessel Internal Diameter (ID) and Tan-Tan Length
   - For each nozzle tag (N1, N2, etc.), find its elevation/position
   - Use the "Tag-to-Text Trace" method: follow the leader line from each nozzle tag to find its elevation value (often written vertically)
   - Note saddle positions

2. **From End View / Section A-A:**
   - Determine nozzle angular positions (clock positions)
   - Find the 0° reference point
   - Convert to standard: 90°=Top, 0°=Right, 270°=Bottom, 180°=Left

3. **From Nozzle Schedule Table:**
   - Extract exact nozzle sizes (convert NPS/DN to mm ID)
   - Extract projection distances (from centerline to flange face)
   - Match tags exactly (N2 vs N2A are different)

**OUTPUT FORMAT (Strict JSON):**
{
  "id": Number (Internal Diameter in mm),
  "length": Number (Tan-Tan length in mm),
  "headRatio": Number (e.g., 2.0 for 2:1 Ellipsoidal),
  "orientation": "horizontal" or "vertical",
  "saddles": [{"pos": Number}, ...] (pos = Distance from Left T/L),
  "nozzles": [
    {
      "name": String (exact tag),
      "pos": Number (Distance from Left T/L in mm),
      "proj": Number (Projection from Centerline in mm),
      "angle": Number (90=Top, 270=Bottom, 0=Right, 180=Left),
      "size": Number (ID in mm)
    }
  ]
}

**CRITICAL:**
- Read text carefully - these are high-resolution crops
- Cross-reference between views to verify data
- If coordinates are from Right T/L, convert to Left T/L
- Return ONLY valid JSON, no markdown or explanation`;

  const response = await callGeminiProxy(imageParts, prompt);

  if (response.error) {
    throw new Error(`Gemini extraction failed: ${response.error}`);
  }

  // Parse JSON - handle potential markdown fences in response
  const text = response.text.trim();
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/) ||
    text.match(/```\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${jsonStr.slice(0, 200)}`);
  }

  return validateExtractionResult(parsed);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateExtractionResult(data: unknown): ExtractionResult {
  const d = data as Record<string, unknown>;
  if (!d || typeof d !== 'object') {
    throw new Error('Invalid extraction result: not an object');
  }

  const id = typeof d.id === 'number' && d.id > 0 ? d.id : 1000;
  const length = typeof d.length === 'number' && d.length > 0 ? d.length : 3000;
  const headRatio =
    typeof d.headRatio === 'number' && d.headRatio > 0 ? d.headRatio : 2;
  const orientation: Orientation =
    d.orientation === 'vertical' ? 'vertical' : 'horizontal';

  const nozzles = Array.isArray(d.nozzles)
    ? (d.nozzles as Record<string, unknown>[])
        .filter((n) => n && typeof n === 'object')
        .map((n, idx) => ({
          name: typeof n.name === 'string' ? n.name : `N${idx + 1}`,
          pos: typeof n.pos === 'number' ? n.pos : 0,
          proj: typeof n.proj === 'number' ? n.proj : 0,
          angle: typeof n.angle === 'number' ? n.angle : 0,
          size: typeof n.size === 'number' && n.size > 0 ? n.size : 50,
        }))
    : [];

  const saddles = Array.isArray(d.saddles)
    ? (d.saddles as Record<string, unknown>[])
        .filter((s) => s && typeof s === 'object')
        .map((s, idx) => ({
          pos:
            typeof s.pos === 'number'
              ? s.pos
              : length * (0.25 + idx * 0.5),
        }))
    : [];

  return { id, length, headRatio, orientation, nozzles, saddles };
}
