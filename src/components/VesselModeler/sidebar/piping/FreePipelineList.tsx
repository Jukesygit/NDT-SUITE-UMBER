import { useState } from 'react';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { VesselState, FreeOrigin, PipeSegment, PipeSegmentType } from '../../types';
import { PIPE_SIZES } from '../../types';
import { getFreePipelines } from './helpers';
import { PipeSegmentEditor } from './PipeSegmentEditor';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FreePipelineListProps {
  vesselState: VesselState;
  selectedPipelineId: string;
  selectedSegmentIdx: number;
  onAddFreePipeline: (pipeDiameter: number, segmentType: PipeSegmentType) => void;
  onUpdateFreePipelineOrigin: (pipelineId: string, updates: Partial<FreeOrigin>) => void;
  onAddSegment: (pipelineId: string, segmentType: PipeSegmentType) => void;
  onUpdateSegment: (pipelineId: string, segmentId: string, updates: Partial<PipeSegment>) => void;
  onRemoveSegment: (pipelineId: string, segmentIndex: number) => void;
  onRemovePipeline: (pipelineId: string) => void;
  onSelectPipeSegment: (pipelineId: string, segmentIndex: number) => void;
  /** When true, drops the divider styling and relabels the section "Pipes". */
  pipeOnly?: boolean;
}

// ---------------------------------------------------------------------------
// FreePipelineList — standalone pipes (nozzleIndex === -1), origin + segments.
// ---------------------------------------------------------------------------

export function FreePipelineList({
  vesselState,
  selectedPipelineId,
  selectedSegmentIdx,
  onAddFreePipeline,
  onUpdateFreePipelineOrigin,
  onAddSegment,
  onUpdateSegment,
  onRemoveSegment,
  onRemovePipeline,
  onSelectPipeSegment,
  pipeOnly,
}: FreePipelineListProps) {
  const { pipelines } = vesselState;

  // Track which free pipe accordions are expanded
  const [expandedFreePipes, setExpandedFreePipes] = useState<Set<string>>(() => new Set());
  const toggleFreePipeExpanded = (id: string) => {
    setExpandedFreePipes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Free-standing pipelines (not attached to a nozzle)
  const freePipelines = getFreePipelines(pipelines);

  return (
    <div
      style={
        pipeOnly
          ? {}
          : { borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 12, paddingTop: 10 }
      }
    >
      <p
        style={{
          fontSize: '0.75rem',
          color: 'rgba(255,255,255,0.5)',
          fontWeight: 600,
          margin: '0 0 6px 0',
        }}
      >
        {pipeOnly ? 'Pipes' : 'Free Pipes'}
      </p>
      <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', margin: '0 0 6px 0' }}>
        Add a standalone pipe (no vessel required):
      </p>
      <div className="vm-library-grid" style={{ marginBottom: 10 }}>
        {PIPE_SIZES.map((p) => (
          <div
            key={`free-${p.nps}`}
            className="vm-library-item"
            onClick={() => onAddFreePipeline(p.od, 'straight')}
            title={`Add free-standing ${p.nps} pipe`}
            style={{ userSelect: 'none', cursor: 'pointer' }}
          >
            <div className="size-label">{p.nps}</div>
            <div className="size-mm">{p.od}mm</div>
          </div>
        ))}
      </div>

      {freePipelines.map((fp) => {
        const isExpanded = expandedFreePipes.has(fp.id);
        const isSelected = fp.id === selectedPipelineId;
        const closestSize = PIPE_SIZES.reduce(
          (best, s) =>
            Math.abs(s.od - fp.pipeDiameter) < Math.abs(best.od - fp.pipeDiameter) ? s : best,
          PIPE_SIZES[0]
        );
        const origin = fp.freeOrigin ?? {
          position: [0, 0, 0] as [number, number, number],
          direction: [0, 1, 0] as [number, number, number],
        };

        return (
          <div key={fp.id} className="vm-pipe-accordion" style={{ marginBottom: 6 }}>
            <div
              className={`vm-pipe-accordion-header ${isSelected ? 'selected' : ''}`}
              onClick={() => {
                toggleFreePipeExpanded(fp.id);
                onSelectPipeSegment(fp.id, fp.segments.length > 0 ? 0 : -1);
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
                    Free Pipe &middot; {closestSize.nps}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)' }}>
                    {fp.segments.length} segment{fp.segments.length !== 1 ? 's' : ''} &middot;{' '}
                    {Math.round(fp.pipeDiameter)}mm OD
                  </div>
                </div>
              </div>
              <button
                className="vm-btn-icon"
                title="Remove this pipe"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemovePipeline(fp.id);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {isExpanded && (
              <div className="vm-pipe-accordion-body">
                {/* Origin position controls */}
                <div
                  className="vm-form edit-mode"
                  style={{ margin: '6px 0', position: 'relative', zIndex: 1 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}
                  >
                    Origin (mm)
                  </div>
                  <div className="vm-form-row">
                    {(['x', 'y', 'z'] as const).map((axis, i) => (
                      <div key={axis} className="vm-control-group">
                        <div className="vm-label">
                          <span>{axis.toUpperCase()}</span>
                        </div>
                        <input
                          type="number"
                          className="vm-input"
                          value={origin.position[i]}
                          onChange={(e) => {
                            const pos: [number, number, number] = [...origin.position];
                            pos[i] = Number(e.target.value);
                            onUpdateFreePipelineOrigin(fp.id, { position: pos });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'rgba(255,255,255,0.5)',
                      marginBottom: 4,
                      marginTop: 6,
                    }}
                  >
                    Direction
                  </div>
                  <div className="vm-toggle-group">
                    {(
                      [
                        ['+X', [1, 0, 0]],
                        ['-X', [-1, 0, 0]],
                        ['+Y', [0, 1, 0]],
                        ['-Y', [0, -1, 0]],
                        ['+Z', [0, 0, 1]],
                        ['-Z', [0, 0, -1]],
                      ] as [string, [number, number, number]][]
                    ).map(([label, dir]) => {
                      const isActive =
                        origin.direction[0] === dir[0] &&
                        origin.direction[1] === dir[1] &&
                        origin.direction[2] === dir[2];
                      return (
                        <button
                          key={label}
                          className={`vm-toggle-btn ${isActive ? 'active' : ''}`}
                          onClick={() => onUpdateFreePipelineOrigin(fp.id, { direction: dir })}
                          title={`Pipe direction: ${label}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Segments list (reuses same pattern as nozzle-attached) */}
                <PipeSegmentEditor
                  pipeline={fp}
                  selectedPipelineId={selectedPipelineId}
                  selectedSegmentIdx={selectedSegmentIdx}
                  onSelectPipeSegment={onSelectPipeSegment}
                  onRemoveSegment={onRemoveSegment}
                  onUpdateSegment={onUpdateSegment}
                  onAddSegment={onAddSegment}
                  onRemovePipeline={onRemovePipeline}
                  clearTitle="Remove this pipe"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
