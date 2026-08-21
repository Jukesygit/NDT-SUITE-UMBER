import { describe, it, expect } from 'vitest';
import {
  bodyKeyOf,
  categoryLayerKeys,
  categoryLayerPatch,
  isCategoryVisibleAnywhere,
  isEffectivelyVisible,
  isLayerVisible,
  layerKey,
  MAIN_BODY_KEY,
  type LayerVisibility,
} from '../layer-visibility';

// Pure layer-visibility contract shared by the viewport, the Layers panel and
// (later) the read-only viewer. The load-bearing rule everywhere: the map is
// SPARSE, so an ABSENT key means visible — never "hidden by default".

describe('layerKey / bodyKeyOf', () => {
  it('keys a layer as `${bodyKey}/${categoryKey}`', () => {
    expect(layerKey(MAIN_BODY_KEY, 'coverage')).toBe('main/coverage');
    expect(layerKey('app-1', 'scans')).toBe('app-1/scans');
  });

  it('routes an entity without a bodyId to the main shell', () => {
    expect(bodyKeyOf({})).toBe(MAIN_BODY_KEY);
    expect(bodyKeyOf({ bodyId: 'app-1' })).toBe('app-1');
  });
});

describe('isLayerVisible', () => {
  it('treats an absent key, an undefined map and `true` alike', () => {
    expect(isLayerVisible(undefined, 'main', 'coverage')).toBe(true);
    expect(isLayerVisible({}, 'main', 'coverage')).toBe(true);
    expect(isLayerVisible({ 'main/coverage': true }, 'main', 'coverage')).toBe(true);
  });

  it('hides only on an explicit false, and only for that exact body', () => {
    const layers: LayerVisibility = { 'main/coverage': false };
    expect(isLayerVisible(layers, 'main', 'coverage')).toBe(false);
    expect(isLayerVisible(layers, 'app-1', 'coverage')).toBe(true);
    expect(isLayerVisible(layers, 'main', 'scans')).toBe(true);
  });
});

describe('isEffectivelyVisible', () => {
  it('ANDs the entity flag with its own body/category layer', () => {
    const layers: LayerVisibility = { 'app-1/coverage': false };
    // Visible entity on the main shell, visible layer.
    expect(isEffectivelyVisible({}, 'coverage', layers)).toBe(true);
    // Visible entity on the hidden boot layer.
    expect(isEffectivelyVisible({ bodyId: 'app-1' }, 'coverage', layers)).toBe(false);
    // Hidden entity on a visible layer.
    expect(isEffectivelyVisible({ visible: false }, 'coverage', layers)).toBe(false);
    // `visible: true` is the same as omitting it.
    expect(isEffectivelyVisible({ visible: true }, 'coverage', layers)).toBe(true);
  });
});

describe('category helpers (master toggle)', () => {
  const bodies = [MAIN_BODY_KEY, 'app-1', 'app-2'];

  it('enumerates one key per body', () => {
    expect(categoryLayerKeys(bodies, 'coverage')).toEqual([
      'main/coverage',
      'app-1/coverage',
      'app-2/coverage',
    ]);
  });

  it('reports the category visible while ANY body still shows it', () => {
    expect(isCategoryVisibleAnywhere({}, bodies, 'coverage')).toBe(true);
    expect(isCategoryVisibleAnywhere({ 'main/coverage': false }, bodies, 'coverage')).toBe(true);
    expect(
      isCategoryVisibleAnywhere(
        { 'main/coverage': false, 'app-1/coverage': false, 'app-2/coverage': false },
        bodies,
        'coverage'
      )
    ).toBe(false);
  });

  it('builds a patch that forces the category across every body', () => {
    expect(categoryLayerPatch(bodies, 'coverage', false)).toEqual({
      'main/coverage': false,
      'app-1/coverage': false,
      'app-2/coverage': false,
    });
    expect(categoryLayerPatch(bodies, 'coverage', true)).toEqual({
      'main/coverage': true,
      'app-1/coverage': true,
      'app-2/coverage': true,
    });
  });

  it('round-trips the master toggle: any-visible → hide all → show all', () => {
    let layers: LayerVisibility = {};
    // First press hides everywhere (something was visible).
    layers = { ...layers, ...categoryLayerPatch(bodies, 'coverage', false) };
    expect(isCategoryVisibleAnywhere(layers, bodies, 'coverage')).toBe(false);
    // Second press shows everywhere (nothing was visible).
    layers = { ...layers, ...categoryLayerPatch(bodies, 'coverage', true) };
    expect(isCategoryVisibleAnywhere(layers, bodies, 'coverage')).toBe(true);
  });

  it('a partially-hidden category hides fully on the next press', () => {
    const partial: LayerVisibility = { 'app-1/coverage': false };
    expect(isCategoryVisibleAnywhere(partial, bodies, 'coverage')).toBe(true);
    const next = { ...partial, ...categoryLayerPatch(bodies, 'coverage', false) };
    expect(isCategoryVisibleAnywhere(next, bodies, 'coverage')).toBe(false);
  });
});
