/**
 * Competency mutation hooks - Create, Update, Delete competencies
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

// ES module import
import competencyService from '../../services/competency-service.js';

interface CompetencyData {
    competency_id: string;
    issuing_body?: string;
    certification_id?: string;
    issued_date?: string;
    expiry_date?: string;
    document_url?: string;
    document_name?: string;
    notes?: string;
    field_value?: string;
}

interface CreateCompetencyParams {
    userId: string;
    data: CompetencyData;
}

interface UpdateCompetencyParams {
    competencyId: string;
    userId: string;
    data: Partial<CompetencyData>;
}

interface DeleteCompetencyParams {
    competencyId: string;
    userId: string;
}

/**
 * Hook for creating a new competency/certification
 */
export function useCreateCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, data }: CreateCompetencyParams) => {
            return competencyService.upsertCompetency(userId, data.competency_id, {
                value: data.field_value,
                expiryDate: data.expiry_date,
                documentUrl: data.document_url,
                documentName: data.document_name,
                notes: data.notes,
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['competencies', variables.userId] });
            queryClient.invalidateQueries({ queryKey: ['expiring-competencies', variables.userId] });
        },
    });
}

/**
 * Hook for updating an existing competency
 */
export function useUpdateCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ competencyId, userId, data }: UpdateCompetencyParams) => {
            return competencyService.upsertCompetency(userId, competencyId, {
                value: data.field_value,
                expiryDate: data.expiry_date,
                documentUrl: data.document_url,
                documentName: data.document_name,
                notes: data.notes,
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['competencies', variables.userId] });
            queryClient.invalidateQueries({ queryKey: ['expiring-competencies', variables.userId] });
        },
    });
}

/**
 * Hook for deleting a competency
 */
export function useDeleteCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ competencyId }: DeleteCompetencyParams) => {
            return competencyService.deleteCompetency(competencyId);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['competencies', variables.userId] });
            queryClient.invalidateQueries({ queryKey: ['expiring-competencies', variables.userId] });
        },
    });
}

/**
 * Hook for uploading a competency document
 */
export function useUploadCompetencyDocument() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            userId,
            competencyName,
            file,
        }: {
            userId: string;
            competencyName: string;
            file: File;
        }) => {
            return competencyService.uploadDocument(file, userId, competencyName);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['competencies', variables.userId] });
        },
    });
}

/**
 * Hook for approving a competency document
 */
export function useApproveCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ competencyId }: { competencyId: string }) => {
            return competencyService.verifyCompetency(competencyId, true);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencies', 'pendingApprovals'] });
            queryClient.invalidateQueries({ queryKey: ['competencies'] });
            queryClient.invalidateQueries({ queryKey: ['personnel'] });
        },
    });
}

/**
 * Hook for rejecting a competency document
 */
export function useRejectCompetency() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ competencyId, reason }: { competencyId: string; reason: string }) => {
            return competencyService.verifyCompetency(competencyId, false, reason);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencies', 'pendingApprovals'] });
            queryClient.invalidateQueries({ queryKey: ['competencies'] });
            queryClient.invalidateQueries({ queryKey: ['personnel'] });
        },
    });
}

/**
 * Hook for requesting changes to a competency document
 */
export function useRequestChanges() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ competencyId, comment }: { competencyId: string; comment: string }) => {
            return competencyService.requestChanges(competencyId, comment);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['competencies', 'pendingApprovals'] });
            queryClient.invalidateQueries({ queryKey: ['competencies'] });
            queryClient.invalidateQueries({ queryKey: ['personnel'] });
        },
    });
}

export default {
    useCreateCompetency,
    useUpdateCompetency,
    useDeleteCompetency,
    useUploadCompetencyDocument,
    useApproveCompetency,
    useRejectCompetency,
    useRequestChanges,
};
