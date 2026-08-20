// =============================================================================
// Publish-time card screenshots — what the renderer is allowed to see
// =============================================================================
// A card image is published bytes, so the PII rule that governs the bundle
// governs the pixels too. Two things are pinned here, and neither needs a GPU:
//
//   • the capture's source state is the SANITISED model — an unpublished
//     category's entities are gone before anything can be drawn, and a rect's
//     planning free-text is gone before it can reach a label;
//   • the capture renders with the SAME layer overlay the client's viewer opens
//     with, so the tile a client clicks and the view it opens agree.
//
// Deliberately imports `vessel-screenshot-state`, not `vessel-screenshot`: the
// invariant belongs to the pure half and must stay testable without a WebGL
// context. If this file ever needs to reach the renderer, the split has been
// undone and the invariant has lost its cheap proof.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AnnotationShapeConfig,
  type CoverageRectConfig,
  type VesselState,
} from '../../VesselModeler/types';
import { MAIN_BODY_KEY, isLayerVisible } from '../../VesselModeler/engine/layer-visibility';
import type { LayerKey } from '../../VesselModeler/outliner-tree';
import { SHARE_LAYER_DEFAULTS, SHARE_VIEWER_INITIAL_LAYERS } from '../bundle-types';
import { SCREENSHOT_LAYERS, screenshotSourceState } from '../vessel-screenshot-state';

const RECT: CoverageRectConfig = {
  id: 1,
  name: 'Shell band A',
  pos: 2000,
  angle: 90,
  width: 400,
  height: 400,
  color: '#ffffff',
  lineWidth: 10,
  filled: false,
  fillOpacity: 0.2,
  technique: 'paut-corrosion-mapping',
  techniqueOther: 'ask Dave about the rate',
  note: 'Client contact is Jane Roe, 07700 900000 — do not scan during shift change',
};

const ANNOTATION = {
  id: 1,
  name: 'Pitting cluster',
  type: 'rectangle',
  pos: 1000,
  angle: 90,
  width: 200,
  height: 200,
  color: '#ff0000',
  lineWidth: 5,
  showLabel: true,
} as AnnotationShapeConfig;

const ALL_LAYERS = new Set(Object.keys(SHARE_LAYER_DEFAULTS) as LayerKey[]);

function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    coverageRects: [RECT],
    annotations: [ANNOTATION],
    ...overrides,
  };
}

describe('screenshotSourceState — the renderer never sees the raw model', () => {
  it('drops the entities of every layer the publisher did not tick', () => {
    const source = screenshotSourceState(makeState(), new Set<LayerKey>(['coverage']));

    // Nothing to draw means nothing that CAN be drawn: an unpublished
    // annotation cannot appear in a thumbnail because it no longer exists.
    expect(source.annotations).toEqual([]);
    expect(source.nozzles).toEqual([]);
    expect(source.inspectionImages).toEqual([]);
    expect(source.coverageRects).toHaveLength(1);
  });

  it('strips rect planning free-text even with every layer published', () => {
    const source = screenshotSourceState(makeState(), ALL_LAYERS);

    expect(source.coverageRects[0].note).toBeUndefined();
    expect(source.coverageRects[0].techniqueOther).toBeUndefined();
    // The technique enum survives — a closed vocabulary, and what makes a
    // published coverage plan legible.
    expect(source.coverageRects[0].technique).toBe('paut-corrosion-mapping');
  });

  it('never publishes reference drawings', () => {
    const source = screenshotSourceState(makeState(), ALL_LAYERS);
    expect(source.referenceDrawings).toEqual([]);
  });

  it('leaves the publisher’s own state untouched', () => {
    const state = makeState();
    screenshotSourceState(state, new Set<LayerKey>());

    expect(state.annotations).toHaveLength(1);
    expect(state.coverageRects[0].note).toBe(RECT.note);
  });
});

describe('SCREENSHOT_LAYERS — the card mirrors the viewer, by reference', () => {
  it('is the very constant the client viewer opens with', () => {
    // Identity, not equality: two empty objects would drift apart silently the
    // day the viewer's opening state stops being "show everything shipped".
    expect(SCREENSHOT_LAYERS).toBe(SHARE_VIEWER_INITIAL_LAYERS);
  });

  it('shows every category the bundle can carry', () => {
    for (const layer of Object.keys(SHARE_LAYER_DEFAULTS) as LayerKey[]) {
      expect(isLayerVisible(SCREENSHOT_LAYERS, MAIN_BODY_KEY, layer)).toBe(true);
      expect(isLayerVisible(SCREENSHOT_LAYERS, 'appendage-1', layer)).toBe(true);
    }
  });

  it('cannot be mutated by either side', () => {
    expect(Object.isFrozen(SHARE_VIEWER_INITIAL_LAYERS)).toBe(true);
  });
});
