import React, { useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import type { VesselState, PipeSegment, PipeSegmentType, NozzleConfig, NozzleOrientationMode } from '../types';
import { PIPE_SIZES, findClosestPipeSize } from '../types';
import { SubSection, SliderRow } from './SliderRow';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PipingSectionProps {
    vesselState: VesselState;
    selectedPipelineId: string;
    selectedSegmentIdx: number;
    selectedNozzleIndex: number;
    onAddNozzle: (nozzle: NozzleConfig) => void;
    onUpdateNozzle: (index: number, updates: Partial<NozzleConfig>) => void;
    onRemoveNozzle: (index: number) => void;
    onSelectNozzle: (index: number) => void;
    onAddPipeline: (nozzleIndex: number, segmentType: PipeSegmentType) => void;
    onAddSegment: (pipelineId: string, segmentType: PipeSegmentType) => void;
    onUpdateSegment: (pipelineId: string, segmentId: string, updates: Partial<PipeSegment>) => void;
    onRemoveSegment: (pipelineId: string, segmentIndex: number) => void;
    onRemovePipeline: (pipelineId: string) => void;
    onSelectPipeSegment: (pipelineId: string, segmentIndex: number) => void;
    isOpen?: boolean;
    onToggle?: () => void;
}

// ---------------------------------------------------------------------------
// Segment type labels and icons
// ---------------------------------------------------------------------------

const SEGMENT_TYPES: { type: PipeSegmentType; label: string }[] = [
    { type: 'straight', label: 'Straight' },
    { type: 'elbow', label: 'Elbow' },
    { type: 'reducer', label: 'Reducer' },
    { type: 'flange', label: 'Flange' },
    { type: 'cap', label: 'Cap' },
];

const LIBRARY_TYPES = SEGMENT_TYPES;

function segmentLabel(seg: PipeSegment): string {
    switch (seg.type) {
        case 'straight': return `Straight ${Math.round(seg.length ?? 0)}mm`;
        case 'elbow': return `Elbow ${Math.round(seg.angle ?? 90)}°`;
        case 'reducer': return `Reducer → ${Math.round(seg.endDiameter ?? 0)}mm`;
        case 'flange': return `Flange ${Math.round(seg.length ?? 25)}mm`;
        case 'cap': return `Cap (${seg.style ?? 'flat'})`;
        default: return seg.type;
    }
}

// ---------------------------------------------------------------------------
// PipingSection
// ---------------------------------------------------------------------------

export function PipingSection({
    vesselState,
    selectedPipelineId,
    selectedSegmentIdx,
    selectedNozzleIndex,
    onAddNozzle,
    onUpdateNozzle,
    onRemoveNozzle,
    onSelectNozzle,
    onAddPipeline,
    onAddSegment,
    onUpdateSegment,
    onRemoveSegment,
    onRemovePipeline,
    onSelectPipeSegment,
    isOpen,
    onToggle,
}: PipingSectionProps) {
    const { pipelines, nozzles } = vesselState;

    // Track which connection point accordions are expanded
    const [expandedPoints, setExpandedPoints] = useState<Set<number>>(() => new Set());
    const toggleExpanded = (index: number) => {
        setExpandedPoints(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    // All plain-pipe nozzles (connection points)
    const connectionPoints = nozzles
        .map((n, i) => ({ nozzle: n, index: i }))
        .filter(({ nozzle }) => nozzle.style === 'plain-pipe');

    // Map nozzle index → pipeline for quick lookup
    const pipelineByNozzle = new Map(pipelines.map(p => [p.nozzleIndex, p]));

    const availableNozzles = connectionPoints.filter(({ index }) => !pipelineByNozzle.has(index));

    const selectedNozzle = selectedNozzleIndex >= 0 ? nozzles[selectedNozzleIndex] : null;

    // Currently selected segment for editing
    const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
    const selectedSegment = selectedPipeline && selectedSegmentIdx >= 0
        ? selectedPipeline.segments[selectedSegmentIdx]
        : null;

    return (
        <SubSection title="Piping" count={connectionPoints.length} isOpen={isOpen} onToggle={onToggle}>
            {/* Parts library grid */}
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px 0' }}>
                Drag a part onto a connection point, or click to add
            </p>
            <div className="vm-library-grid" style={{ marginBottom: 10 }}>
                {LIBRARY_TYPES.map(({ type, label }) => (
                    <div
                        key={type}
                        className="vm-library-item"
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-pipe-part', JSON.stringify({ type }));
                            e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => {
                            if (selectedPipeline) {
                                onAddSegment(selectedPipeline.id, type);
                            } else if (availableNozzles.length > 0) {
                                onAddPipeline(availableNozzles[0].index, type);
                            }
                        }}
                        title={`Drag or click to add ${label} segment`}
                        style={{ userSelect: 'none' }}
                    >
                        <div className="size-label">{label}</div>
                    </div>
                ))}
            </div>

            {/* Add connection point (plain-pipe nozzle) */}
            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', margin: '0 0 4px 0' }}>
                Add a connection point:
            </p>
            <div className="vm-library-grid" style={{ marginBottom: 10 }}>
                {PIPE_SIZES.map(p => (
                    <div
                        key={p.nps}
                        className="vm-library-item"
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-nozzle-pipe', JSON.stringify({ ...p, style: 'plain-pipe' }));
                            e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => {
                            onAddNozzle({
                                name: `P${vesselState.nozzles.length + 1}`,
                                pos: vesselState.length / 2,
                                proj: p.od * 2,
                                angle: 90,
                                size: p.id,
                                style: 'plain-pipe',
                            });
                        }}
                        title={`Drag onto vessel or click to add ${p.nps} connection point`}
                        style={{ userSelect: 'none' }}
                    >
                        <div className="size-label">{p.nps}</div>
                        <div className="size-mm">{p.od}mm</div>
                    </div>
                ))}
            </div>

            {/* Connection point accordions — each groups nozzle + its pipeline segments */}
            {connectionPoints.map(({ nozzle, index }) => {
                const pl = pipelineByNozzle.get(index);
                const isExpanded = expandedPoints.has(index);
                const isNozzleSelected = index === selectedNozzleIndex;
                const segCount = pl ? pl.segments.length : 0;

                return (
                    <div key={index} className="vm-pipe-accordion" style={{ marginBottom: 6 }}>
                        {/* Accordion header — connection point */}
                        <div
                            className={`vm-pipe-accordion-header ${isNozzleSelected ? 'selected' : ''}`}
                            onClick={() => { toggleExpanded(index); onSelectNozzle(index); }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                {isExpanded
                                    ? <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
                                    : <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
                                }
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'white' }}>
                                        {nozzle.name}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)' }}>
                                        {findClosestPipeSize(nozzle.size).nps} @ {Math.round(nozzle.pos)}mm, {Math.round(nozzle.angle)}&deg;
                                        {segCount > 0 && <> &middot; {segCount} segment{segCount !== 1 ? 's' : ''}</>}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                {!pl && (
                                    <button
                                        className="vm-btn-icon"
                                        title="Start pipeline with straight segment"
                                        onClick={(e) => { e.stopPropagation(); onAddPipeline(index, 'straight'); setExpandedPoints(prev => new Set(prev).add(index)); }}
                                    >
                                        <Plus size={14} />
                                    </button>
                                )}
                                <button
                                    className="vm-btn-icon"
                                    title="Remove connection point and pipeline"
                                    onClick={(e) => { e.stopPropagation(); onRemoveNozzle(index); }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Expanded content */}
                        {isExpanded && (
                            <div className="vm-pipe-accordion-body">
                                {/* Nozzle edit form */}
                                {isNozzleSelected && selectedNozzle && (
                                    <div className="vm-form edit-mode" style={{ margin: '6px 0', position: 'relative', zIndex: 1 }} onClick={e => e.stopPropagation()}>
                                        <div className="vm-control-group">
                                            <div className="vm-label"><span>Name</span></div>
                                            <input
                                                className="vm-input"
                                                value={selectedNozzle.name}
                                                onChange={e => onUpdateNozzle(selectedNozzleIndex, { name: e.target.value })}
                                            />
                                        </div>
                                        <div className="vm-form-row">
                                            <div className="vm-control-group">
                                                <div className="vm-label"><span>Position</span></div>
                                                <input
                                                    type="number"
                                                    className="vm-input"
                                                    value={selectedNozzle.pos}
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
                                                    value={selectedNozzle.angle}
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
                                                    value={selectedNozzle.proj}
                                                    onChange={e => onUpdateNozzle(selectedNozzleIndex, { proj: Number(e.target.value) })}
                                                />
                                            </div>
                                            <div className="vm-control-group">
                                                <div className="vm-label"><span>Size (ID)</span></div>
                                                <input
                                                    type="number"
                                                    className="vm-input"
                                                    value={selectedNozzle.size}
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
                                                        className={`vm-toggle-btn ${(selectedNozzle.orientationMode || 'radial') === mode ? 'active' : ''}`}
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
                                    </div>
                                )}

                                {/* Pipeline segments */}
                                {pl && (
                                    <>
                                        {pl.segments.map((seg, si) => {
                                            const isSegSelected = pl.id === selectedPipelineId && si === selectedSegmentIdx;
                                            return (
                                                <React.Fragment key={seg.id}>
                                                    <div
                                                        className={`vm-list-item vm-pipe-segment ${isSegSelected ? 'selected' : ''}`}
                                                        onClick={() => onSelectPipeSegment(pl.id, si)}
                                                    >
                                                        <div className="vm-list-item-info">
                                                            {si + 1}. {segmentLabel(seg)}
                                                        </div>
                                                        <button
                                                            className="vm-btn-icon"
                                                            onClick={(e) => { e.stopPropagation(); onRemoveSegment(pl.id, si); }}
                                                            title="Remove this and all downstream segments"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>

                                                    {isSegSelected && selectedSegment && (
                                                        <div className="vm-form edit-mode" style={{ marginTop: 4, marginLeft: 8, position: 'relative', zIndex: 1 }} onClick={e => e.stopPropagation()}>
                                                            <SliderRow
                                                                label="Rotation"
                                                                value={seg.rotation}
                                                                min={0}
                                                                max={360}
                                                                step={5}
                                                                unit="°"
                                                                onChange={(v) => onUpdateSegment(pl.id, seg.id, { rotation: v })}
                                                            />
                                                            {seg.type === 'straight' && (
                                                                <SliderRow
                                                                    label="Length"
                                                                    value={seg.length ?? pl.pipeDiameter * 3}
                                                                    min={10}
                                                                    max={5000}
                                                                    step={10}
                                                                    unit="mm"
                                                                    onChange={(v) => onUpdateSegment(pl.id, seg.id, { length: v })}
                                                                />
                                                            )}
                                                            {seg.type === 'elbow' && (
                                                                <>
                                                                    <SliderRow
                                                                        label="Angle"
                                                                        value={seg.angle ?? 90}
                                                                        min={5}
                                                                        max={180}
                                                                        step={5}
                                                                        unit="°"
                                                                        onChange={(v) => onUpdateSegment(pl.id, seg.id, { angle: v })}
                                                                    />
                                                                    <SliderRow
                                                                        label="Bend Radius"
                                                                        value={seg.bendRadius ?? pl.pipeDiameter * 1.5}
                                                                        min={Math.round(pl.pipeDiameter)}
                                                                        max={Math.round(pl.pipeDiameter * 5)}
                                                                        step={10}
                                                                        unit="mm"
                                                                        onChange={(v) => onUpdateSegment(pl.id, seg.id, { bendRadius: v })}
                                                                    />
                                                                </>
                                                            )}
                                                            {seg.type === 'reducer' && (
                                                                <>
                                                                    <SliderRow
                                                                        label="Length"
                                                                        value={seg.length ?? pl.pipeDiameter * 2}
                                                                        min={10}
                                                                        max={2000}
                                                                        step={10}
                                                                        unit="mm"
                                                                        onChange={(v) => onUpdateSegment(pl.id, seg.id, { length: v })}
                                                                    />
                                                                    <SliderRow
                                                                        label="End Diameter"
                                                                        value={seg.endDiameter ?? pl.pipeDiameter * 0.75}
                                                                        min={20}
                                                                        max={Math.round(pl.pipeDiameter * 1.5)}
                                                                        step={5}
                                                                        unit="mm"
                                                                        onChange={(v) => onUpdateSegment(pl.id, seg.id, { endDiameter: v })}
                                                                    />
                                                                </>
                                                            )}
                                                            {seg.type === 'flange' && (
                                                                <SliderRow
                                                                    label="Thickness"
                                                                    value={seg.length ?? 25}
                                                                    min={5}
                                                                    max={100}
                                                                    step={1}
                                                                    unit="mm"
                                                                    onChange={(v) => onUpdateSegment(pl.id, seg.id, { length: v })}
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}

                                        {/* Add segment / clear pipeline buttons */}
                                        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                            {LIBRARY_TYPES.map(({ type, label }) => (
                                                <button
                                                    key={type}
                                                    className="vm-btn-sm"
                                                    onClick={() => onAddSegment(pl.id, type)}
                                                    title={`Add ${label}`}
                                                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                                                >
                                                    + {label}
                                                </button>
                                            ))}
                                            <button
                                                className="vm-btn-sm"
                                                onClick={() => onRemovePipeline(pl.id)}
                                                title="Remove all segments"
                                                style={{ fontSize: '0.7rem', padding: '2px 6px', marginLeft: 'auto', color: 'var(--color-danger, #ef4444)' }}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </>
                                )}

                                {/* No pipeline yet — offer segment type buttons to start one */}
                                {!pl && (
                                    <div style={{ padding: '6px 0' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
                                            No pipeline attached. Start with:
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {LIBRARY_TYPES.map(({ type, label }) => (
                                                <button
                                                    key={type}
                                                    className="vm-btn-sm"
                                                    onClick={() => { onAddPipeline(index, type); setExpandedPoints(prev => new Set(prev).add(index)); }}
                                                    title={`Start pipeline with ${label}`}
                                                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                                                >
                                                    + {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Delete connection point */}
                                <button
                                    className="vm-btn-sm"
                                    onClick={() => onRemoveNozzle(index)}
                                    title="Delete this connection point and its pipeline"
                                    style={{
                                        fontSize: '0.7rem',
                                        padding: '3px 8px',
                                        marginTop: 8,
                                        color: 'var(--color-danger, #ef4444)',
                                        width: '100%',
                                    }}
                                >
                                    Delete Connection Point
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

        </SubSection>
    );
}
