/**
 * VesselImagesSection - Displays vessel images in a grid
 * Supports upload, rename, and delete actions
 */

import type { VesselImage } from '../../../hooks/queries/useDataHub';

interface VesselImagesSectionProps {
    images: VesselImage[];
    onUploadImage: () => void;
    onViewImage: (image: VesselImage) => void;
    onRenameImage: (image: VesselImage) => void;
    onDeleteImage: (image: VesselImage) => void;
}

function ImageCard({
    image,
    onView,
    onRename,
    onDelete,
}: {
    image: VesselImage;
    onView: () => void;
    onRename: () => void;
    onDelete: () => void;
}) {
    return (
        <div
            className="vessel-image-card relative group cursor-pointer rounded-lg overflow-hidden aspect-square"
            style={{ border: '2px solid var(--glass-border)' }}
            onClick={onView}
        >
            <img
                src={image.image_url}
                alt={image.name}
                className="w-full h-full object-cover"
            />

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center gap-2">
                <button
                    className="opacity-0 group-hover:opacity-100 bg-blue-600 text-white p-1.5 rounded-full hover:bg-blue-700 transition-all"
                    onClick={(e) => { e.stopPropagation(); onRename(); }}
                    aria-label="Rename image"
                    title="Rename"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </button>
                <button
                    className="opacity-0 group-hover:opacity-100 bg-red-600 text-white p-1.5 rounded-full hover:bg-red-700 transition-all"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    aria-label="Delete image"
                    title="Delete"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Image name overlay */}
            <div
                className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity"
                title={image.name}
            >
                {image.name}
            </div>
        </div>
    );
}

export default function VesselImagesSection({
    images,
    onUploadImage,
    onViewImage,
    onRenameImage,
    onDeleteImage,
}: VesselImagesSectionProps) {
    return (
        <div className="glass-panel" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--spacing-md)' }}>
                <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
                    Vessel Images
                </div>
                <button
                    className="btn btn-primary text-xs"
                    style={{ padding: '6px 12px' }}
                    onClick={onUploadImage}
                >
                    + Add Images
                </button>
            </div>

            {images.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {images.map((image) => (
                        <ImageCard
                            key={image.id}
                            image={image}
                            onView={() => onViewImage(image)}
                            onRename={() => onRenameImage(image)}
                            onDelete={() => onDeleteImage(image)}
                        />
                    ))}
                </div>
            ) : (
                <p className="text-sm italic" style={{ color: 'var(--text-dim)' }}>
                    No images uploaded yet
                </p>
            )}
        </div>
    );
}
