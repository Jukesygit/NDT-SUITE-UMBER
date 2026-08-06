import { useCallback, type Dispatch } from 'react';
import type { NozzleConfig } from '../types';
import { nextNozzleId, removeNozzleById } from '../engine/nozzle-id';
import { historyFor, type UpdateVessel, type VesselAction } from '../engine/vessel-reducer';

interface UseNozzleActionsParams {
  updateVessel: UpdateVessel;
  dispatch: Dispatch<VesselAction>;
  /** Live nozzle array — toggleNozzleVisible reads it for the discrete history label. */
  nozzles: NozzleConfig[];
}

/**
 * Nozzle entity CRUD. Bodies extracted verbatim from VesselModeler.tsx (D1) —
 * same history keys, same store-side id minting, same delete cascade.
 */
export function useNozzleActions({ updateVessel, dispatch, nozzles }: UseNozzleActionsParams) {
  // The store owns nozzle ids: every UI-added nozzle is minted a stable, collision-
  // free id here so no call site can invent (or forget) one.
  const addNozzle = useCallback(
    (nozzle: Omit<NozzleConfig, 'id'>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          nozzles: [...prev.nozzles, { ...nozzle, id: nextNozzleId(prev.nozzles) }],
          hasModel: true,
        }),
        { label: 'Add nozzle', at: Date.now() }
      );
    },
    [updateVessel]
  );

  const updateNozzle = useCallback(
    (index: number, updates: Partial<NozzleConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          nozzles: prev.nozzles.map((n, i) => (i === index ? { ...n, ...updates } : n)),
        }),
        historyFor('nozzle', index, updates)
      );
    },
    [updateVessel]
  );

  const removeNozzle = useCallback(
    (index: number) => {
      // Atomic, id-correct cascade: drop the nozzle + the pipelines anchored to it.
      // Every OTHER pipeline keeps its stable nozzleId, so it stays attached to the
      // SAME physical nozzle — no index-shifting (see engine/nozzle-id.ts).
      updateVessel(
        (prev) => {
          const target = prev.nozzles[index];
          if (!target) return prev;
          return { ...prev, ...removeNozzleById(prev.nozzles, prev.pipelines, target.id) };
        },
        { label: 'Delete nozzle', at: Date.now() }
      );
      dispatch({ type: 'SELECT_NOZZLE', index: -1 });
    },
    [updateVessel, dispatch]
  );

  // Visual-only visibility toggle (C13b). `visible` is excluded from the
  // structural hash, so this applies in-place via ThreeViewport's tier-2 effect.
  // Discrete history entry (no coalesce key) named for the undo dropdown.
  const toggleNozzleVisible = useCallback(
    (index: number) => {
      const target = nozzles[index];
      if (!target) return;
      const show = target.visible === false;
      updateVessel(
        (prev) => ({
          ...prev,
          nozzles: prev.nozzles.map((n, i) => (i === index ? { ...n, visible: show } : n)),
        }),
        { label: `${show ? 'Show' : 'Hide'} nozzle ${target.name || `Nozzle ${index + 1}`}`, at: Date.now() }
      );
    },
    [updateVessel, nozzles]
  );

  return { addNozzle, updateNozzle, removeNozzle, toggleNozzleVisible };
}
