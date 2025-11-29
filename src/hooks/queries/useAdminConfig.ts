/**
 * useAdminConfig - React Query hook for admin configuration lists
 */

import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { ConfigMetadata } from '../../services/admin-service';

/**
 * Query keys for config
 */
export const configKeys = {
    all: ['admin', 'config'] as const,
    lists: () => [...configKeys.all, 'lists'] as const,
    metadata: () => [...configKeys.all, 'metadata'] as const,
};

/**
 * Fetch all configuration lists
 * Longer stale time since config changes rarely
 */
export function useAdminConfig() {
    return useQuery({
        queryKey: configKeys.lists(),
        queryFn: async (): Promise<Record<string, string[]>> => {
            return await adminService.getConfig();
        },
        staleTime: 10 * 60 * 1000, // 10 minutes - config changes rarely
    });
}

/**
 * Get configuration metadata (sync function)
 * This doesn't need to be a hook since metadata is static
 */
export function useConfigMetadata(): ConfigMetadata {
    return adminService.getConfigMetadata();
}
