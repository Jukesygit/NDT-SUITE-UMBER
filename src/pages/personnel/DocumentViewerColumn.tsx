/**
 * DocumentViewerColumn - Shared left-hand document preview column for the
 * competency review modals. Renders a page selector (when a competency has
 * multiple documents/pages) plus the loading / error / image / PDF / download
 * preview for the currently selected document.
 */

import type { CompetencyDocumentInput } from '../../services/competency-mutations';

interface DocumentViewerColumnProps {
    /** Documents ("pages") for the competency, in page order. */
    documents: CompetencyDocumentInput[];
    /** Signed URLs keyed by storage path (from getDocumentUrls). */
    documentUrls: Record<string, string>;
    loading: boolean;
    error: string | null;
    selectedIndex: number;
    onSelect: (index: number) => void;
}

function Spinner() {
    return (
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" />
        </svg>
    );
}

export function DocumentViewerColumn({
    documents,
    documentUrls,
    loading,
    error,
    selectedIndex,
    onSelect,
}: DocumentViewerColumnProps) {
    const selectedDoc = documents[selectedIndex] ?? documents[0];
    const documentUrl = selectedDoc ? documentUrls[selectedDoc.document_url] || null : null;
    const isImage = selectedDoc?.document_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isPdf = selectedDoc?.document_name?.match(/\.pdf$/i);

    return (
        <div className="flex-1 border-r border-white/10 overflow-hidden flex flex-col pm-doc-viewer-col">
            <div className="pm-doc-viewer-header">
                <div className="pm-display-label">
                    Document Preview{documents.length > 1 ? ` (${documents.length} pages)` : ''}
                </div>
                {selectedDoc?.document_name && (
                    <div className="pm-doc-filename">{selectedDoc.document_name}</div>
                )}
                {documents.length > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                        {documents.map((doc, index) => (
                            <button
                                key={`${doc.document_url}-${index}`}
                                onClick={() => onSelect(index)}
                                className={`pm-btn sm${index === selectedIndex ? ' primary' : ''}`}
                                title={doc.document_name}
                            >
                                Page {index + 1}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-auto p-4 pm-doc-viewer-bg">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="pm-text-center">
                            <Spinner />
                            <p className="pm-loading-text">Loading document...</p>
                        </div>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="pm-text-center" style={{ color: 'var(--clean-badge-red-text)' }}>
                            <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="pm-error-icon">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="pm-error-text">{error}</p>
                        </div>
                    </div>
                ) : isImage && documentUrl ? (
                    <div className="flex items-center justify-center h-full">
                        <img src={documentUrl} alt={selectedDoc?.document_name || 'Document'} className="pm-doc-img" />
                    </div>
                ) : isPdf && documentUrl ? (
                    <iframe src={documentUrl} title={selectedDoc?.document_name || 'Document'} className="pm-doc-iframe" />
                ) : documentUrl ? (
                    <div className="flex items-center justify-center h-full">
                        <div style={{ textAlign: 'center' }}>
                            <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="pm-doc-fallback-icon">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="pm-doc-fallback-text" style={{ marginBottom: '16px' }}>Document preview not available</p>
                            <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="pm-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
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
    );
}

export default DocumentViewerColumn;
