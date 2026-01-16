/**
 * PersonnelExpandedRow - Expanded details view for a person in the table
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Person, PersonCompetency, Organization } from '../../hooks/queries/usePersonnel';
import { useUpdatePerson, useUpdatePersonCompetency, useUploadCompetencyDocument, useAddPersonCompetency } from '../../hooks/mutations';
import { useCompetencyDefinitions, useCompetencyCategories } from '../../hooks/queries/useCompetencies';
import type { CompetencyDefinition, CompetencyCategory } from '../../hooks/queries/useCompetencies';
import { Modal } from '../../components/ui';
import { EditCompetencyModal, type CompetencyFormData } from '../profile/EditCompetencyModal';
import { WitnessCheckModal, type WitnessCheckData } from '../../components/features/witness/WitnessCheckModal';

// Utility imports - ES module
import { requiresWitnessCheck } from '../../utils/competency-field-utils.js';
// @ts-ignore - JS module without types
import authManager from '../../auth-manager.js';

// @ts-ignore - JS module without types
import supabaseImport from '../../supabase-client.js';
import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - typing JS module import
const supabaseClient: SupabaseClient = supabaseImport;

interface PersonnelExpandedRowProps {
    person: Person;
    isAdmin: boolean;
    organizations: Organization[];
    onUpdate?: () => void;
}

interface PersonEditData {
    username: string;
    email: string;
    role: string;
    organization_id: string;
    // Personal details
    mobile_number: string;
    home_address: string;
    nearest_uk_train_station: string;
    date_of_birth: string;
    next_of_kin: string;
    next_of_kin_emergency_contact_number: string;
    vantage_number: string;
}

/**
 * User icon
 */
function UserIcon() {
    return (
        <svg
            style={{ width: '20px', height: '20px', color: 'var(--accent-primary)' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
        </svg>
    );
}

/**
 * Checkmark icon for certifications
 */
function CertIcon() {
    return (
        <svg
            style={{ width: '20px', height: '20px', color: 'var(--accent-primary)' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
        </svg>
    );
}

/**
 * Edit icon
 */
function EditIcon({ size = 14 }: { size?: number }) {
    return (
        <svg
            style={{ width: `${size}px`, height: `${size}px`, marginRight: '4px' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
        </svg>
    );
}

/**
 * Witness check icon (displayed when witnessed)
 */
function WitnessIcon() {
    return (
        <svg
            style={{ width: '14px', height: '14px', color: '#10b981', flexShrink: 0 }}
            fill="currentColor"
            viewBox="0 0 20 20"
        >
            <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
            />
        </svg>
    );
}

/**
 * Witness check button icon - clipboard with checkmark
 * Green when witnessed, muted when not witnessed
 */
function WitnessCheckButtonIcon({ witnessed }: { witnessed: boolean }) {
    return (
        <svg
            style={{
                width: '14px',
                height: '14px',
                color: witnessed ? '#10b981' : 'rgba(255, 255, 255, 0.5)',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
        </svg>
    );
}

/**
 * Document icon
 */
function DocumentIcon() {
    return (
        <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
        </svg>
    );
}

/**
 * Get document type from URL
 */
function getDocumentType(url?: string): 'image' | 'pdf' | 'other' {
    if (!url) return 'other';
    const lower = url.toLowerCase();
    if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i)) return 'image';
    if (lower.match(/\.pdf(\?|$)/i)) return 'pdf';
    return 'other';
}

/**
 * Format date for display
 */
function formatDate(dateString?: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Get status color and label for a competency
 */
function getCompetencyStatus(comp: PersonCompetency): { color: string; bgColor: string; label: string } {
    const isExpired =
        comp.status === 'expired' || (comp.expiry_date && new Date(comp.expiry_date) < new Date());
    const isExpiringSoon =
        comp.expiry_date &&
        !isExpired &&
        Math.ceil((new Date(comp.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) <= 30;

    if (isExpired) {
        return { color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.3)', label: 'Expired' };
    }
    if (isExpiringSoon) {
        return { color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.3)', label: 'Expiring' };
    }
    if (comp.status === 'pending_approval') {
        return { color: 'rgba(253, 224, 71, 1)', bgColor: 'rgba(251, 191, 36, 0.2)', label: 'Pending' };
    }
    return { color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.3)', label: 'Active' };
}

/**
 * Group competencies by category
 */
function groupByCategory(competencies: PersonCompetency[]): Record<string, PersonCompetency[]> {
    return competencies.reduce(
        (acc, comp) => {
            const categoryName = (comp.competency as { category?: { name?: string } })?.category?.name || 'Uncategorized';
            if (!acc[categoryName]) acc[categoryName] = [];
            acc[categoryName].push(comp);
            return acc;
        },
        {} as Record<string, PersonCompetency[]>
    );
}

/**
 * Display field component
 */
function DisplayField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div
                style={{
                    fontSize: '12px',
                    color: 'rgba(255, 255, 255, 0.5)',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    fontWeight: '600',
                    letterSpacing: '0.5px',
                }}
            >
                {label}
            </div>
            <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>{value || '-'}</div>
        </div>
    );
}

/**
 * PersonnelExpandedRow component
 */
export function PersonnelExpandedRow({ person, isAdmin, organizations, onUpdate }: PersonnelExpandedRowProps) {
    // Person editing state
    const [editingPerson, setEditingPerson] = useState(false);
    const [personEditData, setPersonEditData] = useState<PersonEditData>({
        username: person.username,
        email: person.email,
        role: person.role,
        organization_id: person.organization_id || '',
        mobile_number: person.mobile_number || '',
        home_address: person.home_address || '',
        nearest_uk_train_station: person.nearest_uk_train_station || '',
        date_of_birth: person.date_of_birth || '',
        next_of_kin: person.next_of_kin || '',
        next_of_kin_emergency_contact_number: person.next_of_kin_emergency_contact_number || '',
        vantage_number: person.vantage_number || '',
    });

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
    const [resolvedDocumentUrl, setResolvedDocumentUrl] = useState<string | null>(null);

    // Save error state
    const [saveError, setSaveError] = useState<string | null>(null);

    // Witness check modal state
    const [witnessingCompetency, setWitnessingCompetency] = useState<PersonCompetency | null>(null);

    // Add competency picker state
    const [showCompetencyPicker, setShowCompetencyPicker] = useState(false);
    const [addingCompetency, setAddingCompetency] = useState<CompetencyDefinition | null>(null);
    const [pickerSearchTerm, setPickerSearchTerm] = useState('');
    const [pickerCategory, setPickerCategory] = useState<string>('all');

    // Resolve document URL when viewing a competency
    useEffect(() => {
        async function resolveUrl() {
            if (!viewingCompetency?.document_url) {
                setResolvedDocumentUrl(null);
                return;
            }

            // If it's already a full URL, use it directly
            if (viewingCompetency.document_url.startsWith('http')) {
                setResolvedDocumentUrl(viewingCompetency.document_url);
                return;
            }

            // It's a storage path - get a signed URL from the 'documents' bucket
            try {
                const { data, error } = await supabaseClient.storage
                    .from('documents')
                    .createSignedUrl(viewingCompetency.document_url, 3600); // 1 hour expiry

                if (error) {
                    console.error('Failed to get signed URL:', error);
                    setResolvedDocumentUrl(null);
                    return;
                }

                setResolvedDocumentUrl(data.signedUrl);
            } catch (err) {
                console.error('Error resolving document URL:', err);
                setResolvedDocumentUrl(null);
            }
        }

        resolveUrl();
    }, [viewingCompetency?.document_url]);

    // Mutations
    const updatePerson = useUpdatePerson();
    const updateCompetency = useUpdatePersonCompetency();
    const uploadDocument = useUploadCompetencyDocument();
    const addCompetency = useAddPersonCompetency();

    // Query hooks for competency definitions (for add picker)
    const definitionsQuery = useCompetencyDefinitions();
    const categoriesQuery = useCompetencyCategories();

    const handleEditPerson = useCallback(() => {
        setSaveError(null);
        setPersonEditData({
            username: person.username,
            email: person.email,
            role: person.role,
            organization_id: person.organization_id || '',
            mobile_number: person.mobile_number || '',
            home_address: person.home_address || '',
            nearest_uk_train_station: person.nearest_uk_train_station || '',
            date_of_birth: person.date_of_birth || '',
            next_of_kin: person.next_of_kin || '',
            next_of_kin_emergency_contact_number: person.next_of_kin_emergency_contact_number || '',
            vantage_number: person.vantage_number || '',
        });
        setEditingPerson(true);
    }, [person]);

    const handleCancelPersonEdit = useCallback(() => {
        setEditingPerson(false);
    }, []);

    const handleSavePerson = useCallback(async () => {
        setSaveError(null);
        try {
            await updatePerson.mutateAsync({
                personId: person.id,
                data: personEditData,
            });
            setEditingPerson(false);
            onUpdate?.();
        } catch (error: unknown) {
            console.error('Failed to update person:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to save changes. Please try again.';
            setSaveError(errorMessage);
        }
    }, [person.id, personEditData, updatePerson, onUpdate]);

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
                personId: person.id,
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
        [witnessingCompetency, person.id, updateCompetency, onUpdate]
    );

    // Remove witness check
    const handleRemoveWitnessCheck = useCallback(async () => {
        if (!witnessingCompetency) return;

        await updateCompetency.mutateAsync({
            competencyId: witnessingCompetency.id,
            personId: person.id,
            data: {
                witness_checked: false,
                witnessed_by: null,
                witnessed_at: null,
                witness_notes: null,
            },
        });
        setWitnessingCompetency(null);
        onUpdate?.();
    }, [witnessingCompetency, person.id, updateCompetency, onUpdate]);

    // Handle document upload for competency modal (editing existing)
    const handleDocumentUpload = useCallback(
        async (file: File): Promise<{ url: string; name: string }> => {
            const competencyName = editingCompetency?.definition?.name;
            console.log('handleDocumentUpload (edit) called', { competencyName, personId: person.id, fileName: file.name });

            if (!competencyName) {
                console.error('Competency name not available for edit', { editingCompetency });
                throw new Error('Competency not available');
            }
            return new Promise((resolve, reject) => {
                uploadDocument.mutate(
                    {
                        userId: person.id,
                        competencyName: competencyName,
                        file,
                    },
                    {
                        onSuccess: (result) => {
                            console.log('Edit upload success', result);
                            resolve(result);
                        },
                        onError: (error) => {
                            console.error('Edit upload error', error);
                            reject(error);
                        },
                    }
                );
            });
        },
        [person.id, editingCompetency?.definition?.name, uploadDocument]
    );

    // Save competency from modal
    const handleSaveCompetencyModal = useCallback(
        async (data: CompetencyFormData) => {
            if (!editingCompetency) return;

            await updateCompetency.mutateAsync({
                competencyId: editingCompetency.competency.id,
                personId: person.id,
                data: {
                    issuing_body: data.issuing_body || null,
                    certification_id: data.certification_id || null,
                    expiry_date: data.expiry_date || null,
                    notes: data.notes || null,
                    document_url: data.document_url || null,
                    document_name: data.document_name || null,
                },
                // Pass previous document URL to detect new uploads (triggers pending_approval status)
                previousDocumentUrl: editingCompetency.competency.document_url,
            });
            setEditingCompetency(null);
            onUpdate?.();
        },
        [editingCompetency, person.id, updateCompetency, onUpdate]
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

            return new Promise((resolve, reject) => {
                uploadDocument.mutate(
                    {
                        userId: person.id,
                        competencyName: competencyName,
                        file,
                    },
                    {
                        onSuccess: (result) => resolve(result),
                        onError: (error) => reject(error),
                    }
                );
            });
        },
        [person.id, addingCompetency?.name, uploadDocument]
    );

    // Save new competency
    const handleSaveNewCompetency = useCallback(
        async (data: CompetencyFormData) => {
            if (!addingCompetency) return;

            await addCompetency.mutateAsync({
                user_id: person.id,
                competency_id: addingCompetency.id,
                issuing_body: data.issuing_body || undefined,
                certification_id: data.certification_id || undefined,
                expiry_date: data.expiry_date || undefined,
                notes: data.notes || undefined,
                document_url: data.document_url || undefined,
                document_name: data.document_name || undefined,
            });
            setAddingCompetency(null);
            onUpdate?.();
        },
        [addingCompetency, person.id, addCompetency, onUpdate]
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
                      document_url: editingCompetency.competency.document_url || '',
                      document_name: editingCompetency.competency.document_name || '',
                      notes: editingCompetency.competency.notes || '',
                  }
                : undefined,
        [
            editingCompetency?.competency.competency_id,
            editingCompetency?.competency.issuing_body,
            editingCompetency?.competency.certification_id,
            editingCompetency?.competency.expiry_date,
            editingCompetency?.competency.document_url,
            editingCompetency?.competency.document_name,
            editingCompetency?.competency.notes,
        ]
    );

    const competenciesByCategory = groupByCategory(person.competencies || []);
    const categories = Object.keys(competenciesByCategory).sort();

    return (
        <div
            style={{
                background: 'rgba(59, 130, 246, 0.05)',
                borderLeft: '4px solid var(--accent-primary)',
                padding: '24px',
                animation: 'slideDown 0.2s ease-out',
            }}
        >
            {/* Personal Information Section */}
            <div style={{ marginBottom: '20px' }}>
                <h4
                    style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#ffffff',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        justifyContent: 'space-between',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserIcon />
                        Personal Information
                    </div>
                    {isAdmin && !editingPerson && (
                        <button
                            onClick={handleEditPerson}
                            className="btn btn--secondary btn--sm"
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                        >
                            <EditIcon />
                            Edit
                        </button>
                    )}
                </h4>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '16px',
                    }}
                >
                    {editingPerson ? (
                        <>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Username
                                </div>
                                <input
                                    type="text"
                                    className="glass-input"
                                    value={personEditData.username}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, username: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Email
                                </div>
                                <input
                                    type="email"
                                    className="glass-input"
                                    value={personEditData.email}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, email: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Organization
                                </div>
                                <select
                                    className="glass-select"
                                    value={personEditData.organization_id}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, organization_id: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                >
                                    {organizations.map((org) => (
                                        <option key={org.id} value={org.id}>
                                            {org.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Role
                                </div>
                                <select
                                    className="glass-select"
                                    value={personEditData.role}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, role: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="editor">Editor</option>
                                    <option value="org_admin">Org Admin</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Mobile Number
                                </div>
                                <input
                                    type="tel"
                                    className="glass-input"
                                    value={personEditData.mobile_number}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, mobile_number: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Date of Birth
                                </div>
                                <input
                                    type="date"
                                    className="glass-input"
                                    value={personEditData.date_of_birth}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, date_of_birth: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Home Address
                                </div>
                                <input
                                    type="text"
                                    className="glass-input"
                                    value={personEditData.home_address}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, home_address: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Nearest UK Train Station
                                </div>
                                <input
                                    type="text"
                                    className="glass-input"
                                    value={personEditData.nearest_uk_train_station}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, nearest_uk_train_station: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Next of Kin
                                </div>
                                <input
                                    type="text"
                                    className="glass-input"
                                    value={personEditData.next_of_kin}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, next_of_kin: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Emergency Contact
                                </div>
                                <input
                                    type="tel"
                                    className="glass-input"
                                    value={personEditData.next_of_kin_emergency_contact_number}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, next_of_kin_emergency_contact_number: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Vantage Number
                                </div>
                                <input
                                    type="text"
                                    className="glass-input"
                                    value={personEditData.vantage_number}
                                    onChange={(e) =>
                                        setPersonEditData({ ...personEditData, vantage_number: e.target.value })
                                    }
                                    style={{ marginTop: '4px' }}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <DisplayField label="Username" value={person.username} />
                            <DisplayField label="Email" value={person.email} />
                            <DisplayField label="Organization" value={person.organizations?.name || 'Unknown'} />
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Role
                                </div>
                                <span className="glass-badge">{person.role}</span>
                            </div>
                            <DisplayField label="Mobile Number" value={person.mobile_number || '-'} />
                            <DisplayField
                                label="Date of Birth"
                                value={person.date_of_birth ? new Date(person.date_of_birth).toLocaleDateString('en-GB') : '-'}
                            />
                            <DisplayField label="Home Address" value={person.home_address || '-'} />
                            <DisplayField label="Nearest UK Train Station" value={person.nearest_uk_train_station || '-'} />
                            <DisplayField label="Next of Kin" value={person.next_of_kin || '-'} />
                            <DisplayField label="Emergency Contact" value={person.next_of_kin_emergency_contact_number || '-'} />
                            <DisplayField label="Vantage Number" value={person.vantage_number || '-'} />
                        </>
                    )}
                </div>

                {editingPerson && (
                    <div style={{ marginTop: '16px' }}>
                        {saveError && (
                            <div
                                style={{
                                    padding: '12px',
                                    marginBottom: '12px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '6px',
                                    color: '#ef4444',
                                    fontSize: '14px',
                                }}
                            >
                                {saveError}
                            </div>
                        )}
                        <div
                            style={{
                                display: 'flex',
                                gap: '12px',
                                justifyContent: 'flex-end',
                            }}
                        >
                            <button
                                onClick={handleCancelPersonEdit}
                                className="btn btn--secondary btn--sm"
                                disabled={updatePerson.isPending}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePerson}
                                className="btn btn--primary btn--sm"
                                disabled={updatePerson.isPending}
                            >
                                {updatePerson.isPending ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Divider */}
            <div
                style={{
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
                    margin: '20px 0',
                }}
            />

            {/* Competencies Section */}
            <div>
                <h4
                    style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#ffffff',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CertIcon />
                        Competencies & Certifications ({person.competencies?.length || 0})
                    </div>
                    {isAdmin && (
                        <button
                            onClick={() => setShowCompetencyPicker(true)}
                            className="btn btn--primary btn--sm"
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                        >
                            <svg
                                style={{ width: '12px', height: '12px', marginRight: '4px' }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Add Certification
                        </button>
                    )}
                </h4>

                {!person.competencies || person.competencies.length === 0 ? (
                    <div
                        style={{
                            padding: '32px',
                            textAlign: 'center',
                            color: 'rgba(255, 255, 255, 0.5)',
                            background: 'rgba(255, 255, 255, 0.02)',
                            borderRadius: '8px',
                            border: '1px dashed rgba(255, 255, 255, 0.1)',
                        }}
                    >
                        <svg
                            style={{ width: '48px', height: '48px', margin: '0 auto 12px', opacity: 0.3 }}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        No competencies recorded
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {categories.map((categoryName) => (
                            <div key={categoryName}>
                                {/* Category Header */}
                                <div
                                    style={{
                                        marginBottom: '8px',
                                        paddingBottom: '6px',
                                        borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
                                    }}
                                >
                                    <h5
                                        style={{
                                            fontSize: '16px',
                                            fontWeight: '600',
                                            color: 'rgba(255, 255, 255, 0.9)',
                                            margin: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                        }}
                                    >
                                        {categoryName}
                                        <span
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: '400',
                                                color: 'rgba(255, 255, 255, 0.5)',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                            }}
                                        >
                                            {competenciesByCategory[categoryName].length}
                                        </span>
                                    </h5>
                                </div>

                                {/* Competencies Grid */}
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                        gap: '8px',
                                    }}
                                >
                                    {competenciesByCategory[categoryName].map((comp) => {
                                        const status = getCompetencyStatus(comp);
                                        const needsWitness = requiresWitnessCheck(comp);

                                        return (
                                            <div
                                                key={comp.id}
                                                style={{
                                                    padding: '10px 12px',
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    borderRadius: '6px',
                                                    borderLeft: `3px solid ${status.color}`,
                                                    border: `1px solid ${status.bgColor}`,
                                                    borderLeftWidth: '3px',
                                                    transition: 'all 0.2s ease',
                                                }}
                                                className="hover:bg-white/5"
                                            >
                                                {/* Header */}
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        marginBottom: '6px',
                                                        gap: '8px',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            flex: 1,
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                fontWeight: '600',
                                                                color: '#ffffff',
                                                                fontSize: '13px',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                            title={comp.competency?.name}
                                                        >
                                                            {comp.competency?.name || 'Unknown Competency'}
                                                        </div>
                                                        {needsWitness && comp.witness_checked && (
                                                            <WitnessIcon />
                                                        )}
                                                    </div>
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        <span
                                                            className="glass-badge"
                                                            style={{
                                                                background: status.bgColor,
                                                                color: status.color,
                                                                fontSize: '10px',
                                                                padding: '2px 6px',
                                                            }}
                                                        >
                                                            {status.label}
                                                        </span>
                                                        {isAdmin && needsWitness && (
                                                            <button
                                                                onClick={() => handleWitnessCheck(comp)}
                                                                className="btn-icon"
                                                                style={{ padding: '2px' }}
                                                                title={comp.witness_checked ? 'Update witness check' : 'Mark as witnessed'}
                                                            >
                                                                <WitnessCheckButtonIcon witnessed={!!comp.witness_checked} />
                                                            </button>
                                                        )}
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => handleEditCompetency(comp)}
                                                                className="btn-icon"
                                                                style={{ padding: '2px', marginLeft: '4px' }}
                                                                title="Edit certification"
                                                            >
                                                                <svg
                                                                    style={{ width: '12px', height: '12px' }}
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    viewBox="0 0 24 24"
                                                                >
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        strokeWidth="2"
                                                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                                    />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Competency Details */}
                                                <div
                                                    style={{
                                                        fontSize: '11px',
                                                        color: 'rgba(255, 255, 255, 0.6)',
                                                        lineHeight: '1.4',
                                                    }}
                                                >
                                                    {comp.issuing_body && (
                                                        <div>
                                                            <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
                                                                Issued by:
                                                            </span>{' '}
                                                            {comp.issuing_body}
                                                        </div>
                                                    )}
                                                    {comp.certification_id && (
                                                        <div>
                                                            <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
                                                                Cert ID:
                                                            </span>{' '}
                                                            {comp.certification_id}
                                                        </div>
                                                    )}
                                                    {comp.expiry_date && (
                                                        <div>
                                                            <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
                                                                Expires:
                                                            </span>{' '}
                                                            {new Date(comp.expiry_date).toLocaleDateString('en-GB')}
                                                        </div>
                                                    )}
                                                    {comp.document_url && (
                                                            <button
                                                                onClick={() => setViewingCompetency(comp)}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    color: '#60a5fa',
                                                                    fontSize: '11px',
                                                                    textDecoration: 'none',
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    padding: 0,
                                                                    marginTop: '4px',
                                                                }}
                                                            >
                                                                <DocumentIcon />
                                                                View Certificate
                                                            </button>
                                                        )}
                                                    </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Certificate Detail Modal */}
            {viewingCompetency && (
                <Modal
                    isOpen={!!viewingCompetency}
                    onClose={() => setViewingCompetency(null)}
                    title={`${viewingCompetency.competency?.name || 'Certificate'} - Details`}
                    size="large"
                >
                    {/* Certificate Details */}
                    <div style={{ marginBottom: '20px' }}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: '16px',
                                fontSize: '14px',
                            }}
                        >
                            {viewingCompetency.issuing_body && (
                                <div>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '4px' }}>
                                        Issued By
                                    </span>
                                    <span style={{ color: '#ffffff', fontWeight: '500' }}>
                                        {viewingCompetency.issuing_body}
                                    </span>
                                </div>
                            )}
                            {viewingCompetency.certification_id && (
                                <div>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '4px' }}>
                                        Certificate ID
                                    </span>
                                    <span style={{ color: '#ffffff', fontWeight: '500' }}>
                                        {viewingCompetency.certification_id}
                                    </span>
                                </div>
                            )}
                            {viewingCompetency.created_at && (
                                <div>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '4px' }}>
                                        Issued Date
                                    </span>
                                    <span style={{ color: '#ffffff', fontWeight: '500' }}>
                                        {formatDate(viewingCompetency.created_at)}
                                    </span>
                                </div>
                            )}
                            {viewingCompetency.expiry_date && (
                                <div>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '4px' }}>
                                        Expiry Date
                                    </span>
                                    <span
                                        style={{
                                            color: getCompetencyStatus(viewingCompetency).color,
                                            fontWeight: '500',
                                        }}
                                    >
                                        {formatDate(viewingCompetency.expiry_date)}
                                    </span>
                                </div>
                            )}
                            {viewingCompetency.notes && (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginBottom: '4px' }}>
                                        Notes
                                    </span>
                                    <span style={{ color: '#ffffff' }}>
                                        {viewingCompetency.notes}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Document Preview */}
                    {viewingCompetency.document_url && (
                        <div style={{ minHeight: '300px' }}>
                            <div
                                style={{
                                    fontSize: '12px',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    marginBottom: '12px',
                                    textTransform: 'uppercase',
                                    fontWeight: '600',
                                    letterSpacing: '0.5px',
                                }}
                            >
                                Certificate Document
                            </div>
                            {!resolvedDocumentUrl && (
                                <div style={{ textAlign: 'center', padding: '40px' }}>
                                    <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                                        Loading document...
                                    </p>
                                </div>
                            )}
                            {resolvedDocumentUrl && getDocumentType(viewingCompetency.document_url) === 'image' && (
                                <img
                                    src={resolvedDocumentUrl}
                                    alt={`${viewingCompetency.competency?.name || 'Certificate'}`}
                                    style={{
                                        width: '100%',
                                        height: 'auto',
                                        maxHeight: '50vh',
                                        objectFit: 'contain',
                                        borderRadius: '8px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                    }}
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const fallback = target.nextElementSibling as HTMLElement;
                                        if (fallback) fallback.style.display = 'block';
                                    }}
                                />
                            )}
                            {/* Fallback for failed image load */}
                            {resolvedDocumentUrl && getDocumentType(viewingCompetency.document_url) === 'image' && (
                                <div style={{ display: 'none', textAlign: 'center', padding: '40px' }}>
                                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '16px' }}>
                                        Unable to load image preview.
                                    </p>
                                    <a
                                        href={resolvedDocumentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn--primary"
                                    >
                                        Open Image in New Tab
                                    </a>
                                </div>
                            )}
                            {resolvedDocumentUrl && getDocumentType(viewingCompetency.document_url) === 'pdf' && (
                                <iframe
                                    src={resolvedDocumentUrl}
                                    title={`${viewingCompetency.competency?.name || 'Certificate'}`}
                                    style={{
                                        width: '100%',
                                        height: '50vh',
                                        border: 'none',
                                        borderRadius: '8px',
                                    }}
                                />
                            )}
                            {resolvedDocumentUrl && getDocumentType(viewingCompetency.document_url) === 'other' && (
                                <div style={{ textAlign: 'center', padding: '40px' }}>
                                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '16px' }}>
                                        This document type cannot be previewed.
                                    </p>
                                    <a
                                        href={resolvedDocumentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn--primary"
                                    >
                                        Download Document
                                    </a>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Modal Footer */}
                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        {resolvedDocumentUrl && (
                            <a
                                href={resolvedDocumentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn--outline btn--sm"
                            >
                                Open in New Tab
                            </a>
                        )}
                        <button
                            onClick={() => setViewingCompetency(null)}
                            className="btn btn--primary btn--sm"
                        >
                            Close
                        </button>
                    </div>
                </Modal>
            )}

            {/* Edit Competency Modal (Admin only) */}
            {editingCompetency && editModalDefinition && editModalInitialData && (
                <EditCompetencyModal
                    isOpen={!!editingCompetency}
                    onClose={() => setEditingCompetency(null)}
                    onSave={handleSaveCompetencyModal}
                    isNew={false}
                    initialData={editModalInitialData}
                    definition={editModalDefinition}
                    isSaving={updateCompetency.isPending}
                    onDocumentUpload={handleDocumentUpload}
                    isUploadingDocument={uploadDocument.isPending}
                />
            )}

            {/* Witness Check Modal (Admin only) */}
            {witnessingCompetency && (
                <WitnessCheckModal
                    isOpen={!!witnessingCompetency}
                    onClose={() => setWitnessingCompetency(null)}
                    competencyName={witnessingCompetency.competency?.name || 'Certification'}
                    personName={person.username}
                    existingWitnessData={{
                        witness_checked: witnessingCompetency.witness_checked,
                        witnessed_by: witnessingCompetency.witnessed_by,
                        witnessed_at: witnessingCompetency.witnessed_at,
                        witness_notes: witnessingCompetency.witness_notes,
                    }}
                    currentUser={{
                        id: authManager.getCurrentUser()?.id || '',
                        name: authManager.getCurrentUser()?.username || authManager.getCurrentUser()?.email || 'Unknown',
                    }}
                    onSave={handleSaveWitnessCheck}
                    onRemove={handleRemoveWitnessCheck}
                    isSaving={updateCompetency.isPending}
                />
            )}

            {/* Competency Type Picker Modal */}
            <Modal
                isOpen={showCompetencyPicker}
                onClose={() => {
                    setShowCompetencyPicker(false);
                    setPickerSearchTerm('');
                    setPickerCategory('all');
                }}
                title="Add Certification"
                size="large"
            >
                {/* Search */}
                <div style={{ marginBottom: '16px' }}>
                    <input
                        type="text"
                        className="glass-input"
                        placeholder="Search certifications..."
                        value={pickerSearchTerm}
                        onChange={(e) => setPickerSearchTerm(e.target.value)}
                        style={{ width: '100%' }}
                    />
                </div>

                {/* Category Filter */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setPickerCategory('all')}
                        className={pickerCategory === 'all' ? 'btn btn--primary btn--sm' : 'btn btn--secondary btn--sm'}
                    >
                        All
                    </button>
                    {((categoriesQuery.data as CompetencyCategory[]) || [])
                        .filter((cat) => !cat.name.toLowerCase().includes('personal details'))
                        .map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setPickerCategory(cat.id)}
                                className={pickerCategory === cat.id ? 'btn btn--primary btn--sm' : 'btn btn--secondary btn--sm'}
                            >
                                {cat.name}
                            </button>
                        ))}
                </div>

                {/* Competency List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }} className="glass-scrollbar">
                    {((definitionsQuery.data as CompetencyDefinition[]) || [])
                        .filter((def) => {
                            // Filter out personal details
                            const categoryName = typeof def.category === 'object' ? def.category?.name : def.category;
                            if (categoryName?.toLowerCase().includes('personal details')) return false;

                            // Category filter
                            if (pickerCategory !== 'all') {
                                const defCategoryId = typeof def.category === 'object' ? def.category?.id : null;
                                if (defCategoryId !== pickerCategory) return false;
                            }

                            // Search filter
                            if (pickerSearchTerm) {
                                const search = pickerSearchTerm.toLowerCase();
                                if (!def.name.toLowerCase().includes(search)) return false;
                            }

                            return true;
                        })
                        .map((def) => (
                            <div
                                key={def.id}
                                onClick={() => handleSelectCompetencyType(def)}
                                style={{
                                    padding: '14px 16px',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff', marginBottom: '2px' }}>
                                        {def.name}
                                    </div>
                                    {def.description && (
                                        <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                            {def.description}
                                        </div>
                                    )}
                                </div>
                                <svg style={{ width: '18px', height: '18px', color: 'var(--accent-primary)', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                            </div>
                        ))}
                </div>
            </Modal>

            {/* Add New Competency Modal */}
            {addingCompetency && addModalDefinition && (
                <EditCompetencyModal
                    isOpen={!!addingCompetency}
                    onClose={() => setAddingCompetency(null)}
                    onSave={handleSaveNewCompetency}
                    isNew={true}
                    definition={addModalDefinition}
                    isSaving={addCompetency.isPending}
                    onDocumentUpload={handleNewDocumentUpload}
                    isUploadingDocument={uploadDocument.isPending}
                />
            )}
        </div>
    );
}

export default PersonnelExpandedRow;
