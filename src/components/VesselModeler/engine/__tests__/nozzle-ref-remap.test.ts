// =============================================================================
// nozzle-ref-remap — re-anchor pipelines across a wholesale nozzle replacement
// =============================================================================
// Guards Phase C of the GA-drawing import hardening: applying a drawing replaces
// vessel.nozzles wholesale (the new nozzles carry brand-new stable ids), so
// pipelines must be re-anchored by nozzle NAME — rewriting each pipeline's
// `nozzleId` to the new nozzle's id. Matching is trim + case-insensitive exact;
// unmatched anchors are dropped and reported (never silently removed).
// =============================================================================

import { describe, it, expect } from 'vitest';

import type { NozzleConfig, Pipeline } from '../../types';
import { remapNozzleRefs } from '../nozzle-ref-remap';

/** Nozzle with an explicit stable id (defaults to `noz-<name>`). */
function nozzle(name: string, id = `noz-${name}`): NozzleConfig {
  return { id, name, pos: 100, proj: 200, angle: 90, size: 100 };
}

/** Pipeline anchored to a nozzle by stable id (omit for free-standing). */
function pipeline(id: string, nozzleId?: string): Pipeline {
  return {
    id,
    ...(nozzleId ? { nozzleId } : {}),
    pipeDiameter: 100,
    segments: [{ id: `${id}-s`, type: 'straight', rotation: 0, length: 300 }],
  };
}

describe('remapNozzleRefs', () => {
  it('rewrites nozzleId to the new nozzle sharing the same name', () => {
    const oldNozzles = [nozzle('N1'), nozzle('N2')];
    // Same tags, fresh ids (a wholesale re-import mints new ids).
    const newNozzles = [nozzle('N1', 'new-1'), nozzle('N2', 'new-2')];
    const pipelines = [pipeline('p0', 'noz-N1'), pipeline('p1', 'noz-N2')];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(removed).toEqual([]);
    expect(out.map((p) => p.nozzleId)).toEqual(['new-1', 'new-2']);
  });

  it('matches case- and whitespace-insensitively', () => {
    const oldNozzles = [nozzle('N1'), nozzle('N2')];
    // Same tags reformatted (casing / surrounding whitespace), fresh ids.
    const newNozzles = [nozzle('  n1 ', 'new-1'), nozzle('N2  ', 'new-2')];
    const pipelines = [pipeline('p0', 'noz-N1'), pipeline('p1', 'noz-N2')];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(removed).toEqual([]);
    expect(out.map((p) => p.nozzleId)).toEqual(['new-1', 'new-2']);
  });

  it('drops and reports pipelines whose anchor nozzle name has no match', () => {
    const oldNozzles = [nozzle('N1'), nozzle('N2')];
    // N2 is gone from the new drawing; N1 survives, N3 is new.
    const newNozzles = [nozzle('N1', 'new-1'), nozzle('N3', 'new-3')];
    const pipelines = [pipeline('p0', 'noz-N1'), pipeline('p1', 'noz-N2')];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(out.map((p) => p.id)).toEqual(['p0']);
    expect(out[0].nozzleId).toBe('new-1');
    expect(removed).toEqual([{ pipelineId: 'p1', oldNozzleName: 'N2' }]);
  });

  it('is a no-op when there are no pipelines', () => {
    const oldNozzles = [nozzle('N1')];
    const newNozzles = [nozzle('N1', 'new-1')];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, []);

    expect(out).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('re-anchors by name even when nozzle order changes', () => {
    const oldNozzles = [nozzle('N1'), nozzle('N2'), nozzle('N3')];
    // Order reversed in the re-read drawing; all names persist with fresh ids.
    const newNozzles = [nozzle('N3', 'new-3'), nozzle('N2', 'new-2'), nozzle('N1', 'new-1')];
    const pipelines = [
      pipeline('p0', 'noz-N1'),
      pipeline('p1', 'noz-N2'),
      pipeline('p2', 'noz-N3'),
    ];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(removed).toEqual([]);
    const byId = Object.fromEntries(out.map((p) => [p.id, p.nozzleId]));
    expect(byId).toEqual({ p0: 'new-1', p1: 'new-2', p2: 'new-3' });
  });

  it('preserves object identity when the resolved id is unchanged', () => {
    const oldNozzles = [nozzle('N1'), nozzle('N2')];
    // New nozzles reuse the same ids (byte-identical re-anchor) for N2 only.
    const newNozzles = [nozzle('N1', 'new-1'), nozzle('N2', 'noz-N2')];
    const pipelines = [pipeline('p0', 'noz-N1'), pipeline('p1', 'noz-N2')];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(removed).toEqual([]);
    // p1's anchor id is unchanged -> same object; p0's changed -> fresh copy.
    expect(out.find((p) => p.id === 'p1')).toBe(pipelines[1]);
    expect(out.find((p) => p.id === 'p0')).not.toBe(pipelines[0]);
  });

  it('carries free-standing pipelines through untouched', () => {
    const oldNozzles = [nozzle('N1')];
    const newNozzles = [nozzle('N1', 'new-1')];
    const free: Pipeline = {
      ...pipeline('free'),
      freeOrigin: { position: [0, 0, 0], direction: [0, 1, 0] },
    };
    const pipelines = [pipeline('p0', 'noz-N1'), free];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(removed).toEqual([]);
    expect(out.find((p) => p.id === 'free')).toBe(free);
    expect(out.map((p) => p.id)).toEqual(['p0', 'free']);
  });

  it('drops a pipeline whose anchor id is not in the old nozzle list', () => {
    const oldNozzles = [nozzle('N1')];
    const newNozzles = [nozzle('N1', 'new-1')];
    const pipelines = [pipeline('p0', 'noz-N1'), pipeline('stale', 'noz-gone')];

    const { pipelines: out, removed } = remapNozzleRefs(oldNozzles, newNozzles, pipelines);

    expect(out.map((p) => p.id)).toEqual(['p0']);
    expect(removed).toEqual([{ pipelineId: 'stale', oldNozzleName: '' }]);
  });
});
