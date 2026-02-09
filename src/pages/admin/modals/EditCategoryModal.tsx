/**
 * EditCategoryModal - Modal for editing competency categories
 */

import { useState, useEffect, FormEvent } from 'react';
import Modal from '../../../components/ui/Modal/Modal';
import FormField from '../../../components/ui/Form/FormField';
import { FormTextarea, FormCheckbox } from '../../../components/ui';
import { useUpdateCategory } from '../../../hooks/mutations';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';
import type { CompetencyCategory } from '../../../hooks/queries/useCompetencies';

export interface EditCategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: CompetencyCategory;
}

interface FormErrors {
    name?: string;
    api?: string;
}

export function EditCategoryModal({ isOpen, onClose, category }: EditCategoryModalProps) {
    const updateCategory = useUpdateCategory();

    const [name, setName] = useState(category.name);
    const [description, setDescription] = useState(category.description || '');
    const [isActive, setIsActive] = useState(category.is_active);
    const [errors, setErrors] = useState<FormErrors>({});

    // Reset form when category changes
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
                data: {
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

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Category"
            size="small"
            footer={
                <>
                    <button type="button" onClick={onClose} disabled={updateCategory.isPending} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" form="edit-category-form" disabled={updateCategory.isPending} className="btn btn-primary flex items-center gap-2">
                        {updateCategory.isPending && <RandomMatrixSpinner size={16} />}
                        {updateCategory.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </>
            }
        >
            <form id="edit-category-form" onSubmit={handleSubmit}>
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
                    autoFocus
                />

                <FormTextarea
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                    rows={3}
                />

                <FormCheckbox
                    label="Active"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    helperText="Inactive categories are hidden from users"
                />
            </form>
        </Modal>
    );
}

export default EditCategoryModal;
