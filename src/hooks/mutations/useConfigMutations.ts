/**
 * Configuration mutation hooks - Manage admin configuration lists
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { ServiceResult } from '../../services/admin-service';

/**
 * Hook for adding an item to a configuration list
 */
export function useAddConfigItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            listName,
            item,
        }: {
            listName: string;
            item: string;
        }): Promise<ServiceResult> => {
            return adminService.addConfigItem(listName, item);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}

/**
 * Hook for updating an item in a configuration list
 */
export function useUpdateConfigItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            listName,
            oldItem,
            newItem,
        }: {
            listName: string;
            oldItem: string;
            newItem: string;
        }): Promise<ServiceResult> => {
            return adminService.updateConfigItem(listName, oldItem, newItem);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}

/**
 * Hook for removing an item from a configuration list
 */
export function useRemoveConfigItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            listName,
            item,
        }: {
            listName: string;
            item: string;
        }): Promise<ServiceResult> => {
            return adminService.removeConfigItem(listName, item);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}

/**
 * Hook for resetting a configuration list to defaults
 */
export function useResetConfigList() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (listName: string): Promise<ServiceResult> => {
            return adminService.resetConfigList(listName);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}

/**
 * Hook for resetting all configuration lists to defaults
 */
export function useResetAllConfig() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (): Promise<ServiceResult> => {
            return adminService.resetAllConfig();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}

/**
 * Hook for importing configuration from JSON
 */
export function useImportConfig() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (jsonString: string): Promise<ServiceResult> => {
            return adminService.importConfig(jsonString);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
        },
    });
}
