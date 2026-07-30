/**
 * CompetencyDocumentsField - Multi-document ("pages") editor for a certification.
 *
 * Renders the ordered list of attached documents (each with a per-item remove
 * button) and a persistent add zone below it (multi-select file input +
 * multi-file drag-and-drop). Files are uploaded on select (same timing as the
 * former single-slot flow) and appended to the array in page order. Per-item
 * remove clears form state only; it never deletes from storage.
 */

import { useCallback, useState, ChangeEvent, DragEvent } from 'react';
import { RandomMatrixSpinner } from '../../components/MatrixSpinners';
import type { CompetencyDocumentInput } from '../../services/competency-mutations';

// Per-file validation — identical whitelist/limit to the former single-slot flow.
const VALID_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface CompetencyDocumentsFieldProps {
    /** Ordered document set (array order = page order). */
    documents: CompetencyDocumentInput[];
    /** Called with the next ordered document set. */
    onChange: (documents: CompetencyDocumentInput[]) => void;
    /** Uploads a single file to storage, returning its path + display name. */
    onUpload?: (file: File) => Promise<{ url: string; name: string }>;
    /** Whether an upload is currently in progress. */
    isUploading?: boolean;
}

function UploadIcon() {
    return (
        <svg
            style={{ width: '28px', height: '28px', color: 'rgba(53, 160, 88, 0.30)', marginBottom: '8px' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
        </svg>
    );
}

function DocumentIcon() {
    return (
        <svg
            style={{ width: '20px', height: '20px', color: 'rgba(53, 160, 88, 0.60)', flexShrink: 0 }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
        </svg>
    );
}

function CloseIcon({ size = 16 }: { size?: number }) {
    return (
        <svg
            style={{ width: `${size}px`, height: `${size}px` }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}

export function CompetencyDocumentsField({
    documents,
    onChange,
    onUpload,
    isUploading = false,
}: CompetencyDocumentsFieldProps) {
    const [isDragging, setIsDragging] = useState(false);

    // Validate + upload each file on select, then append all results in page order.
    const processFiles = useCallback(
        async (files: File[]) => {
            if (!onUpload || files.length === 0) return;

            const valid: File[] = [];
            for (const file of files) {
                if (!VALID_FILE_TYPES.includes(file.type)) {
                    alert(`"${file.name}" is not a PDF or image file`);
                    continue;
                }
                if (file.size > MAX_FILE_SIZE) {
                    alert(`"${file.name}" must be less than 10MB`);
                    continue;
                }
                valid.push(file);
            }
            if (valid.length === 0) return;

            try {
                const results = await Promise.all(valid.map((file) => onUpload(file)));
                onChange([
                    ...documents,
                    ...results.map((r) => ({ document_url: r.url, document_name: r.name })),
                ]);
            } catch {
                alert('Failed to upload document');
            }
        },
        [onUpload, documents, onChange]
    );

    const handleInputChange = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files ?? []);
            // Reset input first so the same file(s) can be re-selected later.
            e.target.value = '';
            await processFiles(files);
        },
        [processFiles]
    );

    const handleDrop = useCallback(
        async (e: DragEvent<HTMLLabelElement>) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            await processFiles(Array.from(e.dataTransfer.files));
        },
        [processFiles]
    );

    const handleDragOver = useCallback((e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleRemove = useCallback(
        (index: number) => {
            onChange(documents.filter((_, i) => i !== index));
        },
        [documents, onChange]
    );

    return (
        <div>
            <span className="pf-display-label" style={{ marginBottom: '6px', display: 'block' }}>
                Certificate Documents
                <span style={{ fontSize: '9px', fontWeight: '400', marginLeft: '8px', letterSpacing: '0.06em' }}>
                    (PDF or images - max 10MB each, add multiple pages)
                </span>
            </span>

            {/* Ordered list of attached documents (pages) */}
            {documents.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                    {documents.map((doc, index) => (
                        <div className="pf-document-row" key={`${doc.document_url}-${index}`}>
                            <DocumentIcon />
                            <span className="pf-document-name">
                                <span style={{ opacity: 0.6, marginRight: '6px' }}>{index + 1}.</span>
                                {doc.document_name}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleRemove(index)}
                                className="pf-document-remove"
                                aria-label={`Remove ${doc.document_name}`}
                            >
                                <CloseIcon />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Persistent add zone */}
            <label
                className={`pf-upload-zone${isDragging ? ' dragging' : ''}${isUploading ? ' uploading' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                {isUploading ? (
                    <>
                        <div style={{ marginBottom: '8px' }}>
                            <RandomMatrixSpinner size={32} />
                        </div>
                        <span className="pf-upload-text">Uploading...</span>
                    </>
                ) : (
                    <>
                        <UploadIcon />
                        <span className="pf-upload-text">
                            {isDragging
                                ? 'Drop files here'
                                : documents.length > 0
                                  ? 'Drag & drop or click to add more pages'
                                  : 'Drag & drop or click to upload'}
                        </span>
                        <span className="pf-upload-hint">PDF or images of your certificate</span>
                    </>
                )}
                <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf"
                    onChange={handleInputChange}
                    disabled={isUploading}
                    style={{ display: 'none' }}
                />
            </label>
        </div>
    );
}

export default CompetencyDocumentsField;
