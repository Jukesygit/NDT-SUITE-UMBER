/**
 * useAdminAssets - React Query hook for assets management
 */

import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';

/**
 * Query keys for assets
 */
export const assetKeys = {
    all: ['admin', 'assets'] as const,
    list: () => [...assetKeys.all, 'list'] as const,
};

/**
 * Fetch all assets across organizations
 */
export function useAdminAssets() {
    return useQuery({
        queryKey: assetKeys.list(),
        queryFn: async () => {
            return await adminService.getAssets();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
