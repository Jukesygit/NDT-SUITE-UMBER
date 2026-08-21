// =============================================================================
// scan-grid-hydration — re-attach cloud thickness grids to a loaded VesselState
// =============================================================================
// A cloud save deliberately STRIPS composite `data`: the grids live in their own
// `scan_composites` table/bucket, not in the model JSON (see
// `engine/vessel-serialization.ts`, `path: 'cloud'`). Anything that deserializes
// a cloud-saved model and then wants to draw a heatmap, read a thickness under
// the cursor, or ship the grid to someone else must therefore fetch the grids
// back first.
//
// The vessel modeler has always done this inline after load. This module is the
// SAME merge, extracted so the non-modeler consumers (client-share publish, the
// projects Coverage-vs-Scope panel) cannot silently ship or render empty grids.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ MIRROR — `src/components/VesselModeler/hooks/useVesselPersistence.ts`     │
// │ (the rehydration block after `SET_VESSEL` / `DESELECT_ALL`).              │
// │                                                                           │
// │ Selection predicate, both kinds:                                          │
// │     sc.cloudId && (!sc.data || sc.data.length === 0)                      │
// │ Merge, both kinds:                                                        │
// │     data:  cloud.thickness_data                                           │
// │     xAxis: cloud.x_axis                                                   │
// │     yAxis: cloud.y_axis                                                   │
// │     stats: cloud.stats || existing.stats                                  │
// │                                                                           │
// │ These two must NOT drift. If the modeler's block changes, change this one │
// │ in the same commit (and vice versa) — a divergence shows up as a client   │
// │ report whose numbers disagree with the modeler that produced it.          │
// └───────────────────────────────────────────────────────────────────────────┘
//
// Deliberately NOT mirrored: the modeler also clears its heatmap caches and
// dispatches history-skipped reducer actions. Those are modeler-local concerns;
// this module is a pure merge over a fetched map and imports no React and no
// three.js (the VesselState import is type-only, and `types.ts` has no imports
// of its own, so nothing renderer-shaped rides in behind it).
// =============================================================================

import { getScanComposite, type ScanCompositeRecord } from './scan-composite-service';
import type { VesselState } from '../components/VesselModeler/types';

/** One composite whose grid could not be fetched. The composite is left as-is. */
export interface ScanGridHydrationFailure {
  /** Which array it came from — the two are fetched from the same table. */
  kind: 'scan' | 'dome';
  /** Local composite id (`ScanCompositeConfig.id` / `DomeScanConfig.id`). */
  id: string;
  /** Display name, for messages a human has to act on. */
  name: string;
  /** `scan_composites.id` that failed to load. */
  cloudId: string;
  message: string;
}

export interface ScanGridHydrationResult {
  /**
   * The state with every fetchable grid merged in. Untouched composites keep
   * their object identity; when nothing needed hydrating this IS the input.
   */
  state: VesselState;
  /** Empty on full success. Callers decide whether a failure is fatal. */
  failures: ScanGridHydrationFailure[];
}

/** The modeler's predicate, verbatim: saved to cloud, grid not inline. */
function needsGrid(composite: { cloudId?: string; data: (number | null)[][] }): boolean {
  return Boolean(composite.cloudId && (!composite.data || composite.data.length === 0));
}

/** Supabase rejects with plain objects, not Errors — read a message off either. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

/**
 * Fetch and merge the cloud thickness grids a deserialized cloud model is
 * missing. Never throws: a fetch that fails lands in `failures` and leaves its
 * composite exactly as it was, so a viewer can degrade and a publisher can
 * refuse — the policy belongs to the caller, not here.
 */
export async function hydrateScanGrids(state: VesselState): Promise<ScanGridHydrationResult> {
  const scanTargets = state.scanComposites.filter(needsGrid);
  const domeTargets = state.domeScanComposites.filter(needsGrid);
  if (scanTargets.length === 0 && domeTargets.length === 0) {
    return { state, failures: [] };
  }

  // One fetch per unique cloudId, all in flight together. The same cloudId can
  // legitimately be referenced by more than one composite (and by both kinds),
  // so the results are keyed and merged everywhere they match.
  const cloudIds = [
    ...new Set([...scanTargets, ...domeTargets].map((composite) => composite.cloudId!)),
  ];
  const fetched = new Map<string, ScanCompositeRecord>();
  const errors = new Map<string, string>();
  await Promise.all(
    cloudIds.map(async (cloudId) => {
      try {
        fetched.set(cloudId, await getScanComposite(cloudId));
      } catch (error) {
        errors.set(cloudId, messageOf(error));
      }
    })
  );

  const failures: ScanGridHydrationFailure[] = [];
  const recordFailure = (
    kind: ScanGridHydrationFailure['kind'],
    composite: { id: string; name: string; cloudId?: string }
  ) => {
    const cloudId = composite.cloudId!;
    failures.push({
      kind,
      id: composite.id,
      name: composite.name,
      cloudId,
      message: errors.get(cloudId) ?? 'scan composite not found',
    });
  };

  const scanComposites = state.scanComposites.map((existing) => {
    if (!needsGrid(existing)) return existing;
    const cloud = fetched.get(existing.cloudId!);
    if (!cloud) {
      recordFailure('scan', existing);
      return existing;
    }
    return {
      ...existing,
      data: cloud.thickness_data,
      xAxis: cloud.x_axis,
      yAxis: cloud.y_axis,
      stats: cloud.stats || existing.stats,
    };
  });

  const domeScanComposites = state.domeScanComposites.map((existing) => {
    if (!needsGrid(existing)) return existing;
    const cloud = fetched.get(existing.cloudId!);
    if (!cloud) {
      recordFailure('dome', existing);
      return existing;
    }
    return {
      ...existing,
      data: cloud.thickness_data,
      xAxis: cloud.x_axis,
      yAxis: cloud.y_axis,
      stats: cloud.stats || existing.stats,
    };
  });

  return { state: { ...state, scanComposites, domeScanComposites }, failures };
}

/**
 * "Scan 1, Dome A" — the composites a human has to go and fix, for an error or
 * a warning line. Names, not ids: the id is a local handle nobody has seen.
 */
export function describeHydrationFailures(failures: ScanGridHydrationFailure[]): string {
  return failures.map((failure) => failure.name || failure.id).join(', ');
}
