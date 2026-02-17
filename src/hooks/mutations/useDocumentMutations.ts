/**
 * Document Control mutation hooks
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import documentControlService from '../../services/document-control-service.ts';
import { documentKeys } from '../queries/useDocuments';
import type { CreateDocumentData, UpdateDocumentData } from '../../types/document-control';

// ============================================================================
// Document Mutations
// ============================================================================

export function useCreateDocument() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateDocumentData) => documentControlService.createDocument(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
            queryClient.invalidateQueries({ queryKey: documentKeys.stats() });
        },
    });
}

export function useUpdateDocument() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: UpdateDocumentData }) =>
            documentControlService.updateDocument(id, updates),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
            queryClient.invalidateQueries({ queryKey: documentKeys.detail(variables.id) });
            queryClient.invalidateQueries({ queryKey: documentKeys.stats() });
        },
    });
}

export function useWithdrawDocument() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => documentControlService.withdrawDocument(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
            queryClient.invalidateQueries({ queryKey: documentKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: documentKeys.stats() });
        },
    });
}

// ============================================================================
// Revision Mutations
// ============================================================================

export function useCreateRevision() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            documentId,
            file,
            changeSummary,
        }: {
            documentId: string;
            file: File;
            changeSummary?: string;
        }) => {
            // Get next revision number first
            const revisions = await documentControlService.getRevisions(documentId);
            const nextRev = (revisions[0]?.revision_number ?? 0) + 1;

            // Upload file
            const uploaded = await documentControlService.uploadDocumentFile(file, documentId, nextRev);

            // Create revision record
            return documentControlService.createRevision(
                documentId,
                uploaded.path,
                uploaded.name,
                file.size,
                file.type,
                changeSummary
            );
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: documentKeys.revisions(data.document_id) });
            queryClient.invalidateQueries({ queryKey: documentKeys.detail(data.document_id) });
            queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
            queryClient.invalidateQueries({ queryKey: documentKeys.stats() });
        },
    });
}

export function useSubmitForReview() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (revisionId: string) => documentControlService.submitForReview(revisionId),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: documentKeys.revisions(data.document_id) });
            queryClient.invalidateQueries({ queryKey: documentKeys.detail(data.document_id) });
            queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
            queryClient.invalidateQueries({ queryKey: documentKeys.stats() });
        },
    });
}

export function useApproveRevision() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ revisionId, comments }: { revisionId: string; comments?: string }) =>
            documentControlService.approveRevision(revisionId, comments),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: documentKeys.revisions(data.document_id) });
            queryClient.invalidateQueries({ queryKey: documentKeys.detail(data.document_id) });
            queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
            queryClient.invalidateQueries({ queryKey: documentKeys.stats() });
            queryClient.invalidateQueries({ queryKey: documentKeys.reviewDue() });
        },
    });
}

export function useRejectRevision() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ revisionId, comments }: { revisionId: string; comments: string }) =>
            documentControlService.rejectRevision(revisionId, comments),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: documentKeys.revisions(data.document_id) });
            queryClient.invalidateQueries({ queryKey: documentKeys.detail(data.document_id) });
            queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
            queryClient.invalidateQueries({ queryKey: documentKeys.stats() });
        },
    });
}

// ============================================================================
// Review Cycle Mutations
// ============================================================================

export function useCompleteReviewNoChanges() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ documentId, reviewNotes }: { documentId: string; reviewNotes?: string }) =>
            documentControlService.completeReviewNoChanges(documentId, reviewNotes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.all });
        },
    });
}

// ============================================================================
// Category Mutations
// ============================================================================

export function useReorderDocumentCategories() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (orderedIds: string[]) =>
            documentControlService.reorderCategories(orderedIds),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.categories() });
        },
    });
}

export function useCreateDocumentCategory() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ name, description }: { name: string; description?: string }) =>
            documentControlService.createCategory(name, description),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.categories() });
        },
    });
}

export function useUpdateDocumentCategory() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: { name?: string; description?: string; is_active?: boolean } }) =>
            documentControlService.updateCategory(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.categories() });
        },
    });
}

export function useDeleteDocumentCategory() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => documentControlService.deleteCategory(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.categories() });
        },
    });
}
