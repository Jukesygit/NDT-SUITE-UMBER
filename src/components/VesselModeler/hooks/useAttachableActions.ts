import { useCallback, type Dispatch } from 'react';
import type { SaddleConfig, LiftingLugConfig, WeldConfig } from '../types';
import { historyFor, type UpdateVessel, type VesselAction } from '../engine/vessel-reducer';

interface UseAttachableActionsParams {
  updateVessel: UpdateVessel;
  dispatch: Dispatch<VesselAction>;
}

/**
 * Attachable entity CRUD — saddles, lifting lugs and welds. Bodies extracted
 * verbatim from VesselModeler.tsx (D1); same history keys and select-clear dispatches.
 */
export function useAttachableActions({ updateVessel, dispatch }: UseAttachableActionsParams) {
  // --- Saddle handlers ---
  const addSaddle = useCallback(
    (saddle: SaddleConfig) => {
      updateVessel((prev) => ({ ...prev, saddles: [...prev.saddles, saddle] }));
    },
    [updateVessel]
  );

  const updateSaddle = useCallback(
    (index: number, updates: Partial<SaddleConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          saddles: prev.saddles.map((s, i) => (i === index ? { ...s, ...updates } : s)),
        }),
        historyFor('saddle', index, updates)
      );
    },
    [updateVessel]
  );

  const updateAllSaddleHeights = useCallback(
    (height: number) => {
      updateVessel(
        (prev) => ({ ...prev, saddles: prev.saddles.map((s) => ({ ...s, height })) }),
        historyFor('allSaddle', '', { height })
      );
    },
    [updateVessel]
  );

  const updateAllSaddleDepths = useCallback(
    (depth: number) => {
      updateVessel(
        (prev) => ({ ...prev, saddles: prev.saddles.map((s) => ({ ...s, depth })) }),
        historyFor('allSaddle', '', { depth })
      );
    },
    [updateVessel]
  );

  // Wear plate is configured universally across all supports, not per-saddle.
  const updateAllSaddleWearPlate = useCallback(
    (updates: Partial<SaddleConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          saddles: prev.saddles.map((s) => ({ ...s, ...updates })),
        }),
        historyFor('allSaddleWearPlate', '', updates)
      );
    },
    [updateVessel]
  );

  const removeSaddle = useCallback(
    (index: number) => {
      updateVessel((prev) => ({ ...prev, saddles: prev.saddles.filter((_, i) => i !== index) }));
      dispatch({ type: 'SELECT_SADDLE', index: -1 });
    },
    [updateVessel, dispatch]
  );

  // --- Lifting lug handlers ---
  const addLug = useCallback(
    (lug: LiftingLugConfig) => {
      updateVessel((prev) => ({
        ...prev,
        liftingLugs: [...prev.liftingLugs, lug],
        hasModel: true,
      }));
    },
    [updateVessel]
  );

  const updateLug = useCallback(
    (index: number, updates: Partial<LiftingLugConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          liftingLugs: prev.liftingLugs.map((l, i) => (i === index ? { ...l, ...updates } : l)),
        }),
        historyFor('lug', index, updates)
      );
    },
    [updateVessel]
  );

  const removeLug = useCallback(
    (index: number) => {
      updateVessel((prev) => ({
        ...prev,
        liftingLugs: prev.liftingLugs.filter((_, i) => i !== index),
      }));
      dispatch({ type: 'SELECT_LUG', index: -1 });
    },
    [updateVessel, dispatch]
  );

  // --- Weld handlers ---
  const addWeld = useCallback(
    (weld: WeldConfig) => {
      updateVessel((prev) => ({ ...prev, welds: [...prev.welds, weld], hasModel: true }));
    },
    [updateVessel]
  );

  const updateWeld = useCallback(
    (index: number, updates: Partial<WeldConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          welds: prev.welds.map((w, i) => (i === index ? { ...w, ...updates } : w)),
        }),
        historyFor('weld', index, updates)
      );
    },
    [updateVessel]
  );

  const removeWeld = useCallback(
    (index: number) => {
      updateVessel((prev) => ({ ...prev, welds: prev.welds.filter((_, i) => i !== index) }));
      dispatch({ type: 'SELECT_WELD', index: -1 });
    },
    [updateVessel, dispatch]
  );

  return {
    addSaddle,
    updateSaddle,
    updateAllSaddleHeights,
    updateAllSaddleDepths,
    updateAllSaddleWearPlate,
    removeSaddle,
    addLug,
    updateLug,
    removeLug,
    addWeld,
    updateWeld,
    removeWeld,
  };
}
