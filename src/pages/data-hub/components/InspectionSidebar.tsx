/**
 * InspectionSidebar - Drawings, photos, quick actions, and stats
 */

import type { VesselImage, Scan, Strake } from '../../../hooks/queries/useDataHub';

interface Drawing {
    image_url?: string;
    annotations?: Array<{ id: string; x: number; y: number; label: string }>;
}

interface Props {
    locationDrawing: Drawing | null;
    gaDrawing: Drawing | null;
    images: VesselImage[];
    scans: Scan[];
    strakes: Strake[];
    onUploadLocation: () => void;
    onUploadGA: () => void;
    onAnnotateLocation: () => void;
    onAnnotateGA: () => void;
    onViewDrawing: (type: 'location' | 'ga') => void;
    onUploadImage: () => void;
    onViewImage: (image: VesselImage) => void;
    onGenerateReport: () => void;
}

function calcCoverage(strakes: Strake[], scans: Scan[]) {
    if (strakes.length === 0) return 0;
    return strakes.reduce((acc, s) => {
        const n = scans.filter(sc => sc.strake_id === s.id).length;
        const target = (s.total_area * s.required_coverage) / 100;
        return acc + (target > 0 ? Math.min((n * s.total_area / 10 / target) * 100, 100) : 0);
    }, 0) / strakes.length;
}

export default function InspectionSidebar({
    locationDrawing,
    gaDrawing,
    images,
    scans,
    strakes,
    onUploadLocation,
    onUploadGA,
    onAnnotateLocation,
    onAnnotateGA,
    onViewDrawing,
    onUploadImage,
    onViewImage,
    onGenerateReport,
}: Props) {
    const coverage = calcCoverage(strakes, scans);
    const coverageColor = coverage >= 100 ? '#22c55e' : '#f59e0b';

    const DrawingCard = ({ title, drawing, onUpload, onAnnotate, type }: {
        title: string;
        drawing: Drawing | null;
        onUpload: () => void;
        onAnnotate: () => void;
        type: 'location' | 'ga';
    }) => (
        <div className="glass-panel p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</span>
                {drawing?.image_url ? (
                    <button onClick={onAnnotate} className="text-xs hover:underline" style={{ color: 'var(--accent-primary)' }}>
                        Annotate
                    </button>
                ) : (
                    <button onClick={onUpload} className="text-xs hover:underline" style={{ color: '#22c55e' }}>
                        + Upload
                    </button>
                )}
            </div>
            {drawing?.image_url ? (
                <div
                    className="relative cursor-pointer rounded overflow-hidden group"
                    style={{ aspectRatio: '16/10' }}
                    onClick={() => onViewDrawing(type)}
                >
                    <img src={drawing.image_url} alt={title} className="w-full h-full object-contain bg-black/20" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                    {(drawing.annotations?.length || 0) > 0 && (
                        <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-xs font-bold bg-blue-600 text-white">
                            {drawing.annotations?.length}
                        </span>
                    )}
                </div>
            ) : (
                <div
                    className="flex items-center justify-center rounded"
                    style={{ aspectRatio: '16/10', background: 'var(--glass-bg-tertiary)' }}
                >
                    <svg className="w-8 h-8" style={{ color: 'var(--text-dim)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-3">
            {/* Drawings */}
            <DrawingCard title="Location Drawing" drawing={locationDrawing} onUpload={onUploadLocation} onAnnotate={onAnnotateLocation} type="location" />
            <DrawingCard title="GA Drawing" drawing={gaDrawing} onUpload={onUploadGA} onAnnotate={onAnnotateGA} type="ga" />

            {/* Photos */}
            <div className="glass-panel p-3">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        Photos ({images.length})
                    </span>
                    <button onClick={onUploadImage} className="text-xs hover:underline" style={{ color: '#22c55e' }}>
                        + Add
                    </button>
                </div>
                {images.length > 0 ? (
                    <div className="grid grid-cols-3 gap-1">
                        {images.slice(0, 6).map((img, i) => (
                            <div
                                key={img.id}
                                className="aspect-square cursor-pointer rounded overflow-hidden group relative"
                                onClick={() => onViewImage(img)}
                            >
                                <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                                {i === 5 && images.length > 6 && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold">
                                        +{images.length - 6}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-center py-3" style={{ color: 'var(--text-dim)' }}>No photos</p>
                )}
            </div>

            {/* Quick Actions */}
            <div className="glass-panel p-3">
                <span className="text-xs font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Quick Actions
                </span>
                <div className="space-y-1">
                    <button
                        onClick={onGenerateReport}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-white/5"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <svg className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Generate Report
                    </button>
                    <button
                        onClick={() => { navigator.clipboard.writeText(window.location.href); alert('Link copied!'); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-white/5"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <svg className="w-4 h-4" style={{ color: '#22c55e' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        Share Link
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="glass-panel p-3">
                <span className="text-xs font-medium block mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Stats
                </span>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span style={{ color: 'var(--text-secondary)' }}>Scans</span>
                        <span style={{ color: 'var(--text-primary)' }}>{scans.length}</span>
                    </div>
                    <div className="flex justify-between">
                        <span style={{ color: 'var(--text-secondary)' }}>Strakes</span>
                        <span style={{ color: 'var(--text-primary)' }}>{strakes.length}</span>
                    </div>
                    {strakes.length > 0 && (
                        <div>
                            <div className="flex justify-between mb-1">
                                <span style={{ color: 'var(--text-secondary)' }}>Coverage</span>
                                <span style={{ color: coverageColor }}>{coverage.toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-tertiary)' }}>
                                <div className="h-full" style={{ width: `${Math.min(coverage, 100)}%`, background: coverageColor }} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
