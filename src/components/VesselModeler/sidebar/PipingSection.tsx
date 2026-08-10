import type { VesselState, FreeOrigin, PipeSegment, PipeSegmentType, NozzleConfig } from '../types';
import { SubSection } from './SliderRow';
import { getConnectionPoints, getFreePipelines } from './piping/helpers';
import { ConnectionPointList } from './piping/ConnectionPointList';
import { FreePipelineList } from './piping/FreePipelineList';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PipingSectionProps {
  vesselState: VesselState;
  selectedPipelineId: string;
  selectedSegmentIdx: number;
  selectedNozzleIndex: number;
  onAddNozzle: (nozzle: Omit<NozzleConfig, 'id'>) => void;
  onUpdateNozzle: (index: number, updates: Partial<NozzleConfig>) => void;
  onRemoveNozzle: (index: number) => void;
  onSelectNozzle: (index: number) => void;
  onAddPipeline: (nozzleIndex: number, segmentType: PipeSegmentType) => void;
  onAddFreePipeline: (pipeDiameter: number, segmentType: PipeSegmentType) => void;
  onUpdateFreePipelineOrigin: (pipelineId: string, updates: Partial<FreeOrigin>) => void;
  onAddSegment: (pipelineId: string, segmentType: PipeSegmentType) => void;
  onUpdateSegment: (pipelineId: string, segmentId: string, updates: Partial<PipeSegment>) => void;
  onRemoveSegment: (pipelineId: string, segmentIndex: number) => void;
  onRemovePipeline: (pipelineId: string) => void;
  onSelectPipeSegment: (pipelineId: string, segmentIndex: number) => void;
  /** When true, hides vessel-attached pipe UI and shows only free pipes */
  pipeOnly?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}

// ---------------------------------------------------------------------------
// PipingSection — thin coordinator. Connection points and free pipes live in
// their own sub-components under ./piping.
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
  onAddFreePipeline,
  onUpdateFreePipelineOrigin,
  onAddSegment,
  onUpdateSegment,
  onRemoveSegment,
  onRemovePipeline,
  onSelectPipeSegment,
  pipeOnly,
  isOpen,
  onToggle,
}: PipingSectionProps) {
  const { pipelines, nozzles } = vesselState;

  const totalCount = getConnectionPoints(nozzles).length + getFreePipelines(pipelines).length;

  return (
    <SubSection title="Piping" count={totalCount} isOpen={isOpen} onToggle={onToggle}>
      {/* Vessel-attached connection points + parts library — vessel mode only */}
      {!pipeOnly && (
        <ConnectionPointList
          vesselState={vesselState}
          selectedPipelineId={selectedPipelineId}
          selectedSegmentIdx={selectedSegmentIdx}
          selectedNozzleIndex={selectedNozzleIndex}
          onAddNozzle={onAddNozzle}
          onUpdateNozzle={onUpdateNozzle}
          onRemoveNozzle={onRemoveNozzle}
          onSelectNozzle={onSelectNozzle}
          onAddPipeline={onAddPipeline}
          onAddSegment={onAddSegment}
          onUpdateSegment={onUpdateSegment}
          onRemoveSegment={onRemoveSegment}
          onRemovePipeline={onRemovePipeline}
          onSelectPipeSegment={onSelectPipeSegment}
        />
      )}

      {/* Free Pipes (standalone, not attached to vessel) — both modes */}
      <FreePipelineList
        vesselState={vesselState}
        selectedPipelineId={selectedPipelineId}
        selectedSegmentIdx={selectedSegmentIdx}
        onAddFreePipeline={onAddFreePipeline}
        onUpdateFreePipelineOrigin={onUpdateFreePipelineOrigin}
        onAddSegment={onAddSegment}
        onUpdateSegment={onUpdateSegment}
        onRemoveSegment={onRemoveSegment}
        onRemovePipeline={onRemovePipeline}
        onSelectPipeSegment={onSelectPipeSegment}
        pipeOnly={pipeOnly}
      />
    </SubSection>
  );
}
