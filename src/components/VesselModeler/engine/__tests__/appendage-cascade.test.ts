// =============================================================================
// appendage-cascade — deleting an appendage removes its attachables
// =============================================================================
// Guards the removeAppendage cascade: deleting an appendage drops every nozzle
// whose bodyId matches AND their pipelines (by stable nozzleId — no index shifting;
// every surviving pipeline keeps pointing at the same physical nozzle), plus the
// body's welds / lifting lugs / coverage rects (Phase 4). Main-shell attachables
// and attachables on OTHER appendages must be left untouched.
// =============================================================================

import { describe, it, expect } from 'vitest';

import type {
  AnnotationShapeConfig,
  AppendageConfig,
  CoverageRectConfig,
  DomeScanConfig,
  LiftingLugConfig,
  NozzleConfig,
  Pipeline,
  WeldConfig,
} from '../../types';
import { cascadeRemoveAppendage } from '../appendage-cascade';

/** Nozzle with a stable id derived from its name (e.g. 'N1' -> 'noz-N1'). */
function nozzle(name: string, bodyId?: string): NozzleConfig {
  return { id: `noz-${name}`, name, pos: 100, proj: 200, angle: 90, size: 100, bodyId };
}

/** Pipeline anchored to the nozzle named `nozzleName` by stable id. */
function pipeline(id: string, nozzleName: string): Pipeline {
  return {
    id,
    nozzleId: `noz-${nozzleName}`,
    pipeDiameter: 100,
    segments: [{ id: `${id}-s`, type: 'straight', rotation: 0, length: 300 }],
  };
}

function weld(name: string, bodyId?: string): WeldConfig {
  return { name, type: 'circumferential', pos: 100, color: '#888', bodyId };
}

function lug(name: string, bodyId?: string): LiftingLugConfig {
  return { name, pos: 100, angle: 90, style: 'padEye', swl: '5t', bodyId };
}

function rect(id: number, bodyId?: string): CoverageRectConfig {
  return {
    id,
    name: `C${id}`,
    pos: 100,
    angle: 90,
    width: 100,
    height: 100,
    color: '#0c6',
    lineWidth: 2,
    filled: true,
    fillOpacity: 0.2,
    bodyId,
  };
}

function annotation(id: number, bodyId?: string): AnnotationShapeConfig {
  return {
    id,
    name: `A${id}`,
    type: 'scan',
    pos: 100,
    angle: 90,
    width: 100,
    height: 100,
    color: '#f33',
    lineWidth: 2,
    showLabel: false,
    bodyId,
  };
}

function dome(id: string, bodyId?: string): DomeScanConfig {
  return {
    id,
    name: id,
    bodyId,
    head: bodyId ? 'end' : 'right',
    centerPhi: 30,
    centerTheta: 0,
    scanDirection: 'cw',
    indexDirection: 'outward',
    orientationConfirmed: true,
    data: [],
    xAxis: [0, 10],
    yAxis: [0, 10],
    stats: { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
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

/** Full cascade-state slice with empty attachable arrays by default. */
function makeState(overrides: Partial<Parameters<typeof cascadeRemoveAppendage>[0]> = {}) {
  return {
    appendages,
    nozzles: [] as NozzleConfig[],
    pipelines: [] as Pipeline[],
    welds: [] as WeldConfig[],
    liftingLugs: [] as LiftingLugConfig[],
    coverageRects: [] as CoverageRectConfig[],
    annotations: [] as AnnotationShapeConfig[],
    domeScanComposites: [] as DomeScanConfig[],
    ...overrides,
  };
}

describe('cascadeRemoveAppendage', () => {
  it('removes the body + its nozzles and keeps surviving pipelines on the same nozzle', () => {
    // Nozzles: 0 main, 1 app-1, 2 app-1, 3 main. Each has a pipeline.
    const state = makeState({
      nozzles: [nozzle('N0'), nozzle('N1', 'app-1'), nozzle('N2', 'app-1'), nozzle('N3')],
      pipelines: [
        pipeline('p0', 'N0'),
        pipeline('p1', 'N1'),
        pipeline('p2', 'N2'),
        pipeline('p3', 'N3'),
      ],
    });

    const result = cascadeRemoveAppendage(state, 0);

    // app-1 gone, app-2 kept.
    expect(result.appendages.map((a) => a.id)).toEqual(['app-2']);

    // Only the two main nozzles remain, order preserved.
    expect(result.nozzles.map((n) => n.name)).toEqual(['N0', 'N3']);
    expect(result.nozzles.every((n) => n.bodyId === undefined)).toBe(true);

    // The app-1 pipelines are gone; the main pipelines remain, STILL anchored to
    // the same physical nozzle by stable id (regression: no index shifting could
    // silently re-target p3 when the earlier nozzles were removed).
    expect(result.pipelines.map((p) => p.id)).toEqual(['p0', 'p3']);
    const byId = new Map(result.pipelines.map((p) => [p.id, p.nozzleId]));
    expect(byId.get('p0')).toBe('noz-N0');
    expect(byId.get('p3')).toBe('noz-N3');
    // The surviving anchor id resolves to the same nozzle it always named.
    expect(result.nozzles.find((n) => n.id === byId.get('p3'))!.name).toBe('N3');
  });

  it('preserves free-standing pipelines (no nozzleId) untouched', () => {
    const free: Pipeline = {
      id: 'free',
      pipeDiameter: 100,
      segments: [{ id: 'free-s', type: 'straight', rotation: 0, length: 300 }],
      freeOrigin: { position: [0, 0, 0], direction: [0, 1, 0] },
    };
    const state = makeState({
      nozzles: [nozzle('N0'), nozzle('N1', 'app-1')],
      pipelines: [free, pipeline('p1', 'N1')],
    });

    const result = cascadeRemoveAppendage(state, 0);

    expect(result.pipelines.map((p) => p.id)).toEqual(['free']);
    expect(result.pipelines[0].nozzleId).toBeUndefined();
  });

  it('leaves nozzles and pipelines untouched when the body has no attached nozzles', () => {
    const state = makeState({
      nozzles: [nozzle('N0'), nozzle('N1', 'app-1')],
      pipelines: [pipeline('p1', 'N1')],
    });

    // Remove app-2, which has no nozzles.
    const result = cascadeRemoveAppendage(state, 1);

    expect(result.appendages.map((a) => a.id)).toEqual(['app-1']);
    expect(result.nozzles).toBe(state.nozzles);
    expect(result.pipelines).toBe(state.pipelines);
  });

  it('is a no-op on nozzles/pipelines for an out-of-range index', () => {
    const state = makeState({
      nozzles: [nozzle('N0', 'app-1')],
      pipelines: [pipeline('p0', 'N0')],
    });

    const result = cascadeRemoveAppendage(state, 99);

    expect(result.appendages).toHaveLength(2);
    expect(result.nozzles).toBe(state.nozzles);
    expect(result.pipelines).toBe(state.pipelines);
  });

  it('strips the body’s welds, lifting lugs, and coverage rects; keeps main + other-body', () => {
    const state = makeState({
      welds: [weld('W-main'), weld('W-app1', 'app-1'), weld('W-app2', 'app-2')],
      liftingLugs: [lug('L-main'), lug('L-app1', 'app-1')],
      coverageRects: [rect(1), rect(2, 'app-1'), rect(3, 'app-1'), rect(4, 'app-2')],
    });

    const result = cascadeRemoveAppendage(state, 0); // delete app-1

    expect(result.welds.map((w) => w.name)).toEqual(['W-main', 'W-app2']);
    expect(result.liftingLugs.map((l) => l.name)).toEqual(['L-main']);
    expect(result.coverageRects.map((r) => r.id)).toEqual([1, 4]);
    // Every surviving attachable is either main-shell or on the still-present body.
    expect(result.welds.every((w) => w.bodyId !== 'app-1')).toBe(true);
    expect(result.coverageRects.every((r) => r.bodyId !== 'app-1')).toBe(true);
  });

  it('strips the body’s annotations; keeps main + other-body annotations', () => {
    const state = makeState({
      annotations: [
        annotation(1),
        annotation(2, 'app-1'),
        annotation(3, 'app-1'),
        annotation(4, 'app-2'),
      ],
    });

    const result = cascadeRemoveAppendage(state, 0); // delete app-1

    expect(result.annotations.map((a) => a.id)).toEqual([1, 4]);
    expect(result.annotations.every((a) => a.bodyId !== 'app-1')).toBe(true);
  });

  it('preserves attachable array references when the deleted body owns none', () => {
    const state = makeState({
      welds: [weld('W-main'), weld('W-app1', 'app-1')],
      liftingLugs: [lug('L-app1', 'app-1')],
      coverageRects: [rect(1)],
      annotations: [annotation(1), annotation(2, 'app-1')],
      domeScanComposites: [dome('d-main'), dome('d-app1', 'app-1')],
    });

    // Delete app-2, which owns no welds/lugs/rects/annotations/dome scans — arrays keep identity.
    const result = cascadeRemoveAppendage(state, 1);

    expect(result.welds).toBe(state.welds);
    expect(result.liftingLugs).toBe(state.liftingLugs);
    expect(result.coverageRects).toBe(state.coverageRects);
    expect(result.annotations).toBe(state.annotations);
    expect(result.domeScanComposites).toBe(state.domeScanComposites);
  });

  it('strips the body’s dome scans; keeps main + other-body dome scans', () => {
    const state = makeState({
      domeScanComposites: [
        dome('d-main'),
        dome('d-app1a', 'app-1'),
        dome('d-app1b', 'app-1'),
        dome('d-app2', 'app-2'),
      ],
    });

    const result = cascadeRemoveAppendage(state, 0); // delete app-1

    expect(result.domeScanComposites.map((d) => d.id)).toEqual(['d-main', 'd-app2']);
    expect(result.domeScanComposites.every((d) => d.bodyId !== 'app-1')).toBe(true);
  });
});
