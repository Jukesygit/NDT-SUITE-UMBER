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
// Kept pure (no React) so the shifting logic can be unit-tested directly.
// =============================================================================

import type { VesselState } from '../types';

/** The slice of state this cascade rewrites. */
type CascadeState = Pick<VesselState, 'appendages' | 'nozzles' | 'pipelines'>;

/**
 * Compute the post-removal { appendages, nozzles, pipelines } for deleting the
 * appendage at `index`. Returns the inputs unchanged (new appendages array only)
 * when the index is out of range or the removed body has no attached nozzles.
 */
export function cascadeRemoveAppendage(state: CascadeState, index: number): CascadeState {
  const removed = state.appendages[index];
  const appendages = state.appendages.filter((_, i) => i !== index);

  const bodyId = removed?.id;
  if (bodyId === undefined) {
    return { appendages, nozzles: state.nozzles, pipelines: state.pipelines };
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

  return { appendages, nozzles, pipelines };
}
