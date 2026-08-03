/**
 * Drawing Extraction Voting
 *
 * Pure, network-free reconciliation of an N-sample Gemini extraction ensemble
 * into a single per-field ExtractionReview carrying confidence. No value is
 * ever invented: a field the samples could not agree on (or could not read at
 * all) is reported as 'missing', never defaulted.
 */

import type { Orientation } from '../types';
import type { RawExtraction, RawNozzle } from './drawing-extraction-raw';

// ---------------------------------------------------------------------------
// Result contract (consumed by the review UI; see design doc 2026-07-30)
// ---------------------------------------------------------------------------

export type FieldConfidence = 'high' | 'medium' | 'low' | 'missing';

export interface ExtractedValue<T> {
  value: T | null; // null iff confidence === 'missing'
  confidence: FieldConfidence;
  flags: string[]; // verifier flag codes, e.g. 'non-standard-size'
}

/** Where a nozzle mounts. Shell nozzles keep tangent-line `pos`; head nozzles
 *  carry a `radialOffset` from the vessel centerline (see head-nozzle-placement). */
export type NozzleMount = 'shell' | 'head-left' | 'head-right';

/** How a nozzle protrudes. 'radial' points out from the axis (today's default
 *  path); 'horizontal' is a side-facing nozzle (3/9 o'clock cluster) whose shell
 *  seat is set by its `elevation` from centerline (see head-nozzle-placement). */
export type NozzleOrientation = 'radial' | 'horizontal';

export interface ReviewNozzle {
  name: ExtractedValue<string>;
  pos: ExtractedValue<number>;
  proj: ExtractedValue<number>;
  angle: ExtractedValue<number>;
  size: ExtractedValue<number>;
  /** Mount location (voted enum). Missing blocks apply like any field. */
  mount: ExtractedValue<NozzleMount>;
  /** mm from vessel centerline in the end view. Gate-relevant ONLY for a
   *  head-* mount; for a shell mount it is the non-applicable sentinel
   *  { value: null, confidence: 'high' } (see notApplicableOffset) which never
   *  blocks apply. */
  radialOffset: ExtractedValue<number>;
  /** Radial vs. horizontal (voted enum). Required classification — a missing
   *  value blocks apply like any field (no assumed-radial default). */
  nozzleOrientation: ExtractedValue<NozzleOrientation>;
  /** Signed mm from vessel centerline. Gate-relevant ONLY when
   *  nozzleOrientation is 'horizontal'; otherwise the non-applicable sentinel
   *  { value: null, confidence: 'high' } (see notApplicableElevation). */
  elevation: ExtractedValue<number>;
}

export interface ExtractionReview {
  id: ExtractedValue<number>;
  length: ExtractedValue<number>;
  headRatio: ExtractedValue<number>;
  orientation: ExtractedValue<Orientation>;
  nozzles: ReviewNozzle[];
  saddles: Array<{ pos: ExtractedValue<number> }>;
}

// Raw sample shape + coercion, and the pure voting primitives, live in sibling
// modules (one concern per file); re-exported here so existing importers keep a
// single entry point.
export { coerceRawExtraction } from './drawing-extraction-raw';
export type { RawExtraction, RawNozzle } from './drawing-extraction-raw';
import {
  normalizeTag,
  voteNumeric,
  voteString,
  voteEnum,
  notApplicable,
  carrySingleton,
} from './drawing-extraction-vote-primitives';

// ---------------------------------------------------------------------------
// Ensemble voting
// ---------------------------------------------------------------------------

/** Build a ReviewNozzle from a nozzle seen in exactly one sample. */
function singletonNozzle(n: RawNozzle): ReviewNozzle {
  const mount = carrySingleton<NozzleMount>(n.mount);
  const isHead = mount.value === 'head-left' || mount.value === 'head-right';
  const nozzleOrientation = carrySingleton<NozzleOrientation>(n.nozzleOrientation);
  const isHorizontal = nozzleOrientation.value === 'horizontal';
  return {
    name: carrySingleton(n.name),
    pos: carrySingleton(n.pos),
    proj: carrySingleton(n.proj),
    angle: carrySingleton(n.angle),
    size: carrySingleton(n.size),
    mount,
    // Offset applies only to a head mount; a shell/unknown singleton gets the
    // same non-blocking sentinel a voted shell nozzle would (never gates apply).
    radialOffset: isHead ? carrySingleton(n.radialOffset) : notApplicable(),
    nozzleOrientation,
    // Elevation applies only to a horizontal nozzle; anything else gets the
    // non-blocking sentinel (never gates apply), mirroring radialOffset.
    elevation: isHorizontal ? carrySingleton(n.elevation) : notApplicable(),
  };
}

/** Vote every field of a nozzle key present in >= 2 samples. */
function votedNozzle(perSample: Array<Map<string, RawNozzle>>, key: string): ReviewNozzle {
  const votedMount = voteEnum(perSample.map((m) => m.get(key)?.mount ?? null));
  const isHead =
    votedMount.value === 'head-left' || votedMount.value === 'head-right';
  const votedOrientation = voteEnum(
    perSample.map((m) => m.get(key)?.nozzleOrientation ?? null),
  );
  const isHorizontal = votedOrientation.value === 'horizontal';
  return {
    name: voteString(
      perSample.map((m) => m.get(key)?.name ?? null),
      normalizeTag,
    ),
    pos: voteNumeric(perSample.map((m) => m.get(key)?.pos ?? null)),
    proj: voteNumeric(perSample.map((m) => m.get(key)?.proj ?? null)),
    angle: voteNumeric(perSample.map((m) => m.get(key)?.angle ?? null)),
    size: voteNumeric(perSample.map((m) => m.get(key)?.size ?? null)),
    mount: votedMount,
    // Offset only matters for a head mount; shell/unknown mounts get the
    // non-blocking sentinel so a normal shell nozzle can never gate apply.
    radialOffset: isHead
      ? voteNumeric(perSample.map((m) => m.get(key)?.radialOffset ?? null))
      : notApplicable(),
    nozzleOrientation: votedOrientation,
    // Elevation only matters for a horizontal nozzle; radial gets the
    // non-blocking sentinel so a normal radial nozzle can never gate apply.
    elevation: isHorizontal
      ? voteNumeric(perSample.map((m) => m.get(key)?.elevation ?? null))
      : notApplicable(),
  };
}

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

  // Voted nozzles (>= 2 samples) keep exact prior behavior and order; singletons
  // (exactly 1 sample) are never discarded — they are carried through as low /
  // 'single-pass' and appended after, in first-seen order. Each key routes to
  // exactly one bucket by presence, so a singleton can never duplicate a voted
  // nozzle (asserted in tests).
  const voted: ReviewNozzle[] = [];
  const singletons: ReviewNozzle[] = [];
  for (const key of keys) {
    const presence = perSample.filter((m) => m.has(key)).length;
    if (presence >= 2) {
      voted.push(votedNozzle(perSample, key));
    } else {
      const only = perSample.find((m) => m.has(key))!.get(key)!;
      singletons.push(singletonNozzle(only));
    }
  }
  return [...voted, ...singletons];
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
    orientation: voteEnum(samples.map((s) => s.orientation)),
    nozzles: voteNozzles(samples),
    saddles: voteSaddles(samples),
  };
}
