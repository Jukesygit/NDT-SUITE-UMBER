/**
 * Vessel model mutation hooks - Save, Update, Delete models and placements
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveVesselModel,
  updateVesselModel,
  deleteVesselModel,
  saveScanPlacement,
  deleteScanPlacement,
} from '../../services/vessel-model-service';
import type {
  SaveVesselModelParams,
  SaveScanPlacementParams,
} from '../../services/vessel-model-service';

/**
 * Hook for saving a new vessel model
 */
export function useSaveVesselModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: SaveVesselModelParams) => saveVesselModel(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vesselModels'] });
      queryClient.invalidateQueries({ queryKey: ['linkedVesselModel'] });
      queryClient.invalidateQueries({ queryKey: ['vesselModelForReport'] });
    },
  });
}

/**
 * Hook for updating an existing vessel model's config
 */
export function useUpdateVesselModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      config,
      name,
    }: {
      id: string;
      config: Record<string, unknown>;
      name?: string;
    }) => updateVesselModel(id, config, name),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vesselModels', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['vesselModels'] });
      // The scope-planning surfaces (planning strip, coverage-scope panel,
      // report page) read the model through these separate key families;
      // without invalidating them an Update in the modeler leaves them
      // serving the pre-save config for up to their 5-min staleTime.
      queryClient.invalidateQueries({ queryKey: ['linkedVesselModel'] });
      queryClient.invalidateQueries({ queryKey: ['vesselModelForReport'] });
    },
  });
}

export interface CreateBlankLinkedModelParams {
  projectVesselId: string;
  organizationId: string;
  userId: string;
  /** Model name; defaults to the vessel's own name at the call site. */
  name: string;
}

/**
 * Create a blank default-geometry model already linked to a project vessel — the
 * "Plan scope" entry point for a vessel that has no model yet
 * (docs/plans/2026-08-17-coverage-comparison-design.md, Surfaces §3). The insert
 * carries `project_vessel_id`, so creation and linking are one round trip.
 *
 * The serializer is imported dynamically: its transitive graph reaches three.js,
 * and this hook is used from the projects pages, which must not carry the 3D
 * engine in their chunk. Returns the new model id so the caller can navigate
 * straight to it.
 */
export function useCreateBlankLinkedVesselModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateBlankLinkedModelParams): Promise<string> => {
      const [{ serializeVesselState }, { DEFAULT_VESSEL_STATE }] = await Promise.all([
        import('../../components/VesselModeler/engine/vessel-serialization'),
        import('../../components/VesselModeler/types'),
      ]);
      const config = serializeVesselState(DEFAULT_VESSEL_STATE, {
        path: 'cloud',
        modelType: 'blank',
      });
      return saveVesselModel({
        name: params.name,
        organizationId: params.organizationId,
        userId: params.userId,
        config,
        projectVesselId: params.projectVesselId,
        modelType: 'blank',
      });
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vesselModels'] });
      queryClient.invalidateQueries({ queryKey: ['projectVesselModels'] });
      queryClient.invalidateQueries({
        queryKey: ['linkedVesselModel', variables.projectVesselId],
      });
      queryClient.invalidateQueries({
        queryKey: ['vesselModelForReport', variables.projectVesselId],
      });
    },
  });
}

/**
 * Hook for deleting a vessel model
 */
export function useDeleteVesselModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteVesselModel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vesselModels'] });
      queryClient.invalidateQueries({ queryKey: ['projectVesselModels'] });
      queryClient.invalidateQueries({ queryKey: ['linkedVesselModel'] });
      queryClient.invalidateQueries({ queryKey: ['vesselModelForReport'] });
    },
  });
}

/**
 * Hook for saving a new scan placement on a vessel model
 */
export function useSaveScanPlacement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: SaveScanPlacementParams) => saveScanPlacement(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['vesselModels', variables.vesselModelId, 'placements'],
      });
    },
  });
}

/**
 * Hook for deleting a scan placement from a vessel model
 */
export function useDeleteScanPlacement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; vesselModelId: string }) => deleteScanPlacement(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['vesselModels', variables.vesselModelId, 'placements'],
      });
    },
  });
}
