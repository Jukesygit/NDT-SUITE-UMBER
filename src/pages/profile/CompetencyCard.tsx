/**
 * CompetencyCard - Display card for a single competency/certification
 */

import { useMemo, useState } from 'react';
import { Modal } from '../../components/ui';

export interface CompetencyCategory {
    id: string;
    name: string;
}

export interface CompetencyDefinition {
    id: string;
    name: string;
    category?: CompetencyCategory | string;
    description?: string;
    is_certification?: boolean;
    has_expiry?: boolean;
}

export interface Competency {
    id: string;
    competency_id: string;
    issuing_body?: string;
    certification_id?: string;
    issued_date?: string;
    expiry_date?: string;
    document_url?: string;
    document_name?: string;
    notes?: string;
    field_value?: string;
}

interface CompetencyCardProps {
    /** The competency data */
    competency: Competency;
    /** The competency definition */
    definition?: CompetencyDefinition;
    /** Callback when edit is clicked */
    onEdit?: (competency: Competency) => void;
    /** Callback when delete is clicked */
    onDelete?: (competency: Competency) => void;
    /** Whether the card is in a compact view */
    compact?: boolean;
}

/**
 * Calculate days until expiry and status color
 */
function useExpiryStatus(expiryDate?: string) {
    return useMemo(() => {
        if (!expiryDate) return { daysUntil: null, status: 'none', color: 'rgba(255, 255, 255, 0.6)' };

        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry.getTime() - today.getTime();
        const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysUntil < 0) {
            return { daysUntil, status: 'expired', color: '#ef4444' };
        } else if (daysUntil <= 30) {
            return { daysUntil, status: 'expiring-soon', color: '#f59e0b' };
        } else if (daysUntil <= 90) {
            return { daysUntil, status: 'expiring', color: '#eab308' };
        } else {
            return { daysUntil, status: 'valid', color: '#10b981' };
        }
    }, [expiryDate]);
}

/**
 * Format date for display
 */
function formatDate(dateString?: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Certificate icon
 */
function CertificateIcon() {
    return (
        <svg
            style={{ width: '20px', height: '20px' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
            />
        </svg>
    );
}

/**
 * Edit icon
 */
function EditIcon() {
    return (
        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
        </svg>
    );
}

/**
 * Document icon
 */
function DocumentIcon() {
    return (
        <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
        </svg>
    );
}

/**
 * CompetencyCard component
 *
 * @example
 * <CompetencyCard
 *     competency={competency}
 *     definition={competencyDefs.find(d => d.id === competency.competency_id)}
 *     onEdit={(c) => setEditingCompetency(c)}
 * />
 */
export function CompetencyCard({
    competency,
    definition,
    onEdit,
    onDelete: _onDelete, // Reserved for future use
    compact = false,
}: CompetencyCardProps) {
    const expiryStatus = useExpiryStatus(competency.expiry_date);
    const [showDocumentModal, setShowDocumentModal] = useState(false);

    const name = definition?.name || 'Unknown Certification';
    const isCertification = definition?.is_certification !== false;

    // Determine if document is an image or PDF
    const getDocumentType = (url?: string): 'image' | 'pdf' | 'other' => {
        if (!url) return 'other';
        const lower = url.toLowerCase();
        if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i)) return 'image';
        if (lower.match(/\.pdf(\?|$)/i)) return 'pdf';
        return 'other';
    };

    const documentType = getDocumentType(competency.document_url);

    return (
        <div
            className="glass-card"
            style={{
                padding: compact ? '16px' : '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto', minWidth: 0 }}>
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: `linear-gradient(135deg, ${expiryStatus.color}20, ${expiryStatus.color}10)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: expiryStatus.color,
                            flexShrink: 0,
                        }}
                    >
                        <CertificateIcon />
                    </div>
                    <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                        <h4
                            style={{
                                fontSize: '15px',
                                fontWeight: '600',
                                color: '#ffffff',
                                margin: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {name}
                        </h4>
                        {definition?.category && (
                            <span
                                style={{
                                    fontSize: '12px',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                }}
                            >
                                {typeof definition.category === 'object'
                                    ? definition.category.name
                                    : definition.category}
                            </span>
                        )}
                    </div>
                </div>

                {/* Edit Button */}
                {onEdit && (
                    <button
                        onClick={() => onEdit(competency)}
                        className="btn-icon"
                        style={{
                            padding: '8px',
                            flexShrink: 0,
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Edit"
                    >
                        <EditIcon />
                    </button>
                )}
            </div>

            {/* Details */}
            {isCertification && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '12px',
                        fontSize: '13px',
                    }}
                >
                    {competency.certification_id && (
                        <div>
                            <span style={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block' }}>
                                Certificate ID
                            </span>
                            <span style={{ color: '#ffffff' }}>{competency.certification_id}</span>
                        </div>
                    )}
                    {competency.issuing_body && (
                        <div>
                            <span style={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block' }}>
                                Issued By
                            </span>
                            <span style={{ color: '#ffffff' }}>{competency.issuing_body}</span>
                        </div>
                    )}
                    {competency.issued_date && (
                        <div>
                            <span style={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block' }}>
                                Issued
                            </span>
                            <span style={{ color: '#ffffff' }}>{formatDate(competency.issued_date)}</span>
                        </div>
                    )}
                    {competency.expiry_date && (
                        <div>
                            <span style={{ color: 'rgba(255, 255, 255, 0.5)', display: 'block' }}>
                                Expires
                            </span>
                            <span style={{ color: expiryStatus.color, fontWeight: '500' }}>
                                {formatDate(competency.expiry_date)}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Non-certification value display */}
            {!isCertification && competency.field_value && (
                <div style={{ color: '#ffffff', fontSize: '14px' }}>{competency.field_value}</div>
            )}

            {/* Document Link */}
            {competency.document_url && (
                <button
                    onClick={() => setShowDocumentModal(true)}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#60a5fa',
                        fontSize: '13px',
                        textDecoration: 'none',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                    }}
                >
                    <DocumentIcon />
                    View Certificate
                </button>
            )}

            {/* Expiry Status Badge */}
            {competency.expiry_date && expiryStatus.status !== 'none' && (
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        background: `${expiryStatus.color}15`,
                        border: `1px solid ${expiryStatus.color}30`,
                        fontSize: '12px',
                        fontWeight: '500',
                        color: expiryStatus.color,
                        alignSelf: 'flex-start',
                    }}
                >
                    {expiryStatus.status === 'expired' && 'Expired'}
                    {expiryStatus.status === 'expiring-soon' &&
                        `Expires in ${expiryStatus.daysUntil} days`}
                    {expiryStatus.status === 'expiring' && `Expires in ${expiryStatus.daysUntil} days`}
                    {expiryStatus.status === 'valid' && 'Valid'}
                </div>
            )}

            {/* Document Viewer Modal */}
            {showDocumentModal && competency.document_url && (
                <Modal
                    isOpen={showDocumentModal}
                    onClose={() => setShowDocumentModal(false)}
                    title={`${name} - Certificate`}
                    size="large"
                >
                    <div style={{ minHeight: '400px' }}>
                        {documentType === 'image' && (
                            <img
                                src={competency.document_url}
                                alt={`${name} certificate`}
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    maxHeight: '70vh',
                                    objectFit: 'contain',
                                    borderRadius: '8px',
                                }}
                                onError={(e) => {
                                    console.error('Failed to load certificate image:', competency.document_url);
                                    // Hide broken image and show fallback
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    // Show fallback message
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'block';
                                }}
                            />
                        )}
                        {/* Fallback for failed image load */}
                        {documentType === 'image' && (
                            <div style={{ display: 'none', textAlign: 'center', padding: '40px' }}>
                                <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '16px' }}>
                                    Unable to load image preview.
                                </p>
                                <a
                                    href={competency.document_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn--primary"
                                >
                                    Open Image in New Tab
                                </a>
                            </div>
                        )}
                        {documentType === 'pdf' && (
                            <iframe
                                src={competency.document_url}
                                title={`${name} certificate`}
                                style={{
                                    width: '100%',
                                    height: '70vh',
                                    border: 'none',
                                    borderRadius: '8px',
                                }}
                            />
                        )}
                        {documentType === 'other' && (
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '16px' }}>
                                    This document type cannot be previewed.
                                </p>
                                <a
                                    href={competency.document_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn--primary"
                                >
                                    Download Document
                                </a>
                            </div>
                        )}
                    </div>
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <a
                            href={competency.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn--outline btn--sm"
                        >
                            Open in New Tab
                        </a>
                        <button
                            onClick={() => setShowDocumentModal(false)}
                            className="btn btn--primary btn--sm"
                        >
                            Close
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

export default CompetencyCard;
