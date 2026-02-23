import { useState, useCallback } from 'react';
import { Modal, FormField, FormSelect, FormTextarea } from '../../../components/ui';
import { useDocumentCategories } from '../../../hooks/queries/useDocuments';
import { useUpdateDocument } from '../../../hooks/mutations/useDocumentMutations';
import type { Document } from '../../../types/document-control';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    document: Document;
}

export default function EditDocumentModal({ isOpen, onClose, document: doc }: Props) {
    const { data: categories = [] } = useDocumentCategories();
    const updateDoc = useUpdateDocument();

    const [title, setTitle] = useState(doc.title);
    const [description, setDescription] = useState(doc.description || '');
    const [categoryId, setCategoryId] = useState(doc.category_id);
    const [reviewPeriod, setReviewPeriod] = useState(String(doc.review_period_months));
    const [error, setError] = useState('');

    const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }));
    const reviewOptions = [
        { value: '3', label: '3 months' },
        { value: '6', label: '6 months' },
        { value: '12', label: '12 months' },
        { value: '24', label: '24 months' },
        { value: '36', label: '36 months' },
    ];

    const handleSubmit = useCallback(async () => {
        if (!title.trim()) { setError('Title is required'); return; }

        try {
            await updateDoc.mutateAsync({
                id: doc.id,
                updates: {
                    title: title.trim(),
                    description: description.trim() || undefined,
                    category_id: categoryId,
                    review_period_months: parseInt(reviewPeriod),
                },
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update document');
        }
    }, [title, description, categoryId, reviewPeriod, doc.id, updateDoc, onClose]);

    const footer = (
        <div className="flex justify-end gap-3">
            <button onClick={onClose} disabled={updateDoc.isPending} className="dc-btn">Cancel</button>
            <button onClick={handleSubmit} disabled={updateDoc.isPending} className="dc-btn primary">
                {updateDoc.isPending ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${doc.doc_number}`} size="medium" footer={footer}>
            <div className="space-y-4">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <FormField
                    label="Document Number"
                    value={doc.doc_number}
                    disabled
                    readOnly
                />

                <FormField
                    label="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                />

                <FormTextarea
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                />

                <FormSelect
                    label="Category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    options={categoryOptions}
                />

                <FormSelect
                    label="Review Period"
                    value={reviewPeriod}
                    onChange={(e) => setReviewPeriod(e.target.value)}
                    options={reviewOptions}
                />
            </div>
        </Modal>
    );
}
