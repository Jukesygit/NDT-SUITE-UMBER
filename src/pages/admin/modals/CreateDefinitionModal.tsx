/**
 * CreateDefinitionModal - Modal for creating new competency definitions (cert types)
 */

import { useState, FormEvent } from 'react';
import Modal from '../../../components/ui/Modal/Modal';
import FormField from '../../../components/ui/Form/FormField';
import { FormTextarea, FormCheckbox, FormSelect } from '../../../components/ui';
import { useCreateDefinition } from '../../../hooks/mutations';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';
import type { CompetencyCategory } from '../../../hooks/queries/useCompetencies';

export interface CreateDefinitionModalProps {
    isOpen: boolean;
    onClose: () => void;
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

export function CreateDefinitionModal({ isOpen, onClose, categories }: CreateDefinitionModalProps) {
    const createDefinition = useCreateDefinition();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [fieldType, setFieldType] = useState<string>('expiry_date');
    const [requiresDocument, setRequiresDocument] = useState(true);
    const [requiresApproval, setRequiresApproval] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});

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
            await createDefinition.mutateAsync({
                name: trimmedName,
                description: description.trim() || undefined,
                category_id: categoryId,
                field_type: fieldType as any,
                requires_document: requiresDocument,
                requires_approval: requiresApproval,
            });
            // Reset form
            setName('');
            setDescription('');
            setCategoryId('');
            setFieldType('expiry_date');
            setRequiresDocument(true);
            setRequiresApproval(false);
            setErrors({});
            onClose();
        } catch (error: unknown) {
            setErrors({ api: error instanceof Error ? error.message : 'Failed to create certification type' });
        }
    };

    const handleClose = () => {
        setName('');
        setDescription('');
        setCategoryId('');
        setFieldType('expiry_date');
        setRequiresDocument(true);
        setRequiresApproval(false);
        setErrors({});
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Create New Certification Type"
            size="medium"
            footer={
                <>
                    <button type="button" onClick={handleClose} disabled={createDefinition.isPending} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" form="create-definition-form" disabled={createDefinition.isPending} className="btn btn-primary flex items-center gap-2">
                        {createDefinition.isPending && <RandomMatrixSpinner size={16} />}
                        {createDefinition.isPending ? 'Creating...' : 'Create Cert Type'}
                    </button>
                </>
            }
        >
            <form id="create-definition-form" onSubmit={handleSubmit}>
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
                    placeholder="e.g., EN 9712 PAUT L2"
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
                    onChange={(e) => setFieldType(e.target.value)}
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
                        helperText="Documents must be approved by an admin before becoming active"
                    />
                </div>
            </form>
        </Modal>
    );
}

export default CreateDefinitionModal;
