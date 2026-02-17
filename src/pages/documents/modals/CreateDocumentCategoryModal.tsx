import { useState, FormEvent } from 'react';
import Modal from '../../../components/ui/Modal/Modal';
import FormField from '../../../components/ui/Form/FormField';
import { FormTextarea } from '../../../components/ui';
import { useCreateDocumentCategory } from '../../../hooks/mutations';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';

export interface CreateDocumentCategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface FormErrors {
    name?: string;
    api?: string;
}

export default function CreateDocumentCategoryModal({ isOpen, onClose }: CreateDocumentCategoryModalProps) {
    const createCategory = useCreateDocumentCategory();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [errors, setErrors] = useState<FormErrors>({});

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
            await createCategory.mutateAsync({
                name: trimmedName,
                description: description.trim() || undefined,
            });
            setName('');
            setDescription('');
            setErrors({});
            onClose();
        } catch (error: unknown) {
            setErrors({ api: error instanceof Error ? error.message : 'Failed to create category' });
        }
    };

    const handleClose = () => {
        setName('');
        setDescription('');
        setErrors({});
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Create Document Category"
            size="small"
            footer={
                <>
                    <button type="button" onClick={handleClose} disabled={createCategory.isPending} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" form="create-doc-category-form" disabled={createCategory.isPending} className="btn btn-primary flex items-center gap-2">
                        {createCategory.isPending && <RandomMatrixSpinner size={16} />}
                        {createCategory.isPending ? 'Creating...' : 'Create Category'}
                    </button>
                </>
            }
        >
            <form id="create-doc-category-form" onSubmit={handleSubmit}>
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
            </form>
        </Modal>
    );
}
