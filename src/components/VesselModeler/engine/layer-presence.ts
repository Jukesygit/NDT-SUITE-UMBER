// ---------------------------------------------------------------------------
// Layer presence — which layer categories a vessel actually has content in.
//
// The aggregate counterpart of `buildOutlinerTree`'s per-body "drop empty
// categories" rule, for surfaces that show ONE toggle per category across every
// body (the projects Coverage section, the client viewer later) rather than the
// outliner's body → category tree.
//
// Vocabulary and order come from `LAYER_CATEGORIES` — the single layer
// vocabulary — never from a local list, and the routing mirrors the outliner
// exactly: entities carry `bodyId` (undefined ⇒ main shell) and the collections
// without one (saddles, textures, inspection images, rulers, pipelines) always
// belong to the main shell. A regression test pins both against
// `buildOutlinerTree` so the two can never drift.
//
// Pure: no React, no THREE. `outliner-tree`'s only runtime dependency is
// `layer-visibility`, so importing the vocabulary here pulls in no editor code.
// ---------------------------------------------------------------------------

import type { VesselState } from '../types';
import { LAYER_CATEGORIES, type LayerKey } from '../outliner-tree';
import { MAIN_BODY_KEY } from './layer-visibility';

/** One category that has at least one entity somewhere on the vessel. */
export interface PresentLayerCategory {
  key: LayerKey;
  label: string;
  /** Entities in this category across every body — the toggle's count badge. */
  count: number;
}

/** Every body key a layer can be scoped to: the main shell, then each boot. */
export function layerBodyKeys(state: VesselState): string[] {
  return [MAIN_BODY_KEY, ...(state.appendages ?? []).map((a) => a.id)];
}

/**
 * Categories carrying content, in {@link LAYER_CATEGORIES} order. Counts are
 * body-blind on purpose — the consumer toggles a category on ALL bodies at once
 * (`categoryLayerPatch`), so a per-body split would be a number nobody acts on.
 */
export function presentLayerCategories(state: VesselState): PresentLayerCategory[] {
  const counts: Record<LayerKey, number> = {
    nozzles: state.nozzles?.length ?? 0,
    welds: state.welds?.length ?? 0,
    lugs: state.liftingLugs?.length ?? 0,
    saddles: state.saddles?.length ?? 0,
    scans: state.scanComposites?.length ?? 0,
    domeScans: state.domeScanComposites?.length ?? 0,
    annotations: state.annotations?.length ?? 0,
    coverage: state.coverageRects?.length ?? 0,
    images: state.inspectionImages?.length ?? 0,
    rulers: state.rulers?.length ?? 0,
    pipelines: state.pipelines?.length ?? 0,
    textures: state.textures?.length ?? 0,
  };

  return LAYER_CATEGORIES.filter(({ key }) => counts[key] > 0).map(({ key, label }) => ({
    key,
    label,
    count: counts[key],
  }));
}
