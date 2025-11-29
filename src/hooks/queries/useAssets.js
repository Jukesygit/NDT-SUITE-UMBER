// React Query hooks for Assets - Data Hub
import { useQuery } from '@tanstack/react-query';
import { assetService } from '../../services/asset-service.js';

/**
 * Query keys for assets - enables proper cache invalidation
 */
export const assetKeys = {
    all: ['assets'],
    lists: () => [...assetKeys.all, 'list'],
    list: () => [...assetKeys.lists()],
    details: () => [...assetKeys.all, 'detail'],
    detail: (id) => [...assetKeys.details(), id],
    stats: (id) => [...assetKeys.all, 'stats', id],
};

/**
 * Fetch all assets for the current organization
 * This is the initial load - just asset metadata, no nested data
 */
export function useAssets() {
    return useQuery({
        queryKey: assetKeys.list(),
        queryFn: () => assetService.getAssets(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Fetch a single asset by ID
 */
export function useAsset(assetId) {
    return useQuery({
        queryKey: assetKeys.detail(assetId),
        queryFn: () => assetService.getAsset(assetId),
        enabled: !!assetId,
    });
}

/**
 * Fetch asset statistics (vessel count, scan count)
 */
export function useAssetStats(assetId) {
    return useQuery({
        queryKey: assetKeys.stats(assetId),
        queryFn: () => assetService.getAssetStats(assetId),
        enabled: !!assetId,
        staleTime: 2 * 60 * 1000, // 2 minutes - stats can be slightly stale
    });
}
