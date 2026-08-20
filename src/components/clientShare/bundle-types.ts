// ---------------------------------------------------------------------------
// Client-share bundle format — the contract between publisher and viewer.
//
// A bundle is an IMMUTABLE published snapshot, not a view onto live data
// (docs/plans/2026-08-17-client-sharing-design.md). Its shape lives here alone,
// and this module is deliberately types-only: the viewer chunk must be able to
// know the format without importing the builder, which drags the whole vessel
// engine (and three.js) behind it.
//
// Layout under `<shareId>/rev-<N>/` in the private `client-shares` bucket:
//
//   manifest.json                      ← everything below, minus the models
//   vessels/<vesselId>/model.json      ← serialized VesselState (sanitised)
//   vessels/<vesselId>/screenshot.png  ← publish-time card image (optional)
//
// The models are separate files so the landing page can render vessel cards
// from the manifest alone, and only pay for a model when a vessel is opened.
// ---------------------------------------------------------------------------

import type { ComparisonStatus } from '../VesselModeler/engine/coverage-comparison';
import type { LayerVisibility } from '../VesselModeler/engine/layer-visibility';
import type { LayerKey } from '../VesselModeler/outliner-tree';

/**
 * Bundle format version. Bump when a change would make an OLDER viewer
 * misread a NEWER bundle — published links outlive deploys, so the viewer
 * checks this and says "please ask for a fresh link" rather than rendering
 * something wrong.
 */
export const SHARE_BUNDLE_FORMAT = 1;

/** Fixed attribution line on every published page. */
export const PREPARED_BY = 'Matrix Advanced Inspections';

/**
 * Layer categories offered in the publish dialog, with their default state.
 * Per the design: the deliverable is on, the working notes are off.
 *
 * It lives in this types-only module, not beside the builder, because the
 * publish DIALOG needs it and the dialog must stay clear of the builder's
 * (three.js-bearing) import graph.
 */
export const SHARE_LAYER_DEFAULTS: Record<LayerKey, boolean> = {
  nozzles: true,
  welds: true,
  lugs: true,
  saddles: true,
  scans: true,
  domeScans: true,
  coverage: true,
  pipelines: true,
  textures: true,
  rulers: false,
  annotations: false,
  images: false,
};

/**
 * The layer overlay the client viewer OPENS with — and therefore the one a
 * publish-time card screenshot must be rendered with.
 *
 * Empty on purpose. `LayerVisibility` is sparse and an ABSENT key means visible
 * (`engine/layer-visibility`), so `{}` shows everything the sanitised model
 * still contains — which, since exclusion is removal rather than hiding, is
 * exactly the published set. There is deliberately no projection from
 * `publishedLayers` or `SHARE_LAYER_DEFAULTS` here: an unpublished category has
 * no entities left to hide.
 *
 * It lives in the format module because it is a publisher/viewer contract, not
 * a component detail: `ShareVesselViewer` seeds its state from it and
 * `clientShare/vessel-screenshot-state.ts` renders with it, so a card and the
 * viewport it opens agree by construction. Frozen — both sides spread it into a
 * new object and neither may mutate the shared value.
 */
export const SHARE_VIEWER_INITIAL_LAYERS: LayerVisibility = Object.freeze({});

/** One feature row, carrying NUMBERS — the viewer formats with the shared
 *  engine formatters so paper, app and client page round identically. */
export interface ShareStatRow {
  /** Engine feature key (`cylinder` | `leftHead` | `<appId>:dome` | …). */
  key: string;
  label: string;
  /** Absent ⇒ untracked. Never coerced to 0. */
  targetPct?: number;
  achievedPct: number;
  deltaPct?: number;
  status: ComparisonStatus;
}

/** Vessel-level rollup, straight from `computeComparisonRollup`. */
export interface ShareStatRollup {
  achievedPct: number;
  targetPct: number;
  met: number;
  near: number;
  short: number;
  tracked: number;
  total: number;
}

/** A camera pose the client can jump to, in the bundle's own plain form. */
export interface ShareBookmark {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}

/** One vessel's entry in the manifest. */
export interface ShareManifestVessel {
  /** `project_vessels.id` — opaque to the client, used only as a route key. */
  id: string;
  name: string;
  tag?: string;
  type?: string;
  /** Bundle-relative path of the serialized model. */
  modelPath: string;
  /** Bundle-relative path of the card screenshot, when one was captured. */
  screenshotPath?: string;
  bookmarks: ShareBookmark[];
  stats: ShareStatRow[];
  rollup: ShareStatRollup;
}

/** Project-level metadata shown in the header and on the landing page. */
export interface ShareManifestProject {
  name: string;
  number?: string;
  client?: string;
  location?: string;
}

/** The whole manifest — one fetch, then the viewer knows what exists. */
export interface ShareManifest {
  formatVersion: number;
  /** Revision number of this publish; shown as "Rev N · published <date>". */
  revision: number;
  publishedAt: string;
  preparedBy: string;
  project: ShareManifestProject;
  /**
   * Layer categories the publisher chose to include. This is a TOGGLE LIST,
   * not a security boundary: entities in unpublished categories are REMOVED
   * from the serialized models, never merely hidden. A client cannot toggle
   * their way to something that was not published, because it is not there.
   */
  publishedLayers: LayerKey[];
  vessels: ShareManifestVessel[];
}

/** Everything one publish produces, ready to upload. */
export interface ShareBundle {
  manifest: ShareManifest;
  /** Bundle-relative path → file contents, in upload order. */
  files: ShareBundleFile[];
}

export interface ShareBundleFile {
  /** Bundle-relative path, e.g. `vessels/<id>/model.json`. */
  path: string;
  /** JSON payloads are objects; binary payloads (screenshots) are Blobs. */
  body: Record<string, unknown> | Blob;
  contentType: string;
}

/** Path of the manifest inside every bundle revision. */
export const MANIFEST_PATH = 'manifest.json';

export function vesselModelPath(vesselId: string): string {
  return `vessels/${vesselId}/model.json`;
}

export function vesselScreenshotPath(vesselId: string): string {
  return `vessels/${vesselId}/screenshot.png`;
}
