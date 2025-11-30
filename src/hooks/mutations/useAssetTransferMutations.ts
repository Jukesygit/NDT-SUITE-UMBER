/**
 * Asset transfer mutation hooks - Transfer assets between organizations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { ServiceResult } from '../../services/admin-service';

/**
 * Hook for transferring a single asset to another organization
 */
export function useTransferAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            assetId,
            targetOrgId,
        }: {
            assetId: string;
            targetOrgId: string;
        }): Promise<ServiceResult> => {
            return adminService.transferAsset(assetId, targetOrgId);
        },
        onSuccess: () => {
            // Invalidate admin caches
            queryClient.invalidateQueries({ queryKey: ['admin', 'assets'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
            // Invalidate all Data Hub asset caches (source and target orgs)
            queryClient.invalidateQueries({ queryKey: ['dataHub', 'assets'] });
            // Invalidate general asset list
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });
}

/**
 * Hook for bulk transferring multiple assets to another organization
 */
export function useBulkTransferAssets() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            assetIds,
            targetOrgId,
        }: {
            assetIds: string[];
            targetOrgId: string;
        }): Promise<ServiceResult> => {
            return adminService.bulkTransferAssets(assetIds, targetOrgId);
        },
        onSuccess: () => {
            // Invalidate admin caches
            queryClient.invalidateQueries({ queryKey: ['admin', 'assets'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
            // Invalidate all Data Hub asset caches (source and target orgs)
            queryClient.invalidateQueries({ queryKey: ['dataHub', 'assets'] });
            // Invalidate general asset list
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });
}

/**
 * Hook for creating an asset for a specific organization (admin only)
 */
export function useAdminCreateAsset() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            orgId,
            name,
        }: {
            orgId: string;
            name: string;
        }): Promise<ServiceResult> => {
            return adminService.createAssetForOrg(orgId, name);
        },
        onSuccess: (_, variables) => {
            // Invalidate admin caches
            queryClient.invalidateQueries({ queryKey: ['admin', 'assets'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
            // Invalidate Data Hub caches for this org
            queryClient.invalidateQueries({ queryKey: ['dataHub', 'assets', variables.orgId] });
            // Invalidate general asset list
            queryClient.invalidateQueries({ queryKey: ['assets'] });
        },
    });
}
