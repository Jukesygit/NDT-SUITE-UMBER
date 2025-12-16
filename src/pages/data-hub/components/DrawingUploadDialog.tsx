/**
 * DrawingUploadDialog - Upload Location or GA drawing
 * Single file upload with preview
 */

import { useState, useCallback, useRef } from 'react';
import { Modal } from '../../../components/ui';

type DrawingType = 'location' | 'ga';

interface DrawingUploadDialogProps {
    isOpen: boolean;
    onClose: () => void;
    drawingType: DrawingType;
    vesselName: string;
    onUpload: (file: File) => Promise<void>;
}

export default function DrawingUploadDialog({
    isOpen,
    onClose,
    drawingType,
    vesselName,
    onUpload,
}: DrawingUploadDialogProps) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const title = drawingType === 'location' ? 'Location Drawing' : 'GA Drawing';

    const handleFile = useCallback((selectedFile: File | null) => {
        if (!selectedFile || !selectedFile.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        // Clean up previous preview
        if (preview) {
            URL.revokeObjectURL(preview);
        }

        setFile(selectedFile);
        setPreview(URL.createObjectURL(selectedFile));
    }, [preview]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        handleFile(droppedFile);
    }, [handleFile]);

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
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            handleFile(selectedFile);
        }
        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [handleFile]);

    const handleUpload = async () => {
        if (!file) return;

        try {
            setIsUploading(true);
            await onUpload(file);

            // Clean up
            if (preview) {
                URL.revokeObjectURL(preview);
            }
            setFile(null);
            setPreview(null);
            onClose();
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Failed to upload drawing. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleClose = () => {
        if (preview) {
            URL.revokeObjectURL(preview);
        }
        setFile(null);
        setPreview(null);
        onClose();
    };

    const clearFile = () => {
        if (preview) {
            URL.revokeObjectURL(preview);
        }
        setFile(null);
        setPreview(null);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={`Upload ${title} - ${vesselName}`}
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
                        disabled={!file || isUploading}
                        className="btn-primary"
                    >
                        {isUploading ? 'Uploading...' : 'Upload Drawing'}
                    </button>
                </>
            }
        >
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleInputChange}
            />

            {preview ? (
                /* Preview state */
                <div className="space-y-4">
                    <div
                        className="relative rounded-lg overflow-hidden"
                        style={{ border: '2px solid var(--glass-border)' }}
                    >
                        <img
                            src={preview}
                            alt="Drawing preview"
                            className="w-full h-auto max-h-[400px] object-contain"
                            style={{ background: 'var(--glass-bg-tertiary)' }}
                        />
                        <button
                            onClick={clearFile}
                            className="absolute top-2 right-2 p-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
                            title="Remove"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <strong>File:</strong> {file?.name}
                    </div>
                </div>
            ) : (
                /* Drop zone */
                <div
                    className={`
                        rounded-lg p-12 text-center cursor-pointer transition-all
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
                        className="mx-auto w-16 h-16 mb-4"
                        style={{ color: isDragging ? 'var(--accent-primary)' : 'var(--text-dim)' }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                        />
                    </svg>
                    <h3
                        className="text-sm font-semibold mb-1"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {isDragging ? 'Drop drawing here' : `Drag & drop ${title.toLowerCase()} here`}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        or click to select a file
                    </p>
                    <p className="text-xs mt-3" style={{ color: 'var(--text-dim)' }}>
                        Supports: PNG, JPG, GIF, SVG, PDF
                    </p>
                </div>
            )}

            {/* Info box */}
            <div
                className="rounded-lg p-4 mt-4 text-sm"
                style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: 'var(--text-secondary)',
                }}
            >
                <div className="flex items-start gap-2">
                    <svg
                        className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        {drawingType === 'location' ? (
                            <p>
                                Upload a location drawing showing the vessel's position on the asset.
                                You can add annotations after uploading to mark specific inspection points.
                            </p>
                        ) : (
                            <p>
                                Upload a General Arrangement (GA) drawing of the vessel.
                                This helps visualize the vessel layout and plan inspections.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
