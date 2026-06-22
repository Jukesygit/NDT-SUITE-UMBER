import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { VesselState, SaddleConfig } from '../types';
import { DEFAULT_SADDLE_DEPTH } from '../engine/saddle-geometry';
import { SliderRow, SubSection } from './SliderRow';

export interface SaddleSectionProps {
    vesselState: VesselState;
    selectedSaddleIndex: number;
    onAddSaddle: (saddle: SaddleConfig) => void;
    onUpdateSaddle: (index: number, updates: Partial<SaddleConfig>) => void;
    onUpdateAllSaddleHeights: (height: number) => void;
    onUpdateAllSaddleDepths: (depth: number) => void;
    onRemoveSaddle: (index: number) => void;
    onSelectSaddle: (index: number) => void;
    isOpen?: boolean;
    onToggle?: () => void;
}

export function SaddleSection({
    vesselState, selectedSaddleIndex,
    onAddSaddle, onUpdateSaddle, onUpdateAllSaddleHeights, onUpdateAllSaddleDepths, onRemoveSaddle, onSelectSaddle,
    isOpen, onToggle,
}: SaddleSectionProps) {
    const sel = selectedSaddleIndex >= 0 ? vesselState.saddles[selectedSaddleIndex] : null;
    const defaultHeight = Math.round(vesselState.id / 2 * 1.2);
    const currentAllHeight = vesselState.saddles.length > 0
        ? (vesselState.saddles[0].height ?? defaultHeight)
        : defaultHeight;
    const currentAllDepth = vesselState.saddles.length > 0
        ? (vesselState.saddles[0].depth ?? DEFAULT_SADDLE_DEPTH)
        : DEFAULT_SADDLE_DEPTH;

    return (
        <SubSection title="Supports" count={vesselState.saddles.length} isOpen={isOpen} onToggle={onToggle}>
            <button
                className="vm-btn-add"
                onClick={() => onAddSaddle({ pos: vesselState.length / 2 })}
                style={{ marginBottom: 10 }}
            >
                <Plus size={14} /> Add Saddle Support
            </button>

            {vesselState.saddles.length > 0 && (
                <SliderRow
                    label="All Support Heights"
                    value={currentAllHeight}
                    min={Math.round(vesselState.id / 2 * 0.5)}
                    max={Math.round(vesselState.id / 2 * 3)}
                    step={10}
                    unit="mm"
                    onChange={onUpdateAllSaddleHeights}
                />
            )}

            {vesselState.saddles.length > 0 && (
                <SliderRow
                    label="All Support Depths"
                    value={currentAllDepth}
                    min={100}
                    max={1000}
                    step={10}
                    unit="mm"
                    onChange={onUpdateAllSaddleDepths}
                />
            )}

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
                        <div className="vm-form edit-mode" style={{ marginTop: 8, position: 'relative', zIndex: 1 }} onClick={e => e.stopPropagation()}>
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
                            <div className="vm-form-row">
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Depth (mm)</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.depth ?? DEFAULT_SADDLE_DEPTH}
                                        onChange={e => onUpdateSaddle(selectedSaddleIndex, { depth: Number(e.target.value) })}
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
