/**
 * Competency Definition & Category mutation hooks - Admin CRUD operations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
// @ts-ignore - JS service module
import competencyService from '../../services/competency-service.js';

// Types
export interface CategoryData {
    name: string;
    description?: string;
}

export interface CategoryUpdateData {
    name?: string;
    description?: string;
    is_active?: boolean;
}

export interface DefinitionData {
    name: string;
    description?: string;
    category_id: string;
    field_type: 'text' | 'date' | 'expiry_date' | 'boolean' | 'file' | 'number';
    requires_document?: boolean;
    requires_approval?: boolean;
}

export interface DefinitionUpdateData {
    name?: string;
    description?: string;
    category_id?: string;
    field_type?: 'text' | 'date' | 'expiry_date' | 'boolean' | 'file' | 'number';
    requires_document?: boolean;
    requires_approval?: boolean;
    is_active?: boolean;
}

// ============================================================
// Category Mutations
// ============================================================

/**
 * Hook for creating a new competency category
 */
export function useCreateCategory() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CategoryData) => {
            return competencyService.createCategory(data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencyCategories'] });
            queryClient.invalidateQueries({ queryKey: ['competencyDefinitions'] });
        },
    });
}

/**
 * Hook for updating a competency category
 */
export function useUpdateCategory() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: CategoryUpdateData }) => {
            return competencyService.updateCategory(id, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencyCategories'] });
            queryClient.invalidateQueries({ queryKey: ['competencyDefinitions'] });
        },
    });
}

/**
 * Hook for deleting (deactivating) a competency category
 */
export function useDeleteCategory() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, hardDelete = false }: { id: string; hardDelete?: boolean }) => {
            return competencyService.deleteCategory(id, hardDelete);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencyCategories'] });
            queryClient.invalidateQueries({ queryKey: ['competencyDefinitions'] });
        },
    });
}

/**
 * Hook for reordering categories
 */
export function useReorderCategories() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (orderedIds: string[]) => {
            return competencyService.reorderCategories(orderedIds);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencyCategories'] });
        },
    });
}

// ============================================================
// Definition Mutations
// ============================================================

/**
 * Hook for creating a new competency definition
 */
export function useCreateDefinition() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: DefinitionData) => {
            return competencyService.createDefinition(data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencyDefinitions'] });
        },
    });
}

/**
 * Hook for updating a competency definition
 */
export function useUpdateDefinition() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: DefinitionUpdateData }) => {
            return competencyService.updateDefinition(id, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencyDefinitions'] });
            // Also invalidate user competencies in case field_type changed
            queryClient.invalidateQueries({ queryKey: ['competencies'] });
        },
    });
}

/**
 * Hook for deleting (deactivating) a competency definition
 */
export function useDeleteDefinition() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, hardDelete = false }: { id: string; hardDelete?: boolean }) => {
            return competencyService.deleteDefinition(id, hardDelete);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencyDefinitions'] });
            queryClient.invalidateQueries({ queryKey: ['competencies'] });
        },
    });
}

/**
 * Hook for reordering definitions within a category
 */
export function useReorderDefinitions() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ categoryId, orderedIds }: { categoryId: string; orderedIds: string[] }) => {
            return competencyService.reorderDefinitions(categoryId, orderedIds);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencyDefinitions'] });
        },
    });
}
