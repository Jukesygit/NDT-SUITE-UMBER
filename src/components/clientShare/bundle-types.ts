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
//   vessels/<vesselId>/model.json.gz   ← serialized VesselState (sanitised), gzipped
//   vessels/<vesselId>/screenshot.png  ← publish-time card image (optional)
//
// The models are separate files so the landing page can render vessel cards
// from the manifest alone, and only pay for a model when a vessel is opened.
//
// WHY THE MODELS ARE GZIPPED AND THE MANIFEST IS NOT (2026-08-21). A model
// carries every thickness grid at full resolution, and raw JSON of Float64
// readings is a terrible wire encoding — a real publish was refused by Supabase
// Storage ("The object exceeded the maximum allowed size", the project's ~50MB
// global upload cap). Gzip over quantised decimals cuts that by an order of
// magnitude. The manifest stays plain: it is small, and it is the viewer's ENTRY
// request, so keeping it directly readable is worth more than the bytes.
//
// The viewer branches on the `.gz` suffix of whatever `modelPath` the manifest
// names, so this is NOT a format-version change: a bundle published before this
// still names a plain `model.json` and still loads.
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
 *  engine formatters so paper, app and client page round identically.
 *
 *  The fields below `status` were added 2026-08-25 to bring the client page to
 *  content parity with the modeler's stats panel. They are OPTIONAL because a
 *  published link outlives the deploy that made it: a bundle written before that
 *  date carries none of them, and the viewer must degrade to the %-only table
 *  rather than render a zero. That is why this is NOT a
 *  {@link SHARE_BUNDLE_FORMAT} bump — an old viewer ignores keys it does not
 *  know, and a new viewer dashes what an old bundle lacks. Absent NEVER means 0. */
export interface ShareStatRow {
  /** Engine feature key (`cylinder` | `leftHead` | `<appId>:dome` | …). */
  key: string;
  label: string;
  /** Absent ⇒ untracked. Never coerced to 0. */
  targetPct?: number;
  achievedPct: number;
  deltaPct?: number;
  status: ComparisonStatus;
  /**
   * The stored RBA recommendation for this feature. Absent ⇒ no target entry
   * exists ⇒ the viewer dashes the cell. RBA is informational and INFORMS the
   * scope; it is never the yardstick the delta is measured against.
   */
  rbaPct?: number;
  /** Coverable area of the feature (mm²) — the denominator every % above is of. */
  totalMm2?: number;
  /** `targetPct` as area (mm²). Absent ⇔ untracked, mirroring `targetPct`. */
  targetMm2?: number;
  achievedMm2?: number;
  /**
   * True when the target was DERIVED from drawn coverage rects rather than typed
   * in. Present only when true — the viewer's "auto" marker is a positive claim,
   * and `false` would say the same thing as absent while costing wire bytes.
   */
  targetAuto?: boolean;
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

// ---------------------------------------------------------------------------
// Wall loss (added 2026-08-25)
// ---------------------------------------------------------------------------
// Declared SELF-CONTAINED, like every other type in this module: the shapes
// below are deliberately NOT aliases of the worker's `BinResult` /
// `WallLossBodyResult`, so refactoring the compute path can never silently
// change a wire format that published links are already reading. They are
// numbers, not rendered strings — the viewer owns the formatting, and a bundle
// re-read by a newer viewer formats the way that viewer does.
//
// Absent throughout means ABSENT, not zero: `wallLoss` is missing from every
// bundle published before this date and from any model with no confirmed scans,
// and the viewer renders no section at all rather than an empty distribution.
// No {@link SHARE_BUNDLE_FORMAT} bump for the same reason as `ShareStatRow`'s
// additions — an older viewer ignores the key.
// ---------------------------------------------------------------------------

/** One distribution bin. `minMm`/`maxMm` are set by the custom and CA-based bin
 *  modes only; `label` is the bin's own range text when the mode supplies one. */
export interface ShareWallLossBin {
  minPct: number;
  maxPct: number;
  minMm?: number;
  maxMm?: number;
  label?: string;
  /** Scanned area falling in this bin, in m² (already converted — not mm²). */
  area: number;
  areaPercent: number;
  count: number;
}

/** One body's distribution. `bodyId` absent ⇒ the main shell; every other entry
 *  is an appendage, and its `bins` share the combined view's boundaries so the
 *  two read against each other index-for-index. */
export interface ShareWallLossBody {
  bodyId?: string;
  name?: string;
  bins: ShareWallLossBin[];
  totalScannedArea: number;
  totalDataPoints: number;
  /** Readings outside every bin range. Always written — 0 is a real answer here,
   *  and the viewer shows the row only when `spuriousCount > 0`. */
  spuriousArea: number;
  spuriousCount: number;
  spuriousAreaPercent: number;
}

/** A vessel's wall-loss distribution as published. */
export interface ShareWallLoss {
  nominalThickness: number;
  binMode: 'equal' | 'ca-based' | 'custom';
  /** Publisher-named bins, positional. A name may be absent for a given index —
   *  the viewer falls back to the bin's own `label`, then to "Bin N". */
  binNames?: string[];
  /** The all-bodies view the section opens with. */
  combined: ShareWallLossBody;
  /** Per-body breakdown behind the selector: main shell first, then appendages. */
  bodies: ShareWallLossBody[];
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
  /**
   * Wall-loss distribution, absent when it was not computable at publish time
   * (no wall-loss config, no confirmed scans, or no data points).
   *
   * Like `stats`, it is an AGGREGATE DELIVERABLE, not a layer: it is computed
   * from the full state and ships even when the scans layer itself is
   * unpublished — the client is being told what the wall reads, not shown the
   * readings.
   */
  wallLoss?: ShareWallLoss;
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
  /** Bundle-relative path, e.g. `vessels/<id>/model.json.gz`. */
  path: string;
  /** JSON payloads are objects; binary payloads (screenshots) are Blobs. */
  body: Record<string, unknown> | Blob;
  contentType: string;
  /**
   * Wire encoding applied by the UPLOAD layer, not by the builder.
   *
   * The builder stays pure and synchronous — compression is async and belongs
   * next to the transfer — so `body` here is always the plain, parseable wire
   * JSON. That is deliberate and load-bearing for review: the exclusion sweep
   * (`__tests__/bundle-exclusions.test.ts`) greps the real bytes a client
   * receives, and it could not do that through a gzip frame.
   *
   * Absent ⇒ upload the body as-is.
   */
  encoding?: 'gzip';
}

/** Path of the manifest inside every bundle revision. */
export const MANIFEST_PATH = 'manifest.json';

/**
 * Where a vessel's serialized model lives. The `.gz` is part of the NAME, not a
 * transport detail: the edge function proxies stored bytes verbatim (no
 * `Content-Encoding`), so the extension is the only thing that tells the viewer
 * to inflate. See the module header for why models are compressed.
 */
export function vesselModelPath(vesselId: string): string {
  return `vessels/${vesselId}/model.json.gz`;
}

export function vesselScreenshotPath(vesselId: string): string {
  return `vessels/${vesselId}/screenshot.png`;
}
