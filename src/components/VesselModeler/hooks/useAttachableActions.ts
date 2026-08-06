import { useCallback, type Dispatch } from 'react';
import type { SaddleConfig, LiftingLugConfig, WeldConfig } from '../types';
import { historyFor, type UpdateVessel, type VesselAction } from '../engine/vessel-reducer';

interface UseAttachableActionsParams {
  updateVessel: UpdateVessel;
  dispatch: Dispatch<VesselAction>;
  /** Live arrays — the visibility toggles read them for their discrete history labels. */
  saddles: SaddleConfig[];
  liftingLugs: LiftingLugConfig[];
  welds: WeldConfig[];
}

/**
 * Attachable entity CRUD — saddles, lifting lugs and welds. Bodies extracted
 * verbatim from VesselModeler.tsx (D1); same history keys and select-clear dispatches.
 */
export function useAttachableActions({
  updateVessel,
  dispatch,
  saddles,
  liftingLugs,
  welds,
}: UseAttachableActionsParams) {
  // --- Saddle handlers ---
  const addSaddle = useCallback(
    (saddle: SaddleConfig) => {
      updateVessel((prev) => ({ ...prev, saddles: [...prev.saddles, saddle] }), {
        label: 'Add saddle',
        at: Date.now(),
      });
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
      updateVessel((prev) => ({ ...prev, saddles: prev.saddles.filter((_, i) => i !== index) }), {
        label: 'Delete saddle',
        at: Date.now(),
      });
      dispatch({ type: 'SELECT_SADDLE', index: -1 });
    },
    [updateVessel, dispatch]
  );

  // --- Lifting lug handlers ---
  const addLug = useCallback(
    (lug: LiftingLugConfig) => {
      updateVessel(
        (prev) => ({
          ...prev,
          liftingLugs: [...prev.liftingLugs, lug],
          hasModel: true,
        }),
        { label: 'Add lifting lug', at: Date.now() }
      );
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
      updateVessel(
        (prev) => ({
          ...prev,
          liftingLugs: prev.liftingLugs.filter((_, i) => i !== index),
        }),
        { label: 'Delete lifting lug', at: Date.now() }
      );
      dispatch({ type: 'SELECT_LUG', index: -1 });
    },
    [updateVessel, dispatch]
  );

  // --- Weld handlers ---
  const addWeld = useCallback(
    (weld: WeldConfig) => {
      updateVessel((prev) => ({ ...prev, welds: [...prev.welds, weld], hasModel: true }), {
        label: 'Add weld',
        at: Date.now(),
      });
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
      updateVessel((prev) => ({ ...prev, welds: prev.welds.filter((_, i) => i !== index) }), {
        label: 'Delete weld',
        at: Date.now(),
      });
      dispatch({ type: 'SELECT_WELD', index: -1 });
    },
    [updateVessel, dispatch]
  );

  // --- Visual-only visibility toggles (C13b) ---
  // `visible` is excluded from the structural hash for these types; toggles apply
  // in-place via ThreeViewport's tier-2 effect. Discrete history entries (no
  // coalesce key), named for the undo dropdown.
  const toggleSaddleVisible = useCallback(
    (index: number) => {
      const target = saddles[index];
      if (!target) return;
      const show = target.visible === false;
      updateVessel(
        (prev) => ({
          ...prev,
          saddles: prev.saddles.map((s, i) => (i === index ? { ...s, visible: show } : s)),
        }),
        { label: `${show ? 'Show' : 'Hide'} saddle Saddle ${index + 1}`, at: Date.now() }
      );
    },
    [updateVessel, saddles]
  );

  const toggleLugVisible = useCallback(
    (index: number) => {
      const target = liftingLugs[index];
      if (!target) return;
      const show = target.visible === false;
      updateVessel(
        (prev) => ({
          ...prev,
          liftingLugs: prev.liftingLugs.map((l, i) => (i === index ? { ...l, visible: show } : l)),
        }),
        { label: `${show ? 'Show' : 'Hide'} lug ${target.name || `Lifting lug ${index + 1}`}`, at: Date.now() }
      );
    },
    [updateVessel, liftingLugs]
  );

  const toggleWeldVisible = useCallback(
    (index: number) => {
      const target = welds[index];
      if (!target) return;
      const show = target.visible === false;
      updateVessel(
        (prev) => ({
          ...prev,
          welds: prev.welds.map((w, i) => (i === index ? { ...w, visible: show } : w)),
        }),
        { label: `${show ? 'Show' : 'Hide'} weld ${target.name || `Weld ${index + 1}`}`, at: Date.now() }
      );
    },
    [updateVessel, welds]
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
    toggleSaddleVisible,
    toggleLugVisible,
    toggleWeldVisible,
  };
}
