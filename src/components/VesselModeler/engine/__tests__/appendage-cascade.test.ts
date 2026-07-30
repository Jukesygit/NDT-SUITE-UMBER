// =============================================================================
// appendage-cascade — deleting an appendage removes its nozzles + pipelines
// =============================================================================
// Guards P2-T1's removeAppendage cascade: deleting an appendage drops every
// nozzle whose bodyId matches AND their pipelines, remapping the remaining
// pipelines' nozzleIndex exactly as the single-nozzle removeNozzle cascade does.
// Main-shell nozzles and pipelines must be left untouched.
// =============================================================================

import { describe, it, expect } from 'vitest';

import type { AppendageConfig, NozzleConfig, Pipeline } from '../../types';
import { cascadeRemoveAppendage } from '../appendage-cascade';

function nozzle(name: string, bodyId?: string): NozzleConfig {
  return { name, pos: 100, proj: 200, angle: 90, size: 100, bodyId };
}

function pipeline(id: string, nozzleIndex: number): Pipeline {
  return {
    id,
    nozzleIndex,
    pipeDiameter: 100,
    segments: [{ id: `${id}-s`, type: 'straight', rotation: 0, length: 300 }],
  };
}

const appendages: AppendageConfig[] = [
  {
    id: 'app-1',
    name: 'Sump',
    mountPos: 3000,
    mountAngle: 270,
    diameter: 800,
    length: 1200,
    endClosure: 'flat',
  },
  {
    id: 'app-2',
    name: 'Boot',
    mountPos: 1500,
    mountAngle: 90,
    diameter: 600,
    length: 900,
    endClosure: 'flat',
  },
];

describe('cascadeRemoveAppendage', () => {
  it('removes the body, its nozzles, and their pipelines with correct index shifting', () => {
    // Nozzles: 0 main, 1 app-1, 2 app-1, 3 main. Each has a pipeline.
    const state = {
      appendages,
      nozzles: [nozzle('N0'), nozzle('N1', 'app-1'), nozzle('N2', 'app-1'), nozzle('N3')],
      pipelines: [pipeline('p0', 0), pipeline('p1', 1), pipeline('p2', 2), pipeline('p3', 3)],
    };

    const result = cascadeRemoveAppendage(state, 0);

    // app-1 gone, app-2 kept.
    expect(result.appendages.map((a) => a.id)).toEqual(['app-2']);

    // Only the two main nozzles remain, order preserved.
    expect(result.nozzles.map((n) => n.name)).toEqual(['N0', 'N3']);
    expect(result.nozzles.every((n) => n.bodyId === undefined)).toBe(true);

    // The app-1 pipelines are gone; the main pipelines remain, re-indexed to the
    // new nozzle positions (N0 -> 0, N3 -> 1).
    expect(result.pipelines.map((p) => p.id)).toEqual(['p0', 'p3']);
    const byId = new Map(result.pipelines.map((p) => [p.id, p.nozzleIndex]));
    expect(byId.get('p0')).toBe(0);
    expect(byId.get('p3')).toBe(1);
    expect(result.nozzles[byId.get('p3')!].name).toBe('N3');
  });

  it('preserves free-standing pipelines (nozzleIndex -1) untouched', () => {
    const state = {
      appendages,
      nozzles: [nozzle('N0'), nozzle('N1', 'app-1')],
      pipelines: [
        {
          ...pipeline('free', -1),
          freeOrigin: { position: [0, 0, 0], direction: [0, 1, 0] },
        } as Pipeline,
        pipeline('p1', 1),
      ],
    };

    const result = cascadeRemoveAppendage(state, 0);

    expect(result.pipelines.map((p) => p.id)).toEqual(['free']);
    expect(result.pipelines[0].nozzleIndex).toBe(-1);
  });

  it('leaves nozzles and pipelines untouched when the body has no attached nozzles', () => {
    const state = {
      appendages,
      nozzles: [nozzle('N0'), nozzle('N1', 'app-1')],
      pipelines: [pipeline('p1', 1)],
    };

    // Remove app-2, which has no nozzles.
    const result = cascadeRemoveAppendage(state, 1);

    expect(result.appendages.map((a) => a.id)).toEqual(['app-1']);
    expect(result.nozzles).toBe(state.nozzles);
    expect(result.pipelines).toBe(state.pipelines);
  });

  it('is a no-op on nozzles/pipelines for an out-of-range index', () => {
    const state = {
      appendages,
      nozzles: [nozzle('N0', 'app-1')],
      pipelines: [pipeline('p0', 0)],
    };

    const result = cascadeRemoveAppendage(state, 99);

    expect(result.appendages).toHaveLength(2);
    expect(result.nozzles).toBe(state.nozzles);
    expect(result.pipelines).toBe(state.pipelines);
  });
});
