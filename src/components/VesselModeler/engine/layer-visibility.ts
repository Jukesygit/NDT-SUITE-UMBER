// ---------------------------------------------------------------------------
// Layer visibility — pure.
//
// A layer is one body's slice of one outliner category, keyed
// `${bodyKey}/${categoryKey}` (bodyKey = MAIN_BODY_KEY for the vessel shell,
// otherwise the appendage id). The map is SPARSE: an ABSENT key means visible,
// mirroring the per-entity `visible !== false` convention, so the default state
// is `{}` and untouched layers never appear.
//
// Effective visibility = entity flag ∧ its layer ∧ its body. It is composed into
// Object3D.visible by the viewport — NEVER by filtering state: stats, coverage
// and wall-loss must stay blind to visibility.
//
// Deliberately dependency-free (no THREE, no React, no vessel types) so the
// viewport, the outliner tree and the future read-only viewer share one contract.
// ---------------------------------------------------------------------------

/** Body key of the main vessel shell; appendages use their own id. */
export const MAIN_BODY_KEY = 'main';

/** Sparse layer overlay. Key `${bodyKey}/${categoryKey}`; ABSENT ⇒ visible. */
export type LayerVisibility = Record<string, boolean>;

/** Shape shared by every layer-scoped entity (`bodyId` undefined ⇒ main shell). */
export interface LayerScoped {
  visible?: boolean;
  bodyId?: string;
}

export function layerKey(bodyKey: string, categoryKey: string): string {
  return `${bodyKey}/${categoryKey}`;
}

export function bodyKeyOf(entity: LayerScoped): string {
  return entity.bodyId ?? MAIN_BODY_KEY;
}

/** Resolved visibility of one layer. Absent ⇒ visible. */
export function isLayerVisible(
  layers: LayerVisibility | undefined,
  bodyKey: string,
  categoryKey: string
): boolean {
  return layers?.[layerKey(bodyKey, categoryKey)] !== false;
}

/**
 * entity flag ∧ its own layer. The body term is applied by the caller, which is
 * the only side that knows the body collection.
 */
export function isEffectivelyVisible(
  entity: LayerScoped,
  categoryKey: string,
  layers: LayerVisibility | undefined
): boolean {
  return entity.visible !== false && isLayerVisible(layers, bodyKeyOf(entity), categoryKey);
}

/** Every layer key one category occupies across the given bodies. */
export function categoryLayerKeys(bodyKeys: readonly string[], categoryKey: string): string[] {
  return bodyKeys.map((b) => layerKey(b, categoryKey));
}

/** True while at least one body still shows the category (drives master-eye lit state). */
export function isCategoryVisibleAnywhere(
  layers: LayerVisibility | undefined,
  bodyKeys: readonly string[],
  categoryKey: string
): boolean {
  return bodyKeys.some((b) => isLayerVisible(layers, b, categoryKey));
}

/** Patch forcing one category to `visible` on every body (master / palette toggles). */
export function categoryLayerPatch(
  bodyKeys: readonly string[],
  categoryKey: string,
  visible: boolean
): LayerVisibility {
  const patch: LayerVisibility = {};
  for (const key of categoryLayerKeys(bodyKeys, categoryKey)) patch[key] = visible;
  return patch;
}
