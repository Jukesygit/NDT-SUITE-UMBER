import { useState, useEffect, FormEvent } from 'react';
import Modal from '../../../components/ui/Modal/Modal';
import FormField from '../../../components/ui/Form/FormField';
import { FormTextarea, FormCheckbox } from '../../../components/ui';
import { useUpdateDocumentCategory } from '../../../hooks/mutations';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';
import type { DocumentCategory } from '../../../types/document-control';

export interface EditDocumentCategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: DocumentCategory;
}

interface FormErrors {
    name?: string;
    api?: string;
}

export default function EditDocumentCategoryModal({ isOpen, onClose, category }: EditDocumentCategoryModalProps) {
    const updateCategory = useUpdateDocumentCategory();

    const [name, setName] = useState(category.name);
    const [description, setDescription] = useState(category.description || '');
    const [isActive, setIsActive] = useState(category.is_active);
    const [errors, setErrors] = useState<FormErrors>({});

    useEffect(() => {
        setName(category.name);
        setDescription(category.description || '');
        setIsActive(category.is_active);
        setErrors({});
    }, [category]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        const trimmedName = name.trim();
        if (!trimmedName) {
            setErrors({ name: 'Category name is required' });
            return;
        }
        if (trimmedName.length < 2) {
            setErrors({ name: 'Category name must be at least 2 characters' });
            return;
        }

        try {
            await updateCategory.mutateAsync({
                id: category.id,
                updates: {
                    name: trimmedName,
                    description: description.trim() || undefined,
                    is_active: isActive,
                },
            });
            setErrors({});
            onClose();
        } catch (error: unknown) {
            setErrors({ api: error instanceof Error ? error.message : 'Failed to update category' });
        }
    };

    const handleClose = () => {
        setErrors({});
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Edit Document Category"
            size="small"
            footer={
                <>
                    <button type="button" onClick={handleClose} disabled={updateCategory.isPending} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" form="edit-doc-category-form" disabled={updateCategory.isPending} className="btn btn-primary flex items-center gap-2">
                        {updateCategory.isPending && <RandomMatrixSpinner size={16} />}
                        {updateCategory.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </>
            }
        >
            <form id="edit-doc-category-form" onSubmit={handleSubmit}>
                {errors.api && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/50">
                        <p className="text-sm text-red-400">{errors.api}</p>
                    </div>
                )}

                <FormField
                    label="Category Name"
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setErrors({}); }}
                    error={errors.name}
                    required
                    placeholder="e.g., Safety Procedures"
                    autoFocus
                />

                <FormTextarea
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description for this category"
                    rows={3}
                />

                <FormCheckbox
                    label="Active"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    helperText="Inactive categories won't appear in document creation dropdowns"
                />
            </form>
        </Modal>
    );
}
