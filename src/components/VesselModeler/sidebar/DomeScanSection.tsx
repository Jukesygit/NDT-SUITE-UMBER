import React from 'react';
import { Trash2 } from 'lucide-react';
import type { DomeScanConfig, VesselState } from '../types';
import { SliderRow, SubSection } from './SliderRow';

export interface DomeScanSectionProps {
    vesselState: VesselState;
    selectedDomeScanId: string;
    onSelectDomeScan: (id: string) => void;
    onUpdateDomeScan: (id: string, updates: Partial<DomeScanConfig>) => void;
    onRemoveDomeScan: (id: string) => void;
    isOpen?: boolean;
    onToggle?: () => void;
}

export function DomeScanSection({
    vesselState,
    selectedDomeScanId,
    onSelectDomeScan,
    onUpdateDomeScan,
    onRemoveDomeScan,
    isOpen,
    onToggle,
}: DomeScanSectionProps) {
    const domeScanComposites = vesselState.domeScanComposites;

    return (
        <SubSection title="Dome Scans" count={domeScanComposites.length} isOpen={isOpen} onToggle={onToggle}>
            {domeScanComposites.length === 0 && (
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '8px 0' }}>
                    No dome scans placed
                </p>
            )}

            {domeScanComposites.map(ds => {
                const isSelected = selectedDomeScanId === ds.id;
                return (
                    <React.Fragment key={ds.id}>
                        <div
                            className={`vm-list-item texture ${isSelected ? 'selected' : ''}`}
                            onClick={() => onSelectDomeScan(isSelected ? '' : ds.id)}
                        >
                            <div className="vm-list-item-info">
                                <strong>{ds.name}</strong>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                                    {ds.head === 'left' ? 'Left' : 'Right'} head
                                </div>
                            </div>
                            <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveDomeScan(ds.id); }}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                        {isSelected && (
                            <DomeScanEditPanel
                                ds={ds}
                                onUpdate={(updates) => onUpdateDomeScan(ds.id, updates)}
                                onRemove={() => onRemoveDomeScan(ds.id)}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </SubSection>
    );
}

// ---------------------------------------------------------------------------
// Edit panel for a selected dome scan
// ---------------------------------------------------------------------------

function DomeScanEditPanel({
    ds,
    onUpdate,
    onRemove,
}: {
    ds: DomeScanConfig;
    onUpdate: (updates: Partial<DomeScanConfig>) => void;
    onRemove: () => void;
}) {
    return (
        <div className="vm-form edit-mode" style={{ marginTop: 8, position: 'relative', zIndex: 1 }} onClick={e => e.stopPropagation()}>
            {/* Head selection */}
            <div className="vm-control-group">
                <div className="vm-label"><span>Head</span></div>
                <div className="vm-toggle-group">
                    <button
                        className={`vm-toggle-btn ${ds.head === 'left' ? 'active' : ''}`}
                        onClick={() => onUpdate({ head: 'left' })}
                    >Left</button>
                    <button
                        className={`vm-toggle-btn ${ds.head === 'right' ? 'active' : ''}`}
                        onClick={() => onUpdate({ head: 'right' })}
                    >Right</button>
                </div>
            </div>

            {/* Center phi */}
            <SliderRow
                label="Center φ"
                value={ds.centerPhi}
                min={0}
                max={90}
                step={1}
                unit="°"
                onChange={v => onUpdate({ centerPhi: v })}
            />

            {/* Center theta */}
            <SliderRow
                label="Center θ"
                value={ds.centerTheta}
                min={0}
                max={360}
                step={1}
                unit="°"
                onChange={v => onUpdate({ centerTheta: v })}
            />

            {/* Scan direction */}
            <div className="vm-form-row" style={{ marginTop: 6 }}>
                <div className="vm-control-group">
                    <div className="vm-label"><span>Scan dir</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${ds.scanDirection === 'cw' ? 'active' : ''}`}
                            onClick={() => onUpdate({ scanDirection: 'cw' })}
                        >CW</button>
                        <button
                            className={`vm-toggle-btn ${ds.scanDirection === 'ccw' ? 'active' : ''}`}
                            onClick={() => onUpdate({ scanDirection: 'ccw' })}
                        >CCW</button>
                    </div>
                </div>
                <div className="vm-control-group">
                    <div className="vm-label"><span>Index dir</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${ds.indexDirection === 'outward' ? 'active' : ''}`}
                            onClick={() => onUpdate({ indexDirection: 'outward' })}
                        >Outward</button>
                        <button
                            className={`vm-toggle-btn ${ds.indexDirection === 'inward' ? 'active' : ''}`}
                            onClick={() => onUpdate({ indexDirection: 'inward' })}
                        >Inward</button>
                    </div>
                </div>
            </div>

            {/* Visualization controls */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 10, paddingTop: 10 }}>
                <div className="vm-control-group">
                    <div className="vm-label"><span>Colorscale</span></div>
                    <select
                        className="vm-select"
                        value={ds.colorScale}
                        onChange={e => onUpdate({ colorScale: e.target.value })}
                    >
                        <option value="Jet">Jet</option>
                        <option value="Viridis">Viridis</option>
                        <option value="Hot">Hot</option>
                        <option value="Blues">Blues</option>
                    </select>
                </div>
                <SliderRow
                    label="Opacity"
                    value={ds.opacity}
                    min={0}
                    max={1}
                    step={0.1}
                    unit=""
                    onChange={v => onUpdate({ opacity: v })}
                />
                <div className="vm-form-row">
                    <div className="vm-control-group">
                        <div className="vm-label"><span>Min</span></div>
                        <input
                            type="number"
                            className="vm-input"
                            placeholder="Auto"
                            value={ds.rangeMin ?? ''}
                            onChange={e => onUpdate({
                                rangeMin: e.target.value === '' ? null : parseFloat(e.target.value),
                            })}
                        />
                    </div>
                    <div className="vm-control-group">
                        <div className="vm-label"><span>Max</span></div>
                        <input
                            type="number"
                            className="vm-input"
                            placeholder="Auto"
                            value={ds.rangeMax ?? ''}
                            onChange={e => onUpdate({
                                rangeMax: e.target.value === '' ? null : parseFloat(e.target.value),
                            })}
                        />
                    </div>
                </div>
            </div>

            {/* Remove button */}
            <button
                className="vm-btn vm-btn-danger"
                style={{ width: '100%', marginTop: 10, fontSize: '0.75rem', padding: '6px 0' }}
                onClick={onRemove}
            >
                <Trash2 size={12} style={{ marginRight: 4 }} /> Remove Dome Scan
            </button>
        </div>
    );
}
