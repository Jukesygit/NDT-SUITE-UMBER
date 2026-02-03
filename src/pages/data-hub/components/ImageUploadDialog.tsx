/**
 * ImageUploadDialog - Upload multiple vessel images
 * Supports drag-and-drop and file picker
 */

import { useState, useCallback, useRef } from 'react';
import { Modal } from '../../../components/ui';

interface ImageUploadDialogProps {
    isOpen: boolean;
    onClose: () => void;
    vesselName: string;
    onUpload: (files: File[]) => Promise<void>;
}

interface PreviewFile {
    file: File;
    preview: string;
    name: string;
}

export default function ImageUploadDialog({
    isOpen,
    onClose,
    vesselName,
    onUpload,
}: ImageUploadDialogProps) {
    const [files, setFiles] = useState<PreviewFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback((selectedFiles: FileList | null) => {
        if (!selectedFiles) return;

        const imageFiles = Array.from(selectedFiles).filter(file =>
            file.type.startsWith('image/')
        );

        const newFiles = imageFiles.map(file => ({
            file,
            preview: URL.createObjectURL(file),
            name: file.name,
        }));

        setFiles(prev => [...prev, ...newFiles]);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    }, [handleFiles]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleFileSelect = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFiles(e.target.files);
        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [handleFiles]);

    const removeFile = useCallback((index: number) => {
        setFiles(prev => {
            const newFiles = [...prev];
            URL.revokeObjectURL(newFiles[index].preview);
            newFiles.splice(index, 1);
            return newFiles;
        });
    }, []);

    const handleUpload = async () => {
        if (files.length === 0) return;

        let progressInterval: ReturnType<typeof setInterval> | null = null;

        try {
            setIsUploading(true);
            setUploadProgress(0);

            // Simulate progress updates
            progressInterval = setInterval(() => {
                setUploadProgress(prev => Math.min(prev + 10, 90));
            }, 200);

            await onUpload(files.map(f => f.file));

            setUploadProgress(100);

            // Clean up previews
            files.forEach(f => URL.revokeObjectURL(f.preview));
            setFiles([]);

            // Small delay to show 100% before closing
            setTimeout(() => {
                onClose();
            }, 300);
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Failed to upload images. Please try again.');
        } finally {
            if (progressInterval) clearInterval(progressInterval);
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleClose = () => {
        // Clean up previews
        files.forEach(f => URL.revokeObjectURL(f.preview));
        setFiles([]);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={`Upload Images - ${vesselName}`}
            size="large"
            footer={
                <>
                    <button
                        onClick={handleClose}
                        disabled={isUploading}
                        className="btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={files.length === 0 || isUploading}
                        className="btn-primary"
                    >
                        {isUploading ? `Uploading... ${uploadProgress}%` : `Upload ${files.length} Image${files.length !== 1 ? 's' : ''}`}
                    </button>
                </>
            }
        >
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleInputChange}
            />

            {/* Drop zone */}
            <div
                className={`
                    relative rounded-lg p-8 text-center cursor-pointer transition-all
                    ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-dashed hover:border-white/30'}
                `}
                style={{
                    border: `2px ${isDragging ? 'solid' : 'dashed'} var(--glass-border)`,
                    background: isDragging ? 'rgba(59, 130, 246, 0.1)' : 'var(--glass-bg-secondary)',
                }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={handleFileSelect}
            >
                <svg
                    className="mx-auto w-12 h-12 mb-3"
                    style={{ color: isDragging ? 'var(--accent-primary)' : 'var(--text-dim)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                </svg>
                <h3
                    className="text-sm font-semibold mb-1"
                    style={{ color: 'var(--text-primary)' }}
                >
                    {isDragging ? 'Drop images here' : 'Drag & drop images here'}
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    or click to select files
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>
                    Supports: PNG, JPG, GIF, WebP
                </p>
            </div>

            {/* Upload progress */}
            {isUploading && (
                <div className="mt-4">
                    <div
                        className="h-2 rounded-full overflow-hidden"
                        style={{ background: 'var(--glass-bg-tertiary)' }}
                    >
                        <div
                            className="h-full transition-all duration-200"
                            style={{
                                width: `${uploadProgress}%`,
                                background: 'var(--accent-primary)',
                            }}
                        />
                    </div>
                    <p className="text-xs text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
                        Uploading {files.length} image{files.length !== 1 ? 's' : ''}...
                    </p>
                </div>
            )}

            {/* Preview grid */}
            {files.length > 0 && !isUploading && (
                <div className="mt-4">
                    <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                        Selected Images ({files.length})
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {files.map((file, index) => (
                            <div
                                key={`${file.name}-${index}`}
                                className="relative group aspect-square rounded-lg overflow-hidden"
                                style={{ border: '1px solid var(--glass-border)' }}
                            >
                                <img
                                    src={file.preview}
                                    alt={file.name}
                                    className="w-full h-full object-cover"
                                />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFile(index);
                                    }}
                                    className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove"
                                >
                                    <svg
                                        className="w-3 h-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                                <div
                                    className="absolute bottom-0 left-0 right-0 py-1 px-2 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ background: 'rgba(0, 0, 0, 0.7)', color: 'white' }}
                                >
                                    {file.name}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Modal>
    );
}
