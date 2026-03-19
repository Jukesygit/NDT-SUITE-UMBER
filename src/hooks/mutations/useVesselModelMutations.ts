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
        },
    });
}

/**
 * Hook for updating an existing vessel model's config
 */
export function useUpdateVesselModel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, config }: { id: string; config: Record<string, unknown> }) =>
            updateVesselModel(id, config),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['vesselModels', variables.id] });
            queryClient.invalidateQueries({ queryKey: ['vesselModels'] });
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
        mutationFn: ({ id }: { id: string; vesselModelId: string }) =>
            deleteScanPlacement(id),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['vesselModels', variables.vesselModelId, 'placements'],
            });
        },
    });
}
