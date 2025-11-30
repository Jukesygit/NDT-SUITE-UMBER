// React Query hooks for Scans - Data Hub
import { useQuery } from '@tanstack/react-query';
import { assetService } from '../../services/asset-service.js';

/**
 * Query keys for scans - enables proper cache invalidation
 */
export const scanKeys = {
    all: ['scans'],
    lists: () => [...scanKeys.all, 'list'],
    list: (vesselId) => [...scanKeys.lists(), { vesselId }],
    details: () => [...scanKeys.all, 'detail'],
    detail: (id) => [...scanKeys.details(), id],
};

/**
 * Fetch scans for a specific vessel
 * Only fetched when user clicks on a vessel (lazy loading)
 * Returns metadata + thumbnail, NOT full scan data
 */
export function useScans(vesselId) {
    return useQuery({
        queryKey: scanKeys.list(vesselId),
        queryFn: () => assetService.getScans(vesselId),
        enabled: !!vesselId, // Only fetch when vesselId is provided
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Fetch full scan data by ID
 * Only fetched when user opens a scan for viewing
 * Contains the full data payload needed for visualization
 */
export function useScan(scanId) {
    return useQuery({
        queryKey: scanKeys.detail(scanId),
        queryFn: () => assetService.getScan(scanId),
        enabled: !!scanId,
        staleTime: 10 * 60 * 1000, // 10 minutes - scan data doesn't change often
    });
}
