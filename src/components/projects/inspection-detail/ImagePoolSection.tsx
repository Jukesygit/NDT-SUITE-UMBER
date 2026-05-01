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

function ImageCard({
    image, vesselId, onPreview,
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
        <div className="pj-image-card">
            <div
                className="pj-image-thumb"
                onClick={() => signedUrl && onPreview(signedUrl)}
                title="Click to preview"
            >
                {signedUrl ? (
                    <img src={signedUrl} alt={image.name} />
                ) : (
                    <span className="pj-doc-thumb-empty">
                        <span>Loading...</span>
                    </span>
                )}
            </div>

            <div className="pj-image-info">
                {editingName ? (
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={handleNameBlur}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleNameBlur(); }}
                        className="pj-form-input"
                        style={{ padding: '2px 6px', fontSize: '10px' }}
                    />
                ) : (
                    <div className="pj-image-name" onClick={() => setEditingName(true)} title="Click to rename">
                        {image.name}
                    </div>
                )}

                <div className="pj-image-meta-row">
                    <span className="pj-doc-size">
                        {image.size_bytes ? `${(image.size_bytes / 1024).toFixed(0)} KB` : '—'}
                    </span>
                    <button
                        type="button"
                        onClick={() => deleteImage.mutate({ id: image.id, vesselId })}
                        className="pj-vessel-action-btn danger-ghost"
                        style={{ padding: '2px 6px', fontSize: '9px' }}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

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
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 40,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative', maxWidth: '90vw', maxHeight: '85vh',
                    background: '#0c0b0a', borderRadius: 8,
                    border: '1px solid rgba(53, 160, 88, 0.15)',
                    overflow: 'hidden', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', padding: 24,
                }}
            >
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'none', border: 'none',
                        color: 'rgba(53, 160, 88, 0.50)', cursor: 'pointer', padding: 4,
                    }}
                >
                    <X size={18} />
                </button>
                <img src={url} alt="Preview" style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 4 }} />
            </div>
        </div>
    );
}

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
                projectId, projectVesselId: vesselId, userId: user.id, name, file,
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

    return (
        <CollapsibleSection title="Inspection Images">
            <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    position: 'relative', borderRadius: 6,
                    border: dragOver ? '2px dashed rgba(53, 160, 88, 0.40)' : '2px dashed transparent',
                    background: dragOver ? 'rgba(53, 160, 88, 0.04)' : 'transparent',
                    padding: dragOver ? 10 : 0,
                    transition: 'all 0.15s ease',
                }}
            >
                {dragOver && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(53, 160, 88, 0.06)', borderRadius: 6, pointerEvents: 'none',
                    }}>
                        <span className="pj-doc-filename">Drop images here to upload</span>
                    </div>
                )}

                <div className="pj-image-upload-row" style={{ opacity: dragOver ? 0.3 : 1, transition: 'opacity 0.15s ease' }}>
                    <div style={{ flex: 1 }}>
                        <label className="pj-doc-label" style={{ display: 'block', marginBottom: 4 }}>
                            Image Name (optional)
                        </label>
                        <input
                            type="text"
                            value={imageName}
                            onChange={(e) => setImageName(e.target.value)}
                            placeholder="e.g. Weld A1 Close-up"
                            className="pj-form-input"
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
                            className="pj-btn primary"
                            style={{ opacity: uploading ? 0.5 : 1 }}
                        >
                            {uploading ? 'Uploading...' : 'Upload Image'}
                        </button>
                    </div>
                </div>

                {uploadError && (
                    <div className="pj-alert error" style={{ marginBottom: 10 }}>
                        Upload error: {uploadError}
                    </div>
                )}

                {images.length > 0 ? (
                    <div className="pj-image-grid" style={{ opacity: dragOver ? 0.3 : 1, transition: 'opacity 0.15s ease' }}>
                        {images.map((img) => (
                            <ImageCard
                                key={img.id}
                                image={img}
                                vesselId={vesselId}
                                onPreview={(url) => setPreviewUrl(url)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="pj-empty" style={{ padding: '16px 0' }}>
                        <div className="pj-empty-text">
                            {dragOver ? '' : 'No images uploaded yet. Drag & drop images here or click Upload.'}
                        </div>
                    </div>
                )}
            </div>

            <div className="pj-info-note">
                These images are available in the 3D Modeler for use as inspection images and restriction attachments.
                You can drag & drop images directly into this panel.
            </div>

            {previewUrl && (
                <ImagePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
            )}
        </CollapsibleSection>
    );
}
