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
  type NozzleMount,
  type NozzleOrientation,
  type RawExtraction,
} from './drawing-extraction-voting';
import { buildPrompt, EXTRACTION_SCHEMA } from './drawing-extraction-prompt';
import { verifyExtraction } from './drawing-verifier';

// --- Types -----------------------------------------------------------------

export interface DrawingRegions {
  side: { x: number; y: number; width: number; height: number } | null;
  end: { x: number; y: number; width: number; height: number } | null;
  table: { x: number; y: number; width: number; height: number } | null;
}

/** Legacy flat result consumed by the apply path. Extended additively for
 *  head-mounted nozzles (`mount`/`radialOffset`); existing consumers that read
 *  only pos/proj/angle/size are unaffected. */
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
    /** Mount location. Absent on legacy results ⇒ treated as 'shell'. */
    mount?: NozzleMount;
    /** mm from centerline; present only for a head-* mount. */
    radialOffset?: number;
    /** Radial vs. side-facing horizontal. Absent on legacy results ⇒ radial. */
    nozzleOrientation?: NozzleOrientation;
    /** Signed mm from centerline; present only for a horizontal nozzle. */
    elevation?: number;
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
  sourceHeight: number
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

// --- Gemini extraction: image encoding -------------------------------------

/** Strip the data-URL prefix and return raw base64. */
function dataUrlToBase64(dataUrl: string): string {
  const marker = ';base64,';
  const idx = dataUrl.indexOf(marker);
  if (idx === -1) throw new Error('Invalid data URL format');
  return dataUrl.substring(idx + marker.length);
}

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
  generationConfig: Record<string, unknown>
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
 * 3-sample Gemini ensemble. Returns the voted+verified review — including any
 * `missing` fields, which the review UI lets the user fill in. Never throws for
 * unreadable fields; converting to a final ExtractionResult (and rejecting
 * unresolved fields) happens at apply time via toExtractionResult.
 */
export async function extractVesselFromDrawing(
  croppedImages: string[],
  hasEnd = croppedImages.length >= 2,
  hasTable = croppedImages.length >= 3
): Promise<{ review: ExtractionReview }> {
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
      })
    )
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
        `passes returned usable data.${errors[0] ? ` First error: ${errors[0]}` : ''}`
    );
  }

  // Pad failed passes as all-null samples so agreement is scored against the
  // full ensemble size (a value read by only 2 of 3 passes stays 'medium').
  while (samples.length < SAMPLE_SEEDS.length) {
    samples.push(coerceRawExtraction(null));
  }

  const review = verifyExtraction(voteExtractions(samples), hasTable);
  return { review };
}

// --- Re-exported extraction contract (definitions in voting/verifier) ------

export { toExtractionResult } from './drawing-verifier';
export type {
  FieldConfidence,
  ExtractedValue,
  ExtractionReview,
  ReviewNozzle,
  RawExtraction,
  NozzleMount,
  NozzleOrientation,
} from './drawing-extraction-voting';
