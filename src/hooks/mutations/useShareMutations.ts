/**
 * Share mutation hooks - Create, Update, Delete shares and access requests
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { Share, ServiceResult } from '../../services/admin-service';

/**
 * Hook for creating a new share
 */
export function useCreateShare() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            assetId: string;
            vesselId?: string;
            scanId?: string;
            sharedWithOrganizationId: string;
            permission: 'view' | 'edit';
        }): Promise<ServiceResult<Share>> => {
            return adminService.createShare(data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'shares'] });
        },
    });
}

/**
 * Hook for updating share permissions
 */
export function useUpdateShare() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            permission,
        }: {
            id: string;
            permission: 'view' | 'edit';
        }): Promise<ServiceResult<Share>> => {
            return adminService.updateShare(id, permission);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'shares'] });
        },
    });
}

/**
 * Hook for deleting a share
 */
export function useDeleteShare() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<ServiceResult> => {
            return adminService.deleteShare(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'shares'] });
        },
    });
}

/**
 * Hook for approving an access request
 */
export function useApproveAccessRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<ServiceResult> => {
            return adminService.approveAccessRequest(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'accessRequests'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'shares'] });
        },
    });
}

/**
 * Hook for rejecting an access request
 */
export function useRejectAccessRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            reason,
        }: {
            id: string;
            reason?: string;
        }): Promise<ServiceResult> => {
            return adminService.rejectAccessRequest(id, reason);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'accessRequests'] });
        },
    });
}
