import { useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import type { VesselState, NozzleConfig, PipeSegment, PipeSegmentType } from '../../types';
import { PIPE_SIZES, findClosestPipeSize } from '../../types';
import { LIBRARY_TYPES, getConnectionPoints } from './helpers';
import { NozzleEditForm } from './NozzleEditForm';
import { PipeSegmentEditor } from './PipeSegmentEditor';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ConnectionPointListProps {
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
}

// ---------------------------------------------------------------------------
// ConnectionPointList — parts library + per-nozzle connection-point accordions.
// ---------------------------------------------------------------------------

export function ConnectionPointList({
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
}: ConnectionPointListProps) {
  const { pipelines, nozzles } = vesselState;

  // Appendage names for the "on <body>" suffix on appendage-mounted connection points.
  const appendageNameById = new Map(vesselState.appendages.map((a) => [a.id, a.name]));

  // Track which connection point accordions are expanded
  const [expandedPoints, setExpandedPoints] = useState<Set<number>>(() => new Set());
  const toggleExpanded = (index: number) => {
    setExpandedPoints((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // All plain-pipe nozzles (connection points)
  const connectionPoints = getConnectionPoints(nozzles);

  // Map nozzle index → pipeline for quick lookup
  const pipelineByNozzle = new Map(
    pipelines.filter((p) => p.nozzleIndex >= 0).map((p) => [p.nozzleIndex, p])
  );

  const availableNozzles = connectionPoints.filter(({ index }) => !pipelineByNozzle.has(index));

  const selectedNozzle = selectedNozzleIndex >= 0 ? nozzles[selectedNozzleIndex] : null;

  // Currently selected pipeline (drives the parts-library add target)
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  return (
    <>
      {/* Parts library grid — vessel-attached pipes only */}
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
        {PIPE_SIZES.map((p) => (
          <div
            key={p.nps}
            className="vm-library-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                'application/x-nozzle-pipe',
                JSON.stringify({ ...p, style: 'plain-pipe' })
              );
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
              onClick={() => {
                toggleExpanded(index);
                onSelectNozzle(index);
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                {isExpanded ? (
                  <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
                ) : (
                  <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'white' }}>
                    {nozzle.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)' }}>
                    {findClosestPipeSize(nozzle.size).nps} @ {Math.round(nozzle.pos)}mm,{' '}
                    {Math.round(nozzle.angle)}&deg;
                    {nozzle.bodyId && appendageNameById.has(nozzle.bodyId) && (
                      <> &middot; on {appendageNameById.get(nozzle.bodyId)}</>
                    )}
                    {segCount > 0 && (
                      <>
                        {' '}
                        &middot; {segCount} segment{segCount !== 1 ? 's' : ''}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                {!pl && (
                  <button
                    className="vm-btn-icon"
                    title="Start pipeline with straight segment"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddPipeline(index, 'straight');
                      setExpandedPoints((prev) => new Set(prev).add(index));
                    }}
                  >
                    <Plus size={14} />
                  </button>
                )}
                <button
                  className="vm-btn-icon"
                  title="Remove connection point and pipeline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveNozzle(index);
                  }}
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
                  <NozzleEditForm
                    nozzle={selectedNozzle}
                    index={selectedNozzleIndex}
                    vesselState={vesselState}
                    onUpdateNozzle={onUpdateNozzle}
                  />
                )}

                {/* Pipeline segments */}
                {pl && (
                  <PipeSegmentEditor
                    pipeline={pl}
                    selectedPipelineId={selectedPipelineId}
                    selectedSegmentIdx={selectedSegmentIdx}
                    onSelectPipeSegment={onSelectPipeSegment}
                    onRemoveSegment={onRemoveSegment}
                    onUpdateSegment={onUpdateSegment}
                    onAddSegment={onAddSegment}
                    onRemovePipeline={onRemovePipeline}
                    clearTitle="Remove all segments"
                  />
                )}

                {/* No pipeline yet — offer segment type buttons to start one */}
                {!pl && (
                  <div style={{ padding: '6px 0' }}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'rgba(255,255,255,0.35)',
                        marginBottom: 6,
                      }}
                    >
                      No pipeline attached. Start with:
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {LIBRARY_TYPES.map(({ type, label }) => (
                        <button
                          key={type}
                          className="vm-btn-sm"
                          onClick={() => {
                            onAddPipeline(index, type);
                            setExpandedPoints((prev) => new Set(prev).add(index));
                          }}
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
    </>
  );
}
