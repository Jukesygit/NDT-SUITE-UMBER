/**
 * Request mutation hooks - Account requests and permission requests
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { ServiceResult } from '../../services/admin-service';

/**
 * Hook for approving an account request
 */
export function useApproveAccountRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<ServiceResult> => {
            return adminService.approveAccountRequest(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'accountRequests'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}

/**
 * Hook for rejecting an account request
 */
export function useRejectAccountRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            reason,
        }: {
            id: string;
            reason?: string;
        }): Promise<ServiceResult> => {
            return adminService.rejectAccountRequest(id, reason);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'accountRequests'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        },
    });
}

/**
 * Hook for approving a permission request
 */
export function useApprovePermissionRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<ServiceResult> => {
            return adminService.approvePermissionRequest(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'permissionRequests'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        },
    });
}

/**
 * Hook for rejecting a permission request
 */
export function useRejectPermissionRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            reason,
        }: {
            id: string;
            reason?: string;
        }): Promise<ServiceResult> => {
            return adminService.rejectPermissionRequest(id, reason);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'permissionRequests'] });
        },
    });
}
