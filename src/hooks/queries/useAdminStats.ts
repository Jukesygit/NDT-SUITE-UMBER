/**
 * useAdminStats - React Query hook for admin dashboard statistics
 */

import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { AdminDashboardStats } from '../../services/admin-service';

/**
 * Fetch admin dashboard statistics
 */
export function useAdminStats() {
    return useQuery({
        queryKey: ['admin', 'stats'],
        queryFn: async (): Promise<AdminDashboardStats> => {
            return await adminService.getDashboardStats();
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}
