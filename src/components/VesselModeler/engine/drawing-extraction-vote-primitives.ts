/**
 * Drawing Extraction — Voting Primitives
 *
 * The pure, field-agnostic reconciliation helpers (numeric median vote, string/
 * enum majority vote, confidence scoring, sentinels, singleton carry) used by
 * the ensemble voter. Kept separate from the nozzle/saddle/ensemble assembly so
 * each file stays a single concern and under the line budget. No value is ever
 * invented here — an unread/disagreed field becomes 'missing', never a default.
 */

// Type-only import (erased at compile time ⇒ no runtime circular dependency),
// mirroring how drawing-extraction-raw.ts imports its enums back from voting.
import type { ExtractedValue, FieldConfidence } from './drawing-extraction-voting';

/** Normalize a nozzle tag for cross-sample matching. */
export const normalizeTag = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

export function confidenceFor(agree: number, total: number): FieldConfidence {
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
export function voteNumeric(values: Array<number | null>): ExtractedValue<number> {
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
export function voteString(
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

/** Majority vote for a string enum (orientation / mount / nozzleOrientation):
 *  voteString with the concrete leaf type carried through. */
export function voteEnum<T extends string>(
  values: Array<T | null>,
): ExtractedValue<T> {
  const voted = voteString(values as Array<string | null>);
  return { ...voted, value: voted.value as T | null };
}

/**
 * The non-applicable numeric sentinel used for a field that does not apply to a
 * given nozzle (a shell mount's `radialOffset`, a radial nozzle's `elevation`):
 * a definite "not applicable" — confidence 'high' with a null value so it reads
 * as resolved and never gates apply. The applicable case votes a real number
 * instead. A fresh object each call (no shared mutable flags).
 */
export function notApplicable(): ExtractedValue<number> {
  return { value: null, confidence: 'high', flags: [] };
}

/** Flag marking a field that survived on a single extraction pass. */
export const SINGLE_PASS = 'single-pass';

/**
 * Carry one field from a lone sample: a read value is kept at 'low' confidence
 * with the 'single-pass' flag (so the review UI tints it and prompts a check);
 * a null stays 'missing' exactly as the voted path reports an unread field. No
 * value is invented — only provenance-tagged.
 */
export function carrySingleton<T>(value: T | null): ExtractedValue<T> {
  return value === null
    ? { value: null, confidence: 'missing', flags: [] }
    : { value, confidence: 'low', flags: [SINGLE_PASS] };
}
