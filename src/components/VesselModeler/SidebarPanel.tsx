import React, { useState } from 'react';
import { ChevronDown, Plus, Trash2, ArrowLeftRight, ArrowUpDown, ImagePlus, Circle, Square, Eye, EyeOff, Lock, Unlock, Ruler, Camera, Maximize2 } from 'lucide-react';
import type {
    VesselState,
    NozzleConfig,
    NozzleOrientationMode,
    SaddleConfig,
    TextureConfig,
    LiftingLugConfig,
    LiftingLugStyle,
    AnnotationShapeConfig,
    AnnotationShapeType,
    CoverageRectConfig,
    InspectionImageConfig,
    MeasurementConfig,
    MaterialKey,
    Orientation,
    WeldConfig,
    WeldType,
} from './types';
import { MATERIAL_PRESETS, SCENE_PRESETS, PIPE_SIZES, LIFTING_LUG_SIZES, findClosestPipeSize } from './types';
import type { ScenePresetKey } from './types';
import { loadTextureFromFile } from './engine/texture-manager';
import { computeRulerDistance } from './engine/annotation-geometry';
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
    // Lifting lug props
    selectedLugIndex: number;
    onAddLug: (lug: LiftingLugConfig) => void;
    onUpdateLug: (index: number, updates: Partial<LiftingLugConfig>) => void;
    onRemoveLug: (index: number) => void;
    onSelectLug: (index: number) => void;
    onAddSaddle: (saddle: SaddleConfig) => void;
    onUpdateSaddle: (index: number, updates: Partial<SaddleConfig>) => void;
    onRemoveSaddle: (index: number) => void;
    onSelectSaddle: (index: number) => void;
    // Weld props
    selectedWeldIndex: number;
    onAddWeld: (weld: WeldConfig) => void;
    onUpdateWeld: (index: number, updates: Partial<WeldConfig>) => void;
    onRemoveWeld: (index: number) => void;
    onSelectWeld: (index: number) => void;
    onAddTexture: (texture: TextureConfig, threeTexture: THREE.Texture) => void;
    onUpdateTexture: (id: number, updates: Partial<TextureConfig>) => void;
    onRemoveTexture: (id: number) => void;
    onSelectTexture: (id: number) => void;
    getNextTextureId: () => number;
    renderer: THREE.WebGLRenderer | null;
    // Annotation props
    selectedAnnotationId: number;
    drawMode: AnnotationShapeType | null;
    onSetDrawMode: (mode: AnnotationShapeType | null) => void;
    onAddAnnotation: (config: AnnotationShapeConfig) => void;
    onUpdateAnnotation: (id: number, updates: Partial<AnnotationShapeConfig>) => void;
    onRemoveAnnotation: (id: number) => void;
    onSelectAnnotation: (id: number) => void;
    onUpdateMeasurementConfig: (updates: Partial<MeasurementConfig>) => void;
    getNextAnnotationId: () => number;
    // Coverage props
    coverageDrawMode: boolean;
    onSetCoverageDrawMode: (active: boolean) => void;
    onAddCoverageRect: (rect: CoverageRectConfig) => void;
    onUpdateCoverageRect: (id: number, updates: Partial<CoverageRectConfig>) => void;
    onRemoveCoverageRect: (id: number) => void;
    onSelectCoverageRect: (id: number) => void;
    selectedCoverageRectId: number;
    getNextCoverageRectId: () => number;
    // Inspection image props
    selectedInspectionImageId: number;
    onAddInspectionImage: (img: InspectionImageConfig) => void;
    onUpdateInspectionImage: (id: number, updates: Partial<InspectionImageConfig>) => void;
    onRemoveInspectionImage: (id: number) => void;
    onSelectInspectionImage: (id: number) => void;
    onToggleInspectionImageVisible: (id: number) => void;
    onToggleInspectionImageLocked: (id: number) => void;
    onToggleAnnotationVisible: (id: number) => void;
    onToggleAnnotationLocked: (id: number) => void;
    onViewInspectionImage: (id: number) => void;
    getNextInspectionImageId: () => number;
    // Ruler props
    rulerDrawMode: boolean;
    onSetRulerDrawMode: (active: boolean) => void;
    onRemoveRuler: (id: number) => void;
    onUpdateRuler: (id: number, updates: Partial<import('./types').RulerConfig>) => void;
    selectedRulerId: number;
    onSelectRuler: (id: number) => void;
}

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

function Section({ title, icon, count, defaultOpen = true, children }: {
    title: string;
    icon?: React.ReactNode;
    count?: number;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={`vm-section ${open ? '' : 'collapsed'}`}>
            <div className="vm-section-header" onClick={() => setOpen(o => !o)}>
                <h3 className="vm-section-title">
                    {icon}{title}
                    {count != null && count > 0 && <span className="vm-section-count">{count}</span>}
                </h3>
                <ChevronDown size={14} className="vm-chevron" />
            </div>
            <div className="vm-section-content">{children}</div>
        </div>
    );
}

function SubSection({ title, count, defaultOpen = false, children }: {
    title: string;
    count?: number;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={`vm-subsection ${open ? '' : 'collapsed'}`}>
            <div className="vm-subsection-header" onClick={() => setOpen(o => !o)}>
                <span className="vm-subsection-title">
                    {title}
                    {count != null && count > 0 && <span className="vm-subsection-count">{count}</span>}
                </span>
                <ChevronDown size={12} className="vm-chevron" />
            </div>
            <div className="vm-subsection-content">{children}</div>
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
                <Section title="Attachments" defaultOpen={false} count={
                    props.vesselState.nozzles.length +
                    props.vesselState.liftingLugs.length +
                    props.vesselState.welds.length +
                    props.vesselState.saddles.length
                }>
                    <NozzleSection {...props} />
                    <LiftingLugSection {...props} />
                    <WeldSection {...props} />
                    <SaddleSection {...props} />
                </Section>
                <TextureSection {...props} />
                <Section title="Inspection" defaultOpen={false} count={
                    props.vesselState.annotations.length +
                    props.vesselState.rulers.length +
                    props.vesselState.coverageRects.length +
                    props.vesselState.inspectionImages.length
                }>
                    <AnnotationSection {...props} />
                    <CoverageSection {...props} />
                    <InspectionImageSection {...props} />
                </Section>
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

    const applyScenePreset = (key: ScenePresetKey) => {
        const preset = SCENE_PRESETS[key];
        updateVisuals({ backgroundColor: preset.backgroundColor });
    };

    return (
        <Section title="Visuals" defaultOpen={false}>
            {/* Scene Presets */}
            <div className="vm-control-group">
                <div className="vm-label"><span>Scene Preset</span></div>
                <div className="vm-toggle-group" style={{ flexWrap: 'wrap' }}>
                    {(Object.entries(SCENE_PRESETS) as [ScenePresetKey, typeof SCENE_PRESETS[ScenePresetKey]][]).map(([key, preset]) => (
                        <button
                            key={key}
                            className="vm-toggle-btn"
                            onClick={() => applyScenePreset(key)}
                            title={preset.name}
                            style={{ minWidth: 0, flex: '1 1 auto' }}
                        >
                            <span
                                style={{
                                    display: 'inline-block',
                                    width: 10, height: 10,
                                    borderRadius: 2,
                                    backgroundColor: preset.backgroundColor,
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    marginRight: 4,
                                    verticalAlign: 'middle',
                                }}
                            />
                            {preset.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="vm-control-group">
                <div className="vm-label"><span>Material</span></div>
                <select
                    className="vm-select"
                    value={v.material}
                    onChange={e => updateVisuals({ material: e.target.value as MaterialKey, roughness: null, metalness: null })}
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

            {/* PBR Material Controls */}
            <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                <div className="vm-label" style={{ marginBottom: 6 }}><span style={{ fontWeight: 600 }}>Surface</span></div>
                <SliderRow
                    label="Roughness"
                    value={Math.round((v.roughness ?? MATERIAL_PRESETS[v.material].roughness) * 100)}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={val => updateVisuals({ roughness: val / 100 })}
                />
                <SliderRow
                    label="Metalness"
                    value={Math.round((v.metalness ?? MATERIAL_PRESETS[v.material].metalness) * 100)}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={val => updateVisuals({ metalness: val / 100 })}
                />
                {(v.roughness !== null || v.metalness !== null) && (
                    <button
                        className="vm-toggle-btn"
                        style={{ fontSize: '10px', marginTop: 4, opacity: 0.7 }}
                        onClick={() => updateVisuals({ roughness: null, metalness: null })}
                    >
                        Reset to Preset Defaults
                    </button>
                )}
            </div>

            <div className="vm-control-group">
                <div className="vm-label"><span>Background</span></div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                        type="color"
                        value={v.backgroundColor || '#111111'}
                        onChange={e => updateVisuals({ backgroundColor: e.target.value })}
                        style={{ width: 32, height: 24, padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
                    />
                    <span style={{ fontSize: '11px', opacity: 0.6 }}>{(v.backgroundColor || '#111111').toUpperCase()}</span>
                </div>
            </div>

            {/* Scene helpers */}
            <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                <div className="vm-label" style={{ marginBottom: 6 }}><span style={{ fontWeight: 600 }}>Scene Helpers</span></div>
                <label className="vm-checkbox-row">
                    <input
                        type="checkbox"
                        checked={v.showGrid ?? false}
                        onChange={e => updateVisuals({ showGrid: e.target.checked })}
                    />
                    <span>Ground Grid</span>
                </label>
                <label className="vm-checkbox-row">
                    <input
                        type="checkbox"
                        checked={v.showAxes ?? false}
                        onChange={e => updateVisuals({ showAxes: e.target.checked })}
                    />
                    <span>XYZ Axes</span>
                </label>
                <label className="vm-checkbox-row">
                    <input
                        type="checkbox"
                        checked={v.useEnvironmentMap ?? false}
                        onChange={e => updateVisuals({ useEnvironmentMap: e.target.checked })}
                    />
                    <span>Environment Reflections</span>
                </label>
                <label className="vm-checkbox-row">
                    <input
                        type="checkbox"
                        checked={v.showCardinalDirections ?? false}
                        onChange={e => updateVisuals({ showCardinalDirections: e.target.checked })}
                    />
                    <span>Cardinal Directions</span>
                </label>
            </div>
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
        <SubSection title="Nozzles" count={vesselState.nozzles.length} defaultOpen>
            {/* Library grid - drag onto 3D canvas or click to add */}
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px 0' }}>
                Drag a nozzle size onto the vessel
            </p>
            <div className="vm-library-grid" style={{ marginBottom: 10 }}>
                {PIPE_SIZES.map(p => (
                    <div
                        key={p.nps}
                        className="vm-library-item"
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-nozzle-pipe', JSON.stringify(p));
                            e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => addFromLibrary(p.id)}
                        title={`Drag or click to add ${p.nps} nozzle (${p.od}mm OD)`}
                        style={{ userSelect: 'none' }}
                    >
                        <div className="size-label">{p.nps}</div>
                        <div className="size-mm">{p.od}mm</div>
                    </div>
                ))}
            </div>

            {/* Nozzle list */}
            {vesselState.nozzles.map((n, i) => (
                <React.Fragment key={i}>
                    <div
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
                    {i === selectedNozzleIndex && sel && (
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
                            <div className="vm-control-group">
                                <div className="vm-label"><span>Orientation</span></div>
                                <div className="vm-toggle-group">
                                    {([
                                        ['radial', 'Radial'],
                                        ['horizontal', 'Horiz'],
                                        ['vertical-up', '\u25B2'],
                                        ['vertical-down', '\u25BC'],
                                    ] as [NozzleOrientationMode, string][]).map(([mode, label]) => (
                                        <button
                                            key={mode}
                                            className={`vm-toggle-btn ${(sel.orientationMode || 'radial') === mode ? 'active' : ''}`}
                                            onClick={() => onUpdateNozzle(selectedNozzleIndex, { orientationMode: mode })}
                                            title={mode === 'radial' ? 'Radial (outward from center)' :
                                                   mode === 'horizontal' ? 'Horizontal (fixed axis)' :
                                                   mode === 'vertical-up' ? 'Vertical Up' : 'Vertical Down'}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </React.Fragment>
            ))}
        </SubSection>
    );
}

// ---------------------------------------------------------------------------
// Lifting Lug Section
// ---------------------------------------------------------------------------

function LiftingLugSection({
    vesselState, selectedLugIndex,
    onAddLug, onUpdateLug, onRemoveLug, onSelectLug,
}: SidebarPanelProps) {
    const [lugStyle, setLugStyle] = useState<LiftingLugStyle>('padEye');
    const sel = selectedLugIndex >= 0 ? vesselState.liftingLugs[selectedLugIndex] : null;

    const addFromLibrary = (swl: string) => {
        onAddLug({
            name: `L${vesselState.liftingLugs.length + 1}`,
            pos: vesselState.length / 2,
            angle: 90,
            style: lugStyle,
            swl,
        });
    };

    return (
        <SubSection title="Lifting Lugs" count={vesselState.liftingLugs.length}>
            {/* Style toggle */}
            <div className="vm-control-group">
                <div className="vm-label"><span>Style</span></div>
                <div className="vm-toggle-group">
                    <button
                        className={`vm-toggle-btn ${lugStyle === 'padEye' ? 'active' : ''}`}
                        onClick={() => setLugStyle('padEye')}
                    >
                        Pad Eye
                    </button>
                    <button
                        className={`vm-toggle-btn ${lugStyle === 'trunnion' ? 'active' : ''}`}
                        onClick={() => setLugStyle('trunnion')}
                    >
                        Trunnion
                    </button>
                </div>
            </div>

            {/* Library grid - drag onto 3D canvas or click to add */}
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px 0' }}>
                Drag a lug size onto the vessel
            </p>
            <div className="vm-library-grid" style={{ marginBottom: 10 }}>
                {LIFTING_LUG_SIZES.map(s => (
                    <div
                        key={s.label}
                        className="vm-library-item"
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-lifting-lug', JSON.stringify({ ...s, style: lugStyle }));
                            e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => addFromLibrary(s.label)}
                        title={`Drag or click to add ${s.swlTonnes}t SWL ${lugStyle} lug`}
                        style={{ userSelect: 'none' }}
                    >
                        <div className="size-label">{s.label}</div>
                        <div className="size-mm">{s.swlTonnes}t SWL</div>
                    </div>
                ))}
            </div>

            {/* Lug list */}
            {vesselState.liftingLugs.map((l, i) => (
                <React.Fragment key={i}>
                    <div
                        className={`vm-list-item ${i === selectedLugIndex ? 'selected' : ''}`}
                        onClick={() => onSelectLug(i)}
                    >
                        <div className="vm-list-item-info">
                            <strong>{l.name}</strong> &mdash; {l.swl} {l.style === 'trunnion' ? 'Trunnion' : 'Pad Eye'} @ {Math.round(l.pos)}mm, {Math.round(l.angle)}&deg;
                        </div>
                        <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveLug(i); }}>
                            <Trash2 size={14} />
                        </button>
                    </div>
                    {i === selectedLugIndex && sel && (
                        <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                            <div className="vm-control-group">
                                <div className="vm-label"><span>Name</span></div>
                                <input
                                    className="vm-input"
                                    value={sel.name}
                                    onChange={e => onUpdateLug(selectedLugIndex, { name: e.target.value })}
                                />
                            </div>
                            <div className="vm-control-group">
                                <div className="vm-label"><span>Style</span></div>
                                <div className="vm-toggle-group">
                                    <button
                                        className={`vm-toggle-btn ${sel.style === 'padEye' ? 'active' : ''}`}
                                        onClick={() => onUpdateLug(selectedLugIndex, { style: 'padEye' })}
                                    >
                                        Pad Eye
                                    </button>
                                    <button
                                        className={`vm-toggle-btn ${sel.style === 'trunnion' ? 'active' : ''}`}
                                        onClick={() => onUpdateLug(selectedLugIndex, { style: 'trunnion' })}
                                    >
                                        Trunnion
                                    </button>
                                </div>
                            </div>
                            <div className="vm-form-row">
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Position</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.pos}
                                        onChange={e => onUpdateLug(selectedLugIndex, { pos: Number(e.target.value) })}
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
                                        onChange={e => onUpdateLug(selectedLugIndex, { angle: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="vm-control-group">
                                <div className="vm-label"><span>SWL</span></div>
                                <select
                                    className="vm-select"
                                    value={sel.swl}
                                    onChange={e => onUpdateLug(selectedLugIndex, { swl: e.target.value })}
                                >
                                    {LIFTING_LUG_SIZES.map(s => (
                                        <option key={s.label} value={s.label}>{s.label} ({s.swlTonnes}t)</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                </React.Fragment>
            ))}
        </SubSection>
    );
}

// ---------------------------------------------------------------------------
// Weld Section
// ---------------------------------------------------------------------------

function WeldSection({
    vesselState, selectedWeldIndex,
    onAddWeld, onUpdateWeld, onRemoveWeld, onSelectWeld,
}: SidebarPanelProps) {
    const [weldType, setWeldType] = useState<WeldType>('circumferential');
    const sel = selectedWeldIndex >= 0 ? vesselState.welds[selectedWeldIndex] : null;

    const addWeld = () => {
        const num = vesselState.welds.length + 1;
        if (weldType === 'circumferential') {
            onAddWeld({
                name: `W${num}`,
                type: 'circumferential',
                pos: vesselState.length / 2,
                color: '#888888',
            });
        } else {
            onAddWeld({
                name: `W${num}`,
                type: 'longitudinal',
                pos: vesselState.length * 0.25,
                endPos: vesselState.length * 0.75,
                angle: 90,
                color: '#888888',
            });
        }
    };

    return (
        <SubSection title="Welds" count={vesselState.welds.length}>
            {/* Type toggle */}
            <div className="vm-control-group">
                <div className="vm-label"><span>Type</span></div>
                <div className="vm-toggle-group">
                    <button
                        className={`vm-toggle-btn ${weldType === 'circumferential' ? 'active' : ''}`}
                        onClick={() => setWeldType('circumferential')}
                    >
                        Circ
                    </button>
                    <button
                        className={`vm-toggle-btn ${weldType === 'longitudinal' ? 'active' : ''}`}
                        onClick={() => setWeldType('longitudinal')}
                    >
                        Long
                    </button>
                </div>
            </div>

            {/* Add button */}
            <button
                className="vm-toggle-btn"
                style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }}
                onClick={addWeld}
            >
                <Plus size={14} /> Add {weldType === 'circumferential' ? 'Circumferential' : 'Longitudinal'} Weld
            </button>

            {/* Weld list */}
            {vesselState.welds.map((w, i) => (
                <React.Fragment key={i}>
                    <div
                        className={`vm-list-item ${i === selectedWeldIndex ? 'selected' : ''}`}
                        onClick={() => onSelectWeld(i)}
                    >
                        <div className="vm-list-item-info">
                            <strong>{w.name}</strong> &mdash; {w.type === 'circumferential' ? 'Circ' : 'Long'} @ {Math.round(w.pos)}mm
                            {w.type === 'longitudinal' && w.angle !== undefined ? `, ${Math.round(w.angle)}\u00B0` : ''}
                        </div>
                        <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveWeld(i); }}>
                            <Trash2 size={14} />
                        </button>
                    </div>
                    {i === selectedWeldIndex && sel && (
                        <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                            <div className="vm-control-group">
                                <div className="vm-label"><span>Name</span></div>
                                <input
                                    className="vm-input"
                                    value={sel.name}
                                    onChange={e => onUpdateWeld(selectedWeldIndex, { name: e.target.value })}
                                />
                            </div>
                            <div className="vm-control-group">
                                <div className="vm-label"><span>Type</span></div>
                                <div className="vm-toggle-group">
                                    <button
                                        className={`vm-toggle-btn ${sel.type === 'circumferential' ? 'active' : ''}`}
                                        onClick={() => onUpdateWeld(selectedWeldIndex, { type: 'circumferential' })}
                                    >
                                        Circ
                                    </button>
                                    <button
                                        className={`vm-toggle-btn ${sel.type === 'longitudinal' ? 'active' : ''}`}
                                        onClick={() => onUpdateWeld(selectedWeldIndex, { type: 'longitudinal' })}
                                    >
                                        Long
                                    </button>
                                </div>
                            </div>
                            <div className="vm-form-row">
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>{sel.type === 'circumferential' ? 'Position' : 'Start Pos'}</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.pos}
                                        onChange={e => onUpdateWeld(selectedWeldIndex, { pos: Number(e.target.value) })}
                                    />
                                </div>
                                {sel.type === 'longitudinal' && (
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>End Pos</span></div>
                                        <input
                                            type="number"
                                            className="vm-input"
                                            value={sel.endPos ?? vesselState.length}
                                            onChange={e => onUpdateWeld(selectedWeldIndex, { endPos: Number(e.target.value) })}
                                        />
                                    </div>
                                )}
                            </div>
                            {sel.type === 'longitudinal' && (
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Angle</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.angle ?? 90}
                                        min={0}
                                        max={360}
                                        onChange={e => onUpdateWeld(selectedWeldIndex, { angle: Number(e.target.value) })}
                                    />
                                </div>
                            )}
                            <div className="vm-control-group">
                                <div className="vm-label"><span>Color</span></div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <input
                                        type="color"
                                        value={sel.color || '#888888'}
                                        onChange={e => onUpdateWeld(selectedWeldIndex, { color: e.target.value })}
                                        style={{ width: 32, height: 24, padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
                                    />
                                    <span style={{ fontSize: '11px', opacity: 0.6 }}>{(sel.color || '#888888').toUpperCase()}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </React.Fragment>
            ))}
        </SubSection>
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
        <SubSection title="Supports" count={vesselState.saddles.length}>
            <button
                className="vm-btn"
                onClick={() => onAddSaddle({ pos: vesselState.length / 2, color: '#2244ff' })}
                style={{ marginBottom: 8 }}
            >
                <Plus size={14} /> Add Saddle Support
            </button>

            {vesselState.saddles.map((s, i) => (
                <React.Fragment key={i}>
                    <div
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
                    {i === selectedSaddleIndex && sel && (
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
                            <div className="vm-form-row">
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Height (mm)</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.height ?? Math.round(vesselState.id / 2 * 1.2)}
                                        onChange={e => onUpdateSaddle(selectedSaddleIndex, { height: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </React.Fragment>
            ))}
        </SubSection>
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
        <Section title="Scan Overlay" defaultOpen={false} count={vesselState.textures.length}>
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
        </Section>
    );
}

// ---------------------------------------------------------------------------
// Annotation Section
// ---------------------------------------------------------------------------

function AnnotationSection({
    vesselState, selectedAnnotationId, drawMode,
    onSetDrawMode, onAddAnnotation, onUpdateAnnotation, onRemoveAnnotation,
    onSelectAnnotation, onUpdateMeasurementConfig, getNextAnnotationId,
    onToggleAnnotationVisible, onToggleAnnotationLocked,
    rulerDrawMode, onSetRulerDrawMode, onRemoveRuler,
    onUpdateRuler, selectedRulerId, onSelectRuler,
}: SidebarPanelProps) {
    const sel = vesselState.annotations.find(a => a.id === selectedAnnotationId);
    const selRuler = vesselState.rulers.find(r => r.id === selectedRulerId);
    const mc = vesselState.measurementConfig;

    const addManual = (type: AnnotationShapeType) => {
        const id = getNextAnnotationId();
        onAddAnnotation({
            id,
            name: `A${vesselState.annotations.length + 1}`,
            type,
            pos: vesselState.length / 2,
            angle: 90,
            width: 200,
            height: type === 'circle' ? 200 : 150,
            color: '#ff3333',
            lineWidth: 2,
            showLabel: true,
        });
        onSelectAnnotation(id);
    };

    return (
        <SubSection title="Annotations" count={vesselState.annotations.length + vesselState.rulers.length}>
            {/* Draw tool toggles */}
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px 0' }}>
                Select a tool then click-drag on the vessel to draw
            </p>
            <div className="vm-toggle-group" style={{ marginBottom: 10 }}>
                <button
                    className={`vm-toggle-btn ${drawMode === 'circle' ? 'active' : ''}`}
                    onClick={() => onSetDrawMode(drawMode === 'circle' ? null : 'circle')}
                    title="Draw circle annotation"
                >
                    <Circle size={14} /> Circle
                </button>
                <button
                    className={`vm-toggle-btn ${drawMode === 'rectangle' ? 'active' : ''}`}
                    onClick={() => onSetDrawMode(drawMode === 'rectangle' ? null : 'rectangle')}
                    title="Draw rectangle annotation"
                >
                    <Square size={14} /> Rect
                </button>
                <button
                    className="vm-toggle-btn"
                    onClick={() => addManual('circle')}
                    title="Add circle at center"
                >
                    <Plus size={14} />
                </button>
                <button
                    className={`vm-toggle-btn ${rulerDrawMode ? 'active' : ''}`}
                    onClick={() => onSetRulerDrawMode(!rulerDrawMode)}
                    title="Draw ruler measurement"
                >
                    <Ruler size={14} /> Ruler
                </button>
            </div>

            {/* Annotation list */}
            {vesselState.annotations.map((a) => (
                <React.Fragment key={a.id}>
                    <div
                        className={`vm-list-item ${a.id === selectedAnnotationId ? 'selected' : ''}`}
                        onClick={() => onSelectAnnotation(a.id)}
                        style={{ opacity: a.visible === false ? 0.4 : 1 }}
                    >
                        <div className="vm-list-item-info">
                            <strong>{a.name}</strong> &mdash; {a.type === 'circle' ? '\u25CB' : '\u25A1'} {Math.round(a.width)}mm @ {Math.round(a.pos)}mm
                        </div>
                        <div style={{ display: 'flex', gap: 2 }}>
                            <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onToggleAnnotationVisible(a.id); }} title={a.visible === false ? 'Show' : 'Hide'} style={{ color: a.visible === false ? 'rgba(255,255,255,0.25)' : undefined }}>
                                {a.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onToggleAnnotationLocked(a.id); }} title={a.locked ? 'Unlock' : 'Lock'} style={{ color: a.locked ? '#3b82f6' : undefined }}>
                                {a.locked ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>
                            <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveAnnotation(a.id); }}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                    {a.id === selectedAnnotationId && sel && (
                        <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                            <div className="vm-control-group">
                                <div className="vm-label"><span>Name</span></div>
                                <input
                                    className="vm-input"
                                    value={sel.name}
                                    onChange={e => onUpdateAnnotation(sel.id, { name: e.target.value })}
                                />
                            </div>
                            <div className="vm-form-row">
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Position (mm)</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.pos}
                                        onChange={e => onUpdateAnnotation(sel.id, { pos: Number(e.target.value) })}
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
                                        onChange={e => onUpdateAnnotation(sel.id, { angle: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="vm-form-row">
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>{sel.type === 'circle' ? 'Diameter' : 'Width'} (mm)</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.width}
                                        min={10}
                                        onChange={e => {
                                            const w = Number(e.target.value);
                                            const updates: Partial<AnnotationShapeConfig> = { width: w };
                                            if (sel.type === 'circle') updates.height = w;
                                            onUpdateAnnotation(sel.id, updates);
                                        }}
                                    />
                                </div>
                                {sel.type === 'rectangle' && (
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Height (mm)</span></div>
                                        <input
                                            type="number"
                                            className="vm-input"
                                            value={sel.height}
                                            min={10}
                                            onChange={e => onUpdateAnnotation(sel.id, { height: Number(e.target.value) })}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="vm-form-row">
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Color</span></div>
                                    <input
                                        type="color"
                                        className="vm-input"
                                        value={sel.color}
                                        onChange={e => onUpdateAnnotation(sel.id, { color: e.target.value })}
                                        style={{ height: 36, padding: 2 }}
                                    />
                                </div>
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Label</span></div>
                                    <button
                                        className={`vm-toggle-btn ${sel.showLabel ? 'active' : ''}`}
                                        onClick={() => onUpdateAnnotation(sel.id, { showLabel: !sel.showLabel })}
                                    >
                                        {sel.showLabel ? <Eye size={14} /> : <EyeOff size={14} />}
                                        {sel.showLabel ? ' On' : ' Off'}
                                    </button>
                                </div>
                            </div>
                            {sel.showLabel && (
                                <>
                                    <SliderRow
                                        label="Leader Length"
                                        value={sel.leaderLength ?? 2000}
                                        min={50}
                                        max={5000}
                                        step={10}
                                        onChange={v => onUpdateAnnotation(sel.id, { leaderLength: v, labelOffset: undefined })}
                                    />
                                    {sel.labelOffset && (
                                        <button
                                            className="vm-toggle-btn"
                                            style={{ marginTop: 4, width: '100%', fontSize: '0.7rem', padding: '3px 8px' }}
                                            onClick={() => onUpdateAnnotation(sel.id, { labelOffset: undefined })}
                                        >
                                            Reset Label Position
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </React.Fragment>
            ))}

            {/* Ruler list */}
            {vesselState.rulers.length > 0 && (
                <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                    <div className="vm-label" style={{ marginBottom: 4 }}><span style={{ fontWeight: 600 }}>Rulers</span></div>
                    {vesselState.rulers.map((r) => {
                        const isRulerSelected = selectedRulerId === r.id;
                        return (
                            <React.Fragment key={r.id}>
                                <div
                                    className={`vm-list-item ${isRulerSelected ? 'selected' : ''}`}
                                    onClick={() => onSelectRuler(isRulerSelected ? -1 : r.id)}
                                >
                                    <div className="vm-list-item-info">
                                        <strong>{r.name}</strong> &mdash; <Ruler size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                    </div>
                                    <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveRuler(r.id); }}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                {isRulerSelected && selRuler && (() => {
                                    const currentLength = Math.round(computeRulerDistance(selRuler, vesselState));
                                    return (
                                        <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                                            <div className="vm-form-row">
                                                <div className="vm-control-group">
                                                    <div className="vm-label"><span>Length (mm)</span></div>
                                                    <input
                                                        type="number"
                                                        className="vm-input"
                                                        value={currentLength}
                                                        min={1}
                                                        onChange={e => {
                                                            const newLen = Number(e.target.value);
                                                            if (newLen <= 0 || currentLength <= 0) return;
                                                            const ratio = newLen / currentLength;
                                                            const dPos = selRuler.endPos - selRuler.startPos;
                                                            const dAngle = selRuler.endAngle - selRuler.startAngle;
                                                            onUpdateRuler(selRuler.id, {
                                                                endPos: Math.round(selRuler.startPos + dPos * ratio),
                                                                endAngle: Math.round(selRuler.startAngle + dAngle * ratio),
                                                            });
                                                        }}
                                                    />
                                                </div>
                                                <div className="vm-control-group">
                                                    <div className="vm-label"><span>Color</span></div>
                                                    <input
                                                        type="color"
                                                        className="vm-input"
                                                        value={selRuler.color}
                                                        onChange={e => onUpdateRuler(selRuler.id, { color: e.target.value })}
                                                        style={{ height: 36, padding: 2 }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="vm-form-row">
                                                <div className="vm-control-group">
                                                    <div className="vm-label"><span>Label</span></div>
                                                    <button
                                                        className={`vm-toggle-btn ${selRuler.showLabel ? 'active' : ''}`}
                                                        onClick={() => onUpdateRuler(selRuler.id, { showLabel: !selRuler.showLabel })}
                                                    >
                                                        {selRuler.showLabel ? <Eye size={14} /> : <EyeOff size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {/* Measurement Config */}
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                <div className="vm-label" style={{ marginBottom: 6 }}><span style={{ fontWeight: 600 }}>Measurement Reference</span></div>
                <div className="vm-control-group">
                    <div className="vm-label"><span>Reference TL</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${mc.referenceTangent === 'left' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ referenceTangent: 'left' })}
                        >Left</button>
                        <button
                            className={`vm-toggle-btn ${mc.referenceTangent === 'right' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ referenceTangent: 'right' })}
                        >Right</button>
                    </div>
                </div>
                <div className="vm-control-group">
                    <div className="vm-label"><span>Circ. Direction</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${mc.circumDirection === 'CW' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ circumDirection: 'CW' })}
                        >CW</button>
                        <button
                            className={`vm-toggle-btn ${mc.circumDirection === 'CCW' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ circumDirection: 'CCW' })}
                        >CCW</button>
                    </div>
                </div>
                <div className="vm-control-group">
                    <div className="vm-label"><span>View From</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${mc.viewFromEnd === 'left' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ viewFromEnd: 'left' })}
                        >Left</button>
                        <button
                            className={`vm-toggle-btn ${mc.viewFromEnd === 'right' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ viewFromEnd: 'right' })}
                        >Right</button>
                    </div>
                </div>
            </div>
        </SubSection>
    );
}

// ---------------------------------------------------------------------------
// Coverage Section
// ---------------------------------------------------------------------------

function CoverageSection({
    vesselState, coverageDrawMode, onSetCoverageDrawMode,
    onAddCoverageRect, onUpdateCoverageRect, onRemoveCoverageRect,
    onSelectCoverageRect, selectedCoverageRectId, getNextCoverageRectId,
}: SidebarPanelProps) {
    const sel = vesselState.coverageRects.find(r => r.id === selectedCoverageRectId);

    const addManual = () => {
        const id = getNextCoverageRectId();
        onAddCoverageRect({
            id,
            name: `C${vesselState.coverageRects.length + 1}`,
            pos: vesselState.length / 2,
            angle: 90,
            width: 300,
            height: 200,
            color: '#00cc66',
            lineWidth: 2,
            filled: true,
            fillOpacity: 0.2,
        });
        onSelectCoverageRect(id);
    };

    return (
        <SubSection title="Coverage" count={vesselState.coverageRects.length}>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px 0' }}>
                Draw or add rectangles to track shell coverage
            </p>
            <div className="vm-toggle-group" style={{ marginBottom: 10 }}>
                <button
                    className={`vm-toggle-btn ${coverageDrawMode ? 'active' : ''}`}
                    onClick={() => onSetCoverageDrawMode(!coverageDrawMode)}
                    title="Draw coverage rectangle on vessel"
                >
                    <Square size={14} /> Draw
                </button>
                <button
                    className="vm-toggle-btn"
                    onClick={addManual}
                    title="Add coverage rectangle at center"
                >
                    <Plus size={14} /> Add
                </button>
            </div>

            {/* Coverage rect list */}
            {vesselState.coverageRects.map((r) => {
                const isSelected = r.id === selectedCoverageRectId;
                return (
                    <React.Fragment key={r.id}>
                        <div
                            className={`vm-list-item ${isSelected ? 'selected' : ''}`}
                            style={{ borderLeftColor: r.color, opacity: r.locked ? 0.6 : 1 }}
                            onClick={() => onSelectCoverageRect(r.id)}
                        >
                            <div className="vm-list-item-info">
                                <strong>{r.name}</strong> &mdash; {Math.round(r.width)}&times;{Math.round(r.height)}mm
                            </div>
                            <div style={{ display: 'flex', gap: 2 }}>
                                <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onUpdateCoverageRect(r.id, { locked: !r.locked }); }} title={r.locked ? 'Unlock' : 'Lock'} style={{ color: r.locked ? '#3b82f6' : undefined }}>
                                    {r.locked ? <Lock size={12} /> : <Unlock size={12} />}
                                </button>
                                <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveCoverageRect(r.id); }}>
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
                                        onChange={e => onUpdateCoverageRect(sel.id, { name: e.target.value })}
                                    />
                                </div>
                                <div className="vm-form-row">
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Position (mm)</span></div>
                                        <input
                                            type="number"
                                            className="vm-input"
                                            value={sel.pos}
                                            onChange={e => onUpdateCoverageRect(sel.id, { pos: Number(e.target.value) })}
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
                                            onChange={e => onUpdateCoverageRect(sel.id, { angle: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="vm-form-row">
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Width (mm)</span></div>
                                        <input
                                            type="number"
                                            className="vm-input"
                                            value={sel.width}
                                            min={10}
                                            onChange={e => onUpdateCoverageRect(sel.id, { width: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Height (mm)</span></div>
                                        <input
                                            type="number"
                                            className="vm-input"
                                            value={sel.height}
                                            min={10}
                                            onChange={e => onUpdateCoverageRect(sel.id, { height: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="vm-form-row">
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Color</span></div>
                                        <input
                                            type="color"
                                            className="vm-input"
                                            value={sel.color}
                                            onChange={e => onUpdateCoverageRect(sel.id, { color: e.target.value })}
                                            style={{ height: 36, padding: 2 }}
                                        />
                                    </div>
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Fill</span></div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={sel.filled}
                                                onChange={e => onUpdateCoverageRect(sel.id, { filled: e.target.checked })}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
                                                {sel.filled ? 'On' : 'Off'}
                                            </span>
                                        </label>
                                    </div>
                                </div>
                                {sel.filled && (
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Fill Opacity</span></div>
                                        <input
                                            type="range"
                                            min={0.05}
                                            max={0.8}
                                            step={0.05}
                                            value={sel.fillOpacity}
                                            onChange={e => onUpdateCoverageRect(sel.id, { fillOpacity: Number(e.target.value) })}
                                            className="vm-input"
                                            style={{ height: 28 }}
                                        />
                                    </div>
                                )}
                                <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', margin: '6px 0 0 0' }}>
                                    Drag to move
                                </p>
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </SubSection>
    );
}

// ---------------------------------------------------------------------------
// Inspection Images Section
// ---------------------------------------------------------------------------

function InspectionImageSection({
    vesselState, selectedInspectionImageId,
    onAddInspectionImage, onUpdateInspectionImage, onRemoveInspectionImage,
    onSelectInspectionImage, onToggleInspectionImageVisible, onToggleInspectionImageLocked,
    onViewInspectionImage, getNextInspectionImageId,
}: SidebarPanelProps) {
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
