/**
 * DocumentReviewModal - Modal for reviewing competency documents
 * Split view with document on left, competency details + actions on right
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PendingApproval } from '../../hooks/queries/useCompetencies';
import { useApproveCompetency, useRejectCompetency, useRequestChanges } from '../../hooks/mutations/useCompetencyMutations';
import competencyService from '../../services/competency-service.js';

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
        <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {label}
            </div>
            <div style={{ fontSize: '14px', color: highlight ? '#60a5fa' : '#ffffff', fontWeight: highlight ? '500' : '400' }}>
                {value || 'Not specified'}
            </div>
        </div>
    );
}

/**
 * DocumentReviewModal component
 */
export function DocumentReviewModal({ approval, onClose, onActionComplete }: DocumentReviewModalProps) {
    const [documentUrl, setDocumentUrl] = useState<string | null>(null);
    const [loadingDocument, setLoadingDocument] = useState(true);
    const [documentError, setDocumentError] = useState<string | null>(null);
    const [activeAction, setActiveAction] = useState<ActionType>(null);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const approveMutation = useApproveCompetency();
    const rejectMutation = useRejectCompetency();
    const requestChangesMutation = useRequestChanges();

    // Load document URL
    useEffect(() => {
        async function loadDocumentUrl() {
            if (!approval.document_url) {
                setDocumentError('No document attached');
                setLoadingDocument(false);
                return;
            }

            try {
                const url = await competencyService.getDocumentUrl(approval.document_url);
                setDocumentUrl(url);
            } catch {
                setDocumentError('Failed to load document');
            } finally {
                setLoadingDocument(false);
            }
        }

        loadDocumentUrl();
    }, [approval.document_url]);

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
        } catch {
            alert('Failed to approve document. Please try again.');
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
        } catch {
            alert('Failed to reject document. Please try again.');
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
        } catch {
            alert('Failed to request changes. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const isImage = approval.document_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isPdf = approval.document_name?.match(/\.pdf$/i);

    const modalContent = (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
            style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 backdrop-blur-sm"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
                onClick={submitting ? undefined : onClose}
                aria-hidden="true"
            />

            {/* Modal */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="review-modal-title"
                className="relative w-full max-w-6xl bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl"
                style={{ animation: 'scaleIn 0.2s ease-out', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10" style={{ flexShrink: 0 }}>
                    <div>
                        <h2 id="review-modal-title" className="text-lg font-semibold text-white">
                            Review Document
                        </h2>
                        <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px' }}>
                            {approval.competency?.name || 'Unknown Competency'} - {approval.user?.username || 'Unknown User'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors -mr-2 disabled:opacity-50"
                        aria-label="Close modal"
                    >
                        <CloseIcon />
                    </button>
                </div>

                {/* Body - Split View */}
                <div className="flex-1 overflow-hidden flex" style={{ minHeight: 0 }}>
                    {/* Left: Document Viewer */}
                    <div className="flex-1 border-r border-white/10 overflow-hidden flex flex-col" style={{ minWidth: 0 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', flexShrink: 0 }}>
                            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Document Preview
                            </div>
                            {approval.document_name && (
                                <div style={{ fontSize: '13px', color: '#60a5fa', marginTop: '4px' }}>
                                    {approval.document_name}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 overflow-auto p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                            {loadingDocument ? (
                                <div className="flex items-center justify-center h-full">
                                    <div style={{ textAlign: 'center' }}>
                                        <Spinner />
                                        <p style={{ marginTop: '12px', color: 'rgba(255, 255, 255, 0.5)', fontSize: '14px' }}>
                                            Loading document...
                                        </p>
                                    </div>
                                </div>
                            ) : documentError ? (
                                <div className="flex items-center justify-center h-full">
                                    <div style={{ textAlign: 'center', color: '#ef4444' }}>
                                        <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', opacity: 0.6 }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <p style={{ fontSize: '14px' }}>{documentError}</p>
                                    </div>
                                </div>
                            ) : isImage && documentUrl ? (
                                <div className="flex items-center justify-center h-full">
                                    <img
                                        src={documentUrl}
                                        alt={approval.document_name || 'Document'}
                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }}
                                    />
                                </div>
                            ) : isPdf && documentUrl ? (
                                <iframe
                                    src={documentUrl}
                                    title={approval.document_name || 'Document'}
                                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }}
                                />
                            ) : documentUrl ? (
                                <div className="flex items-center justify-center h-full">
                                    <div style={{ textAlign: 'center' }}>
                                        <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: '0 auto 16px', opacity: 0.4 }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '14px', marginBottom: '16px' }}>
                                            Document preview not available
                                        </p>
                                        <a
                                            href={documentUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn-glass"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
                                        >
                                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            Download Document
                                        </a>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Right: Details & Actions */}
                    <div className="w-96 flex-shrink-0 overflow-y-auto flex flex-col">
                        {/* Competency Details */}
                        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
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
                            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
                                Entered Values
                            </div>

                            {approval.value && <DetailRow label="Value / ID" value={approval.value} />}
                            {approval.issuing_body && <DetailRow label="Issuing Body" value={approval.issuing_body} />}
                            {approval.certification_id && <DetailRow label="Certification ID" value={approval.certification_id} />}
                            <DetailRow label="Expiry Date" value={formatDate(approval.expiry_date)} />
                            <DetailRow label="Submitted" value={formatDate(approval.created_at)} />
                            {approval.notes && (
                                <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px' }}>Notes</div>
                                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>{approval.notes}</div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ padding: '20px', flex: 1 }}>
                            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
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
                                        className="glass-input w-full"
                                        style={{ resize: 'none' }}
                                        disabled={submitting}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setActiveAction(null); setComment(''); }}
                                            disabled={submitting}
                                            className="flex-1 btn-glass py-2"
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
                                        className="glass-input w-full"
                                        style={{ resize: 'none' }}
                                        disabled={submitting}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setActiveAction(null); setComment(''); }}
                                            disabled={submitting}
                                            className="flex-1 btn-glass py-2"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleReject}
                                            disabled={submitting || !comment.trim()}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50"
                                            style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#ffffff' }}
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
