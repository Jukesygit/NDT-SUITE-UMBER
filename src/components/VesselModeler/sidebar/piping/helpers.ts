import type { NozzleConfig, Pipeline, PipeSegment, PipeSegmentType } from '../../types';

// ---------------------------------------------------------------------------
// Segment type labels and library grid entries
// ---------------------------------------------------------------------------

export const SEGMENT_TYPES: { type: PipeSegmentType; label: string }[] = [
  { type: 'straight', label: 'Straight' },
  { type: 'elbow', label: 'Elbow' },
  { type: 'reducer', label: 'Reducer' },
  { type: 'flange', label: 'Flange' },
  { type: 'cap', label: 'Cap' },
];

export const LIBRARY_TYPES = SEGMENT_TYPES;

export function segmentLabel(seg: PipeSegment): string {
  switch (seg.type) {
    case 'straight':
      return `Straight ${Math.round(seg.length ?? 0)}mm`;
    case 'elbow':
      return `Elbow ${Math.round(seg.angle ?? 90)}°`;
    case 'reducer':
      return `Reducer → ${Math.round(seg.endDiameter ?? 0)}mm`;
    case 'flange':
      return `Flange ${Math.round(seg.length ?? 25)}mm`;
    case 'cap':
      return `Cap (${seg.style ?? 'flat'})`;
    default:
      return seg.type;
  }
}

// ---------------------------------------------------------------------------
// Pure derivations shared by the coordinator + list sub-components
// ---------------------------------------------------------------------------

/** All plain-pipe nozzles (connection points), paired with their flat-array index. */
export function getConnectionPoints(
  nozzles: NozzleConfig[]
): { nozzle: NozzleConfig; index: number }[] {
  return nozzles
    .map((n, i) => ({ nozzle: n, index: i }))
    .filter(({ nozzle }) => nozzle.style === 'plain-pipe');
}

/** Free-standing pipelines (not attached to a nozzle). */
export function getFreePipelines(pipelines: Pipeline[]): Pipeline[] {
  return pipelines.filter((p) => !p.nozzleId);
}
