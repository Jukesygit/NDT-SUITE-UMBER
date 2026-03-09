import { useState, useCallback, useEffect } from 'react';
import { SectionSpinner, ErrorDisplay } from '../../../components/ui';
import { useDocument } from '../../../hooks/queries/useDocuments';
import { useSubmitForReview } from '../../../hooks/mutations/useDocumentMutations';
import DocumentStatusBadge from './DocumentStatusBadge';
import RevisionHistory from './RevisionHistory';
import CreateRevisionModal from '../modals/CreateRevisionModal';
import ApprovalModal from '../modals/ApprovalModal';
import EditDocumentModal from '../modals/EditDocumentModal';
import type { DocumentRevision } from '../../../types/document-control';
import { getDocumentFileUrl } from '../../../services/document-control-service.ts';

interface Props {
    documentId: string;
    canManage: boolean;
    onBack: () => void;
}

function detectFileType(fileName: string): 'pdf' | 'image' | 'other' {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (/\.(jpe?g|png|gif|webp|bmp|svg)$/.test(lower)) return 'image';
    return 'other';
}

export default function DocumentDetailView({ documentId, canManage, onBack }: Props) {
    const { data: doc, isLoading, error } = useDocument(documentId);
    const submitForReview = useSubmitForReview();

    const [showRevisionModal, setShowRevisionModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [approvalRevision, setApprovalRevision] = useState<DocumentRevision | null>(null);
    const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');

    // Document preview state
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewType, setPreviewType] = useState<'pdf' | 'image' | 'other'>('other');

    // Load document preview when doc is available
    useEffect(() => {
        if (!doc?.current_revision) {
            setPreviewUrl(null);
            return;
        }
        const rev = doc.current_revision as unknown as DocumentRevision;
        if (!rev.file_path) return;

        const type = detectFileType(rev.file_name || rev.file_path);
        setPreviewType(type);

        if (type === 'other') return;

        setPreviewLoading(true);
        getDocumentFileUrl(rev.file_path)
            .then(url => setPreviewUrl(url))
            .catch(() => setPreviewUrl(null))
            .finally(() => setPreviewLoading(false));
    }, [doc]);

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
            <div className="dc-detail-view">
                <SectionSpinner message="Loading document..." />
            </div>
        );
    }

    if (error || !doc) {
        return (
            <div className="dc-detail-view">
                <ErrorDisplay error={error || new Error('Document not found')} />
            </div>
        );
    }

    const category = doc.category as { name: string } | undefined;
    const owner = doc.owner as { username: string; email: string } | undefined;
    const currentRev = doc.current_revision as unknown as DocumentRevision | undefined;

    return (
        <>
            <div className="dc-detail-view">
                {/* Back button + title bar */}
                <div className="dc-detail-header">
                    <button className="dc-detail-back" onClick={onBack}>
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                        Back to Documents
                    </button>
                    <div className="dc-detail-title-row">
                        <div className="dc-doc-icon" style={{ width: 40, height: 40, borderRadius: 10 }}>
                            <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14,2 14,8 20,8" />
                            </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 className="dc-detail-title">{doc.title}</h2>
                            <span className="dc-doc-num" style={{ fontSize: 13 }}>{doc.doc_number}</span>
                        </div>
                        <DocumentStatusBadge status={doc.status} />
                    </div>
                </div>

                {/* Main content: preview + info side by side */}
                <div className="dc-detail-body">
                    {/* Document preview pane */}
                    <div className="dc-detail-preview">
                        {!currentRev ? (
                            <div className="dc-detail-no-file">
                                <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14,2 14,8 20,8" />
                                </svg>
                                <p>No file uploaded yet</p>
                            </div>
                        ) : previewLoading ? (
                            <SectionSpinner message="Loading preview..." />
                        ) : previewType === 'pdf' && previewUrl ? (
                            <iframe
                                src={previewUrl}
                                className="dc-detail-iframe"
                                title={`Preview of ${doc.title}`}
                            />
                        ) : previewType === 'image' && previewUrl ? (
                            <div className="dc-detail-image-wrap">
                                <img
                                    src={previewUrl}
                                    alt={doc.title}
                                    className="dc-detail-image"
                                />
                            </div>
                        ) : (
                            <div className="dc-detail-no-preview">
                                <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14,2 14,8 20,8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10,9 9,9 8,9" />
                                </svg>
                                <p>Preview not available for this file type</p>
                                <button onClick={handleDownloadCurrent} className="dc-btn primary" style={{ marginTop: 12 }}>
                                    Download to View
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Info panel */}
                    <div className="dc-detail-info">
                        {/* Metadata grid */}
                        <div className="dc-detail-meta-grid">
                            <InfoRow label="Document #" value={doc.doc_number} />
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
                            {currentRev && (
                                <InfoRow label="Current Rev" value={`Rev ${currentRev.revision_number}`} />
                            )}
                        </div>

                        {doc.description && (
                            <div style={{ marginTop: 16 }}>
                                <label className="dc-detail-label">Description</label>
                                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4, lineHeight: 1.5 }}>
                                    {doc.description}
                                </p>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="dc-detail-actions">
                            {currentRev && (
                                <button onClick={handleDownloadCurrent} className="dc-btn primary" style={{ fontSize: 13 }}>
                                    Download Current Version
                                </button>
                            )}
                            {canManage && (
                                <>
                                    <button onClick={() => setShowRevisionModal(true)} className="dc-btn" style={{ fontSize: 13 }}>
                                        Upload New Revision
                                    </button>
                                    <button onClick={() => setShowEditModal(true)} className="dc-btn" style={{ fontSize: 13 }}>
                                        Edit Details
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Revision history */}
                        <div style={{ marginTop: 20 }}>
                            <h3 className="dc-detail-section-title">Revision History</h3>
                            <RevisionHistory
                                documentId={documentId}
                                canManage={canManage}
                                onApprove={handleApprove}
                                onReject={handleReject}
                                onSubmitForReview={handleSubmitForReview}
                            />
                        </div>
                    </div>
                </div>
            </div>

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
        <div className="dc-detail-meta-item">
            <label className="dc-detail-label">{label}</label>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.95)', marginTop: 2 }}>{value}</div>
        </div>
    );
}
