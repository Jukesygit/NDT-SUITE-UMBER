import React from 'react';
import { Trash2, Square, Plus, Lock, Unlock, Copy } from 'lucide-react';
import type { VesselState, CoverageRectConfig } from '../types';
import { SubSection } from './SliderRow';

export interface CoverageSectionProps {
    vesselState: VesselState;
    coverageDrawMode: boolean;
    onSetCoverageDrawMode: (active: boolean) => void;
    onAddCoverageRect: (rect: CoverageRectConfig) => void;
    onUpdateCoverageRect: (id: number, updates: Partial<CoverageRectConfig>) => void;
    onRemoveCoverageRect: (id: number) => void;
    onSelectCoverageRect: (id: number) => void;
    selectedCoverageRectId: number;
    getNextCoverageRectId: () => number;
    isOpen?: boolean;
    onToggle?: () => void;
}

export function CoverageSection({
    vesselState, coverageDrawMode, onSetCoverageDrawMode,
    onAddCoverageRect, onUpdateCoverageRect, onRemoveCoverageRect,
    onSelectCoverageRect, selectedCoverageRectId, getNextCoverageRectId,
    isOpen, onToggle,
}: CoverageSectionProps) {
    const sel = vesselState.coverageRects.find(r => r.id === selectedCoverageRectId);

    const nextName = () => {
        const used = new Set(vesselState.coverageRects.map(r => r.name));
        let n = 1;
        while (used.has(`C${n}`)) n++;
        return `C${n}`;
    };

    const addManual = () => {
        const id = getNextCoverageRectId();
        onAddCoverageRect({
            id,
            name: nextName(),
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

    const duplicateRect = (source: CoverageRectConfig) => {
        const id = getNextCoverageRectId();
        onAddCoverageRect({
            ...source,
            id,
            name: nextName(),
            pos: source.pos + 50,
            locked: false,
        });
        onSelectCoverageRect(id);
    };

    return (
        <SubSection title="Coverage" count={vesselState.coverageRects.length} isOpen={isOpen} onToggle={onToggle}>
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
                                <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); duplicateRect(r); }} title="Duplicate">
                                    <Copy size={12} />
                                </button>
                                <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onUpdateCoverageRect(r.id, { locked: !r.locked }); }} title={r.locked ? 'Unlock' : 'Lock'} style={{ color: r.locked ? '#3b82f6' : undefined }}>
                                    {r.locked ? <Lock size={12} /> : <Unlock size={12} />}
                                </button>
                                <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveCoverageRect(r.id); }}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                        {isSelected && sel && (
                            <div className="vm-form edit-mode" style={{ marginTop: 8, position: 'relative', zIndex: 1 }} onClick={e => e.stopPropagation()}>
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Name</span></div>
                                    <input
                                        className="vm-input"
                                        value={sel.name}
                                        onChange={e => onUpdateCoverageRect(sel.id, { name: e.target.value })}
                                    />
                                </div>
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Position (mm)</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.pos}
                                        onChange={e => onUpdateCoverageRect(sel.id, { pos: Number(e.target.value) })}
                                    />
                                    <input
                                        type="range"
                                        min={0}
                                        max={vesselState.length}
                                        step={1}
                                        value={sel.pos}
                                        onChange={e => onUpdateCoverageRect(sel.id, { pos: Number(e.target.value) })}
                                        className="vm-input"
                                        style={{ height: 28, marginTop: 4 }}
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
                                    <input
                                        type="range"
                                        min={0}
                                        max={360}
                                        step={1}
                                        value={sel.angle}
                                        onChange={e => onUpdateCoverageRect(sel.id, { angle: Number(e.target.value) })}
                                        className="vm-input"
                                        style={{ height: 28, marginTop: 4 }}
                                    />
                                </div>
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Width (mm)</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.width}
                                        min={10}
                                        onChange={e => onUpdateCoverageRect(sel.id, { width: Number(e.target.value) })}
                                    />
                                    <div className="vm-toggle-group" style={{ marginTop: 4 }}>
                                        {[500, 1000, 1500, 2000].map(v => (
                                            <button
                                                key={v}
                                                className={`vm-toggle-btn ${sel.width === v ? 'active' : ''}`}
                                                style={{ flex: 1, fontSize: '0.65rem', padding: '2px 0' }}
                                                onClick={() => onUpdateCoverageRect(sel.id, { width: v })}
                                            >
                                                {v}
                                            </button>
                                        ))}
                                    </div>
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
                                    <div className="vm-toggle-group" style={{ marginTop: 4 }}>
                                        {[500, 1000, 1500, 2000].map(v => (
                                            <button
                                                key={v}
                                                className={`vm-toggle-btn ${sel.height === v ? 'active' : ''}`}
                                                style={{ flex: 1, fontSize: '0.65rem', padding: '2px 0' }}
                                                onClick={() => onUpdateCoverageRect(sel.id, { height: v })}
                                            >
                                                {v}
                                            </button>
                                        ))}
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
