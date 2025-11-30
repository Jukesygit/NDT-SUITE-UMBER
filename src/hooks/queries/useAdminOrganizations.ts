/**
 * useAdminOrganizations - React Query hooks for organization management
 */

import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { Organization } from '../../types/database.types';
import type { OrganizationStats } from '../../services/admin-service';

/**
 * Query keys for organizations
 */
export const organizationKeys = {
    all: ['admin', 'organizations'] as const,
    list: () => [...organizationKeys.all, 'list'] as const,
    withStats: () => [...organizationKeys.all, 'withStats'] as const,
};

/**
 * Fetch all organizations (excluding SYSTEM)
 */
export function useOrganizations() {
    return useQuery({
        queryKey: organizationKeys.list(),
        queryFn: async (): Promise<Organization[]> => {
            return await adminService.getOrganizations();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Fetch organizations with statistics
 */
export function useOrganizationsWithStats() {
    return useQuery({
        queryKey: organizationKeys.withStats(),
        queryFn: async (): Promise<OrganizationStats[]> => {
            return await adminService.getOrganizationsWithStats();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
