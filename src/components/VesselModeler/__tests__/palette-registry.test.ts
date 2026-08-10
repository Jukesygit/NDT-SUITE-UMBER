import { describe, it, expect } from 'vitest';
import {
  buildPaletteItems,
  filterPaletteItems,
  PALETTE_RESULT_CAP,
  type PaletteItem,
} from '../engine/palette-registry';
import { DEFAULT_VESSEL_STATE, type VesselState } from '../types';

// C14 — pure command-palette registry. Verifies every collection yields an
// entity, commands cover views/bookmarks/view-modes/toggles/undo/redo, topo is
// gated on ctx.topoEnabled, and filterPaletteItems ranks + caps as specified.

/** A populated vessel: entities on the main shell AND on one boot (app-1). */
function makeVessel(overrides: Partial<VesselState> = {}): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    appendages: [
      {
        id: 'app-1',
        name: 'Boot 1',
        mountPos: 4000,
        mountAngle: 270,
        diameter: 800,
        length: 1200,
        endClosure: 'dished',
      },
    ],
    nozzles: [
      { id: 'noz-1', name: 'N1', pos: 100, proj: 0, angle: 90, size: 100 },
      { id: 'noz-2', name: 'N2', pos: 200, proj: 0, angle: 90, size: 100, bodyId: 'app-1' },
    ],
    liftingLugs: [{ name: 'L1', pos: 500, angle: 90, style: 'padEye', swl: '5t' }],
    saddles: [{ pos: 1000 }],
    welds: [{ name: 'W1', type: 'circumferential', pos: 500, color: '#888' }],
    annotations: [
      {
        id: 1,
        name: 'A1',
        type: 'scan',
        pos: 300,
        angle: 90,
        width: 100,
        height: 100,
        color: '#f00',
        lineWidth: 2,
        showLabel: true,
      },
    ],
    coverageRects: [
      {
        id: 2,
        name: 'C1',
        pos: 250,
        angle: 90,
        width: 100,
        height: 100,
        color: '#0f0',
        lineWidth: 2,
        filled: false,
        fillOpacity: 0.2,
      },
    ],
    inspectionImages: [
      { id: 3, name: 'IMG1', imageData: '', pos: 400, angle: 90, method: 'UT' },
    ],
    rulers: [
      { id: 4, name: 'R1', startPos: 0, startAngle: 90, endPos: 500, endAngle: 90, color: '#fff', showLabel: true },
    ],
    scanComposites: [
      {
        id: 'sc-1',
        name: 'S1',
        data: [],
        xAxis: [],
        yAxis: [],
        stats: { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
        indexStartMm: 0,
        datumAngleDeg: 0,
        scanDirection: 'cw',
        indexDirection: 'forward',
        orientationConfirmed: true,
        colorScale: 'Jet',
        rangeMin: null,
        rangeMax: null,
        opacity: 1,
      },
    ],
    domeScanComposites: [
      {
        id: 'ds-1',
        name: 'D1',
        bodyId: 'app-1',
        head: 'end',
        centerPhi: 45,
        centerTheta: 0,
        scanDirection: 'cw',
        indexDirection: 'outward',
        orientationConfirmed: true,
        data: [],
        xAxis: [],
        yAxis: [],
        stats: { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
        colorScale: 'Jet',
        rangeMin: null,
        rangeMax: null,
        opacity: 1,
      },
    ],
    textures: [
      {
        id: 7,
        name: 'T1',
        imageData: '',
        pos: 0,
        angle: 90,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
        aspectRatio: 1,
      },
    ],
    pipelines: [{ id: 'p-1', pipeDiameter: 100, segments: [] }],
    cameraBookmarks: [{ id: 'bm-1', name: 'Front', position: [1, 2, 3], target: [0, 0, 0] }],
    ...overrides,
  };
}

const selectTypes = (items: PaletteItem[]): string[] =>
  items
    .filter((i) => i.kind === 'entity')
    .map((i) => ('select' in i.action ? i.action.select.type : ''));

describe('buildPaletteItems', () => {
  it('emits an entity for every collection', () => {
    const items = buildPaletteItems(makeVessel(), { topoEnabled: true });
    const types = new Set(selectTypes(items));
    for (const t of [
      'SELECT_NOZZLE',
      'SELECT_WELD',
      'SELECT_LUG',
      'SELECT_SADDLE',
      'SELECT_APPENDAGE',
      'SELECT_SCAN_COMPOSITE',
      'SELECT_DOME_SCAN',
      'SELECT_ANNOTATION',
      'SELECT_COVERAGE_RECT',
      'SELECT_INSPECTION_IMAGE',
      'SELECT_RULER',
      'SELECT_PIPE_SEGMENT',
      'SELECT_TEXTURE',
    ]) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('emits commands for views, bookmarks, view-modes, toggles and undo/redo', () => {
    const items = buildPaletteItems(makeVessel(), { topoEnabled: true });
    const has = (pred: (a: PaletteItem['action']) => boolean) => items.some((i) => pred(i.action));
    expect(has((a) => 'view' in a && a.view === 'tdc')).toBe(true);
    expect(has((a) => 'bookmark' in a && a.bookmark === 'bm-1')).toBe(true);
    expect(has((a) => 'viewMode' in a && a.viewMode === '3d')).toBe(true);
    expect(has((a) => 'toggle' in a && a.toggle === 'snap')).toBe(true);
    expect(has((a) => 'undo' in a)).toBe(true);
    expect(has((a) => 'redo' in a)).toBe(true);
    // All eight canonical views are present.
    const views = items.filter((i) => 'view' in i.action).map((i) => ('view' in i.action ? i.action.view : ''));
    expect(new Set(views)).toEqual(new Set(['n', 'e', 's', 'w', 'top', 'bottom', 'iso', 'tdc']));
  });

  it('omits the Topo view-mode command when topoEnabled is false', () => {
    const withTopo = buildPaletteItems(makeVessel(), { topoEnabled: true });
    const withoutTopo = buildPaletteItems(makeVessel(), { topoEnabled: false });
    const hasTopo = (items: PaletteItem[]) =>
      items.some((i) => 'viewMode' in i.action && i.action.viewMode === 'topo');
    expect(hasTopo(withTopo)).toBe(true);
    expect(hasTopo(withoutTopo)).toBe(false);
    // The other two view modes remain when Topo is omitted.
    const modes = withoutTopo
      .filter((i) => 'viewMode' in i.action)
      .map((i) => ('viewMode' in i.action ? i.action.viewMode : ''));
    expect(new Set(modes)).toEqual(new Set(['3d', 'flattened']));
  });

  it('carries the boot name and nozzle id as keywords', () => {
    const items = buildPaletteItems(makeVessel(), { topoEnabled: true });
    const bootNozzle = items.find((i) => i.id === 'ent:nozzle:1')!;
    expect(bootNozzle.keywords).toEqual(expect.arrayContaining(['noz-2', 'Boot 1']));
  });
});

describe('filterPaletteItems', () => {
  it('matches a nozzle by its stable id keyword', () => {
    const items = buildPaletteItems(makeVessel(), { topoEnabled: true });
    const results = filterPaletteItems(items, 'noz-2');
    expect(results.some((i) => i.id === 'ent:nozzle:1')).toBe(true);
  });

  it('matches boot-mounted entities by boot name', () => {
    const items = buildPaletteItems(makeVessel(), { topoEnabled: true });
    const results = filterPaletteItems(items, 'boot 1');
    // The boot-mounted nozzle (keyword "Boot 1") and the boot itself both match.
    expect(results.some((i) => i.id === 'ent:nozzle:1')).toBe(true);
    expect(results.some((i) => i.id === 'ent:appendage:0')).toBe(true);
  });

  it('ranks an entity above a command on an equal-tier match', () => {
    // An annotation literally named "View" prefix-matches "view" (tier 4), tying
    // with the canonical-view commands ("View North" …). The entity wins.
    const vessel = makeVessel({
      annotations: [
        {
          id: 9,
          name: 'View',
          type: 'scan',
          pos: 100,
          angle: 90,
          width: 50,
          height: 50,
          color: '#f00',
          lineWidth: 1,
          showLabel: true,
        },
      ],
    });
    const items = buildPaletteItems(vessel, { topoEnabled: true });
    const results = filterPaletteItems(items, 'view');
    expect(results[0].kind).toBe('entity');
    expect(results[0].id).toBe('ent:annotation:9');
  });

  it('empty query lists commands before entities and caps the result', () => {
    const items = buildPaletteItems(makeVessel(), { topoEnabled: true });
    const results = filterPaletteItems(items, '');
    expect(results.length).toBeLessThanOrEqual(PALETTE_RESULT_CAP);
    expect(results[0].kind).toBe('command');
  });

  it('caps a broad match at PALETTE_RESULT_CAP', () => {
    const nozzles = Array.from({ length: 40 }, (_, i) => ({
      id: `noz-${i + 1}`,
      name: `Nozzle ${i + 1}`,
      pos: i,
      proj: 0,
      angle: 90,
      size: 100,
    }));
    const items = buildPaletteItems(makeVessel({ nozzles }), { topoEnabled: true });
    const results = filterPaletteItems(items, 'nozzle');
    expect(results.length).toBe(PALETTE_RESULT_CAP);
  });
});
