import { useQuery } from '@tanstack/react-query';
import documentControlService from '../../services/document-control-service.ts';
import type { DocumentFilters } from '../../types/document-control';

// Query key factory
export const documentKeys = {
    all: ['documents'] as const,
    lists: () => [...documentKeys.all, 'list'] as const,
    list: (filters?: DocumentFilters) => [...documentKeys.lists(), filters] as const,
    details: () => [...documentKeys.all, 'detail'] as const,
    detail: (id: string) => [...documentKeys.details(), id] as const,
    revisions: (docId: string) => [...documentKeys.all, 'revisions', docId] as const,
    categories: () => [...documentKeys.all, 'categories'] as const,
    reviewDue: (days?: number) => [...documentKeys.all, 'reviewDue', days] as const,
    stats: () => [...documentKeys.all, 'stats'] as const,
    reviewSchedule: (docId: string) => [...documentKeys.all, 'reviewSchedule', docId] as const,
};

/**
 * Fetch all documents with optional filters
 */
export function useDocuments(filters?: DocumentFilters) {
    return useQuery({
        queryKey: documentKeys.list(filters),
        queryFn: () => documentControlService.getDocuments(filters),
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Fetch a single document with current revision details
 */
export function useDocument(documentId: string | undefined) {
    return useQuery({
        queryKey: documentKeys.detail(documentId!),
        queryFn: () => documentControlService.getDocument(documentId!),
        enabled: !!documentId,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Fetch revision history for a document
 */
export function useDocumentRevisions(documentId: string | undefined) {
    return useQuery({
        queryKey: documentKeys.revisions(documentId!),
        queryFn: () => documentControlService.getRevisions(documentId!),
        enabled: !!documentId,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Fetch active document categories (for dropdowns)
 */
export function useDocumentCategories() {
    return useQuery({
        queryKey: documentKeys.categories(),
        queryFn: () => documentControlService.getCategories(),
        staleTime: 30 * 60 * 1000,
    });
}

/**
 * Fetch all document categories including inactive (for admin management)
 */
export function useAllDocumentCategories() {
    return useQuery({
        queryKey: [...documentKeys.categories(), 'all'],
        queryFn: () => documentControlService.getAllCategories(),
        staleTime: 30 * 60 * 1000,
    });
}

/**
 * Fetch documents due for review
 */
export function useDocumentsDueForReview(daysAhead = 30) {
    return useQuery({
        queryKey: documentKeys.reviewDue(daysAhead),
        queryFn: () => documentControlService.getDocumentsDueForReview(daysAhead),
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Fetch document stats for dashboard
 */
export function useDocumentStats() {
    return useQuery({
        queryKey: documentKeys.stats(),
        queryFn: () => documentControlService.getDocumentStats(),
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Fetch review schedule for a specific document
 */
export function useDocumentReviewSchedule(documentId: string | undefined) {
    return useQuery({
        queryKey: documentKeys.reviewSchedule(documentId!),
        queryFn: () => documentControlService.getReviewSchedule(documentId!),
        enabled: !!documentId,
        staleTime: 5 * 60 * 1000,
    });
}
