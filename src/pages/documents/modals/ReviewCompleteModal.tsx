import { useState, useCallback } from 'react';
import { Modal, FormTextarea } from '../../../components/ui';
import { useCompleteReviewNoChanges } from '../../../hooks/mutations/useDocumentMutations';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    documentId: string;
    docNumber: string;
}

export default function ReviewCompleteModal({ isOpen, onClose, documentId, docNumber }: Props) {
    const [reviewNotes, setReviewNotes] = useState('');
    const [error, setError] = useState('');
    const completeReview = useCompleteReviewNoChanges();

    const handleSubmit = useCallback(async () => {
        setError('');
        try {
            await completeReview.mutateAsync({
                documentId,
                reviewNotes: reviewNotes.trim() || undefined,
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to complete review');
        }
    }, [documentId, reviewNotes, completeReview, onClose]);

    const footer = (
        <div className="flex justify-end gap-3">
            <button onClick={onClose} disabled={completeReview.isPending} className="dc-btn">Cancel</button>
            <button
                onClick={handleSubmit}
                disabled={completeReview.isPending}
                className="dc-btn"
                style={{ color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.3)' }}
            >
                {completeReview.isPending ? 'Completing...' : 'Confirm Review Complete'}
            </button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Review Complete - ${docNumber}`} size="medium" footer={footer}>
            <div className="space-y-4">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <p className="text-sm text-gray-300">
                    This confirms the document has been reviewed and no changes are needed.
                    The next review date will be recalculated based on the review period.
                </p>

                <FormTextarea
                    label="Review Notes (optional)"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Any notes about this review..."
                    rows={3}
                />
            </div>
        </Modal>
    );
}
