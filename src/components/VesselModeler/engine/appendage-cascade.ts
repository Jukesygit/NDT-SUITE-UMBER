// =============================================================================
// Vessel Modeler - Appendage Removal Cascade
// =============================================================================
// Pure helper for deleting an appendage body and everything anchored to it.
// Deleting an appendage removes its own nozzles (those whose `bodyId` matches the
// appendage id) AND their pipelines, applying the SAME index-shift semantics the
// single-nozzle `removeNozzle` cascade uses (VesselModeler.tsx): drop the nozzle,
// drop pipelines whose `nozzleIndex` equals it, and decrement `nozzleIndex` for
// every pipeline anchored to a later nozzle. Matching nozzle indices are handled
// descending so earlier indices stay valid as the array shrinks.
//
// Main-shell nozzles (bodyId undefined) and their pipelines are left untouched.
// The body's other attachables — welds, lifting lugs and coverage rects that
// carry its bodyId — are stripped too (simple filters; no index cascade). Arrays
// with nothing to strip keep their original reference so a delete that touches no
// attachables stays byte-identical downstream.
// Kept pure (no React) so the shifting logic can be unit-tested directly.
// =============================================================================

import type { VesselState } from '../types';

/** The slice of state this cascade rewrites. */
type CascadeState = Pick<
  VesselState,
  'appendages' | 'nozzles' | 'pipelines' | 'welds' | 'liftingLugs' | 'coverageRects'
>;

/** Drop every item whose `bodyId` matches, preserving the array reference when
 *  nothing is removed (so unrelated deletes cause no spurious identity change). */
function stripByBody<T extends { bodyId?: string }>(items: T[], bodyId: string): T[] {
  const next = items.filter((it) => it.bodyId !== bodyId);
  return next.length === items.length ? items : next;
}

/**
 * Compute the post-removal state slice for deleting the appendage at `index`.
 * Removes the body plus its nozzles (+ their pipelines, index-shifted) and its
 * welds / lifting lugs / coverage rects. Returns the inputs unchanged (new
 * appendages array only) when the index is out of range.
 */
export function cascadeRemoveAppendage(state: CascadeState, index: number): CascadeState {
  const removed = state.appendages[index];
  const appendages = state.appendages.filter((_, i) => i !== index);

  const bodyId = removed?.id;
  if (bodyId === undefined) {
    return {
      appendages,
      nozzles: state.nozzles,
      pipelines: state.pipelines,
      welds: state.welds,
      liftingLugs: state.liftingLugs,
      coverageRects: state.coverageRects,
    };
  }

  // Indices of nozzles anchored to this body, descending so removals below don't
  // invalidate the indices still to process.
  const doomed = state.nozzles
    .map((n, i) => (n.bodyId === bodyId ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => b - a);

  let nozzles = state.nozzles;
  let pipelines = state.pipelines;
  for (const nozzleIndex of doomed) {
    // Identical to the removeNozzle cascade, one nozzle at a time.
    nozzles = nozzles.filter((_, i) => i !== nozzleIndex);
    pipelines = pipelines
      .filter((p) => p.nozzleIndex !== nozzleIndex)
      .map((p) => (p.nozzleIndex > nozzleIndex ? { ...p, nozzleIndex: p.nozzleIndex - 1 } : p));
  }

  return {
    appendages,
    nozzles,
    pipelines,
    welds: stripByBody(state.welds, bodyId),
    liftingLugs: stripByBody(state.liftingLugs, bodyId),
    coverageRects: stripByBody(state.coverageRects, bodyId),
  };
}
