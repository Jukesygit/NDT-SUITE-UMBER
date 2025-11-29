/**
 * DrawingAnnotationDialog - Annotate drawings with markers and boxes
 * Canvas-based annotation tool with comment support
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Modal } from '../../../components/ui';

type AnnotationType = 'marker' | 'box';

interface Annotation {
    id: string;
    type: AnnotationType;
    x: number;
    y: number;
    width?: number;
    height?: number;
    label: string;
}

interface Drawing {
    image_url: string;
    annotations?: Annotation[];
    comment?: string;
}

interface DrawingAnnotationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    drawingType: 'location' | 'ga';
    vesselName: string;
    drawing: Drawing;
    onSave: (annotations: Annotation[], comment: string) => Promise<void>;
}

function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default function DrawingAnnotationDialog({
    isOpen,
    onClose,
    drawingType,
    vesselName,
    drawing,
    onSave,
}: DrawingAnnotationDialogProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    const [annotations, setAnnotations] = useState<Annotation[]>(drawing.annotations || []);
    const [comment, setComment] = useState(drawing.comment || '');
    const [selectedTool, setSelectedTool] = useState<AnnotationType>('marker');
    const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [scale, setScale] = useState(1);

    const title = drawingType === 'location' ? 'Location Drawing' : 'GA Drawing';

    // Load image and set up canvas
    useEffect(() => {
        if (!isOpen || !drawing.image_url) return;

        const img = new Image();
        img.onload = () => {
            imageRef.current = img;
            setImageLoaded(true);
        };
        img.src = drawing.image_url;

        return () => {
            imageRef.current = null;
            setImageLoaded(false);
        };
    }, [isOpen, drawing.image_url]);

    // Draw canvas
    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        const img = imageRef.current;

        if (!canvas || !container || !img || !imageLoaded) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Calculate scale to fit container
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight || 500;
        const imgRatio = img.width / img.height;
        const containerRatio = containerWidth / containerHeight;

        let drawWidth, drawHeight;
        if (imgRatio > containerRatio) {
            drawWidth = containerWidth;
            drawHeight = containerWidth / imgRatio;
        } else {
            drawHeight = containerHeight;
            drawWidth = containerHeight * imgRatio;
        }

        const newScale = drawWidth / img.width;
        setScale(newScale);

        canvas.width = drawWidth;
        canvas.height = drawHeight;

        // Draw image
        ctx.drawImage(img, 0, 0, drawWidth, drawHeight);

        // Draw annotations
        annotations.forEach((annotation, index) => {
            const x = annotation.x * newScale;
            const y = annotation.y * newScale;
            const isSelected = annotation.id === selectedAnnotation;

            if (annotation.type === 'box' && annotation.width && annotation.height) {
                const w = annotation.width * newScale;
                const h = annotation.height * newScale;

                // Draw box
                ctx.strokeStyle = isSelected ? '#fbbf24' : 'rgba(34, 197, 94, 1)';
                ctx.lineWidth = isSelected ? 3 : 2;
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = isSelected ? 'rgba(251, 191, 36, 0.25)' : 'rgba(34, 197, 94, 0.25)';
                ctx.fillRect(x, y, w, h);

                // Draw number badge
                const badgeSize = 20;
                ctx.fillStyle = isSelected ? '#fbbf24' : 'rgba(34, 197, 94, 0.95)';
                ctx.fillRect(x, y - badgeSize, badgeSize, badgeSize);
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y - badgeSize, badgeSize, badgeSize);
                ctx.fillStyle = 'white';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((index + 1).toString(), x + badgeSize / 2, y - badgeSize / 2);
            } else {
                // Draw marker
                const radius = isSelected ? 12 : 10;

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = isSelected ? '#fbbf24' : 'rgba(239, 68, 68, 0.9)';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.fillStyle = 'white';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((index + 1).toString(), x, y);
            }
        });
    }, [annotations, selectedAnnotation, imageLoaded]);

    useEffect(() => {
        drawCanvas();
    }, [drawCanvas]);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            drawCanvas();
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawCanvas]);

    const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        return { x, y };
    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const coords = getCanvasCoords(e);
        if (!coords) return;

        // Check if clicking on existing annotation
        for (const annotation of annotations) {
            const ax = annotation.x;
            const ay = annotation.y;

            if (annotation.type === 'box' && annotation.width && annotation.height) {
                if (
                    coords.x >= ax &&
                    coords.x <= ax + annotation.width &&
                    coords.y >= ay &&
                    coords.y <= ay + annotation.height
                ) {
                    setSelectedAnnotation(annotation.id);
                    return;
                }
            } else {
                const distance = Math.sqrt(Math.pow(coords.x - ax, 2) + Math.pow(coords.y - ay, 2));
                if (distance <= 15) {
                    setSelectedAnnotation(annotation.id);
                    return;
                }
            }
        }

        // Add new marker
        if (selectedTool === 'marker') {
            const newAnnotation: Annotation = {
                id: generateId(),
                type: 'marker',
                x: coords.x,
                y: coords.y,
                label: '',
            };
            setAnnotations([...annotations, newAnnotation]);
            setSelectedAnnotation(newAnnotation.id);
        }
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (selectedTool !== 'box') return;

        const coords = getCanvasCoords(e);
        if (!coords) return;

        setIsDrawing(true);
        setDrawStart(coords);
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !drawStart) {
            setIsDrawing(false);
            setDrawStart(null);
            return;
        }

        const coords = getCanvasCoords(e);
        if (!coords) return;

        const width = Math.abs(coords.x - drawStart.x);
        const height = Math.abs(coords.y - drawStart.y);

        // Only create box if it's a reasonable size
        if (width > 10 && height > 10) {
            const newAnnotation: Annotation = {
                id: generateId(),
                type: 'box',
                x: Math.min(drawStart.x, coords.x),
                y: Math.min(drawStart.y, coords.y),
                width,
                height,
                label: '',
            };
            setAnnotations([...annotations, newAnnotation]);
            setSelectedAnnotation(newAnnotation.id);
        }

        setIsDrawing(false);
        setDrawStart(null);
    };

    const deleteSelectedAnnotation = () => {
        if (!selectedAnnotation) return;
        setAnnotations(annotations.filter(a => a.id !== selectedAnnotation));
        setSelectedAnnotation(null);
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            await onSave(annotations, comment);
            onClose();
        } catch (error) {
            console.error('Failed to save annotations:', error);
            alert('Failed to save annotations. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Annotate ${title} - ${vesselName}`}
            size="xl"
            footer={
                <>
                    <button onClick={onClose} disabled={isSaving} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="btn btn-primary">
                        {isSaving ? 'Saving...' : 'Save Annotations'}
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setSelectedTool('marker')}
                            className={`
                                px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors
                                ${selectedTool === 'marker' ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'}
                            `}
                        >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" />
                            </svg>
                            Marker
                        </button>
                        <button
                            onClick={() => setSelectedTool('box')}
                            className={`
                                px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors
                                ${selectedTool === 'box' ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'}
                            `}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <rect x="4" y="4" width="16" height="16" strokeWidth={2} />
                            </svg>
                            Box
                        </button>
                    </div>

                    {selectedAnnotation && (
                        <button
                            onClick={deleteSelectedAnnotation}
                            className="px-3 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete Selected
                        </button>
                    )}

                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                        {selectedTool === 'marker' ? 'Click to add marker' : 'Click and drag to draw box'}
                    </div>
                </div>

                {/* Canvas */}
                <div
                    ref={containerRef}
                    className="relative rounded-lg overflow-hidden"
                    style={{
                        background: 'var(--glass-bg-tertiary)',
                        border: '2px solid var(--glass-border)',
                        minHeight: '400px',
                    }}
                >
                    {imageLoaded ? (
                        <canvas
                            ref={canvasRef}
                            onClick={handleCanvasClick}
                            onMouseDown={handleMouseDown}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={() => {
                                setIsDrawing(false);
                                setDrawStart(null);
                            }}
                            className="cursor-crosshair mx-auto block"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-[400px]">
                            <p style={{ color: 'var(--text-dim)' }}>Loading image...</p>
                        </div>
                    )}
                </div>

                {/* Annotation details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Annotations list */}
                    <div
                        className="rounded-lg p-4"
                        style={{ background: 'var(--glass-bg-secondary)', border: '1px solid var(--glass-border)' }}
                    >
                        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                            Annotations ({annotations.length})
                        </h4>
                        {annotations.length > 0 ? (
                            <div className="space-y-2 max-h-[150px] overflow-y-auto">
                                {annotations.map((annotation, index) => (
                                    <div
                                        key={annotation.id}
                                        onClick={() => setSelectedAnnotation(annotation.id)}
                                        className={`
                                            p-2 rounded cursor-pointer transition-colors text-sm
                                            ${annotation.id === selectedAnnotation ? 'bg-yellow-500/20 border-yellow-500/50' : 'hover:bg-white/5'}
                                        `}
                                        style={{ border: '1px solid transparent' }}
                                    >
                                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                            #{index + 1}
                                        </span>
                                        <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>
                                            {annotation.type === 'box' ? 'Box' : 'Marker'}
                                        </span>
                                        {annotation.label && (
                                            <span className="ml-2" style={{ color: 'var(--text-dim)' }}>
                                                - {annotation.label}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                                No annotations yet. Click on the image to add markers.
                            </p>
                        )}
                    </div>

                    {/* Comment */}
                    <div
                        className="rounded-lg p-4"
                        style={{ background: 'var(--glass-bg-secondary)', border: '1px solid var(--glass-border)' }}
                    >
                        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                            Comment
                        </h4>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Add a comment for this drawing..."
                            className="w-full h-[120px] p-3 rounded-lg text-sm resize-none"
                            style={{
                                background: 'var(--glass-bg-tertiary)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)',
                            }}
                        />
                    </div>
                </div>
            </div>
        </Modal>
    );
}
