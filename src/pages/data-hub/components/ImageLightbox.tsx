/**
 * ImageLightbox - Fullscreen image viewer with zoom and navigation
 */

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { VesselImage } from '../../../hooks/queries/useDataHub';

interface ImageLightboxProps {
    isOpen: boolean;
    onClose: () => void;
    images: VesselImage[];
    initialIndex?: number;
}

export default function ImageLightbox({
    isOpen,
    onClose,
    images,
    initialIndex = 0,
}: ImageLightboxProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [isZoomed, setIsZoomed] = useState(false);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
            setIsZoomed(false);
        }
    }, [isOpen, initialIndex]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    onClose();
                    break;
                case 'ArrowLeft':
                    navigatePrev();
                    break;
                case 'ArrowRight':
                    navigateNext();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, currentIndex, images.length]);

    // Prevent body scroll when open
    useEffect(() => {
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    const navigatePrev = useCallback(() => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
        setIsZoomed(false);
    }, [images.length]);

    const navigateNext = useCallback(() => {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
        setIsZoomed(false);
    }, [images.length]);

    const toggleZoom = useCallback(() => {
        setIsZoomed((prev) => !prev);
    }, []);

    if (!isOpen || images.length === 0) return null;

    const currentImage = images[currentIndex];

    const lightboxContent = (
        <div
            className="fixed inset-0 z-[9999] flex flex-col"
            style={{ background: 'rgba(0, 0, 0, 0.95)' }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3"
                style={{ background: 'rgba(0, 0, 0, 0.5)' }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-white/80 text-sm">
                        {currentIndex + 1} / {images.length}
                    </span>
                    <span className="text-white font-medium truncate max-w-[300px]" title={currentImage.name}>
                        {currentImage.name}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleZoom}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                        title={isZoomed ? 'Zoom out' : 'Zoom in'}
                    >
                        {isZoomed ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                        )}
                    </button>
                    <a
                        href={currentImage.image_url}
                        download={currentImage.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                        title="Download"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </a>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                        title="Close (Esc)"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Image container */}
            <div
                className="flex-1 flex items-center justify-center overflow-auto p-4"
                onClick={(e) => {
                    if (e.target === e.currentTarget) onClose();
                }}
            >
                <img
                    src={currentImage.image_url}
                    alt={currentImage.name}
                    className={`
                        max-h-full transition-transform duration-200 cursor-pointer
                        ${isZoomed ? 'max-w-none cursor-zoom-out' : 'max-w-full cursor-zoom-in'}
                    `}
                    style={{
                        transform: isZoomed ? 'scale(2)' : 'scale(1)',
                        transformOrigin: 'center center',
                    }}
                    onClick={toggleZoom}
                />
            </div>

            {/* Navigation buttons */}
            {images.length > 1 && (
                <>
                    <button
                        onClick={navigatePrev}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                        title="Previous (←)"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button
                        onClick={navigateNext}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                        title="Next (→)"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </>
            )}

            {/* Thumbnail strip */}
            {images.length > 1 && (
                <div
                    className="flex items-center justify-center gap-2 py-3 px-4 overflow-x-auto"
                    style={{ background: 'rgba(0, 0, 0, 0.5)' }}
                >
                    {images.map((image, index) => (
                        <button
                            key={image.id}
                            onClick={() => {
                                setCurrentIndex(index);
                                setIsZoomed(false);
                            }}
                            className={`
                                flex-shrink-0 w-12 h-12 rounded overflow-hidden transition-all
                                ${index === currentIndex ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : 'opacity-50 hover:opacity-100'}
                            `}
                        >
                            <img
                                src={image.image_url}
                                alt={image.name}
                                className="w-full h-full object-cover"
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    return createPortal(lightboxContent, document.body);
}
