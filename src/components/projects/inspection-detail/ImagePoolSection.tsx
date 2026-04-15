import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import CollapsibleSection from './CollapsibleSection';
import {
    useUploadProjectImage,
    useUpdateProjectImageName,
    useDeleteProjectImage,
} from '../../../hooks/mutations/useInspectionProjectMutations';
import { getProjectFileUrl } from '../../../services/inspection-project-service';
import { useAuth } from '../../../contexts/AuthContext';
import type { ProjectImage } from '../../../types/inspection-project';

interface ImagePoolSectionProps {
    vesselId: string;
    projectId: string;
    images: ProjectImage[];
}

// ---------------------------------------------------------------------------
// Image card — fetches its own signed URL
// ---------------------------------------------------------------------------

function ImageCard({
    image,
    vesselId,
    onPreview,
}: {
    image: ProjectImage;
    vesselId: string;
    onPreview: (url: string) => void;
}) {
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [editingName, setEditingName] = useState(false);
    const [name, setName] = useState(image.name);
    const updateName = useUpdateProjectImageName();
    const deleteImage = useDeleteProjectImage();

    useEffect(() => {
        let cancelled = false;
        getProjectFileUrl(image.storage_path, image.storage_bucket)
            .then((url) => { if (!cancelled) setSignedUrl(url); })
            .catch(() => { if (!cancelled) setSignedUrl(null); });
        return () => { cancelled = true; };
    }, [image.id, image.storage_path, image.storage_bucket]);

    const handleNameBlur = () => {
        setEditingName(false);
        const trimmed = name.trim();
        if (trimmed && trimmed !== image.name) {
            updateName.mutate({ id: image.id, name: trimmed, vesselId });
        } else {
            setName(image.name);
        }
    };

    return (
        <div
            style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                overflow: 'hidden',
            }}
        >
            {/* Thumbnail */}
            <div
                onClick={() => signedUrl && onPreview(signedUrl)}
                style={{
                    width: '100%',
                    height: 140,
                    background: 'var(--surface-elevated)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: signedUrl ? 'pointer' : 'default',
                    borderBottom: '1px solid var(--border-subtle)',
                }}
                title="Click to preview"
            >
                {signedUrl ? (
                    <img
                        src={signedUrl}
                        alt={image.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }}
                    />
                ) : (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-disabled)' }}>
                        Loading...
                    </span>
                )}
            </div>

            {/* Info bar */}
            <div style={{ padding: '8px 10px' }}>
                {/* Editable name */}
                {editingName ? (
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={handleNameBlur}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleNameBlur(); }}
                        style={{
                            width: '100%',
                            padding: '2px 4px',
                            background: 'var(--border-subtle)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 4,
                            color: 'var(--text-primary)',
                            fontSize: '0.8rem',
                        }}
                    />
                ) : (
                    <div
                        onClick={() => setEditingName(true)}
                        title="Click to rename"
                        style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'text',
                        }}
                    >
                        {image.name}
                    </div>
                )}

                {/* File size + delete */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 4,
                    }}
                >
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-quaternary)' }}>
                        {image.size_bytes
                            ? `${(image.size_bytes / 1024).toFixed(0)} KB`
                            : '\u2014'}
                    </span>
                    <button
                        type="button"
                        onClick={() => deleteImage.mutate({ id: image.id, vesselId })}
                        style={{
                            padding: '2px 6px',
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: 4,
                            color: '#ef4444',
                            fontSize: '0.65rem',
                            cursor: 'pointer',
                        }}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Preview modal
// ---------------------------------------------------------------------------

function ImagePreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 40,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    maxWidth: '90vw',
                    maxHeight: '85vh',
                    background: '#1a1a1a',
                    borderRadius: 12,
                    border: '1px solid var(--border-default)',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                }}
            >
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        padding: 4,
                    }}
                >
                    <X size={18} />
                </button>
                <img
                    src={url}
                    alt="Preview"
                    style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }}
                />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ImagePoolSection({ vesselId, projectId, images }: ImagePoolSectionProps) {
    const { user } = useAuth();
    const uploadImage = useUploadProjectImage();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const dropZoneRef = useRef<HTMLDivElement | null>(null);

    const [imageName, setImageName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const handleUpload = async (file: File) => {
        if (!user) return;
        if (!file.type.startsWith('image/')) {
            setUploadError('Only image files are supported');
            return;
        }
        const name = imageName.trim() || file.name.replace(/\.[^.]+$/, '');
        setUploading(true);
        setUploadError(null);
        try {
            await uploadImage.mutateAsync({
                projectId,
                projectVesselId: vesselId,
                userId: user.id,
                name,
                file,
            });
            setImageName('');
        } catch (err) {
            setUploadError((err as Error).message);
        } finally {
            setUploading(false);
        }
    };

    const handleMultiUpload = async (files: File[]) => {
        for (const file of files) {
            await handleUpload(file);
        }
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
            setDragOver(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
        if (files.length > 0) {
            handleMultiUpload(files);
        } else {
            setUploadError('No image files found. Only image files are supported.');
        }
    }, [user, imageName, projectId, vesselId]);

    const handlePreview = useCallback((url: string) => {
        setPreviewUrl(url);
    }, []);

    const closePreview = useCallback(() => {
        setPreviewUrl(null);
    }, []);

    return (
        <CollapsibleSection title="Inspection Images">
            {/* Drop zone wrapper */}
            <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    position: 'relative',
                    borderRadius: 8,
                    border: dragOver ? '2px dashed var(--accent-primary, #3b82f6)' : '2px dashed transparent',
                    background: dragOver ? 'rgba(59,130,246,0.06)' : 'transparent',
                    padding: dragOver ? 10 : 0,
                    transition: 'all 0.15s ease',
                }}
            >
                {/* Drag overlay */}
                {dragOver && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(59,130,246,0.08)',
                            borderRadius: 8,
                            pointerEvents: 'none',
                        }}
                    >
                        <span style={{ fontSize: '0.95rem', color: 'var(--accent-primary, #3b82f6)', fontWeight: 500 }}>
                            Drop images here to upload
                        </span>
                    </div>
                )}

                {/* Upload area */}
                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        marginBottom: 14,
                        alignItems: 'flex-end',
                        opacity: dragOver ? 0.3 : 1,
                        transition: 'opacity 0.15s ease',
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <label
                            style={{
                                display: 'block',
                                fontSize: '0.75rem',
                                color: 'var(--text-tertiary)',
                                marginBottom: 4,
                            }}
                        >
                            Image Name (optional)
                        </label>
                        <input
                            type="text"
                            value={imageName}
                            onChange={(e) => setImageName(e.target.value)}
                            placeholder="e.g. Weld A1 Close-up"
                            className="glass-input"
                            style={{ width: '100%', fontSize: '0.85rem' }}
                        />
                    </div>
                    <div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                if (files.length > 0) handleMultiUpload(files);
                                e.target.value = '';
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="btn btn--primary btn--sm"
                            style={{
                                cursor: uploading ? 'wait' : 'pointer',
                                whiteSpace: 'nowrap',
                                opacity: uploading ? 0.5 : 1,
                            }}
                        >
                            {uploading ? 'Uploading...' : 'Upload Image'}
                        </button>
                    </div>
                </div>

                {uploadError && (
                    <div
                        style={{
                            padding: '8px 12px',
                            marginBottom: 10,
                            borderRadius: 6,
                            background: 'rgba(239,68,68,0.12)',
                            border: '1px solid rgba(239,68,68,0.25)',
                            color: '#ef4444',
                            fontSize: '0.8rem',
                        }}
                    >
                        Upload error: {uploadError}
                    </div>
                )}

                {/* Image grid */}
                {images.length > 0 ? (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 10,
                            opacity: dragOver ? 0.3 : 1,
                            transition: 'opacity 0.15s ease',
                        }}
                    >
                        {images.map((img) => (
                            <ImageCard
                                key={img.id}
                                image={img}
                                vesselId={vesselId}
                                onPreview={handlePreview}
                            />
                        ))}
                    </div>
                ) : (
                    <div
                        style={{
                            padding: 20,
                            textAlign: 'center',
                            color: 'var(--text-quaternary)',
                            fontSize: '0.85rem',
                        }}
                    >
                        {dragOver ? '' : 'No images uploaded yet. Drag & drop images here or click Upload.'}
                    </div>
                )}
            </div>

            {/* Note */}
            <div
                style={{
                    marginTop: 14,
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'rgba(59,130,246,0.06)',
                    border: '1px solid rgba(59,130,246,0.12)',
                    fontSize: '0.75rem',
                    color: 'var(--text-tertiary)',
                }}
            >
                These images are available in the 3D Modeler for use as inspection images and
                restriction attachments. You can drag & drop images directly into this panel.
            </div>

            {/* Preview modal */}
            {previewUrl && (
                <ImagePreviewModal url={previewUrl} onClose={closePreview} />
            )}
        </CollapsibleSection>
    );
}
