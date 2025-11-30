// React Query mutations for Assets - Data Hub
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assetService } from '../../services/asset-service.js';
import { assetKeys } from '../queries/useAssets.js';
import { vesselKeys } from '../queries/useVessels.js';
import { scanKeys } from '../queries/useScans.js';

/**
 * Create a new asset
 */
export function useCreateAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (name) => assetService.createAsset(name),
        onSuccess: () => {
            // Invalidate asset list to refetch
            queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
        },
    });
}

/**
 * Update an asset
 */
export function useUpdateAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ assetId, updates }) => assetService.updateAsset(assetId, updates),
        onSuccess: (data, { assetId }) => {
            // Update the specific asset in cache
            queryClient.setQueryData(assetKeys.detail(assetId), data);
            // Invalidate the list to reflect changes
            queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
        },
    });
}

/**
 * Delete an asset
 */
export function useDeleteAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (assetId) => assetService.deleteAsset(assetId),
        onSuccess: (_, assetId) => {
            // Remove from cache
            queryClient.removeQueries({ queryKey: assetKeys.detail(assetId) });
            queryClient.removeQueries({ queryKey: assetKeys.stats(assetId) });
            // Invalidate list
            queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
        },
    });
}

/**
 * Create a new vessel
 */
export function useCreateVessel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ assetId, name }) => assetService.createVessel(assetId, name),
        onSuccess: (_, { assetId }) => {
            // Invalidate vessel list for this asset
            queryClient.invalidateQueries({ queryKey: vesselKeys.list(assetId) });
            // Invalidate asset stats (vessel count changed)
            queryClient.invalidateQueries({ queryKey: assetKeys.stats(assetId) });
        },
    });
}

/**
 * Update a vessel
 */
export function useUpdateVessel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ vesselId, updates }) => assetService.updateVessel(vesselId, updates),
        onSuccess: (data, { vesselId }) => {
            // Update the specific vessel in cache
            queryClient.setQueryData(vesselKeys.detail(vesselId), data);
            // Invalidate lists that might contain this vessel
            queryClient.invalidateQueries({ queryKey: vesselKeys.lists() });
        },
    });
}

/**
 * Delete a vessel
 */
export function useDeleteVessel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ vesselId, assetId }) => assetService.deleteVessel(vesselId),
        onSuccess: (_, { vesselId, assetId }) => {
            // Remove from cache
            queryClient.removeQueries({ queryKey: vesselKeys.detail(vesselId) });
            queryClient.removeQueries({ queryKey: vesselKeys.images(vesselId) });
            queryClient.removeQueries({ queryKey: vesselKeys.strakes(vesselId) });
            queryClient.removeQueries({ queryKey: scanKeys.list(vesselId) });
            // Invalidate list
            queryClient.invalidateQueries({ queryKey: vesselKeys.list(assetId) });
            // Invalidate asset stats
            queryClient.invalidateQueries({ queryKey: assetKeys.stats(assetId) });
        },
    });
}
