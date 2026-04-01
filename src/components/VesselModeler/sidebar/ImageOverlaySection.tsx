import React from 'react';
import { Trash2, ImagePlus } from 'lucide-react';
import type { VesselState, TextureConfig } from '../types';
import { loadTextureFromFile } from '../engine/texture-manager';
import { SliderRow, SubSection } from './SliderRow';
import type * as THREE from 'three';

export interface ImageOverlaySectionProps {
    vesselState: VesselState;
    selectedTextureId: number;
    onAddTexture: (texture: TextureConfig, threeTexture: THREE.Texture) => void;
    onUpdateTexture: (id: number, updates: Partial<TextureConfig>) => void;
    onRemoveTexture: (id: number) => void;
    onSelectTexture: (id: number) => void;
    getNextTextureId: () => number;
    renderer: THREE.WebGLRenderer | null;
}

export function ImageOverlaySection({
    vesselState, selectedTextureId,
    onAddTexture, onUpdateTexture, onRemoveTexture, onSelectTexture,
    getNextTextureId, renderer,
}: ImageOverlaySectionProps) {
    const sel = vesselState.textures.find(t => t.id === selectedTextureId);

    const handleFile = async (file: File) => {
        if (!renderer) return;
        try {
            const result = await loadTextureFromFile(file, renderer);
            const id = getNextTextureId();
            const tex: TextureConfig = {
                id,
                name: result.name,
                imageData: result.imageData,
                pos: vesselState.length / 2,
                angle: 90,
                scaleX: 1.0,
                scaleY: 1.0,
                rotation: 0,
                flipH: false,
                flipV: false,
                aspectRatio: result.aspectRatio,
            };
            onAddTexture(tex, result.texture);
        } catch {
            // File load failed silently
        }
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
        <SubSection title="Image Overlays" count={vesselState.textures.length}>
            {/* Drop zone */}
            <label
                className="vm-texture-import"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
            >
                <ImagePlus size={20} style={{ marginBottom: 4, opacity: 0.5 }} />
                <div className="drop-text">Drop image or click to import</div>
                <div className="drop-sub">PNG, JPG, SVG</div>
                <input type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
            </label>

            {/* Texture list */}
            {vesselState.textures.map((t) => {
                const texId = t.id;
                const isSelected = texId === selectedTextureId;
                return (
                    <React.Fragment key={t.id}>
                        <div
                            className={`vm-list-item texture ${isSelected ? 'selected' : ''}`}
                            onClick={() => onSelectTexture(texId)}
                        >
                            <div className="vm-list-item-info">
                                <strong>{t.name}</strong>
                            </div>
                            <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveTexture(texId); }}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                        {isSelected && sel && (
                            <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                                <div className="vm-form-row">
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Position</span></div>
                                        <input
                                            type="number"
                                            className="vm-input"
                                            value={sel.pos}
                                            onChange={e => onUpdateTexture(sel.id, { pos: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Angle</span></div>
                                        <input
                                            type="number"
                                            className="vm-input"
                                            value={sel.angle}
                                            onChange={e => onUpdateTexture(sel.id, { angle: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="vm-form-row">
                                    <SliderRow
                                        label="Scale X"
                                        value={sel.scaleX}
                                        min={0.1}
                                        max={5}
                                        step={0.1}
                                        unit="x"
                                        onChange={v => onUpdateTexture(sel.id, { scaleX: v })}
                                    />
                                    <SliderRow
                                        label="Scale Y"
                                        value={sel.scaleY}
                                        min={0.1}
                                        max={5}
                                        step={0.1}
                                        unit="x"
                                        onChange={v => onUpdateTexture(sel.id, { scaleY: v })}
                                    />
                                </div>
                                <div className="vm-form-row">
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Rotation</span></div>
                                        <select
                                            className="vm-select"
                                            value={sel.rotation}
                                            onChange={e => onUpdateTexture(sel.id, { rotation: Number(e.target.value) })}
                                        >
                                            <option value={0}>0°</option>
                                            <option value={90}>90°</option>
                                            <option value={180}>180°</option>
                                            <option value={270}>270°</option>
                                        </select>
                                    </div>
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Flip</span></div>
                                        <div className="vm-toggle-group">
                                            <button
                                                className={`vm-toggle-btn ${sel.flipH ? 'active' : ''}`}
                                                onClick={() => onUpdateTexture(sel.id, { flipH: !sel.flipH })}
                                            >H</button>
                                            <button
                                                className={`vm-toggle-btn ${sel.flipV ? 'active' : ''}`}
                                                onClick={() => onUpdateTexture(sel.id, { flipV: !sel.flipV })}
                                            >V</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </SubSection>
    );
}
