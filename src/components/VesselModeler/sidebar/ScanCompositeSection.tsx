import React, { useState } from 'react';
import { Trash2, Cloud } from 'lucide-react';
import type { VesselState, ScanCompositeConfig } from '../types';
import { SliderRow, SubSection } from './SliderRow';

export interface ScanCompositeSectionProps {
    vesselState: VesselState;
    selectedScanCompositeId: string;
    onSelectScanComposite: (id: string) => void;
    onImportComposite: (compositeId: string, placement: { scanDirection: 'cw' | 'ccw'; indexDirection: 'forward' | 'reverse' }) => void;
    onUpdateScanComposite: (id: string, updates: Partial<ScanCompositeConfig>) => void;
    onRemoveScanComposite: (id: string) => void;
    cloudComposites: Array<{ id: string; name: string; width: number; height: number; created_at: string }> | undefined;
    cloudCompositesLoading: boolean;
    cloudCompositesError: Error | null;
}

export function ScanCompositeSection({
    vesselState, selectedScanCompositeId,
    onSelectScanComposite, onImportComposite,
    onUpdateScanComposite, onRemoveScanComposite,
    cloudComposites, cloudCompositesLoading, cloudCompositesError,
}: ScanCompositeSectionProps) {
    const [showImport, setShowImport] = useState(false);
    const [importingId, setImportingId] = useState<string | null>(null);
    const handleImport = () => {
        if (!importingId) return;
        onImportComposite(importingId, { scanDirection: 'cw', indexDirection: 'forward' });
        setShowImport(false);
        setImportingId(null);
    };

    return (
        <SubSection title="Scan Composites" count={vesselState.scanComposites.length}>
            <button
                className="vm-btn vm-btn-primary"
                onClick={() => setShowImport(true)}
                style={{ marginBottom: 8 }}
            >
                <Cloud size={14} /> Import from Cloud
            </button>

            {vesselState.scanComposites.length === 0 && (
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '8px 0' }}>
                    No scan composites placed
                </p>
            )}

            {vesselState.scanComposites.map(sc => {
                const isSelected = selectedScanCompositeId === sc.id;
                const widthMm = sc.xAxis.length > 0 ? Math.round(sc.xAxis[sc.xAxis.length - 1] - sc.xAxis[0]) : 0;
                const heightMm = sc.yAxis.length > 0 ? Math.round(sc.yAxis[sc.yAxis.length - 1] - sc.yAxis[0]) : 0;
                return (
                    <React.Fragment key={sc.id}>
                        <div
                            className={`vm-list-item texture ${isSelected ? 'selected' : ''}`}
                            onClick={() => onSelectScanComposite(isSelected ? '' : sc.id)}
                        >
                            <div className="vm-list-item-info">
                                <strong>{sc.name}</strong>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                                    {widthMm} &times; {heightMm} mm
                                    {!sc.orientationConfirmed && (
                                        <span style={{ color: '#facc15', marginLeft: 6 }}>&#9679; Set orientation</span>
                                    )}
                                </div>
                            </div>
                            <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveScanComposite(sc.id); }}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                        {isSelected && (
                            <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                                {/* --- Step 1: Orientation (always visible) --- */}
                                {!sc.orientationConfirmed && (
                                    <p style={{ fontSize: '0.8rem', color: '#facc15', margin: '0 0 8px', fontWeight: 600 }}>
                                        Set scan orientation using the 3D gizmo or controls below, then confirm.
                                    </p>
                                )}
                                <div className="vm-form-row">
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Datum angle</span></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input
                                                type="number"
                                                className="vm-input"
                                                min={0}
                                                max={360}
                                                step={1}
                                                value={sc.datumAngleDeg}
                                                onChange={e => {
                                                    const v = parseFloat(e.target.value);
                                                    if (!isNaN(v)) onUpdateScanComposite(sc.id, { datumAngleDeg: ((v % 360) + 360) % 360 });
                                                }}
                                                style={{ width: 64 }}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>deg</span>
                                        </div>
                                    </div>
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Index start</span></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input
                                                type="number"
                                                className="vm-input"
                                                min={0}
                                                max={vesselState.length}
                                                step={1}
                                                value={sc.indexStartMm}
                                                onChange={e => {
                                                    const v = parseFloat(e.target.value);
                                                    if (!isNaN(v)) onUpdateScanComposite(sc.id, { indexStartMm: Math.max(0, Math.min(vesselState.length, v)) });
                                                }}
                                                style={{ width: 64 }}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>mm</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="vm-form-row" style={{ marginTop: 6 }}>
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Scan dir</span></div>
                                        <div className="vm-toggle-group">
                                            <button
                                                className={`vm-toggle-btn ${sc.scanDirection === 'cw' ? 'active' : ''}`}
                                                onClick={() => onUpdateScanComposite(sc.id, { scanDirection: 'cw' })}
                                            >CW</button>
                                            <button
                                                className={`vm-toggle-btn ${sc.scanDirection === 'ccw' ? 'active' : ''}`}
                                                onClick={() => onUpdateScanComposite(sc.id, { scanDirection: 'ccw' })}
                                            >CCW</button>
                                        </div>
                                    </div>
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Index dir</span></div>
                                        <div className="vm-toggle-group">
                                            <button
                                                className={`vm-toggle-btn ${sc.indexDirection === 'forward' ? 'active' : ''}`}
                                                onClick={() => onUpdateScanComposite(sc.id, { indexDirection: 'forward' })}
                                            >Fwd</button>
                                            <button
                                                className={`vm-toggle-btn ${sc.indexDirection === 'reverse' ? 'active' : ''}`}
                                                onClick={() => onUpdateScanComposite(sc.id, { indexDirection: 'reverse' })}
                                            >Rev</button>
                                        </div>
                                    </div>
                                </div>

                                {!sc.orientationConfirmed ? (
                                    <button
                                        className="vm-btn vm-btn-primary"
                                        style={{ width: '100%', marginTop: 10, padding: '8px 0', fontWeight: 600 }}
                                        onClick={() => onUpdateScanComposite(sc.id, { orientationConfirmed: true })}
                                    >
                                        Confirm Orientation &amp; Render Scan
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className="vm-btn"
                                            style={{ width: '100%', marginTop: 8, fontSize: '0.75rem', padding: '4px 0' }}
                                            onClick={() => onUpdateScanComposite(sc.id, { orientationConfirmed: false })}
                                        >
                                            Re-adjust Orientation
                                        </button>

                                        {/* --- Step 2: Visualization (only after confirmation) --- */}
                                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 10, paddingTop: 10 }}>
                                            <div className="vm-control-group">
                                                <div className="vm-label"><span>Colorscale</span></div>
                                                <select
                                                    className="vm-select"
                                                    value={sc.colorScale}
                                                    onChange={e => onUpdateScanComposite(sc.id, { colorScale: e.target.value })}
                                                >
                                                    <option value="Jet">Jet</option>
                                                    <option value="Viridis">Viridis</option>
                                                    <option value="Hot">Hot</option>
                                                    <option value="Blues">Blues</option>
                                                </select>
                                            </div>
                                            <SliderRow
                                                label="Opacity"
                                                value={sc.opacity}
                                                min={0}
                                                max={1}
                                                step={0.1}
                                                unit=""
                                                onChange={v => onUpdateScanComposite(sc.id, { opacity: v })}
                                            />
                                            <div className="vm-form-row">
                                                <div className="vm-control-group">
                                                    <div className="vm-label"><span>Min</span></div>
                                                    <input
                                                        type="number"
                                                        className="vm-input"
                                                        placeholder="Auto"
                                                        value={sc.rangeMin ?? ''}
                                                        onChange={e => onUpdateScanComposite(sc.id, {
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
                                                        value={sc.rangeMax ?? ''}
                                                        onChange={e => onUpdateScanComposite(sc.id, {
                                                            rangeMax: e.target.value === '' ? null : parseFloat(e.target.value),
                                                        })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </React.Fragment>
                );
            })}

            {/* Import modal */}
            {showImport && (
                <div className="vm-modal-overlay">
                    <div className="vm-modal">
                        <div className="vm-modal-header">
                            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'white' }}>Import Scan Composite</h3>
                            <button className="vm-btn-icon" onClick={() => { setShowImport(false); setImportingId(null); }}>
                                &times;
                            </button>
                        </div>
                        <div className="vm-modal-body">
                            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', margin: '0 0 10px' }}>
                                Select a composite to import. You can adjust placement after import using the 3D gizmo or sidebar controls.
                            </p>
                            {cloudCompositesLoading ? (
                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px 0' }}>
                                    Loading...
                                </p>
                            ) : cloudCompositesError ? (
                                <p style={{ fontSize: '0.85rem', color: '#ef4444', textAlign: 'center', padding: '20px 0' }}>
                                    Error: {cloudCompositesError.message}
                                </p>
                            ) : (!cloudComposites || cloudComposites.length === 0) ? (
                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px 0' }}>
                                    No composites saved yet
                                </p>
                            ) : (
                                cloudComposites.map(c => (
                                    <div
                                        key={c.id}
                                        className={`vm-list-item texture ${importingId === c.id ? 'selected' : ''}`}
                                        onClick={() => setImportingId(c.id)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="vm-list-item-info">
                                            <strong>{c.name}</strong>
                                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                                                {c.width} &times; {c.height} &middot; {new Date(c.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="vm-modal-footer">
                            <button className="vm-btn" onClick={() => { setShowImport(false); setImportingId(null); }}>Cancel</button>
                            {importingId && (
                                <button className="vm-btn vm-btn-primary" onClick={handleImport}>Import</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </SubSection>
    );
}
