import React, { useState, useEffect } from 'react';
import { Trash2, Camera, Eye, EyeOff, Lock, Unlock, Maximize2, ImagePlus } from 'lucide-react';
import type { VesselState, InspectionImageConfig } from '../types';
import { SliderRow, SubSection } from './SliderRow';
import type { ProjectImage } from '../../../types/inspection-project';
import { getProjectFileUrl } from '../../../services/inspection-project-service';

export interface InspectionImageSectionProps {
    vesselState: VesselState;
    selectedInspectionImageId: number;
    onAddInspectionImage: (img: InspectionImageConfig) => void;
    onUpdateInspectionImage: (id: number, updates: Partial<InspectionImageConfig>) => void;
    onRemoveInspectionImage: (id: number) => void;
    onSelectInspectionImage: (id: number) => void;
    onToggleInspectionImageVisible: (id: number) => void;
    onToggleInspectionImageLocked: (id: number) => void;
    onViewInspectionImage: (id: number) => void;
    getNextInspectionImageId: () => number;
    projectImages?: ProjectImage[];
    isOpen?: boolean;
    onToggle?: () => void;
}

// Small thumbnail for a project image in the picker
function ProjectImageThumb({
    image,
    onAdd,
}: {
    image: ProjectImage;
    onAdd: (image: ProjectImage) => void;
}) {
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getProjectFileUrl(image.storage_path, image.storage_bucket)
            .then((url) => { if (!cancelled) setThumbUrl(url); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [image.storage_path, image.storage_bucket]);

    return (
        <button
            onClick={() => onAdd(image)}
            title={`Add "${image.name}" to vessel`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                padding: '4px 6px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                cursor: 'pointer',
                color: '#ccc',
                fontSize: '0.75rem',
                textAlign: 'left',
            }}
        >
            {thumbUrl ? (
                <img
                    src={thumbUrl}
                    alt={image.name}
                    style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                />
            ) : (
                <div style={{ width: 24, height: 24, background: 'rgba(255,255,255,0.06)', borderRadius: 3, flexShrink: 0 }} />
            )}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {image.name}
            </span>
            <ImagePlus size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
        </button>
    );
}

export function InspectionImageSection({
    vesselState, selectedInspectionImageId,
    onAddInspectionImage, onUpdateInspectionImage, onRemoveInspectionImage,
    onSelectInspectionImage, onToggleInspectionImageVisible, onToggleInspectionImageLocked,
    onViewInspectionImage, getNextInspectionImageId, projectImages,
    isOpen, onToggle,
}: InspectionImageSectionProps) {
    const sel = vesselState.inspectionImages.find(i => i.id === selectedInspectionImageId);
    const [showProjectPicker, setShowProjectPicker] = useState(false);
    const [loadingProjectImage, setLoadingProjectImage] = useState(false);

    const handleAddProjectImage = async (pImg: ProjectImage) => {
        setLoadingProjectImage(true);
        try {
            const url = await getProjectFileUrl(pImg.storage_path, pImg.storage_bucket);
            const response = await fetch(url);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageData = e.target?.result as string;
                if (!imageData) return;
                const id = getNextInspectionImageId();
                onAddInspectionImage({
                    id,
                    name: pImg.name,
                    imageData,
                    pos: vesselState.length / 2,
                    angle: 90,
                });
                onSelectInspectionImage(id);
            };
            reader.readAsDataURL(blob);
        } catch {
            // Silently fail — signed URL may have expired
        } finally {
            setLoadingProjectImage(false);
        }
    };

    const handleFile = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target?.result as string;
            if (!imageData) return;
            const id = getNextInspectionImageId();
            const num = vesselState.inspectionImages.length + 1;
            onAddInspectionImage({
                id,
                name: `IMG${num}`,
                imageData,
                pos: vesselState.length / 2,
                angle: 90,
            });
            onSelectInspectionImage(id);
        };
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) handleFile(file);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = '';
    };

    return (
        <SubSection title="Inspection Images" count={vesselState.inspectionImages.length} isOpen={isOpen} onToggle={onToggle}>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px 0' }}>
                Attach photos to vessel points
            </p>

            {/* Upload zone */}
            <label
                className="vm-texture-import"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
            >
                <Camera size={20} style={{ marginBottom: 4, opacity: 0.5 }} />
                <div className="drop-text">Drop image or click to import</div>
                <div className="drop-sub">PNG, JPG</div>
                <input type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
            </label>

            {/* Project image pool picker */}
            {projectImages && projectImages.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                    <button
                        className="vm-toggle-btn"
                        onClick={() => setShowProjectPicker(p => !p)}
                        style={{
                            width: '100%',
                            fontSize: '0.72rem',
                            padding: '4px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            justifyContent: 'center',
                            opacity: loadingProjectImage ? 0.5 : 1,
                        }}
                        disabled={loadingProjectImage}
                    >
                        <ImagePlus size={12} />
                        {showProjectPicker ? 'Hide' : 'From'} Project Pool ({projectImages.length})
                    </button>
                    {showProjectPicker && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                            {projectImages.map((pImg) => (
                                <ProjectImageThumb
                                    key={pImg.id}
                                    image={pImg}
                                    onAdd={handleAddProjectImage}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Image list */}
            {vesselState.inspectionImages.map((img) => {
                const isSelected = img.id === selectedInspectionImageId;
                return (
                    <React.Fragment key={img.id}>
                        <div
                            className={`vm-list-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => onSelectInspectionImage(img.id)}
                            style={{ opacity: img.visible === false ? 0.4 : 1 }}
                        >
                            <div className="vm-list-item-info" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <img
                                    src={img.imageData}
                                    alt={img.name}
                                    style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                                />
                                <strong>{img.name}</strong>
                            </div>
                            <div style={{ display: 'flex', gap: 2 }}>
                                <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onToggleInspectionImageVisible(img.id); }} title={img.visible === false ? 'Show' : 'Hide'} style={{ color: img.visible === false ? 'rgba(255,255,255,0.25)' : undefined }}>
                                    {img.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
                                </button>
                                <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onToggleInspectionImageLocked(img.id); }} title={img.locked ? 'Unlock' : 'Lock'} style={{ color: img.locked ? '#3b82f6' : undefined }}>
                                    {img.locked ? <Lock size={12} /> : <Unlock size={12} />}
                                </button>
                                <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onViewInspectionImage(img.id); }} title="View full image">
                                    <Maximize2 size={14} />
                                </button>
                                <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveInspectionImage(img.id); }}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                        {isSelected && sel && (
                            <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Name</span></div>
                                    <input
                                        className="vm-input"
                                        value={sel.name}
                                        onChange={e => onUpdateInspectionImage(sel.id, { name: e.target.value })}
                                    />
                                </div>
                                <div className="vm-form-row">
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Position (mm)</span></div>
                                        <input
                                            type="number"
                                            className="vm-input"
                                            value={sel.pos}
                                            onChange={e => onUpdateInspectionImage(sel.id, { pos: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Angle (&deg;)</span></div>
                                        <input
                                            type="number"
                                            className="vm-input"
                                            value={sel.angle}
                                            min={0}
                                            max={360}
                                            onChange={e => onUpdateInspectionImage(sel.id, { angle: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <SliderRow
                                    label="Leader Length"
                                    value={sel.leaderLength ?? 2000}
                                    min={50}
                                    max={5000}
                                    step={10}
                                    onChange={v => onUpdateInspectionImage(sel.id, { leaderLength: v, labelOffset: undefined })}
                                />
                                {sel.labelOffset && (
                                    <button
                                        className="vm-toggle-btn"
                                        style={{ marginTop: 4, width: '100%', fontSize: '0.7rem', padding: '3px 8px' }}
                                        onClick={() => onUpdateInspectionImage(sel.id, { labelOffset: undefined })}
                                    >
                                        Reset Label Position
                                    </button>
                                )}
                                <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', margin: '6px 0 0 0' }}>
                                    Drag dot on vessel to reposition | Click thumbnail to view full image
                                </p>
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </SubSection>
    );
}
