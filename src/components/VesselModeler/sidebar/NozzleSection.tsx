import React from 'react';
import { Trash2 } from 'lucide-react';
import type { VesselState, NozzleConfig, NozzleOrientationMode } from '../types';
import { PIPE_SIZES, findClosestPipeSize } from '../types';
import { SubSection } from './SliderRow';

export interface NozzleSectionProps {
    vesselState: VesselState;
    selectedNozzleIndex: number;
    onAddNozzle: (nozzle: NozzleConfig) => void;
    onUpdateNozzle: (index: number, updates: Partial<NozzleConfig>) => void;
    onRemoveNozzle: (index: number) => void;
    onSelectNozzle: (index: number) => void;
    isOpen?: boolean;
    onToggle?: () => void;
}

export function NozzleSection({
    vesselState, selectedNozzleIndex,
    onAddNozzle, onUpdateNozzle, onRemoveNozzle, onSelectNozzle,
    isOpen, onToggle,
}: NozzleSectionProps) {
    // Filter out plain-pipe nozzles — those are managed in the Piping section
    const flangedNozzles = vesselState.nozzles
        .map((n, i) => ({ nozzle: n, index: i }))
        .filter(({ nozzle }) => nozzle.style !== 'plain-pipe');

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
        <SubSection title="Nozzles" count={flangedNozzles.length} isOpen={isOpen} onToggle={onToggle}>
            {/* Library grid - drag onto 3D canvas or click to add */}
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px 0' }}>
                Drag a nozzle size onto the vessel
            </p>
            <div className="vm-library-grid">
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

            {flangedNozzles.length > 0 && <div className="vm-library-separator" />}

            {/* Nozzle list (flanged only — plain-pipe nozzles are in Piping section) */}
            {flangedNozzles.map(({ nozzle: n, index: i }) => (
                <React.Fragment key={i}>
                    <div
                        className={`vm-list-item ${i === selectedNozzleIndex ? 'selected' : ''}`}
                        onClick={() => onSelectNozzle(i)}
                    >
                        <div className="vm-list-item-info">
                            <strong>{n.name}</strong> <span style={{ color: 'var(--color-primary-400, #60a5fa)', fontWeight: 600 }}>{findClosestPipeSize(n.size).nps}</span>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                                {Math.round(n.pos)}mm &middot; {Math.round(n.angle)}&deg;
                            </div>
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
                                        min={Math.round(-(vesselState.id / (2 * vesselState.headRatio)))}
                                        max={Math.round(vesselState.length + vesselState.id / (2 * vesselState.headRatio))}
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
                            <button
                                className="vm-btn-sm"
                                onClick={() => onRemoveNozzle(selectedNozzleIndex)}
                                title="Delete this nozzle"
                                style={{
                                    fontSize: '0.7rem',
                                    padding: '3px 8px',
                                    marginTop: 8,
                                    color: 'var(--color-danger, #ef4444)',
                                    width: '100%',
                                }}
                            >
                                Delete Nozzle
                            </button>
                        </div>
                    )}
                </React.Fragment>
            ))}
        </SubSection>
    );
}
