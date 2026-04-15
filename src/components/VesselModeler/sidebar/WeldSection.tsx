import React, { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { VesselState, WeldConfig, WeldType } from '../types';
import { SliderRow, SubSection } from './SliderRow';

export interface WeldSectionProps {
    vesselState: VesselState;
    selectedWeldIndex: number;
    onAddWeld: (weld: WeldConfig) => void;
    onUpdateWeld: (index: number, updates: Partial<WeldConfig>) => void;
    onRemoveWeld: (index: number) => void;
    onSelectWeld: (index: number) => void;
    isOpen?: boolean;
    onToggle?: () => void;
}

export function WeldSection({
    vesselState, selectedWeldIndex,
    onAddWeld, onUpdateWeld, onRemoveWeld, onSelectWeld,
    isOpen, onToggle,
}: WeldSectionProps) {
    const [weldType, setWeldType] = useState<WeldType>('circumferential');
    const sel = selectedWeldIndex >= 0 ? vesselState.welds[selectedWeldIndex] : null;

    const addWeld = () => {
        const prefix = weldType === 'circumferential' ? 'CW' : 'LW';
        const existingCount = vesselState.welds.filter(w => w.type === weldType).length;
        const num = existingCount + 1;
        if (weldType === 'circumferential') {
            onAddWeld({
                name: `${prefix}${num}`,
                type: 'circumferential',
                pos: vesselState.length / 2,
                color: '#888888',
            });
        } else {
            onAddWeld({
                name: `${prefix}${num}`,
                type: 'longitudinal',
                pos: vesselState.length * 0.25,
                endPos: vesselState.length * 0.75,
                angle: 90,
                color: '#888888',
            });
        }
    };

    return (
        <SubSection title="Welds" count={vesselState.welds.length} isOpen={isOpen} onToggle={onToggle}>
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

            {/* Add button (draggable onto vessel) */}
            <button
                className="vm-toggle-btn"
                style={{ width: '100%', marginBottom: 8, justifyContent: 'center', cursor: 'grab' }}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-weld', JSON.stringify({ type: weldType }));
                    e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={addWeld}
                title={`Drag onto vessel or click to add ${weldType === 'circumferential' ? 'circumferential' : 'longitudinal'} weld`}
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
                            <SliderRow
                                label={sel.type === 'circumferential' ? 'Position' : 'Start Pos'}
                                value={Math.round(sel.pos)}
                                min={0}
                                max={vesselState.length}
                                step={1}
                                onChange={v => onUpdateWeld(selectedWeldIndex, { pos: v })}
                            />
                            {sel.type === 'longitudinal' && (
                                <SliderRow
                                    label="End Pos"
                                    value={Math.round(sel.endPos ?? vesselState.length)}
                                    min={0}
                                    max={vesselState.length}
                                    step={1}
                                    onChange={v => onUpdateWeld(selectedWeldIndex, { endPos: v })}
                                />
                            )}
                            {sel.type === 'longitudinal' && (
                                <SliderRow
                                    label="Angle"
                                    value={Math.round(sel.angle ?? 90)}
                                    min={0}
                                    max={360}
                                    step={1}
                                    unit="°"
                                    onChange={v => onUpdateWeld(selectedWeldIndex, { angle: v })}
                                />
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
