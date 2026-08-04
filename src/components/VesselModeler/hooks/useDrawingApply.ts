import { useCallback, type Dispatch } from 'react';
import type { NozzleConfig, VesselState } from '../types';
import type { ExtractionResult } from '../engine/drawing-parser';
import { remapNozzleRefs } from '../engine/nozzle-ref-remap';
import { backfillNozzleIds } from '../engine/nozzle-id';
import { placeExtractedNozzle } from '../engine/head-nozzle-placement';
import type { UpdateVessel, VesselAction } from '../engine/vessel-reducer';

interface UseDrawingApplyParams {
  updateVessel: UpdateVessel;
  dispatch: Dispatch<VesselAction>;
  vesselState: VesselState;
  /** Clamp helper kept in the component (shared with the persistence load path). */
  validateVesselState: (state: VesselState) => VesselState;
}

/**
 * GA drawing-import apply handler (T2-D / D4). Body extracted verbatim from
 * VesselModeler.tsx — it resolves extracted nozzles to engine placement
 * (head-mounted → axial dome-end), re-anchors existing pipelines by nozzle name
 * via remapNozzleRefs (confirming before dropping any whose anchor vanished),
 * replaces the vessel scalars/nozzles/saddles/pipelines through validateVesselState,
 * then deselects. The `[updateVessel, vesselState.nozzles, vesselState.pipelines]`
 * dependency array is preserved so the callback identity is unchanged.
 */
export function useDrawingApply({
  updateVessel,
  dispatch,
  vesselState,
  validateVesselState,
}: UseDrawingApplyParams) {
  const handleDrawingApply = useCallback(
    (result: ExtractionResult) => {
      // Resolve each extracted nozzle to engine placement: head-mounted nozzles
      // (dished-end manways) become axial dome-end nozzles; shell nozzles pass
      // through unchanged. Vessel scalars come from the same result.
      const placementVessel = {
        id: result.id,
        length: result.length,
        headRatio: result.headRatio,
      };
      // The drawing replaces nozzles wholesale — mint fresh stable ids for them
      // so pipelines can be re-anchored to the new nozzles by id via remapNozzleRefs.
      const newNozzles = backfillNozzleIds(
        result.nozzles.map((n) => ({
          name: n.name,
          ...placeExtractedNozzle(n, placementVessel),
        })) as NozzleConfig[]
      );

      // The drawing replaces nozzles wholesale, so re-anchor existing pipelines
      // by nozzle name (their old nozzleId is about to go stale).
      // Pipelines whose anchor is gone are dropped — but never silently.
      const { pipelines: remappedPipelines, removed } = remapNozzleRefs(
        vesselState.nozzles,
        newNozzles,
        vesselState.pipelines
      );
      if (removed.length > 0) {
        const removedNames = removed.map((r) => r.oldNozzleName || '(unnamed)').join(', ');
        const proceed = window.confirm(
          `Applying this drawing will remove ${removed.length} pipeline(s) whose anchor ` +
            `nozzle is no longer present in the drawing: ${removedNames}.\n\nApply anyway?`
        );
        if (!proceed) return;
      }

      updateVessel((prev) =>
        validateVesselState({
          ...prev,
          id: result.id,
          length: result.length,
          headRatio: result.headRatio,
          orientation: result.orientation,
          nozzles: newNozzles,
          saddles: result.saddles.map((s) => ({
            pos: s.pos,
            color: s.color || '#2244ff',
          })),
          pipelines: remappedPipelines,
          hasModel: true,
        })
      );
      dispatch({ type: 'DESELECT_ALL' });
    },
    [updateVessel, vesselState.nozzles, vesselState.pipelines]
  );

  return { handleDrawingApply };
}
