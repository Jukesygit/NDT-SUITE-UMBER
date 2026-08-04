import { useCallback, type Dispatch } from 'react';
import {
  findClosestPipeSize,
  type NozzleConfig,
  type Pipeline,
  type PipeSegment,
  type PipeSegmentType,
  type FreeOrigin,
} from '../types';
import { historyFor, type UpdateVessel, type VesselAction } from '../engine/vessel-reducer';

interface UsePipingActionsParams {
  updateVessel: UpdateVessel;
  dispatch: Dispatch<VesselAction>;
  /** Live nozzle array (addPipeline resolves array index → stable nozzle id). */
  nozzles: NozzleConfig[];
}

/**
 * Pipeline / pipe-segment entity CRUD. Bodies extracted verbatim from
 * VesselModeler.tsx (D1). `createDefaultSegment` is returned so the (still-inline)
 * nozzle-pipe drop handler can reuse the same stable factory it did before.
 */
export function usePipingActions({ updateVessel, dispatch, nozzles }: UsePipingActionsParams) {
  const createDefaultSegment = useCallback(
    (type: PipeSegmentType, pipeDiameter: number): PipeSegment => {
      const base: PipeSegment = { id: crypto.randomUUID(), type, rotation: 0 };
      switch (type) {
        case 'straight':
          return { ...base, length: pipeDiameter * 3 };
        case 'elbow':
          return { ...base, angle: 90, bendRadius: pipeDiameter * 1.5 };
        case 'reducer':
          return { ...base, length: pipeDiameter * 2, endDiameter: pipeDiameter * 0.75 };
        case 'flange':
          return { ...base, length: 25 };
        case 'cap':
          return { ...base, style: 'flat' };
        default:
          return { ...base, length: pipeDiameter * 3 };
      }
    },
    []
  );

  const addPipeline = useCallback(
    // `nozzleIndex` is the array index of the clicked nozzle in the sidebar list;
    // it is resolved to the nozzle's stable id at this boundary and never stored.
    (nozzleIndex: number, segmentType: PipeSegmentType) => {
      const nozzle = nozzles[nozzleIndex];
      if (!nozzle) return;
      const pipe = findClosestPipeSize(nozzle.size);
      const diameter = pipe.od;
      const newPipeline: Pipeline = {
        id: crypto.randomUUID(),
        nozzleId: nozzle.id,
        pipeDiameter: diameter,
        segments: [createDefaultSegment(segmentType, diameter)],
      };
      updateVessel((prev) => ({ ...prev, pipelines: [...prev.pipelines, newPipeline] }));
    },
    [nozzles, updateVessel, createDefaultSegment]
  );

  const addFreePipeline = useCallback(
    (pipeDiameter: number, segmentType: PipeSegmentType) => {
      const newPipeline: Pipeline = {
        id: crypto.randomUUID(),
        pipeDiameter,
        segments: [createDefaultSegment(segmentType, pipeDiameter)],
        freeOrigin: { position: [0, 0, 0], direction: [0, 1, 0] },
      };
      updateVessel((prev) => ({ ...prev, pipelines: [...prev.pipelines, newPipeline] }));
    },
    [updateVessel, createDefaultSegment]
  );

  const updateFreePipelineOrigin = useCallback(
    (pipelineId: string, updates: Partial<FreeOrigin>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          pipelines: prev.pipelines.map((p) => {
            if (p.id !== pipelineId || p.nozzleId) return p;
            const current = p.freeOrigin ?? {
              position: [0, 0, 0] as [number, number, number],
              direction: [0, 1, 0] as [number, number, number],
            };
            return { ...p, freeOrigin: { ...current, ...updates } };
          }),
        }),
        historyFor('freePipelineOrigin', pipelineId, updates)
      );
    },
    [updateVessel]
  );

  const addSegment = useCallback(
    (pipelineId: string, segmentType: PipeSegmentType) => {
      updateVessel((prev) => ({
        ...prev,
        pipelines: prev.pipelines.map((p) => {
          if (p.id !== pipelineId) return p;
          // Compute effective diameter (may have changed via reducer segments)
          let currentDiameter = p.pipeDiameter;
          for (const seg of p.segments) {
            if (seg.type === 'reducer' && seg.endDiameter) {
              currentDiameter = seg.endDiameter;
            }
          }
          return {
            ...p,
            segments: [...p.segments, createDefaultSegment(segmentType, currentDiameter)],
          };
        }),
      }));
    },
    [updateVessel, createDefaultSegment]
  );

  const updateSegment = useCallback(
    (pipelineId: string, segmentId: string, updates: Partial<PipeSegment>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          pipelines: prev.pipelines.map((p) =>
            p.id === pipelineId
              ? {
                  ...p,
                  segments: p.segments.map((s) => (s.id === segmentId ? { ...s, ...updates } : s)),
                }
              : p
          ),
        }),
        historyFor('pipeSegment', `${pipelineId}:${segmentId}`, updates)
      );
    },
    [updateVessel]
  );

  const removeSegment = useCallback(
    (pipelineId: string, segmentIndex: number) => {
      updateVessel((prev) => {
        const updated = prev.pipelines
          .map((p) => {
            if (p.id !== pipelineId) return p;
            return { ...p, segments: p.segments.slice(0, segmentIndex) };
          })
          .filter((p) => p.segments.length > 0);
        return { ...prev, pipelines: updated };
      });
      dispatch({ type: 'SELECT_PIPE_SEGMENT', pipelineId: '', segmentIndex: -1 });
    },
    [updateVessel, dispatch]
  );

  const removePipeline = useCallback(
    (pipelineId: string) => {
      updateVessel((prev) => ({
        ...prev,
        pipelines: prev.pipelines.filter((p) => p.id !== pipelineId),
      }));
      dispatch({ type: 'SELECT_PIPE_SEGMENT', pipelineId: '', segmentIndex: -1 });
    },
    [updateVessel, dispatch]
  );

  const selectPipeSegment = useCallback(
    (pipelineId: string, segmentIndex: number) => {
      dispatch({ type: 'SELECT_PIPE_SEGMENT', pipelineId, segmentIndex });
    },
    [dispatch]
  );

  return {
    createDefaultSegment,
    addPipeline,
    addFreePipeline,
    updateFreePipelineOrigin,
    addSegment,
    updateSegment,
    removeSegment,
    removePipeline,
    selectPipeSegment,
  };
}
