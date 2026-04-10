import React, { useRef } from 'react';
import { Trash2, Square, Eye, EyeOff, Lock, Unlock, Ruler, ShieldAlert, Upload, X, FileText } from 'lucide-react';
import type {
    VesselState,
    AnnotationShapeConfig,
    AnnotationShapeType,
    MeasurementConfig,
    RulerConfig,
    ThicknessThresholds,
} from '../types';
import { computeRulerDistance } from '../engine/annotation-geometry';
import { SliderRow, SubSection } from './SliderRow';
import { ThresholdSection } from './ThresholdSection';

export interface AnnotationSectionProps {
    vesselState: VesselState;
    selectedAnnotationId: number;
    drawMode: AnnotationShapeType | null;
    onSetDrawMode: (mode: AnnotationShapeType | null) => void;
    onAddAnnotation: (config: AnnotationShapeConfig) => void;
    onUpdateAnnotation: (id: number, updates: Partial<AnnotationShapeConfig>) => void;
    onRemoveAnnotation: (id: number) => void;
    onSelectAnnotation: (id: number) => void;
    onUpdateMeasurementConfig: (updates: Partial<MeasurementConfig>) => void;
    getNextAnnotationId: () => number;
    onToggleAnnotationVisible: (id: number) => void;
    onToggleAnnotationLocked: (id: number) => void;
    rulerDrawMode: boolean;
    onSetRulerDrawMode: (active: boolean) => void;
    onRemoveRuler: (id: number) => void;
    onUpdateRuler: (id: number, updates: Partial<RulerConfig>) => void;
    selectedRulerId: number;
    onSelectRuler: (id: number) => void;
    onUpdateThicknessThresholds: (thresholds: ThicknessThresholds) => void;
}

export function AnnotationSection({
    vesselState, selectedAnnotationId, drawMode,
    onSetDrawMode, onAddAnnotation, onUpdateAnnotation, onRemoveAnnotation,
    onSelectAnnotation, onUpdateMeasurementConfig, getNextAnnotationId,
    onToggleAnnotationVisible, onToggleAnnotationLocked,
    rulerDrawMode, onSetRulerDrawMode, onRemoveRuler,
    onUpdateRuler, selectedRulerId, onSelectRuler,
    onUpdateThicknessThresholds,
}: AnnotationSectionProps) {
    const sel = vesselState.annotations.find(a => a.id === selectedAnnotationId);
    const selRuler = vesselState.rulers.find(r => r.id === selectedRulerId);
    const mc = vesselState.measurementConfig;

    const restrictionImageRef = useRef<HTMLInputElement>(null);

    const addManual = (type: AnnotationShapeType) => {
        const id = getNextAnnotationId();
        onAddAnnotation({
            id,
            name: type === 'restriction'
                ? `R${vesselState.annotations.filter(a => a.type === 'restriction').length + 1}`
                : `A${vesselState.annotations.filter(a => a.type === 'scan').length + 1}`,
            type,
            pos: vesselState.length / 2,
            angle: 90,
            width: 200,
            height: 150,
            color: type === 'restriction' ? '#facc15' : '#ff3333',
            lineWidth: 2,
            showLabel: true,
        });
        onSelectAnnotation(id);
    };

    const handleRestrictionImageUpload = (annId: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            onUpdateAnnotation(annId, {
                restrictionImage: reader.result as string,
                restrictionImageName: file.name,
            });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    return (
        <SubSection title="Annotations" count={vesselState.annotations.length + vesselState.rulers.length}>
            {/* Draw tool toggles */}
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px 0' }}>
                Select a tool then click-drag on the vessel to draw, or add manually
            </p>
            <div className="vm-toggle-group" style={{ marginBottom: 10 }}>
                <button
                    className={`vm-toggle-btn ${drawMode === 'scan' ? 'active' : ''}`}
                    onClick={() => onSetDrawMode(drawMode === 'scan' ? null : 'scan')}
                    title="Draw scan annotation"
                >
                    <Square size={14} /> Scan
                </button>
                <button
                    className={`vm-toggle-btn ${drawMode === 'restriction' ? 'active' : ''}`}
                    onClick={() => onSetDrawMode(drawMode === 'restriction' ? null : 'restriction')}
                    title="Draw restriction annotation"
                >
                    <ShieldAlert size={14} /> Restriction
                </button>
                <button
                    className={`vm-toggle-btn ${rulerDrawMode ? 'active' : ''}`}
                    onClick={() => onSetRulerDrawMode(!rulerDrawMode)}
                    title="Draw ruler measurement"
                >
                    <Ruler size={14} /> Ruler
                </button>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                <button className="vm-btn" onClick={() => addManual('scan')} style={{ flex: 1, fontSize: '0.75rem' }}>
                    + Scan
                </button>
                <button className="vm-btn" onClick={() => addManual('restriction')} style={{ flex: 1, fontSize: '0.75rem' }}>
                    + Restriction
                </button>
            </div>

            {/* Annotation list */}
            {vesselState.annotations.map((a) => (
                <React.Fragment key={a.id}>
                    <div
                        className={`vm-list-item ${a.id === selectedAnnotationId ? 'selected' : ''}`}
                        onClick={() => onSelectAnnotation(a.id)}
                        style={{ opacity: a.visible === false ? 0.4 : 1 }}
                    >
                        <div className="vm-list-item-info">
                            {a.severityLevel && (
                                <span
                                    className="vm-severity-dot"
                                    style={{ backgroundColor: { red: '#ff3333', yellow: '#ffaa00', green: '#33cc33' }[a.severityLevel] }}
                                />
                            )}
                            <strong>{a.name}</strong> &mdash; {a.type === 'restriction' ? '\u26A0' : '\u25A1'} {Math.round(a.width)}mm @ {Math.round(a.pos)}mm
                        </div>
                        <div style={{ display: 'flex', gap: 2 }}>
                            <button
                                className="vm-btn-icon"
                                onClick={e => { e.stopPropagation(); onUpdateAnnotation(a.id, { includeInReport: !(a.includeInReport ?? false) }); }}
                                title={a.includeInReport ? 'Included in report' : 'Not in report'}
                                style={{ opacity: a.includeInReport ? 1 : 0.3 }}
                            >
                                <FileText size={12} />
                            </button>
                            <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onToggleAnnotationVisible(a.id); }} title={a.visible === false ? 'Show' : 'Hide'} style={{ color: a.visible === false ? 'rgba(255,255,255,0.25)' : undefined }}>
                                {a.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onToggleAnnotationLocked(a.id); }} title={a.locked ? 'Unlock' : 'Lock'} style={{ color: a.locked ? '#3b82f6' : undefined }}>
                                {a.locked ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>
                            <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveAnnotation(a.id); }}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                    {a.id === selectedAnnotationId && sel && (
                        <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                            <div className="vm-control-group">
                                <div className="vm-label"><span>Name</span></div>
                                <input
                                    className="vm-input"
                                    value={sel.name}
                                    onChange={e => onUpdateAnnotation(sel.id, { name: e.target.value })}
                                />
                            </div>
                            <div className="vm-form-row">
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Position (mm)</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.pos}
                                        onChange={e => onUpdateAnnotation(sel.id, { pos: Number(e.target.value) })}
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
                                        onChange={e => onUpdateAnnotation(sel.id, { angle: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="vm-form-row">
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Width (mm)</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.width}
                                        min={10}
                                        onChange={e => onUpdateAnnotation(sel.id, { width: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Height (mm)</span></div>
                                    <input
                                        type="number"
                                        className="vm-input"
                                        value={sel.height}
                                        min={10}
                                        onChange={e => onUpdateAnnotation(sel.id, { height: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="vm-form-row">
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Color</span></div>
                                    <input
                                        type="color"
                                        className="vm-input"
                                        value={sel.color}
                                        onChange={e => onUpdateAnnotation(sel.id, { color: e.target.value })}
                                        style={{ height: 36, padding: 2 }}
                                    />
                                </div>
                                <div className="vm-control-group">
                                    <div className="vm-label"><span>Label</span></div>
                                    <button
                                        className={`vm-toggle-btn ${sel.showLabel ? 'active' : ''}`}
                                        onClick={() => onUpdateAnnotation(sel.id, { showLabel: !sel.showLabel })}
                                    >
                                        {sel.showLabel ? <Eye size={14} /> : <EyeOff size={14} />}
                                        {sel.showLabel ? ' On' : ' Off'}
                                    </button>
                                </div>
                            </div>
                            {sel.showLabel && (
                                <>
                                    <SliderRow
                                        label="Leader Length"
                                        value={sel.leaderLength ?? 2000}
                                        min={50}
                                        max={5000}
                                        step={10}
                                        onChange={v => onUpdateAnnotation(sel.id, { leaderLength: v, labelOffset: undefined })}
                                    />
                                    {sel.labelOffset && (
                                        <button
                                            className="vm-toggle-btn"
                                            style={{ marginTop: 4, width: '100%', fontSize: '0.7rem', padding: '3px 8px' }}
                                            onClick={() => onUpdateAnnotation(sel.id, { labelOffset: undefined })}
                                        >
                                            Reset Label Position
                                        </button>
                                    )}
                                </>
                            )}

                            {/* Restriction-specific controls */}
                            {sel.type === 'restriction' && (
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 8, paddingTop: 8 }}>
                                    <div className="vm-control-group">
                                        <div className="vm-label"><span>Restriction Notes</span></div>
                                        <textarea
                                            className="vm-input"
                                            placeholder="e.g. Nozzle S2, structural steelwork..."
                                            value={sel.restrictionNotes ?? ''}
                                            onChange={e => onUpdateAnnotation(sel.id, { restrictionNotes: e.target.value })}
                                            rows={3}
                                            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.8rem' }}
                                        />
                                    </div>
                                    <div className="vm-control-group" style={{ marginTop: 6 }}>
                                        <div className="vm-label"><span>Restriction Photo</span></div>
                                        {sel.restrictionImage ? (
                                            <div style={{ position: 'relative' }}>
                                                <img
                                                    src={sel.restrictionImage}
                                                    alt={sel.restrictionImageName ?? 'Restriction'}
                                                    style={{
                                                        width: '100%', borderRadius: 4,
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        maxHeight: 160, objectFit: 'cover',
                                                    }}
                                                />
                                                <button
                                                    className="vm-btn-icon"
                                                    onClick={() => onUpdateAnnotation(sel.id, { restrictionImage: undefined, restrictionImageName: undefined })}
                                                    title="Remove image"
                                                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', borderRadius: 4 }}
                                                >
                                                    <X size={14} />
                                                </button>
                                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                                                    {sel.restrictionImageName}
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                className="vm-btn"
                                                onClick={() => restrictionImageRef.current?.click()}
                                                style={{ width: '100%' }}
                                            >
                                                <Upload size={14} /> Upload Photo
                                            </button>
                                        )}
                                        <input
                                            ref={restrictionImageRef}
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={e => handleRestrictionImageUpload(sel.id, e)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </React.Fragment>
            ))}

            {/* Ruler list */}
            {vesselState.rulers.length > 0 && (
                <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                    <div className="vm-label" style={{ marginBottom: 4 }}><span style={{ fontWeight: 600 }}>Rulers</span></div>
                    {vesselState.rulers.map((r) => {
                        const isRulerSelected = selectedRulerId === r.id;
                        return (
                            <React.Fragment key={r.id}>
                                <div
                                    className={`vm-list-item ${isRulerSelected ? 'selected' : ''}`}
                                    onClick={() => onSelectRuler(isRulerSelected ? -1 : r.id)}
                                >
                                    <div className="vm-list-item-info">
                                        <strong>{r.name}</strong> &mdash; <Ruler size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                    </div>
                                    <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveRuler(r.id); }}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                {isRulerSelected && selRuler && (() => {
                                    const currentLength = Math.round(computeRulerDistance(selRuler, vesselState));
                                    return (
                                        <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                                            <div className="vm-form-row">
                                                <div className="vm-control-group">
                                                    <div className="vm-label"><span>Length (mm)</span></div>
                                                    <input
                                                        type="number"
                                                        className="vm-input"
                                                        value={currentLength}
                                                        min={1}
                                                        onChange={e => {
                                                            const newLen = Number(e.target.value);
                                                            if (newLen <= 0 || currentLength <= 0) return;
                                                            const ratio = newLen / currentLength;
                                                            const dPos = selRuler.endPos - selRuler.startPos;
                                                            const dAngle = selRuler.endAngle - selRuler.startAngle;
                                                            onUpdateRuler(selRuler.id, {
                                                                endPos: Math.round(selRuler.startPos + dPos * ratio),
                                                                endAngle: Math.round(selRuler.startAngle + dAngle * ratio),
                                                            });
                                                        }}
                                                    />
                                                </div>
                                                <div className="vm-control-group">
                                                    <div className="vm-label"><span>Color</span></div>
                                                    <input
                                                        type="color"
                                                        className="vm-input"
                                                        value={selRuler.color}
                                                        onChange={e => onUpdateRuler(selRuler.id, { color: e.target.value })}
                                                        style={{ height: 36, padding: 2 }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="vm-form-row">
                                                <div className="vm-control-group">
                                                    <div className="vm-label"><span>Label</span></div>
                                                    <button
                                                        className={`vm-toggle-btn ${selRuler.showLabel ? 'active' : ''}`}
                                                        onClick={() => onUpdateRuler(selRuler.id, { showLabel: !selRuler.showLabel })}
                                                    >
                                                        {selRuler.showLabel ? <Eye size={14} /> : <EyeOff size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {/* Measurement Config */}
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                <div className="vm-label" style={{ marginBottom: 6 }}><span style={{ fontWeight: 600 }}>Measurement Reference</span></div>
                <div className="vm-control-group">
                    <div className="vm-label"><span>Reference TL</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${mc.referenceTangent === 'left' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ referenceTangent: 'left' })}
                        >Left</button>
                        <button
                            className={`vm-toggle-btn ${mc.referenceTangent === 'right' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ referenceTangent: 'right' })}
                        >Right</button>
                    </div>
                </div>
                <div className="vm-control-group">
                    <div className="vm-label"><span>Circ. Direction</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${mc.circumDirection === 'CW' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ circumDirection: 'CW' })}
                        >CW</button>
                        <button
                            className={`vm-toggle-btn ${mc.circumDirection === 'CCW' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ circumDirection: 'CCW' })}
                        >CCW</button>
                    </div>
                </div>
                <div className="vm-control-group">
                    <div className="vm-label"><span>View From</span></div>
                    <div className="vm-toggle-group">
                        <button
                            className={`vm-toggle-btn ${mc.viewFromEnd === 'left' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ viewFromEnd: 'left' })}
                        >Left</button>
                        <button
                            className={`vm-toggle-btn ${mc.viewFromEnd === 'right' ? 'active' : ''}`}
                            onClick={() => onUpdateMeasurementConfig({ viewFromEnd: 'right' })}
                        >Right</button>
                    </div>
                </div>
            </div>

            {/* Thickness thresholds */}
            <ThresholdSection
                thresholds={vesselState.thicknessThresholds}
                onUpdate={onUpdateThicknessThresholds}
            />
        </SubSection>
    );
}
