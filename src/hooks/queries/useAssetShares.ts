/**
 * useAssetShares - React Query hooks for asset sharing and access requests
 */

import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { Share, AccessRequest } from '../../services/admin-service';

/**
 * Query keys for sharing
 */
export const shareKeys = {
    all: ['admin', 'sharing'] as const,
    shares: () => [...shareKeys.all, 'shares'] as const,
    accessRequests: () => [...shareKeys.all, 'accessRequests'] as const,
};

/**
 * Fetch all active shares
 */
export function useAssetShares() {
    return useQuery({
        queryKey: shareKeys.shares(),
        queryFn: async (): Promise<Share[]> => {
            return await adminService.getShares();
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

/**
 * Fetch pending access requests
 * Short stale time since requests are time-sensitive
 */
export function useAccessRequests() {
    return useQuery({
        queryKey: shareKeys.accessRequests(),
        queryFn: async (): Promise<AccessRequest[]> => {
            return await adminService.getAccessRequests();
        },
        staleTime: 30 * 1000, // 30 seconds - requests are time-sensitive
    });
}
