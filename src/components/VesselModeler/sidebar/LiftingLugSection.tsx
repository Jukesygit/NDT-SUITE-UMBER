import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { VesselState, LiftingLugConfig, LiftingLugStyle } from '../types';
import { LIFTING_LUG_SIZES } from '../types';
import { SubSection } from './SliderRow';

export interface LiftingLugSectionProps {
    vesselState: VesselState;
    selectedLugIndex: number;
    onAddLug: (lug: LiftingLugConfig) => void;
    onUpdateLug: (index: number, updates: Partial<LiftingLugConfig>) => void;
    onRemoveLug: (index: number) => void;
    onSelectLug: (index: number) => void;
}

export function LiftingLugSection({
    vesselState, selectedLugIndex,
    onAddLug, onUpdateLug, onRemoveLug, onSelectLug,
}: LiftingLugSectionProps) {
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
