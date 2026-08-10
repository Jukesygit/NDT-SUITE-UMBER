/**
 * EditCompetencyModal - Modal for adding/editing competencies
 */

import { useState, useCallback, useEffect } from 'react';
import { Modal, FormField, FormTextarea, FormSelect } from '../../components/ui';
import { CompetencyDocumentsField } from './CompetencyDocumentsField';
import type { CompetencyDefinition } from './CompetencyCard';
import type { CompetencyDocumentInput } from '../../services/competency-mutations';
import './profile.css';

export interface CompetencyFormData {
  competency_id: string;
  issuing_body: string;
  certification_id: string;
  issued_date: string;
  expiry_date: string;
  /** Ordered document set (array order = page order). */
  documents: CompetencyDocumentInput[];
  notes: string;
  level?: string;
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
 * File-type competencies (like CV Document) only need document upload, not cert fields
 */
function shouldShowCertificationFields(definition?: CompetencyDefinition): boolean {
  if (!definition) return true;

  // File-type competencies don't need certification fields (issuing body, cert ID, expiry)
  if (definition.field_type === 'file') {
    return false;
  }

  return definition.is_certification !== false;
}

/** Build the initial form state from optional seed data. */
function buildFormData(
  initialData: Partial<CompetencyFormData> | undefined,
  definition: CompetencyDefinition | undefined
): CompetencyFormData {
  return {
    competency_id: initialData?.competency_id || definition?.id || '',
    issuing_body: initialData?.issuing_body || '',
    certification_id: initialData?.certification_id || '',
    issued_date: initialData?.issued_date || '',
    expiry_date: initialData?.expiry_date || '',
    documents: initialData?.documents ? [...initialData.documents] : [],
    notes: initialData?.notes || '',
    level: initialData?.level || '',
    definition,
  };
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
  const [formData, setFormData] = useState<CompetencyFormData>(() =>
    buildFormData(initialData, definition)
  );

  // Sync form state when modal opens with new definition/initialData
  useEffect(() => {
    if (isOpen) {
      setFormData(buildFormData(initialData, definition));
    }
  }, [isOpen, definition, initialData]);

  // Update field
  const updateField = useCallback((field: keyof CompetencyFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Update the document set
  const updateDocuments = useCallback((documents: CompetencyDocumentInput[]) => {
    setFormData((prev) => ({ ...prev, documents }));
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    onSave(formData);
  }, [formData, onSave]);

  // Handle close - reset form
  const handleClose = useCallback(() => {
    setFormData(buildFormData(undefined, undefined));
    onClose();
  }, [onClose]);

  const showCertFields = shouldShowCertificationFields(definition);
  const showLevelField = definition?.name?.toUpperCase().includes('IRATA');
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
                className="pf-btn danger"
                disabled={isSaving || isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
          {/* Cancel and Save buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleClose} className="pf-btn" disabled={isSaving || isDeleting}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="pf-btn primary"
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

        {/* IRATA Level */}
        {showLevelField && (
          <FormSelect
            label="IRATA Level"
            value={formData.level || ''}
            onChange={(e) => updateField('level', e.target.value)}
            placeholder="Select level..."
            options={[
              { value: 'L1', label: 'Level 1' },
              { value: 'L2', label: 'Level 2' },
              { value: 'L3', label: 'Level 3' },
            ]}
            containerClassName="mb-0"
          />
        )}

        {/* Document Upload (multi-page) */}
        <CompetencyDocumentsField
          documents={formData.documents}
          onChange={updateDocuments}
          onUpload={onDocumentUpload}
          isUploading={isUploadingDocument}
        />

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
