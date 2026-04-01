import React from 'react';
import { Trash2, Camera, Eye, EyeOff, Lock, Unlock, Maximize2 } from 'lucide-react';
import type { VesselState, InspectionImageConfig } from '../types';
import { SliderRow, SubSection } from './SliderRow';

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
}

export function InspectionImageSection({
    vesselState, selectedInspectionImageId,
    onAddInspectionImage, onUpdateInspectionImage, onRemoveInspectionImage,
    onSelectInspectionImage, onToggleInspectionImageVisible, onToggleInspectionImageLocked,
    onViewInspectionImage, getNextInspectionImageId,
}: InspectionImageSectionProps) {
    const sel = vesselState.inspectionImages.find(i => i.id === selectedInspectionImageId);

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
        <SubSection title="Inspection Images" count={vesselState.inspectionImages.length}>
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
