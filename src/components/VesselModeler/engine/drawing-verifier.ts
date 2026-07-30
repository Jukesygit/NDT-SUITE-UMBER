/**
 * Drawing Verifier + Review Conversion
 *
 * Pure post-vote processing of an ExtractionReview. `verifyExtraction` runs
 * sanity / cross-view checks, appending advisory flag codes and demoting
 * confidence to 'low' on flagged fields — it never mutates a value and never
 * snaps a size to a standard bore. `toExtractionResult` / `reviewToLenientResult`
 * convert a review into the legacy flat result, substituting nothing.
 */

import type {
  ExtractedValue,
  ExtractionReview,
  ReviewNozzle,
} from './drawing-extraction-voting';
// Type-only import: erased at compile time, so no runtime circular dependency.
import type { ExtractionResult } from './drawing-parser';

// Standard nominal bores (mm) for NPS 1/2" .. 48" — used for the size sanity
// check only. A size within 5% of any entry is considered standard.
export const STANDARD_BORES_MM = [
  15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450,
  500, 600, 700, 750, 800, 900, 1000, 1050, 1100, 1200,
];

const VESSEL_ID_RANGE: [number, number] = [100, 20000];
const VESSEL_LENGTH_RANGE: [number, number] = [100, 50000];
const HEAD_RATIO_RANGE: [number, number] = [1.5, 4.0];
const SIZE_TOLERANCE = 0.05;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneValue<T>(ev: ExtractedValue<T>): ExtractedValue<T> {
  return { value: ev.value, confidence: ev.confidence, flags: [...ev.flags] };
}

/** Append a flag and demote confidence to 'low'; no-op on missing fields. */
function flag<T>(ev: ExtractedValue<T>, code: string): void {
  if (ev.value === null || ev.confidence === 'missing') return;
  if (!ev.flags.includes(code)) ev.flags.push(code);
  ev.confidence = 'low';
}

function inRange(v: number, [lo, hi]: [number, number]): boolean {
  return v >= lo && v <= hi;
}

function isStandardBore(size: number): boolean {
  return STANDARD_BORES_MM.some((b) => Math.abs(size - b) <= b * SIZE_TOLERANCE);
}

/**
 * Post-vote there is no per-source provenance (all crops go to one call), so
 * the only available cross-view signal is that side-view fields (pos) and
 * table-derived fields (size / proj) should co-occur once a table was
 * supplied. A tag present in only one of those families likely came from a
 * single source.
 */
function isUnmatched(n: ReviewNozzle): boolean {
  const hasSide = n.pos.value !== null;
  const hasTableFields = n.size.value !== null || n.proj.value !== null;
  return (hasSide && !hasTableFields) || (!hasSide && hasTableFields);
}

// ---------------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------------

/**
 * Run plausibility / cross-view checks on a voted review.
 *
 * @param review    the voted ExtractionReview
 * @param hasTable  whether a nozzle-schedule table region was supplied
 */
export function verifyExtraction(
  review: ExtractionReview,
  hasTable: boolean,
): ExtractionReview {
  const id = cloneValue(review.id);
  const length = cloneValue(review.length);
  const headRatio = cloneValue(review.headRatio);
  const orientation = cloneValue(review.orientation);
  const nozzles: ReviewNozzle[] = review.nozzles.map((n) => ({
    name: cloneValue(n.name),
    pos: cloneValue(n.pos),
    proj: cloneValue(n.proj),
    angle: cloneValue(n.angle),
    size: cloneValue(n.size),
  }));
  const saddles = review.saddles.map((s) => ({ pos: cloneValue(s.pos) }));

  // Vessel plausibility.
  if (id.value !== null && !inRange(id.value, VESSEL_ID_RANGE)) {
    flag(id, 'out-of-range');
  }
  if (length.value !== null && !inRange(length.value, VESSEL_LENGTH_RANGE)) {
    flag(length, 'out-of-range');
  }
  if (headRatio.value !== null && !inRange(headRatio.value, HEAD_RATIO_RANGE)) {
    flag(headRatio, 'out-of-range');
  }

  // Ellipsoidal head depth for the nozzle position envelope.
  const headDepth =
    id.value !== null && headRatio.value !== null && headRatio.value > 0
      ? id.value / (2 * headRatio.value)
      : 0;

  // Duplicate-tag detection needs the full count first.
  const tagCounts = new Map<string, number>();
  for (const n of nozzles) {
    if (n.name.value !== null) {
      const k = n.name.value.trim().toLowerCase();
      tagCounts.set(k, (tagCounts.get(k) ?? 0) + 1);
    }
  }

  for (const n of nozzles) {
    if (n.size.value !== null && !isStandardBore(n.size.value)) {
      flag(n.size, 'non-standard-size');
    }
    if (
      n.pos.value !== null &&
      length.value !== null &&
      (n.pos.value < -headDepth || n.pos.value > length.value + headDepth)
    ) {
      flag(n.pos, 'out-of-range');
    }
    if (
      n.proj.value !== null &&
      id.value !== null &&
      (n.proj.value <= 0 || n.proj.value > 3 * id.value)
    ) {
      flag(n.proj, 'out-of-range');
    }
    if (n.name.value !== null) {
      const k = n.name.value.trim().toLowerCase();
      if ((tagCounts.get(k) ?? 0) > 1) flag(n.name, 'duplicate-tag');
    }
    if (hasTable && isUnmatched(n)) flag(n.name, 'unmatched-tag');
  }

  return { id, length, headRatio, orientation, nozzles, saddles };
}

// ---------------------------------------------------------------------------
// Review -> legacy ExtractionResult conversion (substitutes nothing)
// ---------------------------------------------------------------------------

/**
 * Strict conversion: throws if ANY field in the review is still 'missing'.
 * Used by the review UI once the user has filled every gap.
 */
export function toExtractionResult(review: ExtractionReview): ExtractionResult {
  const missing: string[] = [];
  const need = <T>(label: string, ev: ExtractedValue<T>): T => {
    if (ev.confidence === 'missing' || ev.value === null) {
      missing.push(label);
      return null as unknown as T;
    }
    return ev.value;
  };
  const id = need('id', review.id);
  const length = need('length', review.length);
  const headRatio = need('headRatio', review.headRatio);
  const orientation = need('orientation', review.orientation);
  const nozzles = review.nozzles.map((n, i) => ({
    name: need(`nozzles[${i}].name`, n.name),
    pos: need(`nozzles[${i}].pos`, n.pos),
    proj: need(`nozzles[${i}].proj`, n.proj),
    angle: need(`nozzles[${i}].angle`, n.angle),
    size: need(`nozzles[${i}].size`, n.size),
  }));
  const saddles = review.saddles.map((s, i) => ({
    pos: need(`saddles[${i}].pos`, s.pos),
  }));
  if (missing.length > 0) {
    throw new Error(
      `Cannot build extraction result — ${missing.length} field(s) still missing: ${missing.join(', ')}`,
    );
  }
  return { id, length, headRatio, orientation, nozzles, saddles };
}

/**
 * Lenient conversion for the automated apply preview: requires the mandatory
 * vessel scalars (throws, listing them, if any are missing — nothing is
 * substituted), and simply drops any nozzle/saddle that still has a missing
 * sub-field. Dropped items remain in the review for manual editing.
 */
export function reviewToLenientResult(
  review: ExtractionReview,
): ExtractionResult {
  const vesselMissing: string[] = [];
  const scalar = <T>(label: string, ev: ExtractedValue<T>): T | null => {
    if (ev.confidence === 'missing' || ev.value === null) {
      vesselMissing.push(label);
      return null;
    }
    return ev.value;
  };
  const id = scalar('id', review.id);
  const length = scalar('length', review.length);
  const headRatio = scalar('headRatio', review.headRatio);
  const orientation = scalar('orientation', review.orientation);
  if (id === null || length === null || headRatio === null || orientation === null) {
    throw new Error(
      `Extraction incomplete — required vessel fields missing: ${vesselMissing.join(', ')}. ` +
        'Nothing was substituted; re-run extraction or provide a clearer drawing.',
    );
  }

  const nozzles: ExtractionResult['nozzles'] = [];
  for (const n of review.nozzles) {
    if (
      n.name.value === null ||
      n.pos.value === null ||
      n.proj.value === null ||
      n.angle.value === null ||
      n.size.value === null
    ) {
      continue; // dropped from legacy result; still editable in the review
    }
    nozzles.push({
      name: n.name.value,
      pos: n.pos.value,
      proj: n.proj.value,
      angle: n.angle.value,
      size: n.size.value,
    });
  }

  const saddles: ExtractionResult['saddles'] = [];
  for (const s of review.saddles) {
    if (s.pos.value !== null) saddles.push({ pos: s.pos.value });
  }

  return { id, length, headRatio, orientation, nozzles, saddles };
}
