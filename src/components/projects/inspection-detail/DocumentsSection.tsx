import { useRef, useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import CollapsibleSection from './CollapsibleSection';
import {
    useUploadProjectFile,
    useDeleteProjectFile,
} from '../../../hooks/mutations/useInspectionProjectMutations';
import { getProjectFileUrl } from '../../../services/inspection-project-service';
import { useAuth } from '../../../contexts/AuthContext';
import type { ProjectVessel, ProjectFile, ProjectFileType } from '../../../types/inspection-project';

interface DocumentsSectionProps {
    vessel: ProjectVessel;
    projectId: string;
    files: ProjectFile[];
}

const FILE_SLOTS: { label: string; type: ProjectFileType }[] = [
    { label: 'GA Drawing', type: 'ga_drawing' },
    { label: 'P&ID', type: 'pid_drawing' },
    { label: 'Location Drawing', type: 'location_drawing' },
    { label: 'RBA File', type: 'rba_file' },
];

function isImageFile(name: string, mime: string | null): boolean {
    if (mime && mime.startsWith('image/')) return true;
    return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(name);
}

function isPdfFile(name: string, mime: string | null): boolean {
    if (mime === 'application/pdf') return true;
    return /\.pdf$/i.test(name);
}

async function renderPdfThumbnail(url: string): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist');
    const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    const desiredWidth = 200;
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = desiredWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;

    return canvas.toDataURL('image/png');
}

function FileThumbnail({ file, signedUrl, onClick }: { file: ProjectFile; signedUrl: string | null; onClick: () => void }) {
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const isPdf = isPdfFile(file.filename, file.mime_type);
    const isImage = isImageFile(file.filename, file.mime_type);

    useEffect(() => {
        let cancelled = false;
        if (!signedUrl) {
            setThumbUrl(null);
        } else if (isImage) {
            setThumbUrl(signedUrl);
        } else if (isPdf) {
            renderPdfThumbnail(signedUrl)
                .then(dataUrl => { if (!cancelled) setThumbUrl(dataUrl); })
                .catch(() => { if (!cancelled) setThumbUrl(null); });
        } else {
            setThumbUrl(null);
        }
        return () => { cancelled = true; };
    }, [signedUrl, isPdf, isImage]);

    return (
        <div className="pj-doc-thumb" onClick={onClick} title="Click to preview">
            {thumbUrl ? (
                <img src={thumbUrl} alt={file.filename} />
            ) : (
                <div className="pj-doc-thumb-empty">
                    <span>{isPdf ? 'Loading...' : file.filename.split('.').pop()?.toUpperCase() || 'FILE'}</span>
                </div>
            )}
        </div>
    );
}

function PreviewModal({ file, signedUrl, onClose }: { file: ProjectFile; signedUrl: string; onClose: () => void }) {
    const isPdf = isPdfFile(file.filename, file.mime_type);
    const isImage = isImageFile(file.filename, file.mime_type);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 40,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: '90vw', maxWidth: 1000, height: '85vh',
                    background: '#0c0b0a', borderRadius: 8,
                    border: '1px solid rgba(53, 160, 88, 0.15)',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                }}
            >
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderBottom: '1px solid rgba(53, 160, 88, 0.10)',
                }}>
                    <span className="pj-doc-filename">{file.filename}</span>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(53, 160, 88, 0.50)', cursor: 'pointer', padding: 4,
                    }}>
                        <X size={18} />
                    </button>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    {isPdf ? (
                        <iframe src={signedUrl} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} title={`Preview of ${file.filename}`} />
                    ) : isImage ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto' }}>
                            <img src={signedUrl} alt={file.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <span className="pj-empty-text">Preview not available for this file type</span>
                            <button onClick={() => window.open(signedUrl, '_blank')} className="pj-quick-action-btn primary" style={{ marginTop: 12 }}>
                                Download to View
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function useSignedUrl(file: ProjectFile | undefined) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!file) { setUrl(null); return; }
        let cancelled = false;
        getProjectFileUrl(file.storage_path, file.storage_bucket)
            .then(u => { if (!cancelled) setUrl(u); })
            .catch(() => { if (!cancelled) setUrl(null); });
        return () => { cancelled = true; };
    }, [file?.id]);
    return url;
}

function FileSlot({
    label, type, existing, onUpload, onDelete, onPreview, uploadingType, inputRef,
}: {
    label: string;
    type: ProjectFileType;
    existing: ProjectFile | undefined;
    onUpload: (type: ProjectFileType, file: File) => void;
    onDelete: (pf: ProjectFile) => void;
    onPreview: (pf: ProjectFile) => void;
    uploadingType: string | null;
    inputRef: (el: HTMLInputElement | null) => void;
}) {
    const hiddenInputRef = useRef<HTMLInputElement | null>(null);
    const signedUrl = useSignedUrl(existing);

    return (
        <div className="pj-doc-slot">
            {existing ? (
                <FileThumbnail file={existing} signedUrl={signedUrl} onClick={() => onPreview(existing)} />
            ) : (
                <div className="pj-doc-thumb">
                    <div className="pj-doc-thumb-empty">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14,2 14,8 20,8" />
                        </svg>
                        <span>No file</span>
                    </div>
                </div>
            )}

            <div className="pj-doc-info">
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pj-doc-label">{label}</div>
                    <div className="pj-doc-filename">
                        {existing ? existing.filename : '—'}
                    </div>
                    {existing?.size_bytes ? (
                        <div className="pj-doc-size">
                            {(existing.size_bytes / 1024 / 1024).toFixed(1)} MB
                        </div>
                    ) : null}
                </div>

                {existing ? (
                    <div className="pj-doc-actions">
                        <button type="button" onClick={() => onPreview(existing)} className="pj-vessel-action-btn ghost">
                            Preview
                        </button>
                        <button type="button" onClick={() => onDelete(existing)} className="pj-vessel-action-btn danger-ghost">
                            Remove
                        </button>
                    </div>
                ) : (
                    <>
                        <input
                            ref={(el) => { hiddenInputRef.current = el; inputRef(el); }}
                            type="file"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onUpload(type, f);
                                e.target.value = '';
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => hiddenInputRef.current?.click()}
                            disabled={uploadingType !== null}
                            className="pj-vessel-action-btn"
                        >
                            {uploadingType === type ? 'Uploading...' : 'Upload'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function DocumentsSection({ vessel, projectId, files }: DocumentsSectionProps) {
    const { user } = useAuth();
    const uploadFile = useUploadProjectFile();
    const deleteFile = useDeleteProjectFile();
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const [uploadingType, setUploadingType] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const handleUpload = async (type: ProjectFileType, file: File) => {
        if (!user) return;
        setUploadingType(type);
        setUploadError(null);
        try {
            await uploadFile.mutateAsync({
                projectId, projectVesselId: vessel.id, userId: user.id,
                name: file.name, fileType: type, file,
            });
        } catch (err) {
            setUploadError(`${type}: ${(err as Error).message}`);
        } finally {
            setUploadingType(null);
        }
    };

    const handleDelete = (pf: ProjectFile) => {
        deleteFile.mutate({ id: pf.id, projectId, vesselId: vessel.id });
    };

    const handlePreview = useCallback(async (pf: ProjectFile) => {
        setPreviewFile(pf);
        try {
            const url = await getProjectFileUrl(pf.storage_path, pf.storage_bucket);
            setPreviewUrl(url);
        } catch {
            setPreviewUrl(null);
        }
    }, []);

    const closePreview = useCallback(() => {
        setPreviewFile(null);
        setPreviewUrl(null);
    }, []);

    return (
        <CollapsibleSection title="Documents & Drawings">
            {uploadError && (
                <div className="pj-alert error" style={{ marginBottom: 10 }}>
                    Upload error: {uploadError}
                </div>
            )}
            <div className="pj-doc-grid">
                {FILE_SLOTS.map(({ label, type }) => (
                    <FileSlot
                        key={type}
                        label={label}
                        type={type}
                        existing={files.find(f => f.file_type === type && f.project_vessel_id === vessel.id)}
                        onUpload={handleUpload}
                        onDelete={handleDelete}
                        onPreview={handlePreview}
                        uploadingType={uploadingType}
                        inputRef={(el) => { inputRefs.current[type] = el; }}
                    />
                ))}
            </div>

            {previewFile && previewUrl && (
                <PreviewModal file={previewFile} signedUrl={previewUrl} onClose={closePreview} />
            )}
        </CollapsibleSection>
    );
}
