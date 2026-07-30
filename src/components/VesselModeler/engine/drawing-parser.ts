/**
 * Drawing Parser Module
 *
 * Loads engineering drawings (PDF), crops regions, and extracts vessel data via
 * the Gemini Vision API: a fixed-decoding ensemble (structured JSON output)
 * reconciled by voting then run through a programmatic verifier — no field is
 * ever defaulted. See docs/plans/2026-07-30-ga-drawing-import-hardening-design.md.
 */

import {
  callGeminiProxy,
  type GeminiImagePart,
  type GeminiResponse,
} from '../services/gemini-proxy';
import type { Orientation } from '../types';
import {
  coerceRawExtraction,
  voteExtractions,
  type ExtractionReview,
  type RawExtraction,
} from './drawing-extraction-voting';
import { reviewToLenientResult, verifyExtraction } from './drawing-verifier';

// --- Types -----------------------------------------------------------------

export interface DrawingRegions {
  side: { x: number; y: number; width: number; height: number } | null;
  end: { x: number; y: number; width: number; height: number } | null;
  table: { x: number; y: number; width: number; height: number } | null;
}

/** Legacy flat result consumed by the apply path (unchanged contract). */
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
  saddles: Array<{ pos: number; color?: string }>;
}

// --- PDF rendering ---------------------------------------------------------

async function loadPdf(file: File) {
  const pdfjsLib = await import('pdfjs-dist');
  const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
  const arrayBuffer = await file.arrayBuffer();
  return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
}

/** Number of pages in a PDF file (multi-sheet GA support). */
export async function getPdfPageCount(file: File): Promise<number> {
  const pdf = await loadPdf(file);
  return pdf.numPages;
}

/** Render a PDF page to an image data URL at high scale for text clarity. */
export async function renderPdfPage(file: File, pageNum = 1): Promise<string> {
  const pdf = await loadPdf(file);
  const page = await pdf.getPage(pageNum);
  const scale = 3.0; // 3x for maximum text clarity in engineering drawings
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to get canvas 2D context');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/png');
}

// --- Region cropping -------------------------------------------------------

/**
 * Crop a rectangular region from a data-URL image. `region` must be expressed
 * in the same coordinate space as `sourceWidth`/`sourceHeight` — pass the
 * image's natural dimensions when regions are already in image pixels (the
 * modal does this, making the scale factor 1). Passing on-screen display
 * dimensions with display-space regions also works, but never mix the two.
 */
export function cropRegion(
  imageDataUrl: string,
  region: { x: number; y: number; width: number; height: number },
  sourceWidth: number,
  sourceHeight: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const sx = img.naturalWidth / sourceWidth;
      const sy = img.naturalHeight / sourceHeight;
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

// --- Gemini extraction: prompt + schema ------------------------------------

/** Strip the data-URL prefix and return raw base64. */
function dataUrlToBase64(dataUrl: string): string {
  const marker = ';base64,';
  const idx = dataUrl.indexOf(marker);
  if (idx === -1) throw new Error('Invalid data URL format');
  return dataUrl.substring(idx + marker.length);
}

/** Region labels for the prompt. Images arrive in order [side, end?, table?]. */
function buildRegionDescriptions(hasEnd: boolean, hasTable: boolean): string[] {
  const descs = [
    'IMAGE 1: Side Elevation View (nozzle positions along vessel length)',
  ];
  let idx = 2;
  if (hasEnd) {
    descs.push(`IMAGE ${idx}: End View / Section A-A (angular nozzle positions)`);
    idx++;
  }
  if (hasTable) {
    descs.push(`IMAGE ${idx}: Nozzle Schedule Table (sizes, projections, ratings)`);
  }
  return descs;
}

function buildPrompt(hasEnd: boolean, hasTable: boolean): string {
  return `You are analyzing HIGH-RESOLUTION CROPPED SECTIONS of a Pressure Vessel GA Drawing.

**IMAGES PROVIDED:**
${buildRegionDescriptions(hasEnd, hasTable).join('\n')}

**EXTRACTION INSTRUCTIONS:**
- Side Elevation: vessel Internal Diameter (ID, mm) and Tan-Tan length (mm). For each nozzle tag (N1, N2, ...), trace its leader line to its elevation/position and note saddle positions.
- End View / Section A-A: nozzle angular positions using 90=Top, 0=Right, 270=Bottom, 180=Left.
- Nozzle Schedule Table: exact sizes (convert NPS/DN to mm ID), projections (centerline to flange face). Match tags exactly (N2 vs N2A differ).
- Positions are Distance from Left T/L (convert if given from Right T/L).

**CRITICAL — DO NOT GUESS:**
- Return a value ONLY if you can read it from the drawing.
- If a value is illegible, absent, or uncertain, return null for that field. Never estimate, infer, or fill in a typical value.
- Output must match the provided JSON schema exactly.`;
}

const NUM = { type: 'NUMBER', nullable: true } as const;
/** Gemini v1beta responseSchema (OpenAPI subset). Every leaf is nullable. */
const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    id: NUM,
    length: NUM,
    headRatio: NUM,
    orientation: { type: 'STRING', nullable: true, enum: ['horizontal', 'vertical'] },
    nozzles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', nullable: true },
          pos: NUM,
          proj: NUM,
          angle: NUM,
          size: NUM,
        },
      },
    },
    saddles: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { pos: NUM } },
    },
  },
} as const;

// --- Model resolution + ensemble -------------------------------------------

/** Known-good Gemini Flash model IDs, most-preferred first. */
export const MODEL_CANDIDATES = ['gemini-3.5-flash'];

/** Cached index of the model that last worked this session. */
let workingModelIndex = 0;
const SAMPLE_SEEDS = [41, 42, 43];
const ENSEMBLE_TEMPERATURE = 0.7;

function isModelNotFound(res: GeminiResponse): boolean {
  const status = res.errorStatus ?? '';
  const msg = res.error ?? '';
  return status === 'NOT_FOUND' || /not found|not supported|unsupported/i.test(msg);
}

/** Call Gemini, walking MODEL_CANDIDATES on model-not-found and caching the hit. */
async function callWithModelFallback(
  imageParts: GeminiImagePart[],
  prompt: string,
  generationConfig: Record<string, unknown>,
): Promise<GeminiResponse> {
  for (let attempt = 0; attempt < MODEL_CANDIDATES.length; attempt++) {
    const idx = (workingModelIndex + attempt) % MODEL_CANDIDATES.length;
    const res = await callGeminiProxy(imageParts, prompt, {
      generationConfig,
      model: MODEL_CANDIDATES[idx],
    });
    if (res.error && isModelNotFound(res)) continue;
    if (!res.error) workingModelIndex = idx;
    return res;
  }
  return {
    text: '',
    error: `No available Gemini model (tried ${MODEL_CANDIDATES.join(', ')})`,
  };
}

/**
 * Extract vessel data from cropped drawing regions ([side, end?, table?]) via a
 * 3-sample Gemini ensemble. Returns the voted+verified review and a voted legacy
 * result built by substituting nothing (see reviewToLenientResult).
 */
export async function extractVesselFromDrawing(
  croppedImages: string[],
  hasEnd = croppedImages.length >= 2,
  hasTable = croppedImages.length >= 3,
): Promise<{ review: ExtractionReview; result: ExtractionResult }> {
  const imageParts: GeminiImagePart[] = croppedImages.map((dataUrl) => ({
    mimeType: 'image/png',
    data: dataUrlToBase64(dataUrl),
  }));
  const prompt = buildPrompt(hasEnd, hasTable);

  const responses = await Promise.all(
    SAMPLE_SEEDS.map((seed) =>
      callWithModelFallback(imageParts, prompt, {
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA,
        temperature: ENSEMBLE_TEMPERATURE,
        seed,
      }),
    ),
  );

  const samples: RawExtraction[] = [];
  const errors: string[] = [];
  for (const res of responses) {
    if (res.error) {
      errors.push(res.error);
      continue;
    }
    try {
      samples.push(coerceRawExtraction(JSON.parse(res.text.trim())));
    } catch {
      errors.push(`Unparseable JSON: ${res.text.slice(0, 120)}`);
    }
  }

  if (samples.length < 2) {
    throw new Error(
      `Gemini extraction failed — only ${samples.length} of ${SAMPLE_SEEDS.length} ` +
        `passes returned usable data.${errors[0] ? ` First error: ${errors[0]}` : ''}`,
    );
  }

  // Pad failed passes as all-null samples so agreement is scored against the
  // full ensemble size (a value read by only 2 of 3 passes stays 'medium').
  while (samples.length < SAMPLE_SEEDS.length) {
    samples.push(coerceRawExtraction(null));
  }

  const review = verifyExtraction(voteExtractions(samples), hasTable);
  const result = reviewToLenientResult(review);
  return { review, result };
}

// --- Re-exported extraction contract (definitions in voting/verifier) ------

export { toExtractionResult } from './drawing-verifier';
export type {
  FieldConfidence,
  ExtractedValue,
  ExtractionReview,
  ReviewNozzle,
  RawExtraction,
} from './drawing-extraction-voting';
