// =============================================================================
// Vessel Modeler - Nozzle Reference Remap
// =============================================================================
// Pure helper for the GA-drawing apply path. A drawing import replaces the
// vessel's `nozzles` array wholesale, which invalidates every pipeline's
// positional `nozzleIndex` (an index INTO `nozzles`, per types.ts). This helper
// re-anchors each pipeline by matching its old anchor nozzle's NAME to a nozzle
// in the new list (trim + case-insensitive exact match), rather than by index.
//
// - Free-standing pipelines (`nozzleIndex === -1`) have no anchor nozzle and are
//   carried through untouched.
// - A pipeline whose old anchor name has no match in the new list cannot be
//   re-anchored and is DROPPED from the returned array; its id + old anchor name
//   are reported in `removed` so the caller can surface the loss (never silent).
// - Unchanged references keep their original object identity (React-friendly);
//   only remapped pipelines are shallow-copied.
//
// Kept pure (no React) so the matching/remap logic can be unit-tested directly.
// See docs/plans/2026-07-30-ga-drawing-import-hardening-design.md §Phase C.
// =============================================================================

import type { NozzleConfig, Pipeline } from '../types';

/** A pipeline dropped because its anchor nozzle has no match in the new list. */
export interface RemovedPipelineRef {
  /** Stable id of the dropped pipeline. */
  pipelineId: string;
  /** Name of the anchor nozzle that no longer exists in the new nozzle list. */
  oldNozzleName: string;
}

export interface RemapNozzleRefsResult {
  /** Pipelines with `nozzleIndex` re-anchored; unmatched anchors excluded. */
  pipelines: Pipeline[];
  /** One entry per dropped pipeline (empty when nothing was removed). */
  removed: RemovedPipelineRef[];
}

/** Normalize a nozzle name for matching: trim surrounding whitespace, lowercase. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Re-anchor pipelines from an old nozzle list to a new one by matching anchor
 * nozzle names. Pure — returns new arrays and never mutates its inputs.
 *
 * @param oldNozzles Nozzles the pipelines' `nozzleIndex` currently point into.
 * @param newNozzles Nozzles that will replace `oldNozzles`.
 * @param pipelines  Pipelines to re-anchor.
 */
export function remapNozzleRefs(
  oldNozzles: NozzleConfig[],
  newNozzles: NozzleConfig[],
  pipelines: Pipeline[],
): RemapNozzleRefsResult {
  // Map normalized new-nozzle name -> new index. First occurrence wins so a
  // duplicate name in the new list can't silently steal an earlier anchor.
  const newIndexByName = new Map<string, number>();
  newNozzles.forEach((n, i) => {
    const key = normalizeName(n.name);
    if (!newIndexByName.has(key)) newIndexByName.set(key, i);
  });

  const pipelinesOut: Pipeline[] = [];
  const removed: RemovedPipelineRef[] = [];

  for (const p of pipelines) {
    // Free-standing pipelines have no anchor nozzle — carry through untouched.
    if (p.nozzleIndex === -1) {
      pipelinesOut.push(p);
      continue;
    }

    // A stale / out-of-bounds index has no recoverable anchor name — drop it.
    const oldNozzle = oldNozzles[p.nozzleIndex];
    if (!oldNozzle) {
      removed.push({ pipelineId: p.id, oldNozzleName: '' });
      continue;
    }

    const newIndex = newIndexByName.get(normalizeName(oldNozzle.name));
    if (newIndex === undefined) {
      removed.push({ pipelineId: p.id, oldNozzleName: oldNozzle.name });
      continue;
    }

    // Preserve object identity when the index is unchanged.
    pipelinesOut.push(newIndex === p.nozzleIndex ? p : { ...p, nozzleIndex: newIndex });
  }

  return { pipelines: pipelinesOut, removed };
}
