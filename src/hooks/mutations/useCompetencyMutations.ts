/**
 * Competency mutation hooks - Create, Update, Delete competencies
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

// ES module import
import competencyService from '../../services/competency-service.ts';
import { documentsRequireReview } from '../../utils/competency-documents';
import type { CompetencyDocumentInput } from '../../services/competency-mutations';

interface CompetencyData {
  competency_id: string;
  issuing_body?: string;
  certification_id?: string;
  issued_date?: string;
  expiry_date?: string;
  document_url?: string;
  document_name?: string;
  documents?: CompetencyDocumentInput[];
  notes?: string;
  field_value?: string;
  level?: string;
}

interface CreateCompetencyParams {
  userId: string;
  data: CompetencyData;
}

interface UpdateCompetencyParams {
  competencyId: string;
  userId: string;
  data: Partial<CompetencyData>;
  previousDocuments?: { document_url: string }[]; // Prior document set (multi-doc path)
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
      const documents = data.documents;
      // When a document set is provided it owns the mirror scalars and the
      // re-review decision (shared helper); a new competency has no prior set.
      const status = documents
        ? documentsRequireReview([], documents)
          ? 'pending_approval'
          : 'active'
        : undefined;
      const result = await competencyService.upsertCompetency(userId, data.competency_id, {
        value: data.field_value || data.certification_id,
        expiryDate: data.expiry_date,
        issuingBody: data.issuing_body,
        certificationId: data.certification_id,
        documentUrl: documents ? undefined : data.document_url,
        documentName: documents ? undefined : data.document_name,
        notes: data.notes,
        level: data.level,
        status,
      });
      if (documents) {
        await competencyService.setCompetencyDocuments(result.id, documents);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      // Invalidate all competency queries for this user
      queryClient.invalidateQueries({ queryKey: ['competencies', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['competencies', 'byCategory', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['competencies', 'expiring'] });
      // Also invalidate personnel queries so Personnel page shows updated data
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
    },
  });
}

/**
 * Hook for updating an existing competency
 */
export function useUpdateCompetency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      competencyId,
      userId,
      data,
      previousDocuments,
    }: UpdateCompetencyParams) => {
      const documents = data.documents;
      // When a document set is provided it owns the mirror scalars and the
      // re-review decision (shared helper) against the prior set.
      const status = documents
        ? documentsRequireReview(previousDocuments ?? [], documents)
          ? 'pending_approval'
          : 'active'
        : undefined;
      const result = await competencyService.upsertCompetency(userId, competencyId, {
        value: data.field_value || data.certification_id,
        expiryDate: data.expiry_date,
        issuingBody: data.issuing_body,
        certificationId: data.certification_id,
        documentUrl: documents ? undefined : data.document_url,
        documentName: documents ? undefined : data.document_name,
        notes: data.notes,
        level: data.level,
        status,
      });
      if (documents) {
        await competencyService.setCompetencyDocuments(result.id, documents);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      // Invalidate all competency queries for this user
      queryClient.invalidateQueries({ queryKey: ['competencies', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['competencies', 'byCategory', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['competencies', 'expiring'] });
      // Also invalidate personnel queries so Personnel page shows updated data
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
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
      // Invalidate all competency queries for this user
      queryClient.invalidateQueries({ queryKey: ['competencies', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['competencies', 'byCategory', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['competencies', 'expiring'] });
      // Also invalidate personnel queries so Personnel page shows updated data
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
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
      // Also invalidate personnel queries so Personnel page shows updated data
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
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
