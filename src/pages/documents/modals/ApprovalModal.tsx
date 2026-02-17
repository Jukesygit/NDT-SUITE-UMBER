import { useState, useCallback } from 'react';
import { Modal, FormTextarea } from '../../../components/ui';
import { useApproveRevision, useRejectRevision } from '../../../hooks/mutations/useDocumentMutations';
import type { DocumentRevision } from '../../../types/document-control';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    revision: DocumentRevision;
    action: 'approve' | 'reject';
}

export default function ApprovalModal({ isOpen, onClose, revision, action }: Props) {
    const [comments, setComments] = useState('');
    const [error, setError] = useState('');
    const approveMutation = useApproveRevision();
    const rejectMutation = useRejectRevision();

    const isApprove = action === 'approve';
    const isSubmitting = approveMutation.isPending || rejectMutation.isPending;

    const handleSubmit = useCallback(async () => {
        setError('');

        if (!isApprove && !comments.trim()) {
            setError('Please provide a reason for rejection.');
            return;
        }

        try {
            if (isApprove) {
                await approveMutation.mutateAsync({
                    revisionId: revision.id,
                    comments: comments.trim() || undefined,
                });
            } else {
                await rejectMutation.mutateAsync({
                    revisionId: revision.id,
                    comments: comments.trim(),
                });
            }
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Operation failed');
        }
    }, [isApprove, comments, revision.id, approveMutation, rejectMutation, onClose]);

    const footer = (
        <div className="flex justify-end gap-3">
            <button onClick={onClose} disabled={isSubmitting} className="glass-btn">
                Cancel
            </button>
            <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="glass-btn"
                style={{
                    color: isApprove ? '#22c55e' : '#ef4444',
                    borderColor: isApprove ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                }}
            >
                {isSubmitting ? 'Processing...' : isApprove ? 'Approve' : 'Reject'}
            </button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isApprove ? `Approve Revision ${revision.revision_number}` : `Reject Revision ${revision.revision_number}`}
            size="medium"
            footer={footer}
        >
            <div className="space-y-4">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <p className="text-sm text-gray-300">
                    {isApprove
                        ? 'This will mark the revision as approved and make it the current "for issue" version. Any previous approved revision will be superseded.'
                        : 'Please provide a reason for rejection. The document author will be able to see these comments.'}
                </p>

                <FormTextarea
                    label={isApprove ? 'Comments (optional)' : 'Rejection Reason'}
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder={isApprove ? 'Optional approval notes...' : 'Reason for rejection...'}
                    rows={3}
                    required={!isApprove}
                />
            </div>
        </Modal>
    );
}
