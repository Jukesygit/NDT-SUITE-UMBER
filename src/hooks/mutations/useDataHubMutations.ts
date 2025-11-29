/**
 * useDataHubMutations - React Query mutations for Data Hub
 * Handles asset and vessel CRUD operations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assetService } from '../../services/asset-service.js';
import { dataHubKeys } from '../queries/useDataHub';

// ============================================================================
// Asset Mutations
// ============================================================================

/**
 * Create a new asset
 */
export function useCreateAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ name, organizationId }: { name: string; organizationId: string }) => {
            // Pass organizationId to service so admins can create assets in any org
            return await assetService.createAsset(name, organizationId);
        },
        onSuccess: (_, variables) => {
            // Invalidate assets list for this organization
            queryClient.invalidateQueries({
                queryKey: dataHubKeys.assets(variables.organizationId)
            });
        },
    });
}

/**
 * Update an asset
 */
export function useUpdateAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ assetId, name }: { assetId: string; name: string }) => {
            return await assetService.updateAsset(assetId, { name });
        },
        onSuccess: () => {
            // Invalidate all Data Hub queries since asset name might appear in multiple places
            queryClient.invalidateQueries({ queryKey: dataHubKeys.all });
        },
    });
}

/**
 * Delete an asset
 */
export function useDeleteAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ assetId }: { assetId: string; organizationId: string }) => {
            return await assetService.deleteAsset(assetId);
        },
        onSuccess: (_, variables) => {
            // Invalidate assets list for this organization
            queryClient.invalidateQueries({
                queryKey: dataHubKeys.assets(variables.organizationId)
            });
        },
    });
}

// ============================================================================
// Vessel Mutations
// ============================================================================

/**
 * Create a new vessel
 */
export function useCreateVessel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ assetId, name }: { assetId: string; name: string }) => {
            return await assetService.createVessel(assetId, name);
        },
        onSuccess: (_, variables) => {
            // Invalidate vessels list for this asset
            queryClient.invalidateQueries({
                queryKey: dataHubKeys.vessels(variables.assetId)
            });
            // Also invalidate assets to update vessel counts
            queryClient.invalidateQueries({
                queryKey: dataHubKeys.all
            });
        },
    });
}

/**
 * Update a vessel
 */
export function useUpdateVessel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ vesselId, name }: { vesselId: string; name: string }) => {
            return await assetService.updateVessel(vesselId, { name });
        },
        onSuccess: () => {
            // Invalidate all Data Hub queries since vessel name might appear in multiple places
            queryClient.invalidateQueries({ queryKey: dataHubKeys.all });
        },
    });
}

/**
 * Delete a vessel
 */
export function useDeleteVessel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ vesselId }: { vesselId: string; assetId: string }) => {
            return await assetService.deleteVessel(vesselId);
        },
        onSuccess: (_, variables) => {
            // Invalidate vessels list for this asset
            queryClient.invalidateQueries({
                queryKey: dataHubKeys.vessels(variables.assetId)
            });
            // Also invalidate assets to update vessel counts
            queryClient.invalidateQueries({
                queryKey: dataHubKeys.all
            });
        },
    });
}
