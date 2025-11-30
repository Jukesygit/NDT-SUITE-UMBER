/**
 * Organization mutation hooks - Create, Update, Delete organizations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { ServiceResult } from '../../services/admin-service';
import type { Organization } from '../../types/database.types';

/**
 * Hook for creating a new organization
 */
export function useCreateOrganization() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (name: string): Promise<ServiceResult<Organization>> => {
            return adminService.createOrganization(name);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}

/**
 * Hook for updating an organization
 */
export function useUpdateOrganization() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            name,
        }: {
            id: string;
            name: string;
        }): Promise<ServiceResult<Organization>> => {
            return adminService.updateOrganization(id, { name });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}

/**
 * Hook for deleting an organization
 */
export function useDeleteOrganization() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<ServiceResult> => {
            return adminService.deleteOrganization(id);
        },
        onSuccess: () => {
            // Invalidate all admin queries since deleting org affects many things
            queryClient.invalidateQueries({ queryKey: ['admin'] });
        },
    });
}
