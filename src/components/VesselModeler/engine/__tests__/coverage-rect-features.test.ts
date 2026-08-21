// =============================================================================
// coverage-rect-features — which rects guide which comparison feature
// =============================================================================
// This is the row-expand's guidance listing, NOT a coverage measurement. What
// matters: the keys it emits join the comparison rows with no translation, a
// rect that drapes onto a closure is listed under both the barrel and that
// closure, a pipe (no heads) never emits a head key, and a boot with a flat or
// open end never emits a dome key — the same gate `listComparisonFeatures` uses,
// or the expand would name a feature that has no row.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type CoverageRectConfig,
  type VesselState,
} from '../../types';
import { listComparisonFeatures } from '../coverage-comparison';
import {
  featureKeysForRect,
  groupRectsByFeature,
  rectsForFeature,
} from '../coverage-rect-features';

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

function makeRect(overrides: Partial<CoverageRectConfig> = {}): CoverageRectConfig {
  return {
    id: 1,
    name: 'Rect 1',
    pos: 2000,
    angle: 90,
    width: 400,
    height: 400,
    color: '#ffffff',
    lineWidth: 10,
    filled: false,
    fillOpacity: 0.2,
    ...overrides,
  };
}

function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return { ...DEFAULT_VESSEL_STATE, saddles: [], ...overrides };
}

describe('featureKeysForRect', () => {
  it('keeps a mid-shell rect on the barrel alone', () => {
    const state = makeState();
    expect(featureKeysForRect(makeRect({ pos: state.length / 2 }), state)).toEqual(['cylinder']);
  });

  it('lists a rect draping past the near tangent under the shell AND the left head', () => {
    const state = makeState();
    // Centred ON the left tangent line with real width ⇒ half of it drapes.
    const keys = featureKeysForRect(makeRect({ pos: 0, width: 800 }), state);
    expect(keys).toEqual(['cylinder', 'leftHead']);
  });

  it('routes a rect draping past the far tangent to the right head', () => {
    const state = makeState();
    const keys = featureKeysForRect(makeRect({ pos: state.length, width: 800 }), state);
    expect(keys).toEqual(['cylinder', 'rightHead']);
  });

  it('never names a head on a pipe, which has no head rows', () => {
    const state = makeState({ vesselShape: 'pipe' });
    expect(featureKeysForRect(makeRect({ pos: 0, width: 800 }), state)).toEqual(['cylinder']);
  });

  it('routes a boot rect to that boot, and its drape to the dished dome', () => {
    const state = makeState({ appendages: [BOOT] });
    expect(featureKeysForRect(makeRect({ bodyId: BOOT.id, pos: 700 }), state)).toEqual([
      'app-1:shell',
    ]);
    expect(
      featureKeysForRect(makeRect({ bodyId: BOOT.id, pos: BOOT.length, width: 600 }), state)
    ).toEqual(['app-1:shell', 'app-1:dome']);
  });

  it('emits no dome key for a flat-ended boot, which has no dome row', () => {
    const flat = { ...BOOT, endClosure: 'flat' as const };
    const state = makeState({ appendages: [flat] });
    expect(
      featureKeysForRect(makeRect({ bodyId: flat.id, pos: flat.length, width: 600 }), state)
    ).toEqual(['app-1:shell']);
  });

  it('drops a rect whose body no longer exists', () => {
    const state = makeState();
    expect(featureKeysForRect(makeRect({ bodyId: 'ghost' }), state)).toEqual([]);
  });

  it('only ever emits keys the comparison rows also emit', () => {
    const state = makeState({
      appendages: [BOOT],
      coverageRects: [
        makeRect({ id: 1, pos: 0, width: 800 }),
        makeRect({ id: 2, pos: 6000, width: 800 }),
        makeRect({ id: 3, bodyId: BOOT.id, pos: BOOT.length, width: 600 }),
      ],
    });
    const rowKeys = new Set(listComparisonFeatures(state).map((f) => f.key));

    for (const rect of state.coverageRects) {
      for (const key of featureKeysForRect(rect, state)) {
        expect(rowKeys.has(key)).toBe(true);
      }
    }
  });
});

describe('groupRectsByFeature / rectsForFeature', () => {
  it('groups in model order and agrees with the per-feature lookup', () => {
    const rects = [
      makeRect({ id: 1, name: 'A', pos: 2000 }),
      makeRect({ id: 2, name: 'B', pos: 4000 }),
      makeRect({ id: 3, name: 'C', bodyId: BOOT.id, pos: 700 }),
    ];
    const state = makeState({ appendages: [BOOT], coverageRects: rects });

    const grouped = groupRectsByFeature(state);
    expect(grouped.get('cylinder')?.map((r) => r.name)).toEqual(['A', 'B']);
    expect(grouped.get('app-1:shell')?.map((r) => r.name)).toEqual(['C']);

    expect(rectsForFeature(state, { scope: 'main', key: 'cylinder' })).toEqual(
      grouped.get('cylinder')
    );
    expect(
      rectsForFeature(state, { scope: 'appendage', appendageId: BOOT.id, slot: 'shell' })
    ).toEqual(grouped.get('app-1:shell'));
  });

  it('returns nothing for a feature no rect guides', () => {
    const state = makeState({ coverageRects: [makeRect({ pos: 2000 })] });
    expect(rectsForFeature(state, { scope: 'main', key: 'leftHead' })).toEqual([]);
  });
});
