// =============================================================================
// layer-presence — categories a vessel actually has content in
// =============================================================================
// The aggregate counterpart of the outliner's per-body "drop empty categories"
// rule. The load-bearing property is AGREEMENT: whatever `buildOutlinerTree`
// shows somewhere, `presentLayerCategories` must list, and vice versa. If those
// two ever drift, a layer chip toggles something invisible (or hides something
// with no chip), so the agreement is pinned here rather than left to review.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type CoverageRectConfig,
  type NozzleConfig,
  type VesselState,
} from '../../types';
import { buildOutlinerTree, LAYER_CATEGORIES } from '../../outliner-tree';
import type { SelectionState } from '../vessel-reducer';
import { MAIN_BODY_KEY } from '../layer-visibility';
import { layerBodyKeys, presentLayerCategories } from '../layer-presence';

const BOOT: AppendageConfig = {
  id: 'app-1',
  name: 'Boot 1',
  mountPos: 4000,
  mountAngle: 270,
  diameter: 1000,
  length: 1500,
  endClosure: 'dished',
  headRatio: 2.0,
  visible: true,
  locked: false,
};

const RECT: CoverageRectConfig = {
  id: 1,
  name: 'Rect 1',
  pos: 2000,
  angle: 90,
  width: 500,
  height: 500,
  color: '#ffffff',
  lineWidth: 10,
  filled: false,
  fillOpacity: 0.2,
};

const NOZZLE = { id: 'noz-1', name: 'N1', pos: 1000, angle: 90, size: 100 } as NozzleConfig;

/** The default state ships with saddles; strip them so "bare" really is bare. */
function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return { ...DEFAULT_VESSEL_STATE, saddles: [], ...overrides };
}

/** Empty selection — the tree builder only reads it to mark rows selected. */
const NO_SELECTION = {} as SelectionState;

/** Every category the outliner tree renders anywhere, deduped. */
function categoriesInTree(state: VesselState): string[] {
  const keys = new Set<string>();
  for (const body of buildOutlinerTree(state, NO_SELECTION)) {
    for (const category of body.categories) keys.add(category.key);
  }
  return [...keys];
}

describe('presentLayerCategories', () => {
  it('is empty for a bare vessel', () => {
    expect(presentLayerCategories(makeState())).toEqual([]);
  });

  it('lists only categories with content, counted across every body', () => {
    const state = makeState({
      appendages: [BOOT],
      nozzles: [NOZZLE],
      coverageRects: [RECT, { ...RECT, id: 2, bodyId: BOOT.id }],
    });

    expect(presentLayerCategories(state)).toEqual([
      { key: 'nozzles', label: 'Nozzles', count: 1 },
      { key: 'coverage', label: 'Coverage', count: 2 },
    ]);
  });

  it('emits categories in the LAYER_CATEGORIES order', () => {
    const state = makeState({
      nozzles: [NOZZLE],
      coverageRects: [RECT],
      welds: [{ id: 1, type: 'circumferential', pos: 500 } as never],
    });
    const order = LAYER_CATEGORIES.map((c) => c.key);
    const emitted = presentLayerCategories(state).map((c) => c.key);

    expect(emitted).toEqual([...emitted].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it('agrees with buildOutlinerTree on which categories exist', () => {
    const state = makeState({
      appendages: [BOOT],
      nozzles: [NOZZLE],
      coverageRects: [RECT, { ...RECT, id: 2, bodyId: BOOT.id }],
    });

    expect(
      presentLayerCategories(state)
        .map((c) => c.key)
        .sort()
    ).toEqual(categoriesInTree(state).sort());
  });
});

describe('layerBodyKeys', () => {
  it('is the main shell alone when there are no boots', () => {
    expect(layerBodyKeys(makeState())).toEqual([MAIN_BODY_KEY]);
  });

  it('lists the main shell first, then every boot id', () => {
    const state = makeState({ appendages: [BOOT, { ...BOOT, id: 'app-2', name: 'Boot 2' }] });
    expect(layerBodyKeys(state)).toEqual([MAIN_BODY_KEY, 'app-1', 'app-2']);
  });

  it('matches the bodies the outliner tree builds', () => {
    const state = makeState({ appendages: [BOOT] });
    expect(layerBodyKeys(state)).toEqual(buildOutlinerTree(state, NO_SELECTION).map((b) => b.key));
  });
});
