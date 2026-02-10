import React, { useState } from 'react';
import { ChevronDown, Plus, Trash2, ArrowLeftRight, ArrowUpDown, ImagePlus } from 'lucide-react';
import type {
    VesselState,
    NozzleConfig,
    SaddleConfig,
    TextureConfig,
    MaterialKey,
    Orientation,
} from './types';
import { MATERIAL_PRESETS, PIPE_SIZES, findClosestPipeSize } from './types';
import { loadTextureFromFile } from './engine/texture-manager';
import type * as THREE from 'three';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SidebarPanelProps {
    vesselState: VesselState;
    selectedNozzleIndex: number;
    selectedSaddleIndex: number;
    selectedTextureId: number;
    onUpdateDimensions: (updates: Partial<VesselState>) => void;
    onAddNozzle: (nozzle: NozzleConfig) => void;
    onUpdateNozzle: (index: number, updates: Partial<NozzleConfig>) => void;
    onRemoveNozzle: (index: number) => void;
    onSelectNozzle: (index: number) => void;
    onAddSaddle: (saddle: SaddleConfig) => void;
    onUpdateSaddle: (index: number, updates: Partial<SaddleConfig>) => void;
    onRemoveSaddle: (index: number) => void;
    onSelectSaddle: (index: number) => void;
    onAddTexture: (texture: TextureConfig, threeTexture: THREE.Texture) => void;
    onUpdateTexture: (id: number, updates: Partial<TextureConfig>) => void;
    onRemoveTexture: (id: number) => void;
    onSelectTexture: (id: number) => void;
    getNextTextureId: () => number;
    renderer: THREE.WebGLRenderer | null;
}

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

function Section({ title, icon, defaultOpen = true, children }: {
    title: string;
    icon?: React.ReactNode;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={`vm-section ${open ? '' : 'collapsed'}`}>
            <div className="vm-section-header" onClick={() => setOpen(o => !o)}>
                <h3 className="vm-section-title">{icon}{title}</h3>
                <ChevronDown size={14} className="vm-chevron" />
            </div>
            <div className="vm-section-content">{children}</div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// SliderRow - Slider + number input
// ---------------------------------------------------------------------------

function SliderRow({ label, value, min, max, step = 1, unit = 'mm', onChange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    onChange: (v: number) => void;
}) {
    return (
        <div className="vm-control-group">
            <div className="vm-label">
                <span>{label}</span>
                <span className="vm-val-display">{value}{unit}</span>
            </div>
            <div className="vm-slider-input-row">
                <input
                    type="range"
                    className="vm-slider"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                />
                <input
                    type="number"
                    className="vm-input"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// SidebarPanel
// ---------------------------------------------------------------------------

export default function SidebarPanel(props: SidebarPanelProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Title */}
            <div style={{ padding: '12px 15px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <h2 style={{ margin: 0, fontSize: '1rem', color: 'white', fontWeight: 600 }}>
                    Vessel Modeler
                </h2>
            </div>

            {/* Scrollable sections */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <DimensionsSection {...props} />
                <VisualsSection {...props} />
                <NozzleSection {...props} />
                <SaddleSection {...props} />
                <TextureSection {...props} />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Dimensions Section
// ---------------------------------------------------------------------------

function DimensionsSection({ vesselState, onUpdateDimensions }: SidebarPanelProps) {
    return (
        <Section title="Dimensions">
            <SliderRow
                label="Inner Diameter"
                value={vesselState.id}
                min={100}
                max={10000}
                step={50}
                onChange={v => onUpdateDimensions({ id: v })}
            />
            <SliderRow
                label="Tan-Tan Length"
                value={vesselState.length}
                min={100}
                max={50000}
                step={100}
                onChange={v => onUpdateDimensions({ length: v })}
            />
            <div className="vm-control-group">
                <div className="vm-label"><span>Head Ratio</span></div>
                <select
                    className="vm-select"
                    value={vesselState.headRatio}
                    onChange={e => onUpdateDimensions({ headRatio: Number(e.target.value) })}
                >
                    <option value={2}>2:1 Ellipsoidal</option>
                    <option value={3}>3:1 Ellipsoidal</option>
                    <option value={4}>4:1 Ellipsoidal</option>
                </select>
            </div>
            <div className="vm-control-group">
                <div className="vm-label"><span>Orientation</span></div>
                <div className="vm-toggle-group">
                    <button
                        className={`vm-toggle-btn ${vesselState.orientation === 'horizontal' ? 'active' : ''}`}
                        onClick={() => onUpdateDimensions({ orientation: 'horizontal' as Orientation })}
                    >
                        <ArrowLeftRight size={14} /> Horizontal
                    </button>
                    <button
                        className={`vm-toggle-btn ${vesselState.orientation === 'vertical' ? 'active' : ''}`}
                        onClick={() => onUpdateDimensions({ orientation: 'vertical' as Orientation })}
                    >
                        <ArrowUpDown size={14} /> Vertical
                    </button>
                </div>
            </div>
        </Section>
    );
}

// ---------------------------------------------------------------------------
// Visuals Section
// ---------------------------------------------------------------------------

function VisualsSection({ vesselState, onUpdateDimensions }: SidebarPanelProps) {
    const v = vesselState.visuals;
    const updateVisuals = (updates: Partial<typeof v>) =>
        onUpdateDimensions({ visuals: { ...v, ...updates } });

    return (
        <Section title="Visuals" defaultOpen={false}>
            <div className="vm-control-group">
                <div className="vm-label"><span>Material</span></div>
                <select
                    className="vm-select"
                    value={v.material}
                    onChange={e => updateVisuals({ material: e.target.value as MaterialKey })}
                >
                    {Object.entries(MATERIAL_PRESETS).map(([key, preset]) => (
                        <option key={key} value={key}>{preset.name}</option>
                    ))}
                </select>
            </div>
            <SliderRow
                label="Shell Opacity"
                value={Math.round(v.shellOpacity * 100)}
                min={10}
                max={100}
                unit="%"
                onChange={val => updateVisuals({ shellOpacity: val / 100 })}
            />
            <SliderRow
                label="Nozzle Opacity"
                value={Math.round(v.nozzleOpacity * 100)}
                min={10}
                max={100}
                unit="%"
                onChange={val => updateVisuals({ nozzleOpacity: val / 100 })}
            />
        </Section>
    );
}

// ---------------------------------------------------------------------------
// Nozzle Section
// ---------------------------------------------------------------------------

function NozzleSection({
    vesselState, selectedNozzleIndex,
    onAddNozzle, onUpdateNozzle, onRemoveNozzle, onSelectNozzle,
}: SidebarPanelProps) {
    const sel = selectedNozzleIndex >= 0 ? vesselState.nozzles[selectedNozzleIndex] : null;

    const addFromLibrary = (size: number) => {
        const pipe = findClosestPipeSize(size);
        onAddNozzle({
            name: `N${vesselState.nozzles.length + 1}`,
            pos: vesselState.length / 2,
            proj: pipe.od * 2,
            angle: 90,
            size: pipe.id,
        });
    };

    return (
        <Section title="Nozzles">
            {/* Library grid */}
            <div className="vm-library-grid" style={{ marginBottom: 10 }}>
                {PIPE_SIZES.slice(0, 12).map(p => (
                    <div
                        key={p.nps}
                        className="vm-library-item"
                        onClick={() => addFromLibrary(p.id)}
                        title={`Add ${p.nps} nozzle (${p.od}mm OD)`}
                    >
                        <div className="size-label">{p.nps}</div>
                        <div className="size-mm">{p.od}mm</div>
                    </div>
                ))}
            </div>

            {/* Nozzle list */}
            {vesselState.nozzles.map((n, i) => (
                <div
                    key={i}
                    className={`vm-list-item ${i === selectedNozzleIndex ? 'selected' : ''}`}
                    onClick={() => onSelectNozzle(i)}
                >
                    <div className="vm-list-item-info">
                        <strong>{n.name}</strong> &mdash; {findClosestPipeSize(n.size).nps} @ {Math.round(n.pos)}mm, {Math.round(n.angle)}&deg;
                    </div>
                    <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveNozzle(i); }}>
                        <Trash2 size={14} />
                    </button>
                </div>
            ))}

            {/* Edit selected nozzle */}
            {sel && (
                <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                    <div className="vm-control-group">
                        <div className="vm-label"><span>Name</span></div>
                        <input
                            className="vm-input"
                            value={sel.name}
                            onChange={e => onUpdateNozzle(selectedNozzleIndex, { name: e.target.value })}
                        />
                    </div>
                    <div className="vm-form-row">
                        <div className="vm-control-group">
                            <div className="vm-label"><span>Position</span></div>
                            <input
                                type="number"
                                className="vm-input"
                                value={sel.pos}
                                onChange={e => onUpdateNozzle(selectedNozzleIndex, { pos: Number(e.target.value) })}
                            />
                        </div>
                        <div className="vm-control-group">
                            <div className="vm-label"><span>Angle</span></div>
                            <input
                                type="number"
                                className="vm-input"
                                value={sel.angle}
                                min={0}
                                max={360}
                                onChange={e => onUpdateNozzle(selectedNozzleIndex, { angle: Number(e.target.value) })}
                            />
                        </div>
                    </div>
                    <div className="vm-form-row">
                        <div className="vm-control-group">
                            <div className="vm-label"><span>Projection</span></div>
                            <input
                                type="number"
                                className="vm-input"
                                value={sel.proj}
                                onChange={e => onUpdateNozzle(selectedNozzleIndex, { proj: Number(e.target.value) })}
                            />
                        </div>
                        <div className="vm-control-group">
                            <div className="vm-label"><span>Size (ID)</span></div>
                            <input
                                type="number"
                                className="vm-input"
                                value={sel.size}
                                onChange={e => onUpdateNozzle(selectedNozzleIndex, { size: Number(e.target.value) })}
                            />
                        </div>
                    </div>
                </div>
            )}
        </Section>
    );
}

// ---------------------------------------------------------------------------
// Saddle Section
// ---------------------------------------------------------------------------

function SaddleSection({
    vesselState, selectedSaddleIndex,
    onAddSaddle, onUpdateSaddle, onRemoveSaddle, onSelectSaddle,
}: SidebarPanelProps) {
    const sel = selectedSaddleIndex >= 0 ? vesselState.saddles[selectedSaddleIndex] : null;

    return (
        <Section title="Supports">
            <button
                className="vm-btn"
                onClick={() => onAddSaddle({ pos: vesselState.length / 2, color: '#2244ff' })}
                style={{ marginBottom: 8 }}
            >
                <Plus size={14} /> Add Saddle Support
            </button>

            {vesselState.saddles.map((s, i) => (
                <div
                    key={i}
                    className={`vm-list-item saddle ${i === selectedSaddleIndex ? 'selected' : ''}`}
                    onClick={() => onSelectSaddle(i)}
                >
                    <div className="vm-list-item-info">
                        <strong>Saddle {i + 1}</strong> &mdash; {Math.round(s.pos)}mm
                    </div>
                    <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveSaddle(i); }}>
                        <Trash2 size={14} />
                    </button>
                </div>
            ))}

            {sel && (
                <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                    <div className="vm-form-row">
                        <div className="vm-control-group">
                            <div className="vm-label"><span>Position (mm)</span></div>
                            <input
                                type="number"
                                className="vm-input"
                                value={sel.pos}
                                onChange={e => onUpdateSaddle(selectedSaddleIndex, { pos: Number(e.target.value) })}
                            />
                        </div>
                        <div className="vm-control-group">
                            <div className="vm-label"><span>Color</span></div>
                            <input
                                type="color"
                                className="vm-input"
                                value={sel.color}
                                onChange={e => onUpdateSaddle(selectedSaddleIndex, { color: e.target.value })}
                                style={{ height: 36, padding: 2 }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </Section>
    );
}

// ---------------------------------------------------------------------------
// Texture Section
// ---------------------------------------------------------------------------

function TextureSection({
    vesselState, selectedTextureId,
    onAddTexture, onUpdateTexture, onRemoveTexture, onSelectTexture,
    getNextTextureId, renderer,
}: SidebarPanelProps) {
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
        <Section title="Textures" defaultOpen={false}>
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
                return (
                    <div
                        key={t.id}
                        className={`vm-list-item texture ${texId === selectedTextureId ? 'selected' : ''}`}
                        onClick={() => onSelectTexture(texId)}
                    >
                        <div className="vm-list-item-info">
                            <strong>{t.name}</strong>
                        </div>
                        <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveTexture(texId); }}>
                            <Trash2 size={14} />
                        </button>
                    </div>
                );
            })}

            {/* Edit selected texture */}
            {sel && (
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
        </Section>
    );
}
