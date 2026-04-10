import { Palette } from 'lucide-react';
import type { VesselState, MaterialKey } from '../types';
import { MATERIAL_PRESETS, SCENE_PRESETS } from '../types';
import type { ScenePresetKey } from '../types';
import { SliderRow, Section } from './SliderRow';

export interface VisualsSectionProps {
    vesselState: VesselState;
    onUpdateDimensions: (updates: Partial<VesselState>) => void;
}

export function VisualsSection({ vesselState, onUpdateDimensions }: VisualsSectionProps) {
    const v = vesselState.visuals;
    const updateVisuals = (updates: Partial<typeof v>) =>
        onUpdateDimensions({ visuals: { ...v, ...updates } });

    const applyScenePreset = (key: ScenePresetKey) => {
        const preset = SCENE_PRESETS[key];
        updateVisuals({ backgroundColor: preset.backgroundColor });
    };

    return (
        <Section title="Visuals" defaultOpen={false} icon={<Palette size={14} style={{ marginRight: 6 }} />}>
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
                        checked={v.enableShadows ?? true}
                        onChange={e => updateVisuals({ enableShadows: e.target.checked })}
                    />
                    <span>Shadows</span>
                </label>
                {(v.enableShadows ?? true) && (
                    <SliderRow
                        label="Shadow Intensity"
                        value={Math.round((v.shadowIntensity ?? 0.35) * 100)}
                        min={5}
                        max={100}
                        unit="%"
                        onChange={val => updateVisuals({ shadowIntensity: val / 100 })}
                    />
                )}
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
                        checked={v.showNozzleLabels ?? false}
                        onChange={e => updateVisuals({ showNozzleLabels: e.target.checked })}
                    />
                    <span>Nozzle Labels</span>
                </label>
                <label className="vm-checkbox-row">
                    <input
                        type="checkbox"
                        checked={v.showCardinalDirections ?? false}
                        onChange={e => updateVisuals({ showCardinalDirections: e.target.checked })}
                    />
                    <span>Cardinal Directions</span>
                </label>
                {v.showCardinalDirections && (
                    <div style={{ marginTop: 4, paddingLeft: 4 }}>
                        <SliderRow
                            label="North Heading"
                            value={v.cardinalRotation ?? 0}
                            min={0}
                            max={359}
                            step={1}
                            unit="°"
                            onChange={val => updateVisuals({ cardinalRotation: val })}
                        />
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                            {[0, 90, 180, 270].map(deg => (
                                <button
                                    key={deg}
                                    className="vm-toggle-btn"
                                    style={{
                                        flex: 1, fontSize: 10, padding: '2px 0',
                                        opacity: (v.cardinalRotation ?? 0) === deg ? 1 : 0.6,
                                        borderColor: (v.cardinalRotation ?? 0) === deg ? 'rgba(255,255,255,0.3)' : undefined,
                                    }}
                                    onClick={() => updateVisuals({ cardinalRotation: deg as 0 | 90 | 180 | 270 })}
                                >
                                    {deg}°
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Section>
    );
}
