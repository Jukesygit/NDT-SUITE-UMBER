/**
 * EditCompetencyModal - Modal for adding/editing competencies
 */

import { useState, useCallback, useEffect, ChangeEvent } from 'react';
import { Modal, FormField, FormTextarea } from '../../components/ui';
import { RandomMatrixSpinner } from '../../components/MatrixSpinners';
import type { CompetencyDefinition } from './CompetencyCard';

export interface CompetencyFormData {
    competency_id: string;
    issuing_body: string;
    certification_id: string;
    issued_date: string;
    expiry_date: string;
    document_url: string;
    document_name: string;
    notes: string;
    definition?: CompetencyDefinition;
}

interface EditCompetencyModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback to close modal */
    onClose: () => void;
    /** Callback when save is clicked */
    onSave: (data: CompetencyFormData) => void;
    /** Callback when delete is clicked (only shown when editing existing) */
    onDelete?: () => void;
    /** Whether this is adding a new competency */
    isNew?: boolean;
    /** Initial data for editing */
    initialData?: Partial<CompetencyFormData>;
    /** The competency definition */
    definition?: CompetencyDefinition;
    /** Whether save is in progress */
    isSaving?: boolean;
    /** Whether delete is in progress */
    isDeleting?: boolean;
    /** Callback for document upload */
    onDocumentUpload?: (file: File) => Promise<{ url: string; name: string }>;
    /** Whether document upload is in progress */
    isUploadingDocument?: boolean;
}

/**
 * Check if definition should show certification fields
 */
function shouldShowCertificationFields(definition?: CompetencyDefinition): boolean {
    if (!definition) return true;
    return definition.is_certification !== false;
}

/**
 * Upload icon
 */
function UploadIcon() {
    return (
        <svg
            style={{ width: '32px', height: '32px', color: 'rgba(255, 255, 255, 0.4)', marginBottom: '8px' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
        </svg>
    );
}

/**
 * Document icon
 */
function DocumentIcon() {
    return (
        <svg
            style={{ width: '20px', height: '20px', color: '#10b981', flexShrink: 0 }}
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
    );
}

/**
 * Close/X icon
 */
function CloseIcon({ size = 16 }: { size?: number }) {
    return (
        <svg
            style={{ width: `${size}px`, height: `${size}px` }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}

/**
 * EditCompetencyModal component
 */
export function EditCompetencyModal({
    isOpen,
    onClose,
    onSave,
    onDelete,
    isNew = false,
    initialData,
    definition,
    isSaving = false,
    isDeleting = false,
    onDocumentUpload,
    isUploadingDocument = false,
}: EditCompetencyModalProps) {
    // Form state
    const [formData, setFormData] = useState<CompetencyFormData>({
        competency_id: initialData?.competency_id || definition?.id || '',
        issuing_body: initialData?.issuing_body || '',
        certification_id: initialData?.certification_id || '',
        issued_date: initialData?.issued_date || '',
        expiry_date: initialData?.expiry_date || '',
        document_url: initialData?.document_url || '',
        document_name: initialData?.document_name || '',
        notes: initialData?.notes || '',
        definition,
    });

    // Sync form state when modal opens with new definition/initialData
    useEffect(() => {
        if (isOpen) {
            setFormData({
                competency_id: initialData?.competency_id || definition?.id || '',
                issuing_body: initialData?.issuing_body || '',
                certification_id: initialData?.certification_id || '',
                issued_date: initialData?.issued_date || '',
                expiry_date: initialData?.expiry_date || '',
                document_url: initialData?.document_url || '',
                document_name: initialData?.document_name || '',
                notes: initialData?.notes || '',
                definition,
            });
        }
    }, [isOpen, definition, initialData]);

    // Update field
    const updateField = useCallback((field: keyof CompetencyFormData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    }, []);

    // Handle document upload
    const handleDocumentChange = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file || !onDocumentUpload) return;

            // Validate file type
            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
            if (!validTypes.includes(file.type)) {
                alert('Please upload a PDF or image file');
                return;
            }

            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                alert('File must be less than 10MB');
                return;
            }

            try {
                const result = await onDocumentUpload(file);
                setFormData((prev) => ({
                    ...prev,
                    document_url: result.url,
                    document_name: result.name,
                }));
            } catch (error) {
                console.error('Document upload failed:', error);
                alert('Failed to upload document');
            }
        },
        [onDocumentUpload]
    );

    // Remove document
    const handleRemoveDocument = useCallback(() => {
        setFormData((prev) => ({
            ...prev,
            document_url: '',
            document_name: '',
        }));
    }, []);

    // Handle save
    const handleSave = useCallback(() => {
        onSave(formData);
    }, [formData, onSave]);

    // Handle close - reset form
    const handleClose = useCallback(() => {
        setFormData({
            competency_id: '',
            issuing_body: '',
            certification_id: '',
            issued_date: '',
            expiry_date: '',
            document_url: '',
            document_name: '',
            notes: '',
        });
        onClose();
    }, [onClose]);

    const showCertFields = shouldShowCertificationFields(definition);
    const title = isNew
        ? `Add ${definition?.name || 'Certification'}`
        : `Edit ${definition?.name || 'Certification'}`;

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={title}
            size="medium"
            closeOnBackdropClick={!isSaving}
            closeOnEscape={!isSaving}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    {/* Delete button - only show when editing existing */}
                    <div>
                        {!isNew && onDelete && (
                            <button
                                onClick={onDelete}
                                className="btn btn--danger"
                                disabled={isSaving || isDeleting}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                        )}
                    </div>
                    {/* Cancel and Save buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleClose}
                            className="btn btn--secondary"
                            disabled={isSaving || isDeleting}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="btn btn--primary"
                            disabled={isSaving || isDeleting}
                        >
                            {isSaving ? 'Saving...' : isNew ? 'Add Certification' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Certification Fields */}
                {showCertFields && (
                    <>
                        <FormField
                            label="Issuing Body"
                            placeholder="e.g., BINDT, PCN, ASNT"
                            value={formData.issuing_body}
                            onChange={(e) => updateField('issuing_body', e.target.value)}
                            containerClassName="mb-0"
                        />

                        <FormField
                            label="Certification ID"
                            placeholder="Certificate number"
                            value={formData.certification_id}
                            onChange={(e) => updateField('certification_id', e.target.value)}
                            containerClassName="mb-0"
                        />

                        <FormField
                            label="Expiry Date"
                            type="date"
                            value={formData.expiry_date}
                            onChange={(e) => updateField('expiry_date', e.target.value)}
                            containerClassName="mb-0"
                        />
                    </>
                )}

                {/* Document Upload */}
                <div>
                    <label
                        style={{
                            display: 'block',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: 'rgba(255, 255, 255, 0.6)',
                            marginBottom: '6px',
                        }}
                    >
                        Certificate Document
                        <span
                            style={{
                                fontSize: '11px',
                                fontWeight: '400',
                                marginLeft: '8px',
                                color: 'rgba(255, 255, 255, 0.4)',
                            }}
                        >
                            (PDF or image - max 10MB)
                        </span>
                    </label>

                    {formData.document_name ? (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px 16px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: '8px',
                            }}
                        >
                            <DocumentIcon />
                            <span
                                style={{
                                    flex: 1,
                                    color: '#ffffff',
                                    fontSize: '14px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {formData.document_name}
                            </span>
                            <button
                                type="button"
                                onClick={handleRemoveDocument}
                                className="btn-icon"
                                style={{ padding: '4px', color: '#ef4444' }}
                            >
                                <CloseIcon />
                            </button>
                        </div>
                    ) : (
                        <label
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '20px',
                                border: '2px dashed rgba(255, 255, 255, 0.2)',
                                borderRadius: '8px',
                                cursor: isUploadingDocument ? 'wait' : 'pointer',
                                transition: 'all 0.2s ease',
                                background: 'rgba(255, 255, 255, 0.02)',
                            }}
                            onMouseEnter={(e) => {
                                if (!isUploadingDocument) {
                                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                            }}
                        >
                            {isUploadingDocument ? (
                                <>
                                    <div style={{ marginBottom: '8px' }}>
                                        <RandomMatrixSpinner size={32} />
                                    </div>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '13px' }}>
                                        Uploading...
                                    </span>
                                </>
                            ) : (
                                <>
                                    <UploadIcon />
                                    <span
                                        style={{
                                            color: 'rgba(255, 255, 255, 0.6)',
                                            fontSize: '13px',
                                            textAlign: 'center',
                                        }}
                                    >
                                        Click to upload certificate
                                    </span>
                                    <span
                                        style={{
                                            color: 'rgba(255, 255, 255, 0.4)',
                                            fontSize: '11px',
                                            marginTop: '4px',
                                        }}
                                    >
                                        PDF or image of your certificate
                                    </span>
                                </>
                            )}
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf"
                                onChange={handleDocumentChange}
                                disabled={isUploadingDocument}
                                style={{ display: 'none' }}
                            />
                        </label>
                    )}
                </div>

                {/* Notes */}
                <FormTextarea
                    label="Notes"
                    placeholder="Additional notes or comments..."
                    value={formData.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    rows={3}
                    containerClassName="mb-0"
                />
            </div>
        </Modal>
    );
}

export default EditCompetencyModal;
