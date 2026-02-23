import { useState } from 'react';
import { ErrorDisplay, SectionSpinner } from '../../../components/ui';
import { useDocumentsDueForReview } from '../../../hooks/queries/useDocuments';
import ReviewCompleteModal from '../modals/ReviewCompleteModal';
import DocumentDetailModal from '../modals/DocumentDetailModal';
import type { ReviewDueDocument } from '../../../types/document-control';

export default function ReviewDashboardTab() {
    const { data: reviewDocs = [], isLoading, error } = useDocumentsDueForReview(90);
    const [reviewDoc, setReviewDoc] = useState<ReviewDueDocument | null>(null);
    const [detailDocId, setDetailDocId] = useState<string | null>(null);

    if (error) return <ErrorDisplay error={error} />;

    const overdue = reviewDocs.filter(d => d.is_overdue);
    const dueSoon = reviewDocs.filter(d => !d.is_overdue);

    return (
        <div style={{ padding: '24px' }}>
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <SectionSpinner message="Loading review data..." />
                </div>
            ) : reviewDocs.length === 0 ? (
                <div className="dc-empty">
                    <div className="dc-empty-icon" style={{ color: '#22c55e' }}>
                        <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                    </div>
                    <div className="dc-empty-title">All documents up to date</div>
                    <div className="dc-empty-text">No documents are due for review in the next 90 days.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {overdue.length > 0 && (
                        <div>
                            <div style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}>
                                <span className="dc-sidebar-dot red" />
                                <span style={{ color: 'rgba(252, 165, 165, 0.95)' }}>
                                    Overdue ({overdue.length})
                                </span>
                            </div>
                            <ReviewList
                                items={overdue}
                                onViewDocument={setDetailDocId}
                                onCompleteReview={setReviewDoc}
                            />
                        </div>
                    )}

                    {dueSoon.length > 0 && (
                        <div>
                            <div style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}>
                                <span className="dc-sidebar-dot warn" />
                                <span style={{ color: 'rgba(253, 224, 71, 0.95)' }}>
                                    Due Soon ({dueSoon.length})
                                </span>
                            </div>
                            <ReviewList
                                items={dueSoon}
                                onViewDocument={setDetailDocId}
                                onCompleteReview={setReviewDoc}
                            />
                        </div>
                    )}
                </div>
            )}

            {reviewDoc && (
                <ReviewCompleteModal
                    isOpen={!!reviewDoc}
                    onClose={() => setReviewDoc(null)}
                    documentId={reviewDoc.document_id}
                    docNumber={reviewDoc.doc_number}
                />
            )}

            {detailDocId && (
                <DocumentDetailModal
                    isOpen={!!detailDocId}
                    onClose={() => setDetailDocId(null)}
                    documentId={detailDocId}
                    canManage={true}
                />
            )}
        </div>
    );
}

function ReviewList({
    items,
    onViewDocument,
    onCompleteReview,
}: {
    items: ReviewDueDocument[];
    onViewDocument: (id: string) => void;
    onCompleteReview: (doc: ReviewDueDocument) => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map((item) => (
                <div
                    key={item.document_id}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '16px 20px',
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '12px',
                        transition: 'all 0.2s',
                    }}
                >
                    <div className="dc-doc-icon">
                        <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14,2 14,8 20,8" />
                        </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dc-doc-row">
                            <span className="dc-doc-title">{item.title}</span>
                            <span className="dc-doc-num">{item.doc_number}</span>
                        </div>
                        <div className="dc-doc-meta">
                            <span>{item.category_name}</span>
                            <span>{item.owner_username}</span>
                            <span className={`dc-review-tag ${item.is_overdue ? 'overdue' : 'soon'}`}>
                                {item.is_overdue
                                    ? `${Math.abs(item.days_until_review)}d overdue`
                                    : `${item.days_until_review}d left`
                                }
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                            onClick={() => onViewDocument(item.document_id)}
                            className="dc-btn"
                            style={{ padding: '6px 14px', fontSize: '12px' }}
                        >
                            View
                        </button>
                        <button
                            onClick={() => onCompleteReview(item)}
                            className="dc-btn"
                            style={{
                                padding: '6px 14px',
                                fontSize: '12px',
                                color: 'rgba(134, 239, 172, 0.95)',
                                borderColor: 'rgba(34, 197, 94, 0.3)',
                            }}
                        >
                            No Changes Needed
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
