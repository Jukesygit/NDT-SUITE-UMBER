import { describe, it, expect } from 'vitest';
import { buildOutlinerTree } from '../outliner-tree';
import { DESELECTED, type SelectionState } from '../engine/vessel-reducer';
import { DEFAULT_VESSEL_STATE, type VesselState } from '../types';

// C13b — pure outliner tree builder. Verifies body grouping by bodyId, category
// omission when empty, selected-row mapping for index- and id-based types, and
// boot naming (user-facing "Boot" comes from the appendage name — never renamed).

const sel = (overrides: Partial<SelectionState> = {}): SelectionState => ({
  ...DESELECTED,
  ...overrides,
});

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
    // Lifting lugs intentionally left empty → the "Lifting lugs" category is omitted.
    liftingLugs: [],
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
        locked: true,
      },
      {
        id: 2,
        name: 'A2',
        type: 'scan',
        pos: 400,
        angle: 90,
        width: 100,
        height: 100,
        color: '#f00',
        lineWidth: 2,
        showLabel: true,
        bodyId: 'app-1',
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
    ...overrides,
  };
}

describe('buildOutlinerTree', () => {
  it('puts the main shell first, then each appendage by name', () => {
    const tree = buildOutlinerTree(makeVessel(), sel());
    expect(tree[0].key).toBe('main');
    expect(tree[0].label).toBe('Vessel');
    expect(tree[1].key).toBe('app-1');
    // User-facing "Boot" string comes straight from the appendage name.
    expect(tree[1].label).toBe('Boot 1');
    expect(tree[1].selectAction).toEqual({ type: 'SELECT_APPENDAGE', index: 0 });
    expect(tree[1].toggleRef).toEqual({ kind: 'appendage', index: 0 });
  });

  it('routes entities to their body via bodyId (undefined ⇒ main shell)', () => {
    const tree = buildOutlinerTree(makeVessel(), sel());
    const main = tree[0];
    const boot = tree[1];

    const mainNozzles = main.categories.find((c) => c.key === 'nozzles');
    const bootNozzles = boot.categories.find((c) => c.key === 'nozzles');
    expect(mainNozzles?.rows.map((r) => r.label)).toEqual(['N1']);
    expect(bootNozzles?.rows.map((r) => r.label)).toEqual(['N2']);

    // Saddles/textures/pipelines have no bodyId ⇒ always main shell.
    expect(main.categories.map((c) => c.key)).toEqual(
      expect.arrayContaining(['saddles', 'textures', 'pipelines'])
    );
    expect(boot.categories.map((c) => c.key)).not.toEqual(
      expect.arrayContaining(['saddles', 'textures', 'pipelines'])
    );

    // Dome scan with bodyId lands on that boot, not the shell.
    expect(boot.categories.find((c) => c.key === 'domeScans')?.rows.map((r) => r.label)).toEqual([
      'D1',
    ]);
    expect(main.categories.find((c) => c.key === 'domeScans')).toBeUndefined();
  });

  it('omits empty categories and preserves the fixed category order', () => {
    const main = buildOutlinerTree(makeVessel(), sel())[0];
    // liftingLugs is empty → no "lugs" category anywhere.
    expect(main.categories.find((c) => c.key === 'lugs')).toBeUndefined();
    // Present main categories, in canonical order.
    expect(main.categories.map((c) => c.key)).toEqual([
      'nozzles',
      'welds',
      'saddles',
      'annotations',
      'pipelines',
      'textures',
    ]);
  });

  it('always emits the main shell body even when the vessel is empty', () => {
    const empty = makeVessel({
      appendages: [],
      nozzles: [],
      liftingLugs: [],
      saddles: [],
      welds: [],
      annotations: [],
      domeScanComposites: [],
      textures: [],
      pipelines: [],
    });
    const tree = buildOutlinerTree(empty, sel());
    expect(tree).toHaveLength(1);
    expect(tree[0].key).toBe('main');
    expect(tree[0].categories).toEqual([]);
  });

  it('maps selection for index-based types (nozzle) and emits SELECT_NOZZLE', () => {
    // Global nozzle index 1 = N2 (on the boot).
    const tree = buildOutlinerTree(makeVessel(), sel({ nozzleIndex: 1 }));
    const n1 = tree[0].categories.find((c) => c.key === 'nozzles')!.rows[0];
    const n2 = tree[1].categories.find((c) => c.key === 'nozzles')!.rows[0];
    expect(n1.selected).toBe(false);
    expect(n1.selectAction).toEqual({ type: 'SELECT_NOZZLE', index: 0 });
    expect(n2.selected).toBe(true);
    expect(n2.selectAction).toEqual({ type: 'SELECT_NOZZLE', index: 1 });
    expect(n2.toggleRef).toEqual({ kind: 'nozzle', index: 1 });
  });

  it('maps selection for id-based types (annotation) and emits SELECT_ANNOTATION', () => {
    const main = buildOutlinerTree(makeVessel(), sel({ annotationId: 1 }))[0];
    const rows = main.categories.find((c) => c.key === 'annotations')!.rows;
    const a1 = rows.find((r) => r.label === 'A1')!;
    expect(a1.selected).toBe(true);
    expect(a1.selectAction).toEqual({ type: 'SELECT_ANNOTATION', id: 1 });
    // locked?: true resolves to locked === true; nozzles (no locked field) → false.
    expect(a1.locked).toBe(true);
  });

  it('selects a boot header via appendageIndex', () => {
    const tree = buildOutlinerTree(makeVessel(), sel({ appendageIndex: 0 }));
    expect(tree[1].selected).toBe(true);
    expect(tree[0].selected).toBe(false);
  });

  it('falls back to type+index labels and emits SELECT_PIPE_SEGMENT for pipelines', () => {
    const main = buildOutlinerTree(makeVessel(), sel())[0];
    const saddle = main.categories.find((c) => c.key === 'saddles')!.rows[0];
    expect(saddle.label).toBe('Saddle 1');
    const pipe = main.categories.find((c) => c.key === 'pipelines')!.rows[0];
    expect(pipe.label).toBe('Pipeline 1');
    expect(pipe.selectAction).toEqual({
      type: 'SELECT_PIPE_SEGMENT',
      pipelineId: 'p-1',
      segmentIndex: 0,
    });
  });

  it('resolves visible from `visible !== false`', () => {
    const v = makeVessel({
      nozzles: [
        { id: 'noz-1', name: 'N1', pos: 0, proj: 0, angle: 90, size: 100, visible: false },
        { id: 'noz-2', name: 'N2', pos: 0, proj: 0, angle: 90, size: 100 },
      ],
    });
    const rows = buildOutlinerTree(v, sel())[0].categories.find((c) => c.key === 'nozzles')!.rows;
    expect(rows.find((r) => r.label === 'N1')!.visible).toBe(false);
    expect(rows.find((r) => r.label === 'N2')!.visible).toBe(true);
  });
});
