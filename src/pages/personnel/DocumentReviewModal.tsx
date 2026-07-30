/**
 * DocumentReviewModal - Modal for reviewing competency documents
 * Split view with document on left, competency details + actions on right
 */

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { PendingApproval } from '../../hooks/queries/useCompetencies';
import { useApproveCompetency, useRejectCompetency, useRequestChanges } from '../../hooks/mutations/useCompetencyMutations';
import competencyService from '../../services/competency-service.ts';
import { normalizeCompetencyDocuments } from '../../utils/competency-documents';
import { DocumentViewerColumn } from './DocumentViewerColumn';

interface DocumentReviewModalProps {
    approval: PendingApproval;
    onClose: () => void;
    onActionComplete: () => void;
}

type ActionType = 'approve' | 'reject' | 'changes' | null;

/**
 * Format date for display
 */
function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Close icon
 */
function CloseIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 5L5 15M5 5L15 15" />
        </svg>
    );
}

/**
 * Loading spinner
 */
function Spinner() {
    return (
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" />
        </svg>
    );
}

/**
 * Detail row component
 */
function DetailRow({ label, value, highlight = false }: { label: string; value: string | null | undefined; highlight?: boolean }) {
    return (
        <div className="pm-display-field" style={{ marginBottom: '12px' }}>
            <div className="pm-display-label">{label}</div>
            <div className="pm-display-value" style={{ color: highlight ? '#60a5fa' : undefined, fontWeight: highlight ? '500' : undefined }}>
                {value || 'Not specified'}
            </div>
        </div>
    );
}

/**
 * DocumentReviewModal component
 */
export function DocumentReviewModal({ approval, onClose, onActionComplete }: DocumentReviewModalProps) {
    // All documents ("pages") for the competency under review, in page order.
    const documents = useMemo(() => normalizeCompetencyDocuments(approval), [approval]);
    const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({});
    const [loadingDocuments, setLoadingDocuments] = useState(true);
    const [documentError, setDocumentError] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [activeAction, setActiveAction] = useState<ActionType>(null);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const approveMutation = useApproveCompetency();
    const rejectMutation = useRejectCompetency();
    const requestChangesMutation = useRequestChanges();

    // Batch-resolve signed URLs for every document via the shared service.
    useEffect(() => {
        let cancelled = false;
        async function loadDocumentUrls() {
            if (documents.length === 0) {
                setDocumentError('No document attached');
                setLoadingDocuments(false);
                return;
            }
            setLoadingDocuments(true);
            setDocumentError(null);
            try {
                const urls = await competencyService.getDocumentUrls(documents.map((d) => d.document_url));
                if (!cancelled) setDocumentUrls(urls);
            } catch {
                if (!cancelled) setDocumentError('Failed to load document');
            } finally {
                if (!cancelled) setLoadingDocuments(false);
            }
        }

        loadDocumentUrls();
        return () => {
            cancelled = true;
        };
    }, [approval.id, documents]);

    // Handle Escape key
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape' && !submitting) {
                onClose();
            }
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, submitting]);

    // Prevent body scroll
    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    const handleApprove = async () => {
        setSubmitting(true);
        try {
            await approveMutation.mutateAsync({ competencyId: approval.id });
            onActionComplete();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('Approve failed:', err);
            alert(`Failed to approve document: ${msg}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!comment.trim()) {
            alert('Please provide a reason for rejection.');
            return;
        }
        setSubmitting(true);
        try {
            await rejectMutation.mutateAsync({ competencyId: approval.id, reason: comment });
            onActionComplete();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('Reject failed:', err);
            alert(`Failed to reject document: ${msg}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRequestChanges = async () => {
        if (!comment.trim()) {
            alert('Please provide details about the changes needed.');
            return;
        }
        setSubmitting(true);
        try {
            await requestChangesMutation.mutateAsync({ competencyId: approval.id, comment });
            onActionComplete();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('Request changes failed:', err);
            alert(`Failed to request changes: ${msg}`);
        } finally {
            setSubmitting(false);
        }
    };

    const modalContent = (
        <div
            className="pm-modal-overlay"
            style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
            {/* Backdrop click area */}
            <div
                className="absolute inset-0"
                onClick={submitting ? undefined : onClose}
                aria-hidden="true"
            />

            {/* Modal */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="review-modal-title"
                className="pm-modal-panel relative w-full max-w-6xl"
                style={{ animation: 'scaleIn 0.2s ease-out', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            >
                {/* Header */}
                <div className="pm-modal-header" style={{ flexShrink: 0 }}>
                    <div>
                        <h2 id="review-modal-title" className="pm-modal-title">
                            Review Document
                        </h2>
                        <p className="pm-display-label" style={{ marginTop: '2px', textTransform: 'none', letterSpacing: 'normal', fontSize: '13px' }}>
                            {approval.competency?.name || 'Unknown Competency'} - {approval.user?.username || 'Unknown User'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="pm-modal-close disabled:opacity-50"
                        aria-label="Close modal"
                    >
                        <CloseIcon />
                    </button>
                </div>

                {/* Body - Split View */}
                <div className="flex-1 overflow-hidden flex" style={{ minHeight: 0 }}>
                    {/* Left: Document Viewer */}
                    <DocumentViewerColumn
                        documents={documents}
                        documentUrls={documentUrls}
                        loading={loadingDocuments}
                        error={documentError}
                        selectedIndex={selectedIndex}
                        onSelect={setSelectedIndex}
                    />

                    {/* Right: Details & Actions */}
                    <div className="w-96 flex-shrink-0 overflow-y-auto flex flex-col">
                        {/* Competency Details */}
                        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <div className="pm-display-label" style={{ marginBottom: '16px' }}>
                                Competency Details
                            </div>

                            <DetailRow label="Competency" value={approval.competency?.name} highlight />
                            <DetailRow label="Category" value={approval.competency?.category?.name} />
                            <DetailRow label="Submitted By" value={approval.user?.username} />
                            <DetailRow label="Email" value={approval.user?.email} />
                            <DetailRow label="Organization" value={approval.user?.organizations?.name} />
                        </div>

                        {/* Entered Values */}
                        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <div className="pm-display-label" style={{ marginBottom: '16px' }}>
                                Entered Values
                            </div>

                            {approval.value && <DetailRow label="Value / ID" value={approval.value} />}
                            {approval.issuing_body && <DetailRow label="Issuing Body" value={approval.issuing_body} />}
                            {approval.certification_id && <DetailRow label="Certification ID" value={approval.certification_id} />}
                            <DetailRow label="Expiry Date" value={formatDate(approval.expiry_date)} />
                            <DetailRow label="Submitted" value={formatDate(approval.created_at)} />
                            {approval.notes && (
                                <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                                    <div className="pm-display-label" style={{ marginBottom: '4px' }}>Notes</div>
                                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>{approval.notes}</div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ padding: '20px', flex: 1 }}>
                            <div className="pm-display-label" style={{ marginBottom: '16px' }}>
                                Actions
                            </div>

                            {/* Action Selection */}
                            {!activeAction && (
                                <div className="space-y-3">
                                    <button
                                        onClick={() => handleApprove()}
                                        disabled={submitting}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all disabled:opacity-50"
                                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff' }}
                                    >
                                        {submitting ? <Spinner /> : (
                                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                        Approve Document
                                    </button>

                                    <button
                                        onClick={() => setActiveAction('changes')}
                                        disabled={submitting}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all disabled:opacity-50"
                                        style={{ background: 'rgba(251, 191, 36, 0.2)', border: '1px solid rgba(251, 191, 36, 0.3)', color: '#fbbf24' }}
                                    >
                                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Request Changes
                                    </button>

                                    <button
                                        onClick={() => setActiveAction('reject')}
                                        disabled={submitting}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all disabled:opacity-50"
                                        style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444' }}
                                    >
                                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        Reject Document
                                    </button>
                                </div>
                            )}

                            {/* Comment Form for Request Changes */}
                            {activeAction === 'changes' && (
                                <div className="space-y-3">
                                    <div style={{ padding: '12px', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: '8px' }}>
                                        <p style={{ fontSize: '13px', color: '#fbbf24' }}>
                                            Describe the changes needed. The user will be notified and can resubmit.
                                        </p>
                                    </div>
                                    <textarea
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder="Please describe what changes are needed..."
                                        rows={4}
                                        className="pm-review-textarea"
                                        style={{ resize: 'none' }}
                                        disabled={submitting}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setActiveAction(null); setComment(''); }}
                                            disabled={submitting}
                                            className="pm-btn flex-1"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleRequestChanges}
                                            disabled={submitting || !comment.trim()}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50"
                                            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#ffffff' }}
                                        >
                                            {submitting ? <Spinner /> : 'Send Back'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Comment Form for Reject */}
                            {activeAction === 'reject' && (
                                <div className="space-y-3">
                                    <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px' }}>
                                        <p style={{ fontSize: '13px', color: '#ef4444' }}>
                                            Rejecting this document will mark it as invalid. Please provide a reason.
                                        </p>
                                    </div>
                                    <textarea
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder="Reason for rejection..."
                                        rows={4}
                                        className="pm-review-textarea"
                                        style={{ resize: 'none' }}
                                        disabled={submitting}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setActiveAction(null); setComment(''); }}
                                            disabled={submitting}
                                            className="pm-btn flex-1"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleReject}
                                            disabled={submitting || !comment.trim()}
                                            className="pm-btn danger flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {submitting ? <Spinner /> : 'Reject'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}

export default DocumentReviewModal;
