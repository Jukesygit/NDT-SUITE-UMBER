// =============================================================================
// Vessel Modeler — Coverage comparison (targets vs achieved), pure
// =============================================================================
// THE single row source for every coverage-comparison surface: the modeler stats
// section and the coverage panel's target editor today; the Coverage tab, the
// project vessel-card strip and the generated report next
// (docs/plans/2026-08-17-coverage-comparison-design.md, "Surfaces").
//
// One feature instance per row: the main shell, each main head (vessel shapes
// only), each boot's lateral shell, and each DISHED boot's closure dome. Areas
// come from the coverage calculator's explicit buckets — `shellTotalMm2` /
// `domeTotalMm2` and friends, never the shell-only legacy `totalMm2` /
// `achievedMm2` aliases, which would silently drop every dome.
//
// Pure: no React, no THREE, no scene access. Components render these rows and
// must never re-derive a percentage, a delta or a status locally.
// =============================================================================

import type {
  AppendageCoverageTargets,
  CoverageTargetEntry,
  CoverageTargets,
  VesselState,
} from '../types';
import {
  computeAppendageCoverageTotals,
  computeRegionAchievedAreas,
  computeRegionCoveredAreas,
  computeRegionTotalAreas,
} from './coverage-calculator';
import { cardinalForHead } from './cardinal-directions';

/** Status of one feature instance against its target (design "Status semantics"). */
export type ComparisonStatus = 'met' | 'near' | 'short' | 'untracked';

/**
 * Amber band width, in percentage POINTS below target. Fixed by the design —
 * deliberately not configurable, so every surface bands identically.
 */
export const NEAR_BAND_POINTS = 5;

/** Guards exact band edges against float drift (e.g. 40 − 5 vs a summed 35). */
const EPS = 1e-9;

/**
 * Address of one feature's entry inside {@link CoverageTargets}. The persisted
 * key vocabulary (leftHead / cylinder / rightHead / appendages) never changes —
 * this is just a typed path into it.
 */
export type FeatureTargetRef =
  | { scope: 'main'; key: 'leftHead' | 'cylinder' | 'rightHead' }
  | { scope: 'appendage'; appendageId: string; slot: 'shell' | 'dome' };

/** A feature instance's identity, with no area maths attached (cheap to list). */
export interface CoverageFeature {
  /** Stable across renders: `leftHead` | `cylinder` | `rightHead` | `<appId>:shell` | `<appId>:dome`. */
  key: string;
  label: string;
  /** undefined = main shell body (legacy path); otherwise the appendage id. */
  bodyId?: string;
  ref: FeatureTargetRef;
}

/** Where a resolved target came from — see {@link targetPctOf}. */
export type TargetSource = 'rects' | 'manual';

/** A feature's resolved scope: the ONE answer {@link targetPctOf} hands out. */
export interface ResolvedTarget {
  /** The comparison target, 0-100. */
  pct: number;
  source: TargetSource;
  /** The same target expressed as area (mm²) of the feature. */
  mm2: number;
}

/** One comparison row: a feature instance with its target, achieved and status. */
export interface FeatureComparisonRow extends CoverageFeature {
  /** undefined ⇒ untracked (no target entry). Never coerced to 0. */
  targetPct?: number;
  /** How `targetPct` was resolved. Absent ⇔ untracked (mirrors `targetPct`). */
  targetSource?: TargetSource;
  /** `targetPct` as area (mm²). Absent ⇔ untracked. */
  targetMm2?: number;
  achievedPct: number;
  /** achieved − target, in percentage points. undefined when untracked. */
  deltaPct?: number;
  status: ComparisonStatus;
  totalMm2: number;
  achievedMm2: number;
}

/** Vessel-level rollup over TRACKED rows only. */
export interface ComparisonRollup {
  /** Area-weighted achieved %, tracked features only. */
  achievedPct: number;
  /** Area-weighted target %, tracked features only. */
  targetPct: number;
  met: number;
  near: number;
  short: number;
  /** Count of rows carrying a target (met + near + short). */
  tracked: number;
  /** Count of all rows, tracked or not — the "N of M" denominator. */
  total: number;
}

/**
 * THE single place a comparison target is decided. No surface — stats section,
 * target editor, report, share bundle — may pick a target for itself.
 *
 * Owner ruling 2026-08-21 (docs/plans/2026-08-21-rect-derived-scope-design.md):
 * **drawn coverage rects ARE how coverage is scoped.** This SUPERSEDES the
 * 2026-08-20 amendment in the 2026-08-17 design ("`scopedPct` is THE comparison
 * target"): the resolved scope is the target, and `scopedPct` is now only the
 * fallback leg of that resolution. `rbaPct` never moves — it is the
 * risk-assessment recommendation that INFORMS the scope and is never the
 * yardstick, on either leg.
 *
 * Resolution order:
 *   1. `rectCoveredMm2 > 0` → rect-derived (`covered / total`). A stored manual
 *      `scopedPct` is INERT while rects cover the feature: kept in state, not
 *      consulted, so clearing the rects restores it untouched.
 *   2. else an entry exists → its `scopedPct`, source `'manual'`.
 *   3. else undefined → UNTRACKED, which stays distinct from a 0% target.
 *
 * `rectCoveredMm2` is always 0 for a boot closure dome: no dome-rect raster
 * exists anywhere, so domes are permanently manual/untracked (design non-goal).
 */
export function targetPctOf(
  entry: CoverageTargetEntry | undefined,
  rectCoveredMm2: number,
  totalMm2: number
): ResolvedTarget | undefined {
  if (rectCoveredMm2 > 0) {
    return {
      pct: totalMm2 > 0 ? (rectCoveredMm2 / totalMm2) * 100 : 0,
      source: 'rects',
      mm2: rectCoveredMm2,
    };
  }
  if (entry) {
    return {
      pct: entry.scopedPct,
      source: 'manual',
      mm2: (entry.scopedPct / 100) * totalMm2,
    };
  }
  return undefined;
}

/** Reads a feature's target entry. undefined ⇒ untracked. */
export function readTargetEntry(
  targets: CoverageTargets | undefined,
  ref: FeatureTargetRef
): CoverageTargetEntry | undefined {
  if (!targets) return undefined;
  if (ref.scope === 'main') return targets[ref.key];
  return targets.appendages?.[ref.appendageId]?.[ref.slot];
}

/**
 * Immutably sets (or, with `entry: undefined`, REMOVES) one feature's target.
 * Emptied containers are dropped rather than left as `{}`, so a model whose
 * targets are all cleared serializes back to the legacy no-targets shape.
 * Returns undefined when nothing is left to persist.
 */
export function writeTargetEntry(
  targets: CoverageTargets | undefined,
  ref: FeatureTargetRef,
  entry: CoverageTargetEntry | undefined
): CoverageTargets | undefined {
  const next: CoverageTargets = { ...(targets ?? {}) };

  if (ref.scope === 'main') {
    if (entry) next[ref.key] = entry;
    else delete next[ref.key];
  } else {
    const appendages: Record<string, AppendageCoverageTargets> = { ...(next.appendages ?? {}) };
    const body: AppendageCoverageTargets = { ...(appendages[ref.appendageId] ?? {}) };
    if (entry) body[ref.slot] = entry;
    else delete body[ref.slot];

    if (body.shell === undefined && body.dome === undefined) delete appendages[ref.appendageId];
    else appendages[ref.appendageId] = body;

    if (Object.keys(appendages).length === 0) delete next.appendages;
    else next.appendages = appendages;
  }

  return Object.keys(next).length === 0 ? undefined : next;
}

/**
 * Every feature instance of this vessel, in display order, WITHOUT the heavy
 * area sweeps — for surfaces that only need labels and target addresses (the
 * coverage panel's editor). Head rows exist only for vessel shapes; a pipe has
 * no heads, mirroring how the scan-coverage stats section gates its rows.
 */
export function listComparisonFeatures(state: VesselState): CoverageFeature[] {
  const isPipe = state.vesselShape === 'pipe';
  const isVertical = state.orientation === 'vertical';
  const rotation = state.visuals?.cardinalRotation ?? 0;

  // Same naming the modeler's Coverage section has always used: a
  // vertical vessel reads Top/Bottom, a horizontal one reads by compass heading.
  const headLabel = (head: 'left' | 'right'): string => {
    if (isVertical) return head === 'left' ? 'Top Dome' : 'Bottom Dome';
    return `${cardinalForHead(head, rotation)} Dome`;
  };

  const features: CoverageFeature[] = [];
  if (!isPipe) {
    features.push({
      key: 'leftHead',
      label: headLabel('left'),
      ref: { scope: 'main', key: 'leftHead' },
    });
  }
  features.push({ key: 'cylinder', label: 'Shell', ref: { scope: 'main', key: 'cylinder' } });
  if (!isPipe) {
    features.push({
      key: 'rightHead',
      label: headLabel('right'),
      ref: { scope: 'main', key: 'rightHead' },
    });
  }

  for (const a of state.appendages ?? []) {
    features.push({
      key: `${a.id}:shell`,
      label: `${a.name} shell`,
      bodyId: a.id,
      ref: { scope: 'appendage', appendageId: a.id, slot: 'shell' },
    });
    // Only a dished closure is a real surface to inspect; flat/open boots emit
    // no dome row at all (matching computeAppendageCoverageTotals).
    if (a.endClosure === 'dished') {
      features.push({
        key: `${a.id}:dome`,
        label: `${a.name} dome`,
        bodyId: a.id,
        ref: { scope: 'appendage', appendageId: a.id, slot: 'dome' },
      });
    }
  }

  return features;
}

/** Bands achieved against target. Untracked when there is no target at all. */
export function statusFor(targetPct: number | undefined, achievedPct: number): ComparisonStatus {
  if (targetPct === undefined) return 'untracked';
  if (achievedPct >= targetPct - EPS) return 'met';
  if (achievedPct >= targetPct - NEAR_BAND_POINTS - EPS) return 'near';
  return 'short';
}

/**
 * One comparison row per feature instance — the single source for all surfaces.
 *
 * PERF: this runs the rect sweep (`computeRegionCoveredAreas` → `computeCoverage`)
 * as well as the achieved sweeps, because the scope side is now rect-derived.
 * Every call site is settled or one-shot by construction (modeler sections settle
 * at 250ms; the planning summary, the report and the share stats are one-shot) —
 * acceptable as-is. Do NOT wire this to live drag state (standing PERF RULE), and
 * do not paper over a misuse with caching here.
 */
export function computeComparisonRows(state: VesselState): FeatureComparisonRow[] {
  const regionTotals = computeRegionTotalAreas(state);
  const regionAchieved = computeRegionAchievedAreas(state);
  const regionCovered = computeRegionCoveredAreas(state);
  const appendageTotals = computeAppendageCoverageTotals(state);
  const byAppendage = new Map(appendageTotals.map((t) => [t.appendageId, t]));

  return listComparisonFeatures(state).map((feature) => {
    let totalMm2 = 0;
    let achievedMm2 = 0;
    // Rect-DRAWN area of this feature — the scope side. Stays 0 wherever no rect
    // raster exists, which routes that feature to the manual/untracked legs.
    let rectCoveredMm2 = 0;

    if (feature.ref.scope === 'main') {
      totalMm2 = regionTotals[feature.ref.key];
      achievedMm2 = regionAchieved[feature.ref.key];
      rectCoveredMm2 = regionCovered[feature.ref.key];
    } else {
      const totals = byAppendage.get(feature.ref.appendageId);
      if (totals) {
        // Explicit shell*/dome* buckets only — the legacy totalMm2/achievedMm2
        // aliases are shell-only and would report a dome as its own shell.
        if (feature.ref.slot === 'shell') {
          totalMm2 = totals.shellTotalMm2;
          achievedMm2 = totals.shellAchievedMm2;
          // `coveredMm2` is the boot's LATERAL rect sweep — shell only, by
          // construction (computeAppendageCoveredArea takes the boot cylinder).
          rectCoveredMm2 = totals.coveredMm2;
        } else {
          totalMm2 = totals.domeTotalMm2 ?? 0;
          achievedMm2 = totals.domeAchievedMm2 ?? 0;
          // A boot closure dome has NO rect raster anywhere in the engine, so it
          // is never rect-derived — permanently manual/untracked (design
          // 2026-08-21 non-goal). Crediting it the boot's shell `coveredMm2`
          // would be the exact alias leak the shell*/dome* split exists to stop.
          rectCoveredMm2 = 0;
        }
      }
    }

    const achievedPct = totalMm2 > 0 ? (achievedMm2 / totalMm2) * 100 : 0;
    const entry = readTargetEntry(state.coverageTargets, feature.ref);
    const target = targetPctOf(entry, rectCoveredMm2, totalMm2);

    return {
      ...feature,
      targetPct: target?.pct,
      targetSource: target?.source,
      targetMm2: target?.mm2,
      achievedPct,
      deltaPct: target === undefined ? undefined : achievedPct - target.pct,
      status: statusFor(target?.pct, achievedPct),
      totalMm2,
      achievedMm2,
    };
  });
}

/**
 * Area-weighted rollup across TRACKED rows only — untracked features contribute
 * neither area nor counts, so adding an untracked boot never dilutes the number.
 */
export function computeComparisonRollup(rows: FeatureComparisonRow[]): ComparisonRollup {
  let totalMm2 = 0;
  let achievedMm2 = 0;
  let targetMm2 = 0;
  let met = 0;
  let near = 0;
  let short = 0;

  for (const row of rows) {
    if (row.targetPct === undefined) continue;
    totalMm2 += row.totalMm2;
    achievedMm2 += row.achievedMm2;
    targetMm2 += (row.targetPct / 100) * row.totalMm2;
    if (row.status === 'met') met++;
    else if (row.status === 'near') near++;
    else short++;
  }

  return {
    achievedPct: totalMm2 > 0 ? (achievedMm2 / totalMm2) * 100 : 0,
    targetPct: totalMm2 > 0 ? (targetMm2 / totalMm2) * 100 : 0,
    met,
    near,
    short,
    tracked: met + near + short,
    total: rows.length,
  };
}

// ---------------------------------------------------------------------------
// Display formatting — shared by EVERY comparison surface
// ---------------------------------------------------------------------------
// These live beside the rows on purpose: the modeler stats section, the
// projects Coverage section and the printed report must round identically, or
// the "one source" promise leaks at the last inch. Callers format, never derive.

/** Percentage text. Sub-0.1% values keep a second decimal so they never read 0. */
export function formatCoveragePct(pct: number): string {
  return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

/** Signed delta in percentage points, always carrying its sign (− is U+2212). */
export function formatCoverageDelta(delta: number): string {
  const rounded = Math.abs(delta) < 0.05 ? 0 : delta;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`;
}
