// =============================================================================
// nozzle-ref-remap — re-anchor pipelines across a wholesale nozzle replacement
// =============================================================================
// Guards Phase C of the GA-drawing import hardening: applying a drawing replaces
// vessel.nozzles wholesale, so pipelines must be re-anchored by nozzle NAME, not
// by their now-stale positional nozzleIndex. Matching is trim + case-insensitive
// exact; unmatched anchors are dropped and reported (never silently removed).
// =============================================================================

import { describe, it, expect } from 'vitest';

import type { NozzleConfig, Pipeline } from '../../types';
import { remapNozzleRefs } from '../nozzle-ref-remap';

function nozzle(name: string): NozzleConfig {
  return { name, pos: 100, proj: 200, angle: 90, size: 100 };
}

function pipeline(id: string, nozzleIndex: number): Pipeline {
  return {
    id,
    nozzleIndex,
    pipeDiameter: 100,
    segments: [{ id: `${id}-s`, type: 'straight', rotation: 0, length: 300 }],
  };
}

describe('remapNozzleRefs', () => {
  it('remaps by exact name match when indices are identical', () => {
    const oldNozzles = [nozzle('N1'), nozzle('N2')];
    const newNozzles = [nozzle('N1'), nozzle('N2')];
    const pipelines = [pipeline('p0', 0), pipeline('p1', 1)];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(removed).toEqual([]);
    expect(out.map((p) => p.nozzleIndex)).toEqual([0, 1]);
    // Unchanged references keep object identity.
    expect(out[0]).toBe(pipelines[0]);
    expect(out[1]).toBe(pipelines[1]);
  });

  it('matches case- and whitespace-insensitively', () => {
    const oldNozzles = [nozzle('N1'), nozzle('N2')];
    // Same tags, but reformatted casing / surrounding whitespace.
    const newNozzles = [nozzle('  n1 '), nozzle('N2  ')];
    const pipelines = [pipeline('p0', 0), pipeline('p1', 1)];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(removed).toEqual([]);
    expect(out.map((p) => p.nozzleIndex)).toEqual([0, 1]);
  });

  it('drops and reports pipelines whose anchor nozzle has no match', () => {
    const oldNozzles = [nozzle('N1'), nozzle('N2')];
    // N2 is gone from the new drawing; N1 survives, N3 is new.
    const newNozzles = [nozzle('N1'), nozzle('N3')];
    const pipelines = [pipeline('p0', 0), pipeline('p1', 1)];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(out.map((p) => p.id)).toEqual(['p0']);
    expect(out[0].nozzleIndex).toBe(0);
    expect(removed).toEqual([{ pipelineId: 'p1', oldNozzleName: 'N2' }]);
  });

  it('is a no-op when there are no pipelines', () => {
    const oldNozzles = [nozzle('N1')];
    const newNozzles = [nozzle('N1')];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, []);

    expect(out).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('remaps to the new index when nozzle order changes but names persist', () => {
    const oldNozzles = [nozzle('N1'), nozzle('N2'), nozzle('N3')];
    // Order reversed in the re-read drawing; all names persist.
    const newNozzles = [nozzle('N3'), nozzle('N2'), nozzle('N1')];
    const pipelines = [pipeline('p0', 0), pipeline('p1', 1), pipeline('p2', 2)];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(removed).toEqual([]);
    // p0 (N1) -> 2, p1 (N2) -> 1, p2 (N3) -> 0
    const byId = Object.fromEntries(out.map((p) => [p.id, p.nozzleIndex]));
    expect(byId).toEqual({ p0: 2, p1: 1, p2: 0 });
    // Remapped pipelines are fresh copies; unchanged ones keep identity.
    expect(out.find((p) => p.id === 'p1')).toBe(pipelines[1]); // index 1 unchanged
    expect(out.find((p) => p.id === 'p0')).not.toBe(pipelines[0]); // index changed
  });

  it('carries free-standing pipelines through untouched', () => {
    const oldNozzles = [nozzle('N1')];
    const newNozzles = [nozzle('N1')];
    const free: Pipeline = {
      ...pipeline('free', -1),
      freeOrigin: { position: [0, 0, 0], direction: [0, 1, 0] },
    };
    const pipelines = [pipeline('p0', 0), free];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(removed).toEqual([]);
    expect(out.find((p) => p.id === 'free')).toBe(free);
    expect(out.map((p) => p.id)).toEqual(['p0', 'free']);
  });

  it('drops a pipeline whose stale index is out of bounds', () => {
    const oldNozzles = [nozzle('N1')];
    const newNozzles = [nozzle('N1')];
    const pipelines = [pipeline('p0', 0), pipeline('stale', 5)];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(out.map((p) => p.id)).toEqual(['p0']);
    expect(removed).toEqual([{ pipelineId: 'stale', oldNozzleName: '' }]);
  });
});
