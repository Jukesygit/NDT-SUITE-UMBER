// ---------------------------------------------------------------------------
// Read-only hover resolution — pure.
//
// The read-only viewport's ONLY pointer behaviour (beyond orbit, which comes
// free from OrbitControls) is a hover raycast. Everything the raycast result has
// to be turned into lives here so it can be unit-tested without a WebGL context:
//
//   1. composed-visibility filtering — THREE's Raycaster does NOT skip invisible
//      objects, so a hit must be validated by walking Object3D.visible up to the
//      vessel group, exactly like interaction-manager's `isEntityVisible`;
//   2. entity resolution — the mesh actually hit is often a child (a weld
//      segment, a rect fill), so the nearest ancestor carrying a `type` userData
//      is the entity;
//   3. labelling — mapping that userData back to the entity's display name.
//
// Deliberately THREE-free: it is written against the minimal structural shape of
// an Object3D (`userData` / `parent` / `visible`), which THREE objects satisfy.
// ---------------------------------------------------------------------------

import type { VesselState } from '../types';

/** Minimal structural view of an Object3D — what hover resolution actually reads. */
export interface HoverNode {
  userData?: Record<string, unknown>;
  parent: HoverNode | null;
  visible?: boolean;
}

/** What the viewport reports to its host on hover. */
export interface ReadOnlyHoverInfo {
  /** `userData.type` of the resolved entity, e.g. 'shell' | 'nozzle' | 'scanComposite'. */
  type: string;
  /** Display name of the entity when one can be resolved from the model. */
  label?: string;
  /** The resolved entity's userData, verbatim (scan composites carry their grid here). */
  userData: Record<string, unknown>;
  /** World-space intersection point, as a plain tuple (keeps this module THREE-free). */
  point: readonly [number, number, number];
}

/**
 * Composed visibility of `node`: false when it, or any ancestor below `root`, is
 * hidden. Mirrors `InteractionManager.isEntityVisible` — the layer/body terms are
 * already written into `Object3D.visible`, so this one walk covers entity flags,
 * layers and bodies at once.
 */
export function isComposedVisible(node: HoverNode | null, root: HoverNode | null): boolean {
  let cursor: HoverNode | null = node;
  while (cursor && cursor !== root) {
    if (cursor.visible === false) return false;
    cursor = cursor.parent;
  }
  return true;
}

/**
 * Nearest ancestor userData (inclusive of `node`) that names an entity `type`.
 * Stops at `root`, so an unlabelled hit never resolves to the vessel group.
 */
export function findEntityUserData(
  node: HoverNode | null,
  root: HoverNode | null
): Record<string, unknown> | null {
  let cursor: HoverNode | null = node;
  while (cursor && cursor !== root) {
    const type = cursor.userData?.type;
    if (typeof type === 'string' && type.length > 0) return cursor.userData ?? null;
    cursor = cursor.parent;
  }
  return null;
}

const asIndex = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * Display name for a resolved entity, read back out of the model by the id/index
 * its userData carries. Returns undefined for entities that have no name in the
 * schema (saddles) or when the id no longer resolves (stale mesh mid-rebuild).
 */
export function hoverLabelFor(
  state: VesselState,
  userData: Record<string, unknown>
): string | undefined {
  const { type } = userData;

  switch (type) {
    // The main shell has no name in the schema (`VesselState.id` is the inner
    // diameter, not an identifier) — `type: 'shell'` is the whole answer.
    case 'appendage':
      return state.appendages.find((a) => a.id === userData.bodyId)?.name;
    case 'nozzle': {
      const i = asIndex(userData.nozzleIdx);
      return i === null ? undefined : state.nozzles[i]?.name;
    }
    case 'liftingLug': {
      const i = asIndex(userData.lugIdx);
      return i === null ? undefined : state.liftingLugs[i]?.name;
    }
    case 'weld': {
      const i = asIndex(userData.weldIdx);
      return i === null ? undefined : state.welds[i]?.name;
    }
    case 'texture':
    case 'texture-border':
      return state.textures.find((t) => t.id === userData.id || t.id === userData.textureIdx)?.name;
    case 'scanComposite':
    case 'scanComposite-border':
      return state.scanComposites.find((s) => s.id === userData.id)?.name;
    case 'domeScan':
      return (state.domeScanComposites ?? []).find((s) => s.id === userData.id)?.name;
    case 'annotation':
    case 'annotation-fill':
      return state.annotations.find((a) => a.id === userData.annotationId)?.name;
    case 'coverageRect':
      return state.coverageRects.find((c) => c.id === userData.coverageRectId)?.name;
    case 'ruler':
      return state.rulers.find((r) => r.id === userData.rulerId)?.name;
    default:
      return undefined;
  }
}

/**
 * Full hover resolution for one raycast hit: reject hits under a hidden branch,
 * resolve the entity, label it. `null` means "nothing hoverable here" — the
 * caller should keep scanning the (depth-sorted) hit list.
 */
export function describeHover(
  state: VesselState,
  node: HoverNode | null,
  root: HoverNode | null,
  point: readonly [number, number, number]
): ReadOnlyHoverInfo | null {
  if (!isComposedVisible(node, root)) return null;
  const userData = findEntityUserData(node, root);
  if (!userData) return null;
  return {
    type: userData.type as string,
    label: hoverLabelFor(state, userData),
    userData,
    point,
  };
}
