// =============================================================================
// Vessel Modeler - Nozzle Reference Remap
// =============================================================================
// Pure helper for the GA-drawing apply path. A drawing import replaces the
// vessel's `nozzles` array wholesale — the new nozzles carry brand-new stable
// ids, so every pipeline's `nozzleId` would dangle. This helper re-anchors each
// pipeline by matching its old anchor nozzle's NAME to a nozzle in the new list
// (trim + case-insensitive exact match), rewriting `nozzleId` to the new nozzle's
// id rather than trusting any positional relationship.
//
// - Free-standing pipelines (no `nozzleId`) have no anchor nozzle and are
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
  /** Pipelines with `nozzleId` re-anchored; unmatched anchors excluded. */
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
 * @param oldNozzles Nozzles the pipelines' `nozzleId` currently point into.
 * @param newNozzles Nozzles that will replace `oldNozzles`.
 * @param pipelines  Pipelines to re-anchor.
 */
export function remapNozzleRefs(
  oldNozzles: NozzleConfig[],
  newNozzles: NozzleConfig[],
  pipelines: Pipeline[]
): RemapNozzleRefsResult {
  // Map normalized new-nozzle name -> new nozzle id. First occurrence wins so a
  // duplicate name in the new list can't silently steal an earlier anchor.
  const newIdByName = new Map<string, string>();
  newNozzles.forEach((n) => {
    const key = normalizeName(n.name);
    if (!newIdByName.has(key)) newIdByName.set(key, n.id);
  });

  const pipelinesOut: Pipeline[] = [];
  const removed: RemovedPipelineRef[] = [];

  for (const p of pipelines) {
    // Free-standing pipelines have no anchor nozzle — carry through untouched.
    if (!p.nozzleId) {
      pipelinesOut.push(p);
      continue;
    }

    // A stale anchor id no longer in the old list has no recoverable name — drop it.
    const oldNozzle = oldNozzles.find((n) => n.id === p.nozzleId);
    if (!oldNozzle) {
      removed.push({ pipelineId: p.id, oldNozzleName: '' });
      continue;
    }

    const newId = newIdByName.get(normalizeName(oldNozzle.name));
    if (newId === undefined) {
      removed.push({ pipelineId: p.id, oldNozzleName: oldNozzle.name });
      continue;
    }

    // Preserve object identity when the anchor id is unchanged.
    pipelinesOut.push(newId === p.nozzleId ? p : { ...p, nozzleId: newId });
  }

  return { pipelines: pipelinesOut, removed };
}
