import { useCallback, type Dispatch } from 'react';
import type { AppendageConfig } from '../types';
import { cascadeRemoveAppendage } from '../engine/appendage-cascade';
import { historyFor, type UpdateVessel, type VesselAction } from '../engine/vessel-reducer';

interface UseAppendageActionsParams {
  updateVessel: UpdateVessel;
  dispatch: Dispatch<VesselAction>;
  /** Live appendage array — toggleAppendageVisible reads it for the history label. */
  appendages: AppendageConfig[];
}

/**
 * Appendage (secondary body) entity CRUD. Bodies extracted verbatim from
 * VesselModeler.tsx (D1) — same history key, same delete cascade.
 */
export function useAppendageActions({
  updateVessel,
  dispatch,
  appendages,
}: UseAppendageActionsParams) {
  const addAppendage = useCallback(
    (appendage: AppendageConfig) => {
      updateVessel(
        (prev) => ({
          ...prev,
          appendages: [...prev.appendages, appendage],
          hasModel: true,
        }),
        { label: 'Add Boot', at: Date.now() }
      );
    },
    [updateVessel]
  );

  const updateAppendage = useCallback(
    (index: number, updates: Partial<AppendageConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          appendages: prev.appendages.map((a, i) => (i === index ? { ...a, ...updates } : a)),
        }),
        historyFor('appendage', index, updates)
      );
    },
    [updateVessel]
  );

  const removeAppendage = useCallback(
    (index: number) => {
      // Cascade: deleting an appendage removes its own nozzles (bodyId match) and
      // their pipelines via the shared removeNozzle index-shift semantics. Main-
      // shell nozzles/pipelines are left untouched. (See engine/appendage-cascade.)
      updateVessel((prev) => ({ ...prev, ...cascadeRemoveAppendage(prev, index) }), {
        label: 'Delete Boot',
        at: Date.now(),
      });
      dispatch({ type: 'SELECT_APPENDAGE', index: -1 });
    },
    [updateVessel, dispatch]
  );

  // Visual-only visibility toggle (C13b). Appendage `visible` is excluded from the
  // structural hash and applied by ThreeViewport's appendage tier-2 effect. Discrete
  // history entry; user-facing word is "Boot" (R3 terminology).
  const toggleAppendageVisible = useCallback(
    (index: number) => {
      const target = appendages[index];
      if (!target) return;
      const show = target.visible === false;
      updateVessel(
        (prev) => ({
          ...prev,
          appendages: prev.appendages.map((a, i) => (i === index ? { ...a, visible: show } : a)),
        }),
        { label: `${show ? 'Show' : 'Hide'} Boot ${target.name}`, at: Date.now() }
      );
    },
    [updateVessel, appendages]
  );

  return { addAppendage, updateAppendage, removeAppendage, toggleAppendageVisible };
}
