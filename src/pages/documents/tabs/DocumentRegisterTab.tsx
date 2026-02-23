import { useState, useMemo, useCallback } from 'react';
import { ErrorDisplay } from '../../../components/ui';
import { useDocuments } from '../../../hooks/queries/useDocuments';
import type { Document, DocumentFilters as Filters } from '../../../types/document-control';
import DocumentStatusBadge from '../components/DocumentStatusBadge';
import DocumentFilters from '../components/DocumentFilters';
import CreateDocumentModal from '../modals/CreateDocumentModal';
import DocumentDetailModal from '../modals/DocumentDetailModal';

interface Props {
    canManage: boolean;
    search: string;
}

export default function DocumentRegisterTab({ canManage, search }: Props) {
    const [filters, setFilters] = useState<Filters>({});
    const [showCreate, setShowCreate] = useState(false);
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

    const queryFilters = useMemo(() => ({
        ...filters,
        search: search || undefined,
    }), [filters, search]);

    const { data: documents = [], isLoading, error } = useDocuments(queryFilters);

    const sortedData = useMemo(() => {
        return [...documents].sort((a, b) =>
            String(a.doc_number).localeCompare(String(b.doc_number), undefined, { numeric: true })
        );
    }, [documents]);

    const handleRowClick = useCallback((doc: Document) => {
        setSelectedDocId(doc.id);
    }, []);

    if (error) return <ErrorDisplay error={error} />;

    const getReviewDateInfo = (dateStr: string | null) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = date.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { text: `${Math.abs(diffDays)}d overdue`, className: 'overdue' };
        }
        if (diffDays <= 30) {
            return { text: `${diffDays}d left`, className: 'soon' };
        }
        return {
            text: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            className: '',
        };
    };

    return (
        <>
            <DocumentFilters
                filters={filters}
                onFilterChange={setFilters}
            />

            {canManage && (
                <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        className="dc-btn primary"
                        onClick={() => setShowCreate(true)}
                    >
                        + New Document
                    </button>
                </div>
            )}

            <div className="dc-doc-list glass-scrollbar">
                {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="dc-skeleton-row">
                            <div className="dc-skeleton-icon" />
                            <div className="dc-skeleton-lines">
                                <div className="dc-skeleton-line" />
                                <div className="dc-skeleton-line" />
                                <div className="dc-skeleton-line" />
                            </div>
                        </div>
                    ))
                ) : sortedData.length === 0 ? (
                    <div className="dc-empty">
                        <div className="dc-empty-icon">
                            <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14,2 14,8 20,8" />
                            </svg>
                        </div>
                        <div className="dc-empty-title">No documents found</div>
                        <div className="dc-empty-text">
                            {canManage
                                ? 'Create your first controlled document to get started.'
                                : 'No approved documents are available yet.'}
                        </div>
                        {canManage && (
                            <button
                                className="dc-btn primary"
                                style={{ marginTop: '16px' }}
                                onClick={() => setShowCreate(true)}
                            >
                                + New Document
                            </button>
                        )}
                    </div>
                ) : (
                    sortedData.map((doc, i) => {
                        const reviewInfo = getReviewDateInfo(doc.next_review_date);
                        const categoryName = (doc.category as { name: string } | undefined)?.name;
                        const ownerName = (doc.owner as { username: string } | undefined)?.username;
                        const currentRev = doc.current_revision;

                        return (
                            <div
                                key={doc.id}
                                className="dc-doc-item"
                                style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
                                onClick={() => handleRowClick(doc)}
                            >
                                <div className="dc-doc-icon">
                                    <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14,2 14,8 20,8" />
                                    </svg>
                                </div>
                                <div className="dc-doc-body">
                                    <div className="dc-doc-row">
                                        <span className="dc-doc-title">{doc.title}</span>
                                        <span className="dc-doc-num">{doc.doc_number}</span>
                                    </div>
                                    {doc.description && (
                                        <div className="dc-doc-desc">{doc.description}</div>
                                    )}
                                    <div className="dc-doc-meta">
                                        {categoryName && <span>{categoryName}</span>}
                                        {currentRev && <span>Rev {currentRev.revision_number}</span>}
                                        {ownerName && <span>{ownerName}</span>}
                                    </div>
                                </div>
                                <div className="dc-doc-right">
                                    <DocumentStatusBadge status={doc.status} />
                                    {reviewInfo && (
                                        <span className={`dc-review-date ${reviewInfo.className}`}>
                                            {reviewInfo.text}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {showCreate && (
                <CreateDocumentModal
                    isOpen={showCreate}
                    onClose={() => setShowCreate(false)}
                />
            )}

            {selectedDocId && (
                <DocumentDetailModal
                    isOpen={!!selectedDocId}
                    onClose={() => setSelectedDocId(null)}
                    documentId={selectedDocId}
                    canManage={canManage}
                />
            )}
        </>
    );
}
