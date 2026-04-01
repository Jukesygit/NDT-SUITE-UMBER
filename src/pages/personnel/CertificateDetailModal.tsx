/**
 * CertificateDetailModal - Modal for viewing certificate details and document preview
 */

import type { PersonCompetency } from '../../hooks/queries/usePersonnel';
import { Modal } from '../../components/ui';
import { getDocumentType, formatDate, getCompetencyStatus } from './PersonnelExpandedRowUtils';

interface CertificateDetailModalProps {
    competency: PersonCompetency | null;
    resolvedDocumentUrl: string | null;
    onClose: () => void;
}

export function CertificateDetailModal({
    competency,
    resolvedDocumentUrl,
    onClose,
}: CertificateDetailModalProps) {
    if (!competency) return null;

    return (
        <Modal
            isOpen={!!competency}
            onClose={onClose}
            title={`${competency.competency?.name || 'Certificate'} - Details`}
            size="large"
        >
            {/* Certificate Details */}
            <div style={{ marginBottom: '20px' }}>
                <div className="pm-field-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                    {competency.level && (
                        <div className="pm-display-field">
                            <span className="pm-display-label">Level</span>
                            <span className="pm-display-value" style={{ fontWeight: '600' }}>{competency.level}</span>
                        </div>
                    )}
                    {competency.issuing_body && (
                        <div className="pm-display-field">
                            <span className="pm-display-label">Issued By</span>
                            <span className="pm-display-value">{competency.issuing_body}</span>
                        </div>
                    )}
                    {competency.certification_id && (
                        <div className="pm-display-field">
                            <span className="pm-display-label">Certificate ID</span>
                            <span className="pm-display-value">{competency.certification_id}</span>
                        </div>
                    )}
                    {competency.created_at && (
                        <div className="pm-display-field">
                            <span className="pm-display-label">Issued Date</span>
                            <span className="pm-display-value">{formatDate(competency.created_at)}</span>
                        </div>
                    )}
                    {competency.expiry_date && (
                        <div className="pm-display-field">
                            <span className="pm-display-label">Expiry Date</span>
                            <span
                                className="pm-display-value"
                                style={{ color: getCompetencyStatus(competency).color }}
                            >
                                {formatDate(competency.expiry_date)}
                            </span>
                        </div>
                    )}
                    {competency.notes && (
                        <div className="pm-display-field" style={{ gridColumn: '1 / -1' }}>
                            <span className="pm-display-label">Notes</span>
                            <span className="pm-display-value">{competency.notes}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Document Preview */}
            {competency.document_url && (
                <div style={{ minHeight: '300px' }}>
                    <div className="pm-display-label" style={{ marginBottom: '12px' }}>
                        Certificate Document
                    </div>
                    {!resolvedDocumentUrl && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                                Loading document...
                            </p>
                        </div>
                    )}
                    {resolvedDocumentUrl && getDocumentType(competency.document_url) === 'image' && (
                        <div className="pm-doc-preview">
                            <img
                                src={resolvedDocumentUrl}
                                alt={`${competency.competency?.name || 'Certificate'}`}
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    maxHeight: '50vh',
                                    objectFit: 'contain',
                                }}
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'block';
                                }}
                            />
                        </div>
                    )}
                    {/* Fallback for failed image load */}
                    {resolvedDocumentUrl && getDocumentType(competency.document_url) === 'image' && (
                        <div style={{ display: 'none', textAlign: 'center', padding: '40px' }}>
                            <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '16px' }}>
                                Unable to load image preview.
                            </p>
                            <a
                                href={resolvedDocumentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="pm-btn primary"
                            >
                                Open Image in New Tab
                            </a>
                        </div>
                    )}
                    {resolvedDocumentUrl && getDocumentType(competency.document_url) === 'pdf' && (
                        <iframe
                            src={resolvedDocumentUrl}
                            title={`${competency.competency?.name || 'Certificate'}`}
                            style={{
                                width: '100%',
                                height: '50vh',
                                border: 'none',
                                borderRadius: '8px',
                            }}
                        />
                    )}
                    {resolvedDocumentUrl && getDocumentType(competency.document_url) === 'other' && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '16px' }}>
                                This document type cannot be previewed.
                            </p>
                            <a
                                href={resolvedDocumentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="pm-btn primary"
                            >
                                Download Document
                            </a>
                        </div>
                    )}
                </div>
            )}

            {/* Modal Footer */}
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                {resolvedDocumentUrl && (
                    <a
                        href={resolvedDocumentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pm-btn sm"
                    >
                        Open in New Tab
                    </a>
                )}
                <button
                    onClick={onClose}
                    className="pm-btn primary sm"
                >
                    Close
                </button>
            </div>
        </Modal>
    );
}
