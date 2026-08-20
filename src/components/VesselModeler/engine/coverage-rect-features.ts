// ---------------------------------------------------------------------------
// Coverage rects grouped by comparison feature — GUIDANCE listing, not maths.
//
// A comparison row's expand shows "what did the planner draw here": the rects
// sitting on that feature, with their technique and note
// (docs/plans/2026-08-17-coverage-comparison-design.md, Surfaces §1). It is
// deliberately NOT a coverage calculation — the pivot locked in #12 made rects
// where/how guidance, and achieved % is measured against the feature, never
// against a rect. Nothing downstream may treat this grouping as area.
//
// Routing rule, one call deep: `rectIsPureCylinder` — the SAME canonical
// predicate `computeCoverage` routes area with — decides whether a rect stays on
// the barrel or drapes onto a closure. A rect that drapes is listed under BOTH
// the barrel and the closure it reaches, because that is what it guides. Which
// closure is the nearer tangent (a rect long enough to reach both ends of a
// vessel is not a scope instruction anyone writes).
//
// Pure: no React, no THREE.
// ---------------------------------------------------------------------------

import type { CoverageRectConfig, VesselState } from '../types';
import type { FeatureTargetRef } from './coverage-comparison';
import { rectIsPureCylinder } from './scan-sampling';

/** Feature key → the rects guiding it, in the model's own rect order. */
export type RectsByFeature = Map<string, CoverageRectConfig[]>;

/**
 * Feature keys one rect guides. Mirrors `listComparisonFeatures`' key vocabulary
 * (`cylinder` | `leftHead` | `rightHead` | `<appId>:shell` | `<appId>:dome`) so
 * the two can be joined by key with no translation layer.
 */
export function featureKeysForRect(rect: CoverageRectConfig, state: VesselState): string[] {
  const onMain = rect.bodyId === undefined;
  const isPipe = state.vesselShape === 'pipe';
  const pureCylinder = rectIsPureCylinder(rect, state);

  if (onMain) {
    const keys = ['cylinder'];
    // A pipe has no heads at all, so a draping rect has nowhere else to go.
    if (!pureCylinder && !isPipe) {
      const tanTanLength = state.length ?? 0;
      keys.push(rect.pos < tanTanLength / 2 ? 'leftHead' : 'rightHead');
    }
    return keys;
  }

  const app = state.appendages?.find((a) => a.id === rect.bodyId);
  if (!app) return [];
  const keys = [`${app.id}:shell`];
  // Only a dished closure emits a dome row (same gate as listComparisonFeatures).
  if (!pureCylinder && app.endClosure === 'dished') keys.push(`${app.id}:dome`);
  return keys;
}

/**
 * Every rect on the model, grouped by the feature key(s) it guides. Rects whose
 * body has been deleted appear nowhere — the same way a dangling body drops out
 * of the comparison rows.
 */
export function groupRectsByFeature(state: VesselState): RectsByFeature {
  const grouped: RectsByFeature = new Map();
  for (const rect of state.coverageRects ?? []) {
    for (const key of featureKeysForRect(rect, state)) {
      const bucket = grouped.get(key);
      if (bucket) bucket.push(rect);
      else grouped.set(key, [rect]);
    }
  }
  return grouped;
}

/** The rects guiding one feature, addressed the way the comparison rows are. */
export function rectsForFeature(state: VesselState, ref: FeatureTargetRef): CoverageRectConfig[] {
  const featureKey = ref.scope === 'main' ? ref.key : `${ref.appendageId}:${ref.slot}`;
  return (state.coverageRects ?? []).filter((rect) =>
    featureKeysForRect(rect, state).includes(featureKey)
  );
}
