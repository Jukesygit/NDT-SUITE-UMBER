/**
 * CertificateDetailModal - Modal for viewing certificate details and document preview.
 * Supports multiple documents ("pages") with a page selector.
 */

import { useEffect, useState } from 'react';
import type { PersonCompetency } from '../../hooks/queries/usePersonnel';
import { Modal } from '../../components/ui';
import { getDocumentType, formatDate, getCompetencyStatus } from './PersonnelExpandedRowUtils';
import { normalizeCompetencyDocuments } from '../../utils/competency-documents';

interface CertificateDetailModalProps {
    competency: PersonCompetency | null;
    /** Batched signed URLs keyed by storage path (from getDocumentUrls). */
    documentUrls: Record<string, string>;
    onClose: () => void;
}

export function CertificateDetailModal({
    competency,
    documentUrls,
    onClose,
}: CertificateDetailModalProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset to the first page whenever the viewed competency changes.
    useEffect(() => {
        setSelectedIndex(0);
    }, [competency?.id]);

    if (!competency) return null;

    const docs = normalizeCompetencyDocuments(competency);
    const currentDoc = docs[selectedIndex] ?? docs[0];
    const resolvedDocumentUrl = currentDoc ? documentUrls[currentDoc.document_url] || null : null;
    const docType = currentDoc ? getDocumentType(currentDoc.document_url) : 'other';
    const certName = competency.competency?.name || 'Certificate';

    return (
        <Modal
            isOpen={!!competency}
            onClose={onClose}
            title={`${certName} - Details`}
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
            {currentDoc && (
                <div style={{ minHeight: '300px' }}>
                    <div className="pm-display-label" style={{ marginBottom: '12px' }}>
                        Certificate Document{docs.length > 1 ? `s (${docs.length})` : ''}
                    </div>

                    {/* Page selector when multiple documents are attached */}
                    {docs.length > 1 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                            {docs.map((doc, index) => (
                                <button
                                    key={`${doc.document_url}-${index}`}
                                    onClick={() => setSelectedIndex(index)}
                                    className={`pm-btn sm${index === selectedIndex ? ' primary' : ''}`}
                                    title={doc.document_name}
                                >
                                    Page {index + 1}
                                </button>
                            ))}
                        </div>
                    )}

                    {!resolvedDocumentUrl && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                                Loading document...
                            </p>
                        </div>
                    )}
                    {resolvedDocumentUrl && docType === 'image' && (
                        <div className="pm-doc-preview">
                            <img
                                src={resolvedDocumentUrl}
                                alt={certName}
                                style={{ width: '100%', height: 'auto', maxHeight: '50vh', objectFit: 'contain' }}
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
                    {resolvedDocumentUrl && docType === 'image' && (
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
                    {resolvedDocumentUrl && docType === 'pdf' && (
                        <iframe
                            src={resolvedDocumentUrl}
                            title={certName}
                            style={{ width: '100%', height: '50vh', border: 'none', borderRadius: '8px' }}
                        />
                    )}
                    {resolvedDocumentUrl && docType === 'other' && (
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
