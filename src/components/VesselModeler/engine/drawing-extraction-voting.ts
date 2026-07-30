/**
 * Drawing Extraction Voting
 *
 * Pure, network-free reconciliation of an N-sample Gemini extraction ensemble
 * into a single per-field ExtractionReview carrying confidence. No value is
 * ever invented: a field the samples could not agree on (or could not read at
 * all) is reported as 'missing', never defaulted.
 */

import type { Orientation } from '../types';

// ---------------------------------------------------------------------------
// Result contract (consumed by the review UI; see design doc 2026-07-30)
// ---------------------------------------------------------------------------

export type FieldConfidence = 'high' | 'medium' | 'low' | 'missing';

export interface ExtractedValue<T> {
  value: T | null; // null iff confidence === 'missing'
  confidence: FieldConfidence;
  flags: string[]; // verifier flag codes, e.g. 'non-standard-size'
}

export interface ReviewNozzle {
  name: ExtractedValue<string>;
  pos: ExtractedValue<number>;
  proj: ExtractedValue<number>;
  angle: ExtractedValue<number>;
  size: ExtractedValue<number>;
}

export interface ExtractionReview {
  id: ExtractedValue<number>;
  length: ExtractedValue<number>;
  headRatio: ExtractedValue<number>;
  orientation: ExtractedValue<Orientation>;
  nozzles: ReviewNozzle[];
  saddles: Array<{ pos: ExtractedValue<number> }>;
}

// ---------------------------------------------------------------------------
// Raw sample shape (one parsed Gemini response — every leaf nullable)
// ---------------------------------------------------------------------------

export interface RawNozzle {
  name: string | null;
  pos: number | null;
  proj: number | null;
  angle: number | null;
  size: number | null;
}

export interface RawExtraction {
  id: number | null;
  length: number | null;
  headRatio: number | null;
  orientation: Orientation | null;
  nozzles: RawNozzle[];
  saddles: Array<{ pos: number | null }>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function orient(v: unknown): Orientation | null {
  return v === 'horizontal' || v === 'vertical' ? v : null;
}

/**
 * Coerce a parsed JSON value into a RawExtraction. Malformed / wrong-typed
 * leaves become null — this is type coercion, never value substitution.
 */
export function coerceRawExtraction(parsed: unknown): RawExtraction {
  const d = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<
    string,
    unknown
  >;
  const nozzles = Array.isArray(d.nozzles)
    ? d.nozzles
        .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
        .map((n) => ({
          name: str(n.name),
          pos: num(n.pos),
          proj: num(n.proj),
          angle: num(n.angle),
          size: num(n.size),
        }))
    : [];
  const saddles = Array.isArray(d.saddles)
    ? d.saddles
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({ pos: num(s.pos) }))
    : [];
  return {
    id: num(d.id),
    length: num(d.length),
    headRatio: num(d.headRatio),
    orientation: orient(d.orientation),
    nozzles,
    saddles,
  };
}

// ---------------------------------------------------------------------------
// Voting primitives
// ---------------------------------------------------------------------------

/** Normalize a nozzle tag for cross-sample matching. */
const normalizeTag = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

function confidenceFor(agree: number, total: number): FieldConfidence {
  if (agree >= total) return 'high';
  if (agree >= 2) return 'medium';
  return 'low';
}

/** A field is missing when a strict majority of the ensemble read null. */
function isNullMajority(nullCount: number, total: number): boolean {
  return nullCount * 2 > total;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Median vote with agreement tolerance of max(1mm, 1%). */
function voteNumeric(values: Array<number | null>): ExtractedValue<number> {
  const total = values.length;
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0 || isNullMajority(total - present.length, total)) {
    return { value: null, confidence: 'missing', flags: [] };
  }
  const med = median(present);
  const tol = Math.max(1, Math.abs(med) * 0.01);
  const agree = present.filter((v) => Math.abs(v - med) <= tol).length;
  return { value: med, confidence: confidenceFor(agree, total), flags: [] };
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

/** Majority vote for strings; groups by `normalize` but returns the original. */
function voteString(
  values: Array<string | null>,
  normalize: (s: string) => string = (s) => s,
): ExtractedValue<string> {
  const total = values.length;
  const present = values.filter((v): v is string => v !== null);
  if (present.length === 0 || isNullMajority(total - present.length, total)) {
    return { value: null, confidence: 'missing', flags: [] };
  }
  const byKey = new Map<string, string[]>();
  for (const v of present) {
    const k = normalize(v);
    const list = byKey.get(k) ?? [];
    list.push(v);
    byKey.set(k, list);
  }
  let winner: string[] = [];
  for (const list of byKey.values()) {
    if (list.length > winner.length) winner = list;
  }
  return {
    value: mostCommon(winner),
    confidence: confidenceFor(winner.length, total),
    flags: [],
  };
}

function voteOrientation(
  values: Array<Orientation | null>,
): ExtractedValue<Orientation> {
  const voted = voteString(values as Array<string | null>);
  return { ...voted, value: voted.value as Orientation | null };
}

// ---------------------------------------------------------------------------
// Ensemble voting
// ---------------------------------------------------------------------------

function voteNozzles(samples: RawExtraction[]): ReviewNozzle[] {
  // Index each sample's nozzles by normalized tag (null-named are unmatchable).
  const perSample = samples.map((s) => {
    const map = new Map<string, RawNozzle>();
    for (const n of s.nozzles) {
      if (n.name !== null) map.set(normalizeTag(n.name), n);
    }
    return map;
  });

  // Union of tags in first-seen order.
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const map of perSample) {
    for (const k of map.keys()) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }

  const out: ReviewNozzle[] = [];
  for (const key of keys) {
    const presence = perSample.filter((m) => m.has(key)).length;
    if (presence < 2) continue; // survives only if present in >= 2 samples
    out.push({
      name: voteString(
        perSample.map((m) => m.get(key)?.name ?? null),
        normalizeTag,
      ),
      pos: voteNumeric(perSample.map((m) => m.get(key)?.pos ?? null)),
      proj: voteNumeric(perSample.map((m) => m.get(key)?.proj ?? null)),
      angle: voteNumeric(perSample.map((m) => m.get(key)?.angle ?? null)),
      size: voteNumeric(perSample.map((m) => m.get(key)?.size ?? null)),
    });
  }
  return out;
}

function voteSaddles(
  samples: RawExtraction[],
): Array<{ pos: ExtractedValue<number> }> {
  // No tags to match on, so reconcile by ascending-position rank.
  const sorted = samples.map((s) =>
    s.saddles
      .map((sd) => sd.pos)
      .filter((p): p is number => p !== null)
      .sort((a, b) => a - b),
  );
  const maxCount = Math.max(0, ...sorted.map((arr) => arr.length));
  const out: Array<{ pos: ExtractedValue<number> }> = [];
  for (let r = 0; r < maxCount; r++) {
    const rankVals = sorted.map((arr) => (r < arr.length ? arr[r] : null));
    if (rankVals.filter((v) => v !== null).length < 2) continue;
    out.push({ pos: voteNumeric(rankVals) });
  }
  return out;
}

/** Reconcile an ensemble of raw extractions into a single voted review. */
export function voteExtractions(samples: RawExtraction[]): ExtractionReview {
  return {
    id: voteNumeric(samples.map((s) => s.id)),
    length: voteNumeric(samples.map((s) => s.length)),
    headRatio: voteNumeric(samples.map((s) => s.headRatio)),
    orientation: voteOrientation(samples.map((s) => s.orientation)),
    nozzles: voteNozzles(samples),
    saddles: voteSaddles(samples),
  };
}
