// ---------------------------------------------------------------------------
// Client-share bundle builder — pure.
//
// Turns saved vessel state into the immutable snapshot a client is served
// (docs/plans/2026-08-17-client-sharing-design.md, "Bundle format"). Three
// rules make this module worth reading carefully:
//
// 1. EXCLUSION IS REMOVAL, NOT HIDING. A layer the publisher did not tick is
//    not shipped hidden — its entities are deleted from the serialized model.
//    A client cannot toggle their way to unpublished content because it is not
//    in the file. The same applies to the hard-coded exclusions below, which are
//    NOT publish-dialog options and must never become options.
//
// 2. STATS ARE COMPUTED BEFORE DECIMATION. Coverage percentages come from the
//    full-fidelity state; only the grids the viewer draws and hovers are
//    downsampled. Publishing must never change a number.
//
// 3. DECIMATION IS MIN-POOLED, NOT SAMPLED — see `grid-decimation.ts`, which
//    owns that rule and its reasoning.
//
// CHUNKING: this reaches `serializeVesselState`, whose transitive graph includes
// three.js. Import it dynamically from the publish flow — never statically from
// a projects-page module.
// ---------------------------------------------------------------------------

import type { CameraBookmark, CoverageRectConfig, VesselState } from '../VesselModeler/types';
import type { LayerKey } from '../VesselModeler/outliner-tree';
import {
  computeComparisonRollup,
  computeComparisonRows,
} from '../VesselModeler/engine/coverage-comparison';
import { serializeVesselState } from '../VesselModeler/engine/vessel-serialization';
import { MAX_GRID_DIMENSION, decimateComposite } from './grid-decimation';
import {
  MANIFEST_PATH,
  PREPARED_BY,
  SHARE_BUNDLE_FORMAT,
  vesselModelPath,
  vesselScreenshotPath,
  type ShareBookmark,
  type ShareBundle,
  type ShareBundleFile,
  type ShareManifest,
  type ShareManifestProject,
  type ShareManifestVessel,
  type ShareStatRollup,
  type ShareStatRow,
} from './bundle-types';

export { MAX_GRID_DIMENSION, decimateComposite } from './grid-decimation';

// The publish defaults live in `bundle-types` (the dialog needs them without
// this module's three.js-bearing graph); re-exported so builder consumers have
// one import.
export { SHARE_LAYER_DEFAULTS } from './bundle-types';

/** Which VesselState collection each layer category gates. */
const LAYER_COLLECTIONS: Record<LayerKey, keyof VesselState> = {
  nozzles: 'nozzles',
  welds: 'welds',
  lugs: 'liftingLugs',
  saddles: 'saddles',
  scans: 'scanComposites',
  domeScans: 'domeScanComposites',
  annotations: 'annotations',
  coverage: 'coverageRects',
  images: 'inspectionImages',
  rulers: 'rulers',
  pipelines: 'pipelines',
  textures: 'textures',
};

// ---------------------------------------------------------------------------
// Hard-coded exclusions
// ---------------------------------------------------------------------------

/**
 * Free-text fields stripped from every published bundle regardless of which
 * layers were ticked. These are internal planning instructions and the one
 * place free text could carry a name, a rate, or a comment never meant to
 * leave the company. Locked by the design (#8) — do NOT make them options.
 */
function stripRectGuidance(rect: CoverageRectConfig): CoverageRectConfig {
  const stripped: CoverageRectConfig = { ...rect };
  delete stripped.note;
  delete stripped.techniqueOther;
  // The `technique` enum survives: it is a closed vocabulary and it is what
  // makes a published coverage plan legible ("PAUT corrosion mapping here").
  return stripped;
}

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

/**
 * The state that actually ships: unpublished categories emptied, hard-coded
 * exclusions applied, grids decimated.
 *
 * @param published Layer categories the publisher ticked.
 */
export function sanitizeVesselStateForShare(
  state: VesselState,
  published: ReadonlySet<LayerKey>,
  maxDimension = MAX_GRID_DIMENSION
): VesselState {
  const next: VesselState = { ...state };

  // Empty every collection whose category was not published. Emptying rather
  // than flagging is the whole point — see rule 1 at the top of this file.
  for (const [layer, collection] of Object.entries(LAYER_COLLECTIONS) as [
    LayerKey,
    keyof VesselState,
  ][]) {
    if (!published.has(layer)) {
      (next as unknown as Record<string, unknown>)[collection] = [];
    }
  }

  // Annotations, when their layer IS published, ship with their labels intact:
  // an annotation is an inspection finding, which is the deliverable. Only the
  // coverage rects' planning free-text is stripped unconditionally.
  next.coverageRects = next.coverageRects.map(stripRectGuidance);
  next.scanComposites = next.scanComposites.map((c) => decimateComposite(c, maxDimension));

  // Reference drawings are internal source documents, are not a layer anyone
  // can toggle, and are the largest thing in a saved model. Never published.
  next.referenceDrawings = [];

  return next;
}

// ---------------------------------------------------------------------------
// Stats + bookmarks projection
// ---------------------------------------------------------------------------

/** Per-feature rows for the bundle. Numbers only — the viewer formats them. */
export function buildShareStats(state: VesselState): {
  rows: ShareStatRow[];
  rollup: ShareStatRollup;
} {
  const rows = computeComparisonRows(state);
  const rollup = computeComparisonRollup(rows);
  return {
    rows: rows.map((r) => ({
      key: r.key,
      label: r.label,
      targetPct: r.targetPct,
      achievedPct: r.achievedPct,
      deltaPct: r.deltaPct,
      status: r.status,
    })),
    rollup,
  };
}

/** Bookmarks in the bundle's own form — copied, not aliased, so a later edit to
 *  the model can never mutate a published snapshot's poses. */
export function toShareBookmarks(bookmarks: CameraBookmark[] | undefined): ShareBookmark[] {
  return (bookmarks ?? []).map((bm) => ({
    id: bm.id,
    name: bm.name,
    position: [...bm.position],
    target: [...bm.target],
  }));
}

// ---------------------------------------------------------------------------
// Bundle assembly
// ---------------------------------------------------------------------------

/**
 * Round-trip a JSON payload so the in-memory bundle IS the uploaded bytes.
 *
 * The serialization spec writes absent optional fields as `key: undefined`,
 * which `JSON.stringify` drops on the way to storage. Without this, the object
 * a reviewer (or an exclusion test) inspects would carry keys the client never
 * receives — and "the bundle still has a `note` key" would be a false alarm
 * exactly where false alarms are most expensive.
 */
function toWireJson(payload: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

/** One vessel handed to the builder: its identity plus its saved model. */
export interface ShareSourceVessel {
  id: string;
  name: string;
  tag?: string;
  type?: string;
  vesselState: VesselState;
  /** Publish-time card image, when the publisher captured one. */
  screenshot?: Blob;
}

export interface BuildShareBundleParams {
  project: ShareManifestProject;
  vessels: ShareSourceVessel[];
  published: ReadonlySet<LayerKey>;
  revision: number;
  /** Publish timestamp, injected so the builder stays pure and testable. */
  publishedAt: string;
  maxDimension?: number;
}

/**
 * Build a complete bundle: one manifest plus one model (and optional
 * screenshot) per vessel.
 *
 * Order matters and is load-bearing: stats are computed from the FULL state,
 * then the state is sanitised and decimated for shipping. Swapping those two
 * lines would make a published coverage percentage disagree with the app's.
 */
export function buildShareBundle(params: BuildShareBundleParams): ShareBundle {
  const { project, vessels, published, revision, publishedAt, maxDimension } = params;
  const files: ShareBundleFile[] = [];
  const manifestVessels: ShareManifestVessel[] = [];

  for (const vessel of vessels) {
    const { rows, rollup } = buildShareStats(vessel.vesselState);
    const shipped = sanitizeVesselStateForShare(vessel.vesselState, published, maxDimension);

    const modelPath = vesselModelPath(vessel.id);
    files.push({
      path: modelPath,
      body: toWireJson(serializeVesselState(shipped, { path: 'cloud' })),
      contentType: 'application/json',
    });

    let screenshotPath: string | undefined;
    if (vessel.screenshot) {
      screenshotPath = vesselScreenshotPath(vessel.id);
      files.push({
        path: screenshotPath,
        body: vessel.screenshot,
        contentType: 'image/png',
      });
    }

    manifestVessels.push({
      id: vessel.id,
      name: vessel.name,
      tag: vessel.tag,
      type: vessel.type,
      modelPath,
      screenshotPath,
      bookmarks: toShareBookmarks(vessel.vesselState.cameraBookmarks),
      stats: rows,
      rollup,
    });
  }

  const manifest: ShareManifest = {
    formatVersion: SHARE_BUNDLE_FORMAT,
    revision,
    publishedAt,
    preparedBy: PREPARED_BY,
    project,
    publishedLayers: [...published],
    vessels: manifestVessels,
  };

  files.unshift({
    path: MANIFEST_PATH,
    body: toWireJson(manifest),
    contentType: 'application/json',
  });

  return { manifest, files };
}
