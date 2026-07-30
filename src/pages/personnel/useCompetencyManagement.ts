/**
 * useCompetencyManagement - Custom hook for competency editing, adding,
 * witness checking, and document viewing state/callbacks.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { PersonCompetency } from '../../hooks/queries/usePersonnel';
import { useUpdatePersonCompetency, useUploadCompetencyDocument, useAddPersonCompetency, useDeletePersonCompetency } from '../../hooks/mutations';
import { useCompetencyDefinitions, useCompetencyCategories } from '../../hooks/queries/useCompetencies';
import type { CompetencyDefinition, CompetencyCategory } from '../../hooks/queries/useCompetencies';
import type { CompetencyFormData } from '../profile/EditCompetencyModal';
import type { WitnessCheckData } from '../../components/features/witness/WitnessCheckModal';
import { normalizeCompetencyDocuments, toDocumentInputs } from '../../utils/competency-documents';
import competencyService from '../../services/competency-service.ts';

export function useCompetencyManagement(personId: string, onUpdate?: () => void) {
    // Competency editing modal state
    const [editingCompetency, setEditingCompetency] = useState<{
        competency: PersonCompetency;
        definition: {
            id: string;
            name: string;
            field_type?: 'text' | 'date' | 'expiry_date' | 'boolean' | 'file' | 'number';
            is_certification?: boolean;
        };
    } | null>(null);

    // Certificate detail modal state
    const [viewingCompetency, setViewingCompetency] = useState<PersonCompetency | null>(null);
    // Batched signed URLs (storage path -> signed URL) for every document/page of
    // the competency being viewed.
    const [viewingDocumentUrls, setViewingDocumentUrls] = useState<Record<string, string>>({});

    // Witness check modal state
    const [witnessingCompetency, setWitnessingCompetency] = useState<PersonCompetency | null>(null);

    // Add competency picker state
    const [showCompetencyPicker, setShowCompetencyPicker] = useState(false);
    const [addingCompetency, setAddingCompetency] = useState<CompetencyDefinition | null>(null);
    const [pickerSearchTerm, setPickerSearchTerm] = useState('');
    const [pickerCategory, setPickerCategory] = useState<string>('all');

    // Resolve signed URLs for every document/page when viewing a competency,
    // batched through the shared service (no ad-hoc createSignedUrl here).
    useEffect(() => {
        let cancelled = false;
        async function resolveUrls() {
            if (!viewingCompetency) {
                setViewingDocumentUrls({});
                return;
            }
            const docs = normalizeCompetencyDocuments(viewingCompetency);
            if (docs.length === 0) {
                setViewingDocumentUrls({});
                return;
            }
            try {
                const urls = await competencyService.getDocumentUrls(docs.map((d) => d.document_url));
                if (!cancelled) setViewingDocumentUrls(urls);
            } catch {
                if (!cancelled) setViewingDocumentUrls({});
            }
        }
        resolveUrls();
        return () => {
            cancelled = true;
        };
    }, [viewingCompetency]);

    // Mutations
    const updateCompetency = useUpdatePersonCompetency();
    const uploadDocument = useUploadCompetencyDocument();
    const addCompetency = useAddPersonCompetency();
    const deleteCompetency = useDeletePersonCompetency();

    // Query hooks for competency definitions (for add picker)
    const definitionsQuery = useCompetencyDefinitions();
    const categoriesQuery = useCompetencyCategories();

    // Open edit modal for a competency
    const handleEditCompetency = useCallback((comp: PersonCompetency) => {
        setEditingCompetency({
            competency: comp,
            definition: {
                id: comp.competency_id,
                name: comp.competency?.name || 'Certification',
                field_type: comp.competency?.field_type,
                is_certification: comp.competency?.is_certification,
            },
        });
    }, []);

    // Open witness check modal for a competency
    const handleWitnessCheck = useCallback((comp: PersonCompetency) => {
        setWitnessingCompetency(comp);
    }, []);

    // Save witness check from modal
    const handleSaveWitnessCheck = useCallback(
        async (data: WitnessCheckData) => {
            if (!witnessingCompetency) return;

            await updateCompetency.mutateAsync({
                competencyId: witnessingCompetency.id,
                personId,
                data: {
                    witness_checked: data.witness_checked,
                    witnessed_by: data.witnessed_by,
                    witnessed_at: data.witnessed_at,
                    witness_notes: data.witness_notes,
                },
            });
            setWitnessingCompetency(null);
            onUpdate?.();
        },
        [witnessingCompetency, personId, updateCompetency, onUpdate]
    );

    // Remove witness check
    const handleRemoveWitnessCheck = useCallback(async () => {
        if (!witnessingCompetency) return;

        await updateCompetency.mutateAsync({
            competencyId: witnessingCompetency.id,
            personId,
            data: {
                witness_checked: false,
                witnessed_by: null,
                witnessed_at: null,
                witness_notes: null,
            },
        });
        setWitnessingCompetency(null);
        onUpdate?.();
    }, [witnessingCompetency, personId, updateCompetency, onUpdate]);

    // Handle document upload for competency modal (editing existing)
    const handleDocumentUpload = useCallback(
        async (file: File): Promise<{ url: string; name: string }> => {
            const competencyName = editingCompetency?.definition?.name;

            if (!competencyName) {
                throw new Error('Competency not available');
            }
            // Use mutateAsync instead of wrapping mutate in a Promise
            // This avoids stale callback issues when the component re-renders during upload
            return uploadDocument.mutateAsync({
                userId: personId,
                competencyName: competencyName,
                file,
            });
        },
        [personId, editingCompetency?.definition?.name, uploadDocument]
    );

    // Save competency from modal
    const handleSaveCompetencyModal = useCallback(
        async (data: CompetencyFormData) => {
            if (!editingCompetency) return;

            await updateCompetency.mutateAsync({
                competencyId: editingCompetency.competency.id,
                personId,
                data: {
                    issuing_body: data.issuing_body || null,
                    certification_id: data.certification_id || null,
                    expiry_date: data.expiry_date || null,
                    notes: data.notes || null,
                    documents: data.documents,
                    level: data.level || null,
                },
                // Prior document set drives the re-review decision in the hook.
                previousDocuments: toDocumentInputs(editingCompetency.competency),
            });
            setEditingCompetency(null);
            onUpdate?.();
        },
        [editingCompetency, personId, updateCompetency, onUpdate]
    );

    // Delete a competency on behalf of the person (admin action). Confirms first,
    // then removes the row and all of its documents via the mutation.
    const handleDeleteCompetency = useCallback(
        async (comp: PersonCompetency) => {
            const name = comp.competency?.name || 'this certification';
            if (
                !window.confirm(
                    `Are you sure you want to delete "${name}"? All of its documents will also be removed. This cannot be undone.`
                )
            ) {
                return;
            }
            await deleteCompetency.mutateAsync({ competencyId: comp.id, personId });
            // Close the edit modal if the delete was triggered from within it.
            setEditingCompetency(null);
            onUpdate?.();
        },
        [personId, deleteCompetency, onUpdate]
    );

    // Handle selecting a competency type from picker
    const handleSelectCompetencyType = useCallback((definition: CompetencyDefinition) => {
        setShowCompetencyPicker(false);
        setAddingCompetency(definition);
        setPickerSearchTerm('');
        setPickerCategory('all');
    }, []);

    // Handle document upload for new competency
    // Use Promise wrapper with mutate callbacks (same pattern as ProfilePage)
    const handleNewDocumentUpload = useCallback(
        async (file: File): Promise<{ url: string; name: string }> => {
            const competencyName = addingCompetency?.name;
            if (!competencyName) {
                throw new Error('Competency not available');
            }

            // Use mutateAsync instead of wrapping mutate in a Promise
            // This avoids stale callback issues when the component re-renders during upload
            return uploadDocument.mutateAsync({
                userId: personId,
                competencyName: competencyName,
                file,
            });
        },
        [personId, addingCompetency?.name, uploadDocument]
    );

    // Save new competency
    const handleSaveNewCompetency = useCallback(
        async (data: CompetencyFormData) => {
            if (!addingCompetency) return;

            await addCompetency.mutateAsync({
                user_id: personId,
                competency_id: addingCompetency.id,
                issuing_body: data.issuing_body || undefined,
                certification_id: data.certification_id || undefined,
                expiry_date: data.expiry_date || undefined,
                notes: data.notes || undefined,
                documents: data.documents,
                level: data.level || undefined,
            });
            setAddingCompetency(null);
            onUpdate?.();
        },
        [addingCompetency, personId, addCompetency, onUpdate]
    );

    // Memoize the definition for add modal to prevent form reset on re-render
    const addModalDefinition = useMemo(
        () =>
            addingCompetency
                ? {
                      id: addingCompetency.id,
                      name: addingCompetency.name,
                      field_type: addingCompetency.field_type,
                      is_certification: addingCompetency.field_type !== 'file',
                  }
                : undefined,
        [addingCompetency?.id, addingCompetency?.name, addingCompetency?.field_type]
    );

    // Memoize the definition and initialData for edit modal to prevent form reset on re-render
    const editModalDefinition = useMemo(
        () =>
            editingCompetency
                ? {
                      id: editingCompetency.competency.competency_id,
                      name: editingCompetency.definition.name,
                      field_type: editingCompetency.definition.field_type,
                      is_certification: editingCompetency.definition.is_certification,
                  }
                : undefined,
        [editingCompetency?.competency.competency_id, editingCompetency?.definition.name, editingCompetency?.definition.field_type, editingCompetency?.definition.is_certification]
    );

    const editModalInitialData = useMemo(
        () =>
            editingCompetency
                ? {
                      competency_id: editingCompetency.competency.competency_id,
                      issuing_body: editingCompetency.competency.issuing_body || '',
                      certification_id: editingCompetency.competency.certification_id || '',
                      expiry_date: editingCompetency.competency.expiry_date
                          ? new Date(editingCompetency.competency.expiry_date).toISOString().split('T')[0]
                          : '',
                      documents: toDocumentInputs(editingCompetency.competency),
                      notes: editingCompetency.competency.notes || '',
                      level: editingCompetency.competency.level || '',
                  }
                : undefined,
        [
            editingCompetency?.competency.competency_id,
            editingCompetency?.competency.issuing_body,
            editingCompetency?.competency.certification_id,
            editingCompetency?.competency.expiry_date,
            editingCompetency?.competency.document_url,
            editingCompetency?.competency.document_name,
            editingCompetency?.competency.documents,
            editingCompetency?.competency.notes,
            editingCompetency?.competency.level,
        ]
    );

    return {
        // Edit competency
        editingCompetency,
        setEditingCompetency,
        handleEditCompetency,
        handleSaveCompetencyModal,
        handleDeleteCompetency,
        handleDocumentUpload,
        editModalDefinition,
        editModalInitialData,
        updateCompetencyIsPending: updateCompetency.isPending,
        uploadDocumentIsPending: uploadDocument.isPending,

        // Certificate detail
        viewingCompetency,
        setViewingCompetency,
        viewingDocumentUrls,

        // Witness check
        witnessingCompetency,
        setWitnessingCompetency,
        handleWitnessCheck,
        handleSaveWitnessCheck,
        handleRemoveWitnessCheck,

        // Add competency
        showCompetencyPicker,
        setShowCompetencyPicker,
        addingCompetency,
        setAddingCompetency,
        pickerSearchTerm,
        setPickerSearchTerm,
        pickerCategory,
        setPickerCategory,
        handleSelectCompetencyType,
        handleNewDocumentUpload,
        handleSaveNewCompetency,
        addModalDefinition,
        addCompetencyIsPending: addCompetency.isPending,

        // Query data
        definitions: (definitionsQuery.data as CompetencyDefinition[]) || [],
        categories: (categoriesQuery.data as CompetencyCategory[]) || [],
    };
}
