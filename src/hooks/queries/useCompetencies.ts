import { useQuery } from '@tanstack/react-query';
import competencyService from '../../services/competency-service.js';

// Types - these match the database schema
export interface CompetencyCategory {
    id: string;
    name: string;
    description: string | null;
    display_order: number;
    is_active: boolean;
}

export interface CompetencyDefinition {
    id: string;
    name: string;
    description: string | null;
    field_type: 'text' | 'date' | 'expiry_date' | 'boolean' | 'file' | 'number';
    category_id: string;
    category?: CompetencyCategory;
    display_order: number;
    is_active: boolean;
}

export interface EmployeeCompetency {
    id: string;
    user_id: string;
    competency_id: string;
    competency?: CompetencyDefinition;
    value: string | null;
    expiry_date: string | null;
    document_url: string | null;
    document_name: string | null;
    notes: string | null;
    status: string;
    witness_checked: boolean;
    witnessed_by: string | null;
    witnessed_at: string | null;
    witness_notes: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * React Query hook for fetching user competencies
 *
 * @example
 * const { data: competencies, isLoading, error } = useCompetencies(userId);
 */
export function useCompetencies(userId: string | undefined) {
    return useQuery({
        queryKey: ['competencies', userId],
        queryFn: () => competencyService.getUserCompetencies(userId!),
        enabled: !!userId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * React Query hook for fetching competencies grouped by category
 */
export function useCompetenciesByCategory(userId: string | undefined) {
    return useQuery({
        queryKey: ['competencies', 'byCategory', userId],
        queryFn: () => competencyService.getUserCompetenciesByCategory(userId!),
        enabled: !!userId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * React Query hook for fetching competency definitions
 */
export function useCompetencyDefinitions(categoryId?: string) {
    return useQuery({
        queryKey: ['competencyDefinitions', categoryId],
        queryFn: () => competencyService.getCompetencyDefinitions(categoryId),
        staleTime: 30 * 60 * 1000, // 30 minutes - definitions change rarely
    });
}

/**
 * React Query hook for fetching competency categories
 */
export function useCompetencyCategories() {
    return useQuery({
        queryKey: ['competencyCategories'],
        queryFn: () => competencyService.getCategories(),
        staleTime: 30 * 60 * 1000, // 30 minutes - categories change rarely
    });
}

/**
 * React Query hook for fetching expiring competencies
 */
export function useExpiringCompetencies(daysThreshold: number = 30, includeComments: boolean = false) {
    return useQuery({
        queryKey: ['competencies', 'expiring', daysThreshold, includeComments],
        queryFn: () => competencyService.getExpiringCompetencies(daysThreshold, includeComments),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * React Query hook for fetching competency comments
 */
export function useCompetencyComments(employeeCompetencyId: string | undefined) {
    return useQuery({
        queryKey: ['competencyComments', employeeCompetencyId],
        queryFn: () => competencyService.getCompetencyComments(employeeCompetencyId!),
        enabled: !!employeeCompetencyId,
        staleTime: 2 * 60 * 1000, // 2 minutes - comments may change more frequently
    });
}

/**
 * Pending approval item with user and competency details
 */
export interface PendingApproval {
    id: string;
    user_id: string;
    competency_id: string;
    value: string | null;
    expiry_date: string | null;
    document_url: string | null;
    document_name: string | null;
    notes: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    issuing_body?: string;
    certification_id?: string;
    competency: {
        id: string;
        name: string;
        description: string | null;
        field_type: string;
        category: {
            id: string;
            name: string;
        } | null;
    } | null;
    user: {
        id: string;
        username: string | null;
        email: string | null;
        avatar_url: string | null;
        organization_id: string | null;
        organizations: {
            id: string;
            name: string;
        } | null;
    } | null;
}

/**
 * React Query hook for fetching pending document approvals
 * Used by admins to review competency documents awaiting approval
 */
export function usePendingApprovals() {
    return useQuery<PendingApproval[]>({
        queryKey: ['competencies', 'pendingApprovals'],
        queryFn: () => competencyService.getPendingApprovals(),
        staleTime: 2 * 60 * 1000, // 2 minutes - approvals may change frequently
    });
}
