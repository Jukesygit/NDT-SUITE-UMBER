/**
 * DrawingsSection - Displays Location and GA drawings
 * Supports upload, annotate, and remove actions
 */

interface Drawing {
    image_url?: string;
    annotations?: Array<{ id: string; x: number; y: number; label: string }>;
    comment?: string;
}

interface DrawingsSectionProps {
    locationDrawing: Drawing | null;
    gaDrawing: Drawing | null;
    onUploadLocation: () => void;
    onUploadGA: () => void;
    onAnnotateLocation: () => void;
    onAnnotateGA: () => void;
    onRemoveLocation: () => void;
    onRemoveGA: () => void;
    onViewDrawing: (type: 'location' | 'ga') => void;
}

function DrawingCard({
    title,
    drawing,
    onUpload,
    onAnnotate,
    onRemove,
    onView,
}: {
    title: string;
    drawing: Drawing | null;
    onUpload: () => void;
    onAnnotate: () => void;
    onRemove: () => void;
    onView: () => void;
}) {
    const hasDrawing = drawing?.image_url;
    const annotationCount = drawing?.annotations?.length || 0;
    const hasComment = !!drawing?.comment;

    return (
        <div className="glass-panel" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--spacing-md)' }}>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {title}
                </div>
                {hasDrawing ? (
                    <button
                        className="btn-primary btn-sm"
                        onClick={onAnnotate}
                    >
                        Annotate
                    </button>
                ) : (
                    <button
                        className="btn-success btn-sm"
                        onClick={onUpload}
                    >
                        + Upload
                    </button>
                )}
            </div>

            {hasDrawing ? (
                <div
                    className="relative group cursor-pointer rounded-lg overflow-hidden aspect-video"
                    style={{ border: '2px solid var(--glass-border)' }}
                    onClick={onView}
                >
                    <img
                        src={drawing.image_url}
                        alt={title}
                        className="w-full h-full object-contain"
                        style={{ background: 'var(--glass-bg-tertiary)' }}
                    />

                    {/* Hover overlay with remove button */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center gap-2">
                        <button
                            className="opacity-0 group-hover:opacity-100 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition-all"
                            onClick={(e) => { e.stopPropagation(); onRemove(); }}
                            aria-label={`Remove ${title}`}
                            title="Remove"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>

                    {/* Badges */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                        {annotationCount > 0 && (
                            <div className="bg-blue-600 text-white px-2 py-1 rounded-full text-xs font-bold">
                                {annotationCount} annotation{annotationCount !== 1 ? 's' : ''}
                            </div>
                        )}
                        {hasComment && (
                            <div className="bg-purple-600 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                </svg>
                                Comment
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div
                    className="aspect-video rounded-lg flex items-center justify-center"
                    style={{
                        background: 'var(--glass-bg-tertiary)',
                        border: '2px dashed var(--glass-border)',
                    }}
                >
                    <div className="text-center" style={{ color: 'var(--text-dim)' }}>
                        <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        <p className="text-sm">No drawing uploaded</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function DrawingsSection({
    locationDrawing,
    gaDrawing,
    onUploadLocation,
    onUploadGA,
    onAnnotateLocation,
    onAnnotateGA,
    onRemoveLocation,
    onRemoveGA,
    onViewDrawing,
}: DrawingsSectionProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 'var(--spacing-lg)' }}>
            <DrawingCard
                title="Location Drawing"
                drawing={locationDrawing}
                onUpload={onUploadLocation}
                onAnnotate={onAnnotateLocation}
                onRemove={onRemoveLocation}
                onView={() => onViewDrawing('location')}
            />
            <DrawingCard
                title="GA Drawing"
                drawing={gaDrawing}
                onUpload={onUploadGA}
                onAnnotate={onAnnotateGA}
                onRemove={onRemoveGA}
                onView={() => onViewDrawing('ga')}
            />
        </div>
    );
}
