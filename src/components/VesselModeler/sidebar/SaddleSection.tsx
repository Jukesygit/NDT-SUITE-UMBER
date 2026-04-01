import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { VesselState, SaddleConfig } from '../types';
import { SubSection } from './SliderRow';

export interface SaddleSectionProps {
    vesselState: VesselState;
    selectedSaddleIndex: number;
    onAddSaddle: (saddle: SaddleConfig) => void;
    onUpdateSaddle: (index: number, updates: Partial<SaddleConfig>) => void;
    onRemoveSaddle: (index: number) => void;
    onSelectSaddle: (index: number) => void;
}

export function SaddleSection({
    vesselState, selectedSaddleIndex,
    onAddSaddle, onUpdateSaddle, onRemoveSaddle, onSelectSaddle,
}: SaddleSectionProps) {
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
