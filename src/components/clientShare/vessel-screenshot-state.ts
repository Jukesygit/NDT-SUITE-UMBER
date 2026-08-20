// ---------------------------------------------------------------------------
// Publish-time vessel screenshot — the pure half.
//
// Two separate questions decide what a card image shows: WHAT is rendered, and
// HOW it is lit. This module owns the first one, and owns it alone so the rule
// below can be pinned by a test that never opens a WebGL context.
//
// THE PII INVARIANT EXTENDS TO PIXELS. A published card image is published
// bytes. Rendering the caller's raw model would let a thumbnail show exactly
// what the serialized model deliberately removed — an unpublished annotation,
// a rect's planning note baked into a label. So the capture never sees raw
// state: it renders `screenshotSourceState`, which IS the sanitised model the
// bundle ships (`bundle-builder`, rule 1: exclusion is removal, not hiding).
// A future caller cannot opt out of this, because there is no entry point that
// takes an already-sanitised state.
//
// CHUNKING: this reaches `bundle-builder`, whose graph includes three.js.
// Dynamic import only — never statically from a projects-page module.
// ---------------------------------------------------------------------------

import type { LayerVisibility } from '../VesselModeler/engine/layer-visibility';
import type { LayerKey } from '../VesselModeler/outliner-tree';
import type { VesselState } from '../VesselModeler/types';
import { sanitizeVesselStateForShare } from './bundle-builder';
import { SHARE_VIEWER_INITIAL_LAYERS } from './bundle-types';

/**
 * The state a card image is rendered from: the published bundle's own model,
 * not the publisher's. Unpublished categories are already empty here and the
 * hard-coded exclusions are already applied, so nothing the renderer can reach
 * is anything the client would not receive as JSON.
 *
 * @param published Layer categories the publisher ticked — the same set handed
 *                  to `buildShareBundle`, so image and model can never disagree.
 */
export function screenshotSourceState(
  state: VesselState,
  published: ReadonlySet<LayerKey>,
  maxDimension?: number
): VesselState {
  return sanitizeVesselStateForShare(state, published, maxDimension);
}

/**
 * The layer overlay the capture renders with.
 *
 * It is the SAME constant `ShareVesselViewer` seeds its layer state from — a
 * mirror by shared reference, not by a copied literal that can drift. The card
 * must show what the client sees the moment the vessel opens; if the viewer's
 * opening state ever stops being "everything the bundle carries", changing
 * `SHARE_VIEWER_INITIAL_LAYERS` moves both sides at once.
 */
export const SCREENSHOT_LAYERS: LayerVisibility = SHARE_VIEWER_INITIAL_LAYERS;
