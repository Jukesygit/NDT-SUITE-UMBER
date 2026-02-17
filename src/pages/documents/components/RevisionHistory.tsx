import { useState } from 'react';
import { useDocumentRevisions } from '../../../hooks/queries/useDocuments';
import { SectionSpinner } from '../../../components/ui';
import DocumentStatusBadge from './DocumentStatusBadge';
import { getDocumentFileUrl } from '../../../services/document-control-service.ts';
import type { DocumentRevision } from '../../../types/document-control';

interface Props {
    documentId: string;
    canManage: boolean;
    onApprove?: (revision: DocumentRevision) => void;
    onReject?: (revision: DocumentRevision) => void;
    onSubmitForReview?: (revision: DocumentRevision) => void;
}

export default function RevisionHistory({ documentId, canManage, onApprove, onReject, onSubmitForReview }: Props) {
    const { data: revisions = [], isLoading } = useDocumentRevisions(documentId);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    const handleDownload = async (revision: DocumentRevision) => {
        setDownloadingId(revision.id);
        try {
            const url = await getDocumentFileUrl(revision.file_path);
            window.open(url, '_blank');
        } finally {
            setDownloadingId(null);
        }
    };

    if (isLoading) return <SectionSpinner message="Loading revisions..." />;

    if (revisions.length === 0) {
        return <p className="text-sm text-gray-500 text-center py-4">No revisions yet.</p>;
    }

    return (
        <div className="space-y-3">
            {revisions.map((rev) => (
                <div
                    key={rev.id}
                    className="glass-panel p-4 rounded-lg"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-medium text-gray-200">
                                    Rev {rev.revision_number}
                                </span>
                                <DocumentStatusBadge status={rev.status} />
                                {rev.is_review_only && (
                                    <span className="text-xs text-blue-400">(review only)</span>
                                )}
                            </div>
                            {rev.change_summary && (
                                <p className="text-sm text-gray-400 mt-1">{rev.change_summary}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                <span>{new Date(rev.created_at).toLocaleDateString()}</span>
                                <span>{rev.file_name}</span>
                                {rev.file_size && (
                                    <span>{(rev.file_size / 1024 / 1024).toFixed(1)} MB</span>
                                )}
                            </div>
                            {rev.review_comments && (
                                <div className="mt-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                                    <p className="text-xs text-yellow-400">
                                        Review: {rev.review_comments}
                                    </p>
                                    {rev.reviewer && (
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            - {(rev.reviewer as { username: string }).username}, {rev.reviewed_at && new Date(rev.reviewed_at).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                onClick={() => handleDownload(rev)}
                                disabled={downloadingId === rev.id}
                                className="glass-btn text-xs px-3 py-1.5"
                                title="Download"
                            >
                                {downloadingId === rev.id ? '...' : 'Download'}
                            </button>

                            {canManage && rev.status === 'draft' && onSubmitForReview && (
                                <button
                                    onClick={() => onSubmitForReview(rev)}
                                    className="glass-btn glass-btn-primary text-xs px-3 py-1.5"
                                >
                                    Submit
                                </button>
                            )}

                            {canManage && rev.status === 'under_review' && (
                                <>
                                    {onApprove && (
                                        <button
                                            onClick={() => onApprove(rev)}
                                            className="glass-btn text-xs px-3 py-1.5"
                                            style={{ color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.3)' }}
                                        >
                                            Approve
                                        </button>
                                    )}
                                    {onReject && (
                                        <button
                                            onClick={() => onReject(rev)}
                                            className="glass-btn text-xs px-3 py-1.5"
                                            style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                        >
                                            Reject
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
