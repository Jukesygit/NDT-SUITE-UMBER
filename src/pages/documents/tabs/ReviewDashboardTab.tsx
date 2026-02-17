import { useState } from 'react';
import { ErrorDisplay, SectionSpinner } from '../../../components/ui';
import { useDocumentsDueForReview } from '../../../hooks/queries/useDocuments';
import DocumentStats from '../components/DocumentStats';
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
        <div className="space-y-6">
            <DocumentStats />

            {isLoading ? (
                <SectionSpinner message="Loading review data..." />
            ) : reviewDocs.length === 0 ? (
                <div className="glass-panel p-8 rounded-lg text-center">
                    <svg className="w-12 h-12 text-green-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-200">All documents up to date</h3>
                    <p className="text-sm text-gray-400 mt-1">No documents are due for review in the next 90 days.</p>
                </div>
            ) : (
                <>
                    {overdue.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-400" />
                                Overdue ({overdue.length})
                            </h3>
                            <ReviewList
                                items={overdue}
                                onViewDocument={setDetailDocId}
                                onCompleteReview={setReviewDoc}
                            />
                        </div>
                    )}

                    {dueSoon.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-yellow-400 mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                                Due Soon ({dueSoon.length})
                            </h3>
                            <ReviewList
                                items={dueSoon}
                                onViewDocument={setDetailDocId}
                                onCompleteReview={setReviewDoc}
                            />
                        </div>
                    )}
                </>
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
        <div className="space-y-2">
            {items.map((item) => (
                <div
                    key={item.document_id}
                    className="glass-panel p-4 rounded-lg flex items-center justify-between gap-4"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-[var(--accent-primary)]">{item.doc_number}</span>
                            <span className="text-sm text-gray-200 truncate">{item.title}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                            <span>{item.category_name}</span>
                            <span>Owner: {item.owner_username}</span>
                            <span className={item.is_overdue ? 'text-red-400 font-medium' : ''}>
                                {item.is_overdue
                                    ? `${Math.abs(item.days_until_review)} days overdue`
                                    : `Due in ${item.days_until_review} days`
                                }
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                        <button
                            onClick={() => onViewDocument(item.document_id)}
                            className="glass-btn text-xs px-3 py-1.5"
                        >
                            View
                        </button>
                        <button
                            onClick={() => onCompleteReview(item)}
                            className="glass-btn text-xs px-3 py-1.5"
                            style={{ color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.3)' }}
                        >
                            No Changes Needed
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
