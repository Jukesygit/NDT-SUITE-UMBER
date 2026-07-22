import React from 'react';
import { Trash2 } from 'lucide-react';
import type { Pipeline, PipeSegment, PipeSegmentType } from '../../types';
import { SliderRow } from '../SliderRow';
import { LIBRARY_TYPES, segmentLabel } from './helpers';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PipeSegmentEditorProps {
  pipeline: Pipeline;
  selectedPipelineId: string;
  selectedSegmentIdx: number;
  onSelectPipeSegment: (pipelineId: string, segmentIndex: number) => void;
  onRemoveSegment: (pipelineId: string, segmentIndex: number) => void;
  onUpdateSegment: (pipelineId: string, segmentId: string, updates: Partial<PipeSegment>) => void;
  onAddSegment: (pipelineId: string, segmentType: PipeSegmentType) => void;
  onRemovePipeline: (pipelineId: string) => void;
  /** Title for the trailing Clear button (differs between connection points and free pipes). */
  clearTitle: string;
}

// ---------------------------------------------------------------------------
// PipeSegmentEditor — segment list + per-segment edit form + add/clear buttons.
// Shared verbatim by ConnectionPointList and FreePipelineList.
// ---------------------------------------------------------------------------

export function PipeSegmentEditor({
  pipeline,
  selectedPipelineId,
  selectedSegmentIdx,
  onSelectPipeSegment,
  onRemoveSegment,
  onUpdateSegment,
  onAddSegment,
  onRemovePipeline,
  clearTitle,
}: PipeSegmentEditorProps) {
  return (
    <>
      {pipeline.segments.map((seg, si) => {
        const isSegSelected = pipeline.id === selectedPipelineId && si === selectedSegmentIdx;
        return (
          <React.Fragment key={seg.id}>
            <div
              className={`vm-list-item vm-pipe-segment ${isSegSelected ? 'selected' : ''}`}
              onClick={() => onSelectPipeSegment(pipeline.id, si)}
            >
              <div className="vm-list-item-info">
                {si + 1}. {segmentLabel(seg)}
              </div>
              <button
                className="vm-btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveSegment(pipeline.id, si);
                }}
                title="Remove this and all downstream segments"
              >
                <Trash2 size={12} />
              </button>
            </div>

            {isSegSelected && (
              <div
                className="vm-form edit-mode"
                style={{ marginTop: 4, marginLeft: 8, position: 'relative', zIndex: 1 }}
                onClick={(e) => e.stopPropagation()}
              >
                <SliderRow
                  label="Rotation"
                  value={seg.rotation}
                  min={0}
                  max={360}
                  step={5}
                  unit="°"
                  onChange={(v) => onUpdateSegment(pipeline.id, seg.id, { rotation: v })}
                />
                {seg.type === 'straight' && (
                  <SliderRow
                    label="Length"
                    value={seg.length ?? pipeline.pipeDiameter * 3}
                    min={10}
                    max={5000}
                    step={10}
                    unit="mm"
                    onChange={(v) => onUpdateSegment(pipeline.id, seg.id, { length: v })}
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
                      onChange={(v) => onUpdateSegment(pipeline.id, seg.id, { angle: v })}
                    />
                    <SliderRow
                      label="Bend Radius"
                      value={seg.bendRadius ?? pipeline.pipeDiameter * 1.5}
                      min={Math.round(pipeline.pipeDiameter)}
                      max={Math.round(pipeline.pipeDiameter * 5)}
                      step={10}
                      unit="mm"
                      onChange={(v) => onUpdateSegment(pipeline.id, seg.id, { bendRadius: v })}
                    />
                  </>
                )}
                {seg.type === 'reducer' && (
                  <>
                    <SliderRow
                      label="Length"
                      value={seg.length ?? pipeline.pipeDiameter * 2}
                      min={10}
                      max={2000}
                      step={10}
                      unit="mm"
                      onChange={(v) => onUpdateSegment(pipeline.id, seg.id, { length: v })}
                    />
                    <SliderRow
                      label="End Diameter"
                      value={seg.endDiameter ?? pipeline.pipeDiameter * 0.75}
                      min={20}
                      max={Math.round(pipeline.pipeDiameter * 1.5)}
                      step={5}
                      unit="mm"
                      onChange={(v) => onUpdateSegment(pipeline.id, seg.id, { endDiameter: v })}
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
                    onChange={(v) => onUpdateSegment(pipeline.id, seg.id, { length: v })}
                  />
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Add segment / clear pipeline buttons */}
      <div
        style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}
      >
        {LIBRARY_TYPES.map(({ type, label }) => (
          <button
            key={type}
            className="vm-btn-sm"
            onClick={() => onAddSegment(pipeline.id, type)}
            title={`Add ${label}`}
            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
          >
            + {label}
          </button>
        ))}
        <button
          className="vm-btn-sm"
          onClick={() => onRemovePipeline(pipeline.id)}
          title={clearTitle}
          style={{
            fontSize: '0.7rem',
            padding: '2px 6px',
            marginLeft: 'auto',
            color: 'var(--color-danger, #ef4444)',
          }}
        >
          Clear
        </button>
      </div>
    </>
  );
}
