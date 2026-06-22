import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { VesselState, SaddleConfig } from '../types';
import {
    DEFAULT_SADDLE_DEPTH,
    DEFAULT_WEAR_PLATE_THICKNESS,
    DEFAULT_WEAR_PLATE_ARC_OVERHANG,
    DEFAULT_WEAR_PLATE_AXIAL_OVERHANG,
} from '../engine/saddle-geometry';
import { SliderRow, SubSection } from './SliderRow';

export interface SaddleSectionProps {
    vesselState: VesselState;
    selectedSaddleIndex: number;
    onAddSaddle: (saddle: SaddleConfig) => void;
    onUpdateSaddle: (index: number, updates: Partial<SaddleConfig>) => void;
    onUpdateAllSaddleHeights: (height: number) => void;
    onUpdateAllSaddleDepths: (depth: number) => void;
    /** Wear plate is configured universally across all supports. */
    onUpdateAllSaddleWearPlate: (updates: Partial<SaddleConfig>) => void;
    onRemoveSaddle: (index: number) => void;
    onSelectSaddle: (index: number) => void;
    isOpen?: boolean;
    onToggle?: () => void;
}

export function SaddleSection({
    vesselState, selectedSaddleIndex,
    onAddSaddle, onUpdateSaddle, onUpdateAllSaddleHeights, onUpdateAllSaddleDepths, onUpdateAllSaddleWearPlate, onRemoveSaddle, onSelectSaddle,
    isOpen, onToggle,
}: SaddleSectionProps) {
    const sel = selectedSaddleIndex >= 0 ? vesselState.saddles[selectedSaddleIndex] : null;
    const defaultHeight = Math.round(vesselState.id / 2 * 1.2);
    const first = vesselState.saddles[0];
    const currentAllHeight = first ? (first.height ?? defaultHeight) : defaultHeight;
    const currentAllDepth = first ? (first.depth ?? DEFAULT_SADDLE_DEPTH) : DEFAULT_SADDLE_DEPTH;
    // Wear plate config is universal — read the shared values from the first support.
    const wearPlateOn = first?.wearPlate ?? false;
    const wearPlateThickness = first?.wearPlateThickness ?? DEFAULT_WEAR_PLATE_THICKNESS;
    const wearPlateArcOverhang = first?.wearPlateArcOverhang ?? DEFAULT_WEAR_PLATE_ARC_OVERHANG;
    const wearPlateAxialOverhang = first?.wearPlateAxialOverhang ?? DEFAULT_WEAR_PLATE_AXIAL_OVERHANG;

    return (
        <SubSection title="Supports" count={vesselState.saddles.length} isOpen={isOpen} onToggle={onToggle}>
            <button
                className="vm-btn-add"
                onClick={() => onAddSaddle({
                    pos: vesselState.length / 2,
                    wearPlate: wearPlateOn,
                    wearPlateThickness, wearPlateArcOverhang, wearPlateAxialOverhang,
                })}
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

            {vesselState.saddles.length > 0 && (
                <div className="vm-control-group">
                    <div className="vm-label"><span>Wear Plate (all supports)</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${wearPlateOn ? 'active' : ''}`}
                            onClick={() => onUpdateAllSaddleWearPlate({ wearPlate: true })}
                            title="Show a reinforcement / wear plate between the shell and every saddle cradle"
                        >
                            On
                        </button>
                        <button
                            className={`vm-toggle-btn ${!wearPlateOn ? 'active' : ''}`}
                            onClick={() => onUpdateAllSaddleWearPlate({ wearPlate: false })}
                            title="No wear plate (cradles contact the shell directly)"
                        >
                            Off
                        </button>
                    </div>
                </div>
            )}

            {vesselState.saddles.length > 0 && wearPlateOn && (
                <>
                    <SliderRow
                        label="Plate Thickness"
                        value={wearPlateThickness}
                        min={6}
                        max={40}
                        step={1}
                        unit="mm"
                        onChange={v => onUpdateAllSaddleWearPlate({ wearPlateThickness: v })}
                    />
                    <SliderRow
                        label="Arc Overhang"
                        value={wearPlateArcOverhang}
                        min={0}
                        max={30}
                        step={1}
                        unit="°"
                        onChange={v => onUpdateAllSaddleWearPlate({ wearPlateArcOverhang: v })}
                    />
                    <SliderRow
                        label="Axial Overhang"
                        value={wearPlateAxialOverhang}
                        min={0}
                        max={300}
                        step={5}
                        unit="mm"
                        onChange={v => onUpdateAllSaddleWearPlate({ wearPlateAxialOverhang: v })}
                    />
                </>
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
