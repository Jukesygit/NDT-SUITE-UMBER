/**
 * useAccountRequests - React Query hooks for account and permission requests
 */

import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { AccountRequest, PermissionRequest } from '../../services/admin-service';

/**
 * Query keys for requests
 */
export const requestKeys = {
    all: ['admin', 'requests'] as const,
    accountRequests: () => [...requestKeys.all, 'accountRequests'] as const,
    permissionRequests: () => [...requestKeys.all, 'permissionRequests'] as const,
};

/**
 * Fetch pending account requests
 * Short stale time since requests are time-sensitive
 */
export function useAccountRequests() {
    return useQuery({
        queryKey: requestKeys.accountRequests(),
        queryFn: async (): Promise<AccountRequest[]> => {
            return await adminService.getAccountRequests();
        },
        staleTime: 30 * 1000, // 30 seconds - requests are time-sensitive
    });
}

/**
 * Fetch pending permission requests
 * Short stale time since requests are time-sensitive
 */
export function usePermissionRequests() {
    return useQuery({
        queryKey: requestKeys.permissionRequests(),
        queryFn: async (): Promise<PermissionRequest[]> => {
            return await adminService.getPermissionRequests();
        },
        staleTime: 30 * 1000, // 30 seconds - requests are time-sensitive
    });
}
