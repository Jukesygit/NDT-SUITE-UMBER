import { useState, useCallback } from 'react';
import { Modal, SectionSpinner, ErrorDisplay } from '../../../components/ui';
import { useDocument } from '../../../hooks/queries/useDocuments';
import { useSubmitForReview } from '../../../hooks/mutations/useDocumentMutations';
import DocumentStatusBadge from '../components/DocumentStatusBadge';
import RevisionHistory from '../components/RevisionHistory';
import CreateRevisionModal from './CreateRevisionModal';
import ApprovalModal from './ApprovalModal';
import EditDocumentModal from './EditDocumentModal';
import type { DocumentRevision } from '../../../types/document-control';
import { getDocumentFileUrl } from '../../../services/document-control-service.ts';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    documentId: string;
    canManage: boolean;
}

export default function DocumentDetailModal({ isOpen, onClose, documentId, canManage }: Props) {
    const { data: doc, isLoading, error } = useDocument(documentId);
    const submitForReview = useSubmitForReview();

    const [showRevisionModal, setShowRevisionModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [approvalRevision, setApprovalRevision] = useState<DocumentRevision | null>(null);
    const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');

    const handleDownloadCurrent = useCallback(async () => {
        if (!doc?.current_revision) return;
        const rev = doc.current_revision as unknown as DocumentRevision;
        const url = await getDocumentFileUrl(rev.file_path);
        window.open(url, '_blank');
    }, [doc]);

    const handleSubmitForReview = useCallback(async (rev: DocumentRevision) => {
        await submitForReview.mutateAsync(rev.id);
    }, [submitForReview]);

    const handleApprove = useCallback((rev: DocumentRevision) => {
        setApprovalRevision(rev);
        setApprovalAction('approve');
    }, []);

    const handleReject = useCallback((rev: DocumentRevision) => {
        setApprovalRevision(rev);
        setApprovalAction('reject');
    }, []);

    if (isLoading) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Document Details" size="xl">
                <SectionSpinner message="Loading document..." />
            </Modal>
        );
    }

    if (error || !doc) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Document Details" size="xl">
                <ErrorDisplay error={error || new Error('Document not found')} />
            </Modal>
        );
    }

    const category = doc.category as { name: string } | undefined;
    const owner = doc.owner as { username: string; email: string } | undefined;

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={`${doc.doc_number} - ${doc.title}`} size="xl">
                <div className="space-y-6">
                    {/* Header info */}
                    <div className="grid grid-cols-2 gap-4">
                        <InfoRow label="Document #" value={doc.doc_number} />
                        <InfoRow label="Status" value={<DocumentStatusBadge status={doc.status} />} />
                        <InfoRow label="Category" value={category?.name || '-'} />
                        <InfoRow label="Owner" value={owner?.username || '-'} />
                        <InfoRow label="Review Period" value={`${doc.review_period_months} months`} />
                        <InfoRow
                            label="Next Review"
                            value={doc.next_review_date
                                ? new Date(doc.next_review_date).toLocaleDateString()
                                : 'Not set'
                            }
                        />
                    </div>

                    {doc.description && (
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider">Description</label>
                            <p className="text-sm text-gray-300 mt-1">{doc.description}</p>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                        {doc.current_revision && (
                            <button onClick={handleDownloadCurrent} className="glass-btn glass-btn-primary text-sm">
                                Download Current Version
                            </button>
                        )}
                        {canManage && (
                            <>
                                <button onClick={() => setShowRevisionModal(true)} className="glass-btn text-sm">
                                    Upload New Revision
                                </button>
                                <button onClick={() => setShowEditModal(true)} className="glass-btn text-sm">
                                    Edit Details
                                </button>
                            </>
                        )}
                    </div>

                    {/* Revision history */}
                    <div>
                        <h3 className="text-sm font-medium text-gray-300 mb-3">Revision History</h3>
                        <RevisionHistory
                            documentId={documentId}
                            canManage={canManage}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            onSubmitForReview={handleSubmitForReview}
                        />
                    </div>
                </div>
            </Modal>

            {showRevisionModal && (
                <CreateRevisionModal
                    isOpen={showRevisionModal}
                    onClose={() => setShowRevisionModal(false)}
                    documentId={documentId}
                />
            )}

            {showEditModal && (
                <EditDocumentModal
                    isOpen={showEditModal}
                    onClose={() => setShowEditModal(false)}
                    document={doc}
                />
            )}

            {approvalRevision && (
                <ApprovalModal
                    isOpen={!!approvalRevision}
                    onClose={() => setApprovalRevision(null)}
                    revision={approvalRevision}
                    action={approvalAction}
                />
            )}
        </>
    );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">{label}</label>
            <div className="text-sm text-gray-200 mt-0.5">{value}</div>
        </div>
    );
}
