// =============================================================================
// Nozzle Identity — stable ids + pipeline reference resolution
// =============================================================================
// `NozzleConfig.id` is a stable, unique handle (`noz-<n>`) minted at creation and
// backfilled deterministically at load for legacy saves. `Pipeline.nozzleId`
// references a nozzle by that handle instead of by array position, so deleting or
// reordering nozzles can never silently re-target or orphan piping (the fragility
// that `appendage-cascade.ts` used to paper over with manual index-shifting).
//
// This module is the SINGLE home for the id vocabulary — minting, backfilling,
// lookup, the once-at-load legacy `nozzleIndex → nozzleId` migration, and the
// id-correct delete. Kept pure (no React / no Three.js) so every rule is
// unit-testable in isolation. See roadmap T2-C / appendage design §17 follow-up.
// =============================================================================

import type { NozzleConfig, Pipeline } from '../types';

/** Prefix for minted nozzle ids. Mirrors the `app-<n>` scheme on appendages. */
const NOZZLE_ID_PREFIX = 'noz-';

/**
 * Mint the next collision-free nozzle id for a set of existing nozzles. Monotonic
 * `noz-<n>` counter that skips ids already in use even after deletions have left
 * gaps in the numbering (mirrors `createAppendage`). Never an array index.
 */
export function nextNozzleId(existing: NozzleConfig[]): string {
  const used = new Set(existing.map((n) => n.id).filter(Boolean));
  let n = existing.length + 1;
  while (used.has(`${NOZZLE_ID_PREFIX}${n}`)) n += 1;
  return `${NOZZLE_ID_PREFIX}${n}`;
}

/**
 * Backfill stable ids onto any nozzle that lacks one (legacy saves predate the
 * field). Deterministic (walks in array order) and collision-free (skips ids the
 * record already carries), so a given saved payload always backfills to the same
 * ids — which keeps pipeline pairings and geometry byte-identical across loads.
 * Nozzles that already have an id are left untouched; when nothing changes the
 * original array reference is returned so no spurious identity churn is created.
 */
export function backfillNozzleIds(nozzles: NozzleConfig[]): NozzleConfig[] {
  const used = new Set<string>();
  for (const n of nozzles) if (n.id) used.add(n.id);

  let counter = 0;
  let changed = false;
  const out = nozzles.map((n) => {
    if (n.id) return n;
    let id: string;
    do {
      counter += 1;
      id = `${NOZZLE_ID_PREFIX}${counter}`;
    } while (used.has(id));
    used.add(id);
    changed = true;
    return { ...n, id };
  });
  return changed ? out : nozzles;
}

/** Find a nozzle by its stable id. Pure lookup; tolerates an undefined id (a
 *  free-standing pipeline has none) by returning undefined. */
export function findNozzleById(
  nozzles: NozzleConfig[],
  id: string | undefined
): NozzleConfig | undefined {
  if (!id) return undefined;
  return nozzles.find((n) => n.id === id);
}

/** Return a copy of the pipeline with the deprecated legacy `nozzleIndex` field
 *  dropped (saves write `nozzleId` only). Identity-preserving when already clean. */
function withoutLegacyIndex(p: Pipeline): Pipeline {
  if (p.nozzleIndex === undefined) return p;
  const next: Pipeline = { ...p };
  delete next.nozzleIndex;
  return next;
}

/**
 * Resolve legacy positional `nozzleIndex` references to stable `nozzleId`s ONCE,
 * at load, against the (already id-backfilled) nozzle list. Idempotent:
 *   - a pipeline that already carries a `nozzleId` is kept as-is (index dropped);
 *   - a free-standing pipeline (has `freeOrigin`, or the legacy `nozzleIndex === -1`)
 *     stays free-standing — never grabs a nozzle;
 *   - otherwise the legacy index is looked up (replicating the historical
 *     `nozzleIndex ?? 0` default) and replaced with that nozzle's id. An index
 *     with no matching nozzle leaves the pipeline free-standing rather than
 *     dangling.
 * `nozzleIndex` never survives onto the returned objects.
 */
export function migratePipelineNozzleRefs(
  pipelines: Pipeline[],
  nozzles: NozzleConfig[]
): Pipeline[] {
  return pipelines.map((p) => {
    if (p.nozzleId) return withoutLegacyIndex(p);
    if (p.freeOrigin || p.nozzleIndex === -1) return withoutLegacyIndex(p);

    const idx = typeof p.nozzleIndex === 'number' ? p.nozzleIndex : 0;
    const nozzle = idx >= 0 ? nozzles[idx] : undefined;
    if (!nozzle) return withoutLegacyIndex(p);
    return { ...withoutLegacyIndex(p), nozzleId: nozzle.id };
  });
}

/** The nozzles/pipelines slice rewritten by an id-correct nozzle delete. */
export interface RemoveNozzleResult {
  nozzles: NozzleConfig[];
  pipelines: Pipeline[];
}

/**
 * Remove the nozzle with the given id and the pipelines anchored to it, leaving
 * every OTHER pipeline pointing at the SAME physical nozzle (no index-shifting —
 * ids are stable). This is the id-correct successor to the historical
 * `filter + decrement` cascade. Array references are preserved when nothing is
 * removed, so an unrelated delete causes no downstream identity change.
 */
export function removeNozzleById(
  nozzles: NozzleConfig[],
  pipelines: Pipeline[],
  id: string
): RemoveNozzleResult {
  const nextNozzles = nozzles.filter((n) => n.id !== id);
  if (nextNozzles.length === nozzles.length) return { nozzles, pipelines };

  const nextPipelines = pipelines.filter((p) => p.nozzleId !== id);
  return {
    nozzles: nextNozzles,
    pipelines: nextPipelines.length === pipelines.length ? pipelines : nextPipelines,
  };
}
