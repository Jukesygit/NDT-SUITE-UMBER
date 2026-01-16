/**
 * EditDefinitionModal - Modal for editing competency definitions (cert types)
 */

import { useState, useEffect, FormEvent } from 'react';
import Modal from '../../../components/ui/Modal/Modal';
import FormField from '../../../components/ui/Form/FormField';
import { FormTextarea, FormCheckbox, FormSelect } from '../../../components/ui';
import { useUpdateDefinition } from '../../../hooks/mutations';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';
import type { CompetencyCategory, CompetencyDefinition } from '../../../hooks/queries/useCompetencies';

export interface EditDefinitionModalProps {
    isOpen: boolean;
    onClose: () => void;
    definition: CompetencyDefinition;
    categories: CompetencyCategory[];
}

interface FormErrors {
    name?: string;
    category_id?: string;
    api?: string;
}

const FIELD_TYPE_OPTIONS = [
    { value: 'expiry_date', label: 'Expiry Date - Date with expiry tracking' },
    { value: 'text', label: 'Text - Free text input' },
    { value: 'date', label: 'Date - Date picker without expiry' },
    { value: 'file', label: 'File - Document upload only' },
    { value: 'boolean', label: 'Yes/No - Checkbox' },
    { value: 'number', label: 'Number - Numeric input' },
];

export function EditDefinitionModal({ isOpen, onClose, definition, categories }: EditDefinitionModalProps) {
    const updateDefinition = useUpdateDefinition();

    const [name, setName] = useState(definition.name);
    const [description, setDescription] = useState(definition.description || '');
    const [categoryId, setCategoryId] = useState(definition.category_id);
    const [fieldType, setFieldType] = useState(definition.field_type);
    const [requiresDocument, setRequiresDocument] = useState(definition.requires_document ?? false);
    const [requiresApproval, setRequiresApproval] = useState(definition.requires_approval ?? false);
    const [isActive, setIsActive] = useState(definition.is_active);
    const [errors, setErrors] = useState<FormErrors>({});

    // Reset form when definition changes
    useEffect(() => {
        setName(definition.name);
        setDescription(definition.description || '');
        setCategoryId(definition.category_id);
        setFieldType(definition.field_type);
        setRequiresDocument(definition.requires_document ?? false);
        setRequiresApproval(definition.requires_approval ?? false);
        setIsActive(definition.is_active);
        setErrors({});
    }, [definition]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        const trimmedName = name.trim();
        if (!trimmedName) {
            setErrors({ name: 'Certification type name is required' });
            return;
        }
        if (trimmedName.length < 2) {
            setErrors({ name: 'Name must be at least 2 characters' });
            return;
        }
        if (!categoryId) {
            setErrors({ category_id: 'Please select a category' });
            return;
        }

        try {
            await updateDefinition.mutateAsync({
                id: definition.id,
                data: {
                    name: trimmedName,
                    description: description.trim() || undefined,
                    category_id: categoryId,
                    field_type: fieldType as any,
                    requires_document: requiresDocument,
                    requires_approval: requiresApproval,
                    is_active: isActive,
                },
            });
            setErrors({});
            onClose();
        } catch (error: any) {
            setErrors({ api: error.message || 'Failed to update certification type' });
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Certification Type"
            size="medium"
            footer={
                <>
                    <button type="button" onClick={onClose} disabled={updateDefinition.isPending} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" form="edit-definition-form" disabled={updateDefinition.isPending} className="btn btn-primary flex items-center gap-2">
                        {updateDefinition.isPending && <RandomMatrixSpinner size={16} />}
                        {updateDefinition.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </>
            }
        >
            <form id="edit-definition-form" onSubmit={handleSubmit}>
                {errors.api && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/50">
                        <p className="text-sm text-red-400">{errors.api}</p>
                    </div>
                )}

                <FormField
                    label="Name"
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setErrors({}); }}
                    error={errors.name}
                    required
                    autoFocus
                />

                <FormTextarea
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                    rows={2}
                />

                <FormSelect
                    label="Category"
                    value={categoryId}
                    onChange={(e) => { setCategoryId(e.target.value); setErrors({}); }}
                    error={errors.category_id}
                    required
                >
                    <option value="">Select a category...</option>
                    {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                            {cat.name}
                        </option>
                    ))}
                </FormSelect>

                <FormSelect
                    label="Field Type"
                    value={fieldType}
                    onChange={(e) => setFieldType(e.target.value as any)}
                    required
                >
                    {FIELD_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </FormSelect>

                <div className="space-y-3 mt-4">
                    <FormCheckbox
                        label="Requires Document Upload"
                        checked={requiresDocument}
                        onChange={(e) => setRequiresDocument(e.target.checked)}
                        helperText="Users must upload a certificate or document"
                    />

                    <FormCheckbox
                        label="Requires Admin Approval"
                        checked={requiresApproval}
                        onChange={(e) => setRequiresApproval(e.target.checked)}
                        helperText="Documents must be approved by an admin"
                    />

                    <FormCheckbox
                        label="Active"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        helperText="Inactive cert types are hidden from users"
                    />
                </div>
            </form>
        </Modal>
    );
}

export default EditDefinitionModal;
