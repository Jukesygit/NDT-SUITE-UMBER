import { useCallback, type Dispatch } from 'react';
import type { AppendageConfig } from '../types';
import { cascadeRemoveAppendage } from '../engine/appendage-cascade';
import { historyFor, type UpdateVessel, type VesselAction } from '../engine/vessel-reducer';

interface UseAppendageActionsParams {
  updateVessel: UpdateVessel;
  dispatch: Dispatch<VesselAction>;
}

/**
 * Appendage (secondary body) entity CRUD. Bodies extracted verbatim from
 * VesselModeler.tsx (D1) — same history key, same delete cascade.
 */
export function useAppendageActions({ updateVessel, dispatch }: UseAppendageActionsParams) {
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

  return { addAppendage, updateAppendage, removeAppendage };
}
