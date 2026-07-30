/**
 * CompetencyCard - Display card for a single competency/certification
 * Industrial theme: lives inside a display well, uses green-on-dark text
 */

import { useMemo, useState, useEffect } from 'react';
import { Modal } from '../../components/ui';
import competencyService from '../../services/competency-service.ts';
import { normalizeCompetencyDocuments } from '../../utils/competency-documents';

export interface CompetencyCategory {
    id: string;
    name: string;
}

export interface CompetencyDefinition {
    id: string;
    name: string;
    category?: CompetencyCategory | string;
    description?: string;
    field_type?: 'text' | 'date' | 'expiry_date' | 'boolean' | 'file' | 'number';
    is_certification?: boolean;
    has_expiry?: boolean;
}

export interface Competency {
    id: string;
    competency_id: string;
    user_id?: string;
    issuing_body?: string;
    certification_id?: string;
    issued_date?: string;
    expiry_date?: string;
    document_url?: string;
    document_name?: string;
    notes?: string;
    field_value?: string;
    level?: string;
    status?: 'active' | 'expired' | 'pending_approval' | 'rejected' | 'changes_requested';
    /** Author of the row (server-set; null on legacy rows). */
    created_by?: string | null;
    /** Embedded author profile via the created_by FK (to-one PostgREST embed). */
    created_by_profile?: { username: string | null } | { username: string | null }[] | null;
}

/**
 * Resolve a "Added by {name}" label for a competency written by someone other
 * than the record owner. Returns null for legacy rows (no created_by) and for
 * self-authored rows (created_by === user_id).
 */
function resolveAddedBy(competency: Competency): string | null {
    const createdBy = competency.created_by;
    if (!createdBy || createdBy === competency.user_id) return null;
    const embed = competency.created_by_profile;
    const profile = Array.isArray(embed) ? embed[0] : embed;
    return profile?.username || 'another user';
}

interface CompetencyCardProps {
    competency: Competency;
    definition?: CompetencyDefinition;
    onEdit?: (competency: Competency) => void;
    onDelete?: (competency: Competency) => void;
    compact?: boolean;
}

function useExpiryStatus(expiryDate?: string) {
    return useMemo(() => {
        if (!expiryDate) return { daysUntil: null, status: 'none', badgeClass: '' };
        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry.getTime() - today.getTime();
        const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysUntil < 0) return { daysUntil, status: 'expired', badgeClass: 'expired' };
        if (daysUntil <= 30) return { daysUntil, status: 'expiring-soon', badgeClass: 'expiring-soon' };
        if (daysUntil <= 90) return { daysUntil, status: 'expiring', badgeClass: 'expiring' };
        return { daysUntil, status: 'valid', badgeClass: 'valid' };
    }, [expiryDate]);
}

function getApprovalStatus(status?: Competency['status']) {
    switch (status) {
        case 'pending_approval': return { label: 'Pending Approval', badgeClass: 'pending', show: true };
        case 'rejected': return { label: 'Rejected', badgeClass: 'rejected', show: true };
        case 'changes_requested': return { label: 'Changes Requested', badgeClass: 'changes-requested', show: true };
        case 'expired': return { label: 'Expired', badgeClass: 'expired', show: true };
        default: return { label: '', badgeClass: '', show: false };
    }
}

function formatDate(dateString?: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getDocumentType(url?: string): 'image' | 'pdf' | 'other' {
    if (!url) return 'other';
    const lower = url.toLowerCase();
    if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i)) return 'image';
    if (lower.match(/\.pdf(\?|$)/i)) return 'pdf';
    return 'other';
}

export function CompetencyCard({
    competency,
    definition,
    onEdit,
    onDelete: _onDelete,
    compact = false,
}: CompetencyCardProps) {
    const expiryStatus = useExpiryStatus(competency.expiry_date);
    const approvalStatus = getApprovalStatus(competency.status);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({});
    const [selectedIndex, setSelectedIndex] = useState(0);

    const name = definition?.name || 'Unknown Certification';
    const isCertification = definition?.is_certification !== false;

    const documents = useMemo(() => normalizeCompetencyDocuments(competency), [competency]);
    const hasDocuments = documents.length > 0;
    const addedBy = resolveAddedBy(competency);

    // Resolve signed URLs for every document via the shared batched service.
    useEffect(() => {
        let cancelled = false;
        async function resolve() {
            if (documents.length === 0) {
                setDocumentUrls({});
                return;
            }
            try {
                const urls = await competencyService.getDocumentUrls(documents.map((d) => d.document_url));
                if (!cancelled) setDocumentUrls(urls);
            } catch {
                if (!cancelled) setDocumentUrls({});
            }
        }
        resolve();
        return () => {
            cancelled = true;
        };
    }, [documents.map((d) => d.document_url).join('|')]);

    const currentDoc = documents[selectedIndex] ?? documents[0];
    const resolvedDocumentUrl = currentDoc ? documentUrls[currentDoc.document_url] || null : null;
    const documentType = getDocumentType(currentDoc?.document_url);

    return (
        <div className={`pf-competency-card${compact ? ' compact' : ''}`}>
            <div className="pf-card-header">
                <div className="pf-card-header-left">
                    <div className="pf-card-icon">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                    </div>
                    <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                        <h4 className="pf-card-title">{name}</h4>
                        {definition?.category && (
                            <span className="pf-card-category">
                                {typeof definition.category === 'object' ? definition.category.name : definition.category}
                            </span>
                        )}
                    </div>
                </div>

                {onEdit && (
                    <button onClick={() => onEdit(competency)} className="pf-card-edit-btn" title="Edit">
                        <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                )}
            </div>

            {isCertification && (
                <div className="pf-card-details">
                    {competency.level && (
                        <div>
                            <span className="pf-detail-label">Level</span>
                            <span className="pf-detail-value" style={{ fontWeight: '600' }}>{competency.level}</span>
                        </div>
                    )}
                    {competency.certification_id && (
                        <div>
                            <span className="pf-detail-label">Certificate ID</span>
                            <span className="pf-detail-value">{competency.certification_id}</span>
                        </div>
                    )}
                    {competency.issuing_body && (
                        <div>
                            <span className="pf-detail-label">Issued By</span>
                            <span className="pf-detail-value">{competency.issuing_body}</span>
                        </div>
                    )}
                    {competency.issued_date && (
                        <div>
                            <span className="pf-detail-label">Issued</span>
                            <span className="pf-detail-value">{formatDate(competency.issued_date)}</span>
                        </div>
                    )}
                    {competency.expiry_date && (
                        <div>
                            <span className="pf-detail-label">Expires</span>
                            <span className="pf-detail-value">{formatDate(competency.expiry_date)}</span>
                        </div>
                    )}
                </div>
            )}

            {!isCertification && competency.field_value && (
                <div className="pf-detail-value">{competency.field_value}</div>
            )}

            {hasDocuments && (
                <button className="pf-doc-link" onClick={() => { setSelectedIndex(0); setShowDocumentModal(true); }}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '12px', height: '12px' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View Certificate{documents.length > 1 ? `s (${documents.length})` : ''}
                </button>
            )}

            {approvalStatus.show ? (
                <div className={`pf-badge ${approvalStatus.badgeClass}`}>
                    {approvalStatus.label}
                </div>
            ) : competency.expiry_date && expiryStatus.status !== 'none' ? (
                <div className={`pf-badge ${expiryStatus.badgeClass}`}>
                    {expiryStatus.status === 'expired' && 'Expired'}
                    {expiryStatus.status === 'expiring-soon' && `Expires in ${expiryStatus.daysUntil} days`}
                    {expiryStatus.status === 'expiring' && `Expires in ${expiryStatus.daysUntil} days`}
                    {expiryStatus.status === 'valid' && 'Valid'}
                </div>
            ) : null}

            {addedBy && (
                <div className="pf-card-category" style={{ marginTop: '8px' }}>
                    Added by {addedBy}
                </div>
            )}

            {showDocumentModal && hasDocuments && (
                <Modal
                    isOpen={showDocumentModal}
                    onClose={() => setShowDocumentModal(false)}
                    title={`${name} - Certificate${documents.length > 1 ? ` (Page ${selectedIndex + 1} of ${documents.length})` : ''}`}
                    size="large"
                >
                    {documents.length > 1 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                            {documents.map((doc, index) => (
                                <button
                                    key={`${doc.document_url}-${index}`}
                                    onClick={() => setSelectedIndex(index)}
                                    className={`pf-btn sm${index === selectedIndex ? ' primary' : ''}`}
                                    title={doc.document_name}
                                >
                                    Page {index + 1}
                                </button>
                            ))}
                        </div>
                    )}
                    <div style={{ minHeight: '400px' }}>
                        {!resolvedDocumentUrl && (
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <p className="pf-info-text">Loading document...</p>
                            </div>
                        )}
                        {resolvedDocumentUrl && documentType === 'image' && (
                            <img
                                src={resolvedDocumentUrl}
                                alt={`${name} certificate`}
                                style={{ width: '100%', height: 'auto', maxHeight: '70vh', objectFit: 'contain', borderRadius: '4px' }}
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'block';
                                }}
                            />
                        )}
                        {resolvedDocumentUrl && documentType === 'image' && (
                            <div style={{ display: 'none', textAlign: 'center', padding: '40px' }}>
                                <p className="pf-info-text" style={{ marginBottom: '12px' }}>Unable to load image preview.</p>
                                <a href={resolvedDocumentUrl} target="_blank" rel="noopener noreferrer" className="pf-btn sm primary">
                                    Open Image in New Tab
                                </a>
                            </div>
                        )}
                        {resolvedDocumentUrl && documentType === 'pdf' && (
                            <iframe
                                src={resolvedDocumentUrl}
                                title={`${name} certificate`}
                                style={{ width: '100%', height: '70vh', border: 'none', borderRadius: '4px' }}
                            />
                        )}
                        {resolvedDocumentUrl && documentType === 'other' && (
                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                <p className="pf-info-text" style={{ marginBottom: '12px' }}>This document type cannot be previewed.</p>
                                <a href={resolvedDocumentUrl} target="_blank" rel="noopener noreferrer" className="pf-btn sm primary">
                                    Download Document
                                </a>
                            </div>
                        )}
                    </div>
                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        {resolvedDocumentUrl && (
                            <a href={resolvedDocumentUrl} target="_blank" rel="noopener noreferrer" className="pf-btn sm">
                                Open in New Tab
                            </a>
                        )}
                        <button onClick={() => setShowDocumentModal(false)} className="pf-btn sm primary">
                            Close
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

export default CompetencyCard;
