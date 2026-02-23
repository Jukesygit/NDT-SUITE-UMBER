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
        return (
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.38)', textAlign: 'center', padding: '16px 0' }}>
                No revisions yet.
            </p>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {revisions.map((rev) => (
                <div
                    key={rev.id}
                    style={{
                        padding: '16px 20px',
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '12px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.95)' }}>
                                    Rev {rev.revision_number}
                                </span>
                                <DocumentStatusBadge status={rev.status} />
                                {rev.is_review_only && (
                                    <span style={{ fontSize: '11px', color: 'rgba(147, 197, 253, 0.95)' }}>(review only)</span>
                                )}
                            </div>
                            {rev.change_summary && (
                                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginTop: '4px' }}>
                                    {rev.change_summary}
                                </p>
                            )}
                            <div className="dc-doc-meta" style={{ marginTop: '8px' }}>
                                <span>{new Date(rev.created_at).toLocaleDateString()}</span>
                                <span>{rev.file_name}</span>
                                {rev.file_size && (
                                    <span>{(rev.file_size / 1024 / 1024).toFixed(1)} MB</span>
                                )}
                            </div>
                            {rev.review_comments && (
                                <div style={{
                                    marginTop: '8px',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: 'rgba(251, 191, 36, 0.08)',
                                    border: '1px solid rgba(251, 191, 36, 0.15)',
                                }}>
                                    <p style={{ fontSize: '12px', color: 'rgba(253, 224, 71, 0.95)' }}>
                                        Review: {rev.review_comments}
                                    </p>
                                    {rev.reviewer && (
                                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)', marginTop: '4px' }}>
                                            &mdash; {(rev.reviewer as { username: string }).username}
                                            {rev.reviewed_at && `, ${new Date(rev.reviewed_at).toLocaleDateString()}`}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <button
                                onClick={() => handleDownload(rev)}
                                disabled={downloadingId === rev.id}
                                className="dc-btn"
                                style={{ padding: '6px 14px', fontSize: '12px' }}
                                title="Download"
                            >
                                {downloadingId === rev.id ? '...' : 'Download'}
                            </button>

                            {canManage && rev.status === 'draft' && onSubmitForReview && (
                                <button
                                    onClick={() => onSubmitForReview(rev)}
                                    className="dc-btn primary"
                                    style={{ padding: '6px 14px', fontSize: '12px' }}
                                >
                                    Submit
                                </button>
                            )}

                            {canManage && rev.status === 'under_review' && (
                                <>
                                    {onApprove && (
                                        <button
                                            onClick={() => onApprove(rev)}
                                            className="dc-btn"
                                            style={{
                                                padding: '6px 14px',
                                                fontSize: '12px',
                                                color: 'rgba(134, 239, 172, 0.95)',
                                                borderColor: 'rgba(34, 197, 94, 0.3)',
                                            }}
                                        >
                                            Approve
                                        </button>
                                    )}
                                    {onReject && (
                                        <button
                                            onClick={() => onReject(rev)}
                                            className="dc-btn"
                                            style={{
                                                padding: '6px 14px',
                                                fontSize: '12px',
                                                color: 'rgba(252, 165, 165, 0.95)',
                                                borderColor: 'rgba(239, 68, 68, 0.3)',
                                            }}
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
