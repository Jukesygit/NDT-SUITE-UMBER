/**
 * PersonDocumentReviewModal - Sequential document review modal for a specific person
 * Shows pending documents one at a time with auto-advance and auto-close
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Person } from '../../hooks/queries/usePersonnel';
import { getPendingApprovalCompetencies } from '../../hooks/queries/usePersonnel';
import { useApproveCompetency, useRejectCompetency, useRequestChanges } from '../../hooks/mutations/useCompetencyMutations';
import competencyService from '../../services/competency-service.js';

interface PersonDocumentReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    person: Person;
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
 * Arrow icons for navigation
 */
function ChevronLeftIcon() {
    return (
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
        </svg>
    );
}

function ChevronRightIcon() {
    return (
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
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
 * PersonDocumentReviewModal component
 */
export function PersonDocumentReviewModal({ isOpen, onClose, person }: PersonDocumentReviewModalProps) {
    // Get pending approval competencies for this person
    const pendingCompetencies = useMemo(() => {
        return getPendingApprovalCompetencies(person.competencies || []);
    }, [person.competencies]);

    // Track current index and which competencies have been reviewed
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

    // Current competency being reviewed
    const currentCompetency = pendingCompetencies[currentIndex];

    // Document loading state
    const [documentUrl, setDocumentUrl] = useState<string | null>(null);
    const [loadingDocument, setLoadingDocument] = useState(true);
    const [documentError, setDocumentError] = useState<string | null>(null);

    // Action state
    const [activeAction, setActiveAction] = useState<ActionType>(null);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Mutations
    const approveMutation = useApproveCompetency();
    const rejectMutation = useRejectCompetency();
    const requestChangesMutation = useRequestChanges();

    // Remaining count (excluding reviewed ones)
    const remainingCount = pendingCompetencies.length - reviewedIds.size;

    // Load document URL when current competency changes
    useEffect(() => {
        async function loadDocumentUrl() {
            if (!currentCompetency?.document_url) {
                setDocumentError('No document attached');
                setLoadingDocument(false);
                return;
            }

            setLoadingDocument(true);
            setDocumentError(null);

            try {
                const url = await competencyService.getDocumentUrl(currentCompetency.document_url);
                setDocumentUrl(url);
            } catch {
                setDocumentError('Failed to load document');
            } finally {
                setLoadingDocument(false);
            }
        }

        loadDocumentUrl();
    }, [currentCompetency?.document_url, currentCompetency?.id]);

    // Reset action state when competency changes
    useEffect(() => {
        setActiveAction(null);
        setComment('');
    }, [currentIndex]);

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
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    // Auto-advance to next un-reviewed document or close if all reviewed
    const advanceToNext = useCallback(() => {
        if (!currentCompetency) return;

        // Mark current as reviewed
        const newReviewedIds = new Set(reviewedIds);
        newReviewedIds.add(currentCompetency.id);
        setReviewedIds(newReviewedIds);

        // Find next un-reviewed competency
        const nextUnreviewed = pendingCompetencies.findIndex(
            (comp, idx) => idx > currentIndex && !newReviewedIds.has(comp.id)
        );

        if (nextUnreviewed !== -1) {
            // Move to next un-reviewed
            setCurrentIndex(nextUnreviewed);
        } else {
            // Try to find any un-reviewed before current position
            const anyUnreviewed = pendingCompetencies.findIndex(
                (comp) => !newReviewedIds.has(comp.id)
            );

            if (anyUnreviewed !== -1) {
                setCurrentIndex(anyUnreviewed);
            } else {
                // All reviewed - close modal
                onClose();
            }
        }
    }, [currentCompetency, currentIndex, pendingCompetencies, reviewedIds, onClose]);

    const handleApprove = async () => {
        if (!currentCompetency) return;
        setSubmitting(true);
        try {
            await approveMutation.mutateAsync({ competencyId: currentCompetency.id });
            advanceToNext();
        } catch {
            alert('Failed to approve document. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!currentCompetency) return;
        if (!comment.trim()) {
            alert('Please provide a reason for rejection.');
            return;
        }
        setSubmitting(true);
        try {
            await rejectMutation.mutateAsync({ competencyId: currentCompetency.id, reason: comment });
            advanceToNext();
        } catch {
            alert('Failed to reject document. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRequestChanges = async () => {
        if (!currentCompetency) return;
        if (!comment.trim()) {
            alert('Please provide details about the changes needed.');
            return;
        }
        setSubmitting(true);
        try {
            await requestChangesMutation.mutateAsync({ competencyId: currentCompetency.id, comment });
            advanceToNext();
        } catch {
            alert('Failed to request changes. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Navigation handlers
    const handlePrevious = useCallback(() => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    }, [currentIndex]);

    const handleNext = useCallback(() => {
        if (currentIndex < pendingCompetencies.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    }, [currentIndex, pendingCompetencies.length]);

    if (!isOpen || pendingCompetencies.length === 0) return null;

    const isImage = currentCompetency?.document_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isPdf = currentCompetency?.document_name?.match(/\.pdf$/i);

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
                            Review Documents - {person.username}
                        </h2>
                        <p className="pm-display-label" style={{ marginTop: '2px', textTransform: 'none', letterSpacing: 'normal', fontSize: '13px' }}>
                            Reviewing {currentIndex + 1} of {pendingCompetencies.length} pending document{pendingCompetencies.length !== 1 ? 's' : ''}
                            {reviewedIds.size > 0 && (
                                <span style={{ color: '#10b981', marginLeft: '8px' }}>
                                    ({reviewedIds.size} reviewed)
                                </span>
                            )}
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Navigation buttons */}
                        {pendingCompetencies.length > 1 && (
                            <div className="pm-review-nav" style={{ border: 'none', background: 'none', padding: '0', gap: '4px', marginRight: '8px' }}>
                                <button
                                    onClick={handlePrevious}
                                    disabled={currentIndex === 0 || submitting}
                                    className="pm-modal-close disabled:opacity-30"
                                    aria-label="Previous document"
                                >
                                    <ChevronLeftIcon />
                                </button>
                                <span className="pm-review-counter">
                                    {currentIndex + 1}/{pendingCompetencies.length}
                                </span>
                                <button
                                    onClick={handleNext}
                                    disabled={currentIndex === pendingCompetencies.length - 1 || submitting}
                                    className="pm-modal-close disabled:opacity-30"
                                    aria-label="Next document"
                                >
                                    <ChevronRightIcon />
                                </button>
                            </div>
                        )}
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
                </div>

                {/* Body - Split View */}
                <div className="flex-1 overflow-hidden flex" style={{ minHeight: 0 }}>
                    {/* Left: Document Viewer */}
                    <div className="flex-1 border-r border-white/10 overflow-hidden flex flex-col" style={{ minWidth: 0 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', flexShrink: 0 }}>
                            <div className="pm-display-label">Document Preview</div>
                            {currentCompetency?.document_name && (
                                <div style={{ fontSize: '13px', color: '#60a5fa', marginTop: '4px' }}>
                                    {currentCompetency.document_name}
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
                                        alt={currentCompetency?.document_name || 'Document'}
                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }}
                                    />
                                </div>
                            ) : isPdf && documentUrl ? (
                                <iframe
                                    src={documentUrl}
                                    title={currentCompetency?.document_name || 'Document'}
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
                                            className="pm-btn"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
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
                            <div className="pm-display-label" style={{ marginBottom: '16px' }}>
                                Competency Details
                            </div>

                            <DetailRow label="Competency" value={currentCompetency?.competency?.name} highlight />
                            <DetailRow label="Category" value={(currentCompetency?.competency as { category?: { name?: string } })?.category?.name} />
                            <DetailRow label="Submitted By" value={person.username} />
                            <DetailRow label="Email" value={person.email} />
                            <DetailRow label="Organization" value={person.organizations?.name} />
                        </div>

                        {/* Entered Values */}
                        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <div className="pm-display-label" style={{ marginBottom: '16px' }}>
                                Entered Values
                            </div>

                            {currentCompetency?.value && <DetailRow label="Value / ID" value={currentCompetency.value} />}
                            {currentCompetency?.issuing_body && <DetailRow label="Issuing Body" value={currentCompetency.issuing_body} />}
                            {currentCompetency?.certification_id && <DetailRow label="Certification ID" value={currentCompetency.certification_id} />}
                            <DetailRow label="Expiry Date" value={formatDate(currentCompetency?.expiry_date)} />
                            <DetailRow label="Submitted" value={formatDate(currentCompetency?.created_at)} />
                            {currentCompetency?.notes && (
                                <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                                    <div className="pm-display-label" style={{ marginBottom: '4px' }}>Notes</div>
                                    <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)' }}>{currentCompetency.notes}</div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ padding: '20px', flex: 1 }}>
                            <div className="pm-display-label" style={{ marginBottom: '16px' }}>
                                Actions
                            </div>

                            {/* Reviewed indicator */}
                            {currentCompetency && reviewedIds.has(currentCompetency.id) ? (
                                <div style={{ padding: '20px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                    <svg width="32" height="32" fill="none" stroke="#10b981" viewBox="0 0 24 24" style={{ margin: '0 auto 8px' }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <p style={{ color: '#10b981', fontSize: '14px' }}>Already reviewed</p>
                                </div>
                            ) : (
                                <>
                                    {/* Action Selection */}
                                    {!activeAction && (
                                        <div className="space-y-3">
                                            <button
                                                onClick={handleApprove}
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
                                </>
                            )}

                            {/* Remaining count indicator */}
                            {remainingCount > 0 && remainingCount < pendingCompetencies.length && (
                                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', textAlign: 'center' }}>
                                    <p style={{ fontSize: '13px', color: '#60a5fa' }}>
                                        {remainingCount} document{remainingCount !== 1 ? 's' : ''} remaining to review
                                    </p>
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

export default PersonDocumentReviewModal;
