// =============================================================================
// Vessel Modeler - Appendage Removal Cascade
// =============================================================================
// Pure helper for deleting an appendage body and everything anchored to it.
// Deleting an appendage removes its own nozzles (those whose `bodyId` matches the
// appendage id) AND their pipelines. Because pipelines now reference nozzles by
// stable `nozzleId` (never array position), this is a straight id-based filter —
// drop the body's nozzles, then drop pipelines whose `nozzleId` was one of them.
// No index-shifting: every surviving pipeline keeps pointing at the SAME physical
// nozzle it always did (this replaced the old filter+decrement cascade).
//
// Main-shell nozzles (bodyId undefined) and their pipelines are left untouched.
// The body's other attachables — welds, lifting lugs, coverage rects, annotations
// and dome scans that carry its bodyId — are stripped too (simple filters; no
// index cascade). Arrays with nothing to strip keep their original reference so a
// delete that touches no attachables stays byte-identical downstream.
// Kept pure (no React) so the shifting logic can be unit-tested directly.
// =============================================================================

import type { VesselState } from '../types';

/** The slice of state this cascade rewrites. */
type CascadeState = Pick<
  VesselState,
  | 'appendages'
  | 'nozzles'
  | 'pipelines'
  | 'welds'
  | 'liftingLugs'
  | 'coverageRects'
  | 'annotations'
  | 'domeScanComposites'
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
      annotations: state.annotations,
      domeScanComposites: state.domeScanComposites,
    };
  }

  // Stable ids of the nozzles anchored to this body. Filtering by id means the
  // surviving nozzles and their pipelines keep their identity — no re-indexing.
  const doomedNozzleIds = new Set(
    state.nozzles.filter((n) => n.bodyId === bodyId).map((n) => n.id)
  );

  const nozzles = stripByBody(state.nozzles, bodyId);
  const prunedPipelines = doomedNozzleIds.size
    ? state.pipelines.filter((p) => !(p.nozzleId && doomedNozzleIds.has(p.nozzleId)))
    : state.pipelines;
  const pipelines =
    prunedPipelines.length === state.pipelines.length ? state.pipelines : prunedPipelines;

  return {
    appendages,
    nozzles,
    pipelines,
    welds: stripByBody(state.welds, bodyId),
    liftingLugs: stripByBody(state.liftingLugs, bodyId),
    coverageRects: stripByBody(state.coverageRects, bodyId),
    annotations: stripByBody(state.annotations, bodyId),
    domeScanComposites: stripByBody(state.domeScanComposites, bodyId),
  };
}
