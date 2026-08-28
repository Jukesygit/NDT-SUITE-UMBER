// ---------------------------------------------------------------------------
// Client-share bundle builder — pure.
//
// Turns saved vessel state into the immutable snapshot a client is served
// (docs/plans/2026-08-17-client-sharing-design.md, "Bundle format"). Four rules
// make this module worth reading carefully:
//
// 1. EXCLUSION IS REMOVAL, NOT HIDING. A layer the publisher did not tick is
//    not shipped hidden — its entities are deleted from the serialized model.
//    A client cannot toggle their way to unpublished content because it is not
//    in the file. The same applies to the hard-coded exclusions below, which are
//    NOT publish-dialog options and must never become options.
//
// 2. MODELER VISIBILITY IS WORKING STATE, NOT PUBLISH INTENT. An entity the
//    inspector hid in the modeler was hidden to get a job done — to see past a
//    wall of coverage rectangles — not to say "the client must not see this".
//    That decision is the publish dialog's layer ticks, and rule 1 carries it
//    out. On the client's side the layer chips are the ONLY display control they
//    have, and effective visibility in the read-only scene is
//    `entity.visible !== false` AND the layer — so a shipped `visible: false`
//    leaves a chip that is present, toggleable, and unable to reveal anything.
//    The sanitiser therefore strips per-entity `visible` from everything it
//    ships. It is REMOVED, never set to `true`: absent-means-visible is the wire
//    format's own convention, and honouring it keeps a published model shaped
//    exactly like a legacy one.
//
// 3. STATS ARE COMPUTED FROM THE FULL-FIDELITY STATE, before anything is
//    emptied or normalised. Coverage percentages describe the model the
//    inspector worked on. Publishing must never change a number.
//
// 4. THE BUNDLE IS SELF-CONTAINED, SO THE GRIDS ARE PUT BACK — the cloud save
//    path strips `data`; `attachShippedGrids` re-attaches it. Without that the
//    client's heatmaps are blank.
//
// 5. DISPLAY IS FULL FIDELITY; THE WIRE ENCODING IS NOT THE DISPLAY. Every grid
//    ships at full resolution — no decimation, no downsampling, so a client
//    hovers the cell the inspector scanned. What changes on the way out is only
//    how those numbers are WRITTEN: values are quantised to 4 decimal places
//    (0.0001 mm) and the file is gzipped by the upload layer. Both are lossless
//    where it matters — see `quantizeGrid` below and `bundle-types`' header.
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
  readTargetEntry,
} from '../VesselModeler/engine/coverage-comparison';
import { serializeVesselState } from '../VesselModeler/engine/vessel-serialization';
import { compute, type BinResult } from '../../workers/wall-loss-compute';
import { buildWallLossRequest, canComputeWallLoss } from '../../workers/wall-loss-request';
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
  type ShareWallLoss,
  type ShareWallLossBody,
} from './bundle-types';

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
// Visibility normalisation (rule 2)
// ---------------------------------------------------------------------------

/**
 * Collections whose entities ship with no `visible` flag: every layer-gated
 * collection, plus appendages.
 *
 * Derived from {@link LAYER_COLLECTIONS} rather than re-listed, so a new layer
 * category is normalised the day it is added instead of the day someone notices
 * its chip does nothing. Appendages are the one addition: they are not a layer
 * anyone can toggle, but an appendage's own `visible` flag hides a whole body in
 * the read-only scene, and a client has no control that could bring it back.
 */
const VISIBILITY_NORMALIZED_COLLECTIONS: readonly (keyof VesselState)[] = [
  ...Object.values(LAYER_COLLECTIONS),
  'appendages',
];

/** One entity, copied, without its `visible` key. Never mutates the original —
 *  this module is pure and the caller's state is the live app's. */
function stripVisible<T extends object>(entity: T): T {
  const stripped = { ...entity } as T & { visible?: boolean };
  delete stripped.visible;
  return stripped;
}

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

/**
 * The state that actually ships: unpublished categories emptied, hard-coded
 * exclusions applied, per-entity visibility flags stripped.
 *
 * Thickness grids ride through UNTOUCHED — the client is shown the model at the
 * resolution the app holds it, so a hovered millimetre on the share page is the
 * millimetre the inspector read.
 *
 * @param published Layer categories the publisher ticked.
 */
export function sanitizeVesselStateForShare(
  state: VesselState,
  published: ReadonlySet<LayerKey>
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

  // Rule 2: what the modeler had hidden is not a publish decision, so no shipped
  // entity carries a `visible` flag the client's layer chips could not overrule.
  // Only that one key is touched; the copies are fresh, never the caller's items.
  const collections = next as unknown as Record<string, unknown>;
  for (const collection of VISIBILITY_NORMALIZED_COLLECTIONS) {
    const items = collections[collection];
    if (!Array.isArray(items)) continue;
    collections[collection] = (items as object[]).map(stripVisible);
  }

  // Reference drawings are internal source documents, are not a layer anyone
  // can toggle, and are the largest thing in a saved model. Never published.
  next.referenceDrawings = [];

  return next;
}

// ---------------------------------------------------------------------------
// Stats + bookmarks projection
// ---------------------------------------------------------------------------

/**
 * Per-feature rows for the bundle. Numbers only — the viewer formats them.
 *
 * Every figure is the engine's, projected: this never re-derives a percentage, a
 * delta or a status, and never picks a target (that is `targetPctOf`'s job
 * alone). RBA is the one field not carried on the comparison row — it is
 * informational and lives on the stored target entry — so it is read the way
 * `stats/CoverageScopeSection` reads it, ONLY when an entry exists. An absent
 * entry ships an absent field and the viewer dashes the cell; coercing it to 0
 * would publish "no risk-based recommendation" as "0% recommended".
 */
export function buildShareStats(state: VesselState): {
  rows: ShareStatRow[];
  rollup: ShareStatRollup;
} {
  const rows = computeComparisonRows(state);
  const rollup = computeComparisonRollup(rows);
  return {
    rows: rows.map((r) => {
      const entry = readTargetEntry(state.coverageTargets, r.ref);
      return {
        key: r.key,
        label: r.label,
        targetPct: r.targetPct,
        achievedPct: r.achievedPct,
        deltaPct: r.deltaPct,
        status: r.status,
        rbaPct: entry?.rbaPct,
        totalMm2: r.totalMm2,
        targetMm2: r.targetMm2,
        achievedMm2: r.achievedMm2,
        // Present only when true — see `ShareStatRow.targetAuto`.
        targetAuto: r.targetSource === 'rects' ? true : undefined,
      };
    }),
    rollup,
  };
}

/**
 * A distribution as `compute` returns it — either a `WallLossBodyResult` or the
 * response's own flat combined fields, which carry the same shape without being
 * the same type. Declared here rather than imported so the translation below is
 * visibly a translation: the wire type and the engine type are independent, and
 * a field added to one must be added to the other on purpose.
 */
interface WallLossBodySource {
  bodyId?: string;
  name?: string;
  bins: BinResult[];
  totalScannedArea: number;
  totalDataPoints: number;
  spuriousArea?: number;
  spuriousCount?: number;
  spuriousAreaPercent?: number;
}

/** One body's distribution in the bundle's own form — copied field by field, so
 *  a change to the worker's result shape cannot reach a published bundle. */
function toShareWallLossBody(body: WallLossBodySource): ShareWallLossBody {
  return {
    bodyId: body.bodyId,
    name: body.name,
    bins: body.bins.map((bin) => ({
      minPct: bin.minPct,
      maxPct: bin.maxPct,
      minMm: bin.minMm,
      maxMm: bin.maxMm,
      label: bin.label,
      area: bin.area,
      areaPercent: bin.areaPercent,
      count: bin.count,
    })),
    totalScannedArea: body.totalScannedArea,
    totalDataPoints: body.totalDataPoints,
    // `?? 0` mirrors how `stats/WallLossStatsSection` reads these: the spurious
    // row is driven by `spuriousCount > 0`, so an absent count must read as "no
    // spurious readings", never as a missing row the viewer has to guess about.
    spuriousArea: body.spuriousArea ?? 0,
    spuriousCount: body.spuriousCount ?? 0,
    spuriousAreaPercent: body.spuriousAreaPercent ?? 0,
  };
}

/**
 * The vessel's wall-loss distribution, or undefined when there is none to
 * publish.
 *
 * Run SYNCHRONOUSLY here, against the same `workers/wall-loss-request` builder
 * the modeler's worker hook posts — the panel and the bundle ask `compute` one
 * question, so a client's distribution is the one the inspector approved. The
 * builder stays pure and sync (publish is a one-off user action that already
 * serializes megabytes), which is why this calls `compute` directly rather than
 * standing up a Worker.
 *
 * Undefined in the two cases the modeler section renders nothing: not
 * computable at all, and computable but empty (`totalDataPoints === 0`). An
 * absent key is how the viewer knows to omit the section.
 */
export function buildShareWallLoss(state: VesselState): ShareWallLoss | undefined {
  const config = state.wallLossGroups;
  if (!config || !canComputeWallLoss(state, config)) return undefined;

  const response = compute(buildWallLossRequest(state, config));
  // The combined view IS the response's flat fields (the per-body bins summed
  // index-for-index), so this is the section's `combined.totalDataPoints` test.
  if (response.totalDataPoints === 0) return undefined;

  return {
    // From the RESPONSE, not the config: `compute` resolves the effective
    // nominal wall, and the header must name the number the bins were cut from.
    nominalThickness: response.nominalThickness,
    binMode: config.binMode ?? 'equal',
    binNames: config.binNames,
    combined: toShareWallLossBody({
      bins: response.bins,
      totalScannedArea: response.totalScannedArea,
      totalDataPoints: response.totalDataPoints,
      spuriousArea: response.spuriousArea,
      spuriousCount: response.spuriousCount,
      spuriousAreaPercent: response.spuriousAreaPercent,
    }),
    bodies: response.bodies.map(toShareWallLossBody),
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

/**
 * Decimal places kept in a shipped thickness reading.
 *
 * 0.0001 mm is roughly a hundred times finer than any UT gauge resolves, so
 * nothing a client could measure survives past here — but the Float64 noise that
 * comes with converting a probe's reading does not, and that noise is most of
 * the file. `12.699999809265137` is 19 bytes of JSON; `12.7` is four.
 */
const WIRE_DECIMALS = 4;
const WIRE_SCALE = 10 ** WIRE_DECIMALS;

/**
 * A grid rewritten for the wire: same shape, same nulls, each reading rounded to
 * {@link WIRE_DECIMALS} places.
 *
 * Returns NEW arrays. The app's own grid is never touched — this module is pure
 * and the state it is handed is the live editor's — and the copy also ends the
 * by-reference aliasing the shipped grids otherwise have with app state.
 *
 * Only `data` is quantised. Axes are positions, not readings, and `stats` are
 * computed from the full-fidelity state (rule 3) and never re-derived from what
 * ships here — so neither is rounded, and a published percentage stays the
 * percentage the app showed.
 */
function quantizeGrid(grid: (number | null)[][]): (number | null)[][] {
  return grid.map((row) =>
    row.map((value) =>
      // `null` is "the probe read nothing here" and must survive as a hole —
      // a lossy transform quietly filling those in is exactly what this guards.
      typeof value === 'number' && Number.isFinite(value)
        ? Math.round(value * WIRE_SCALE) / WIRE_SCALE
        : value
    )
  );
}

/**
 * Re-attach the thickness grids the CLOUD save path deliberately drops.
 *
 * STILL REQUIRED even though the bundle now ships grids exactly as the app holds
 * them. The cloud save path writes no `data` for either composite kind (scan
 * composites are `{ key: 'data', save: 'skip' }`; the dome spec has no `data`
 * entry at all) because cloud grids live in their own DB table and the model row
 * must not carry them twice. A bundle has no second table — the model file is
 * the ONLY copy the client ever gets — so without `data` the viewer bakes a blank
 * heatmap and `thicknessAtUv` reads nothing. The builder therefore puts back
 * exactly what the spec dropped and nothing else, leaving the spec the single
 * source for all four modeler save/load paths. Both loaders read a present key
 * back already (SCAN_COMPOSITE_SPEC's `load: { or: () => [] }`, and
 * `normalizeDomeScanComposite`'s `raw.data ?? []`).
 *
 * IT MUST BE THE SANITIZED STATE, never the caller's `vesselState`. When the
 * scans layer is unpublished, `shipped.scanComposites` is empty and there is
 * nothing to attach — which is the correct outcome. Sourcing from the raw state
 * would resurrect the grids of composites rule 1 had just deleted, re-publishing
 * unpublished readings through the back door.
 *
 * What is attached is the QUANTISED copy (rule 5), never the app's array itself.
 */
function attachShippedGrids(
  serialized: Record<string, unknown>,
  shipped: VesselState
): Record<string, unknown> {
  // Matched by id, per kind — never positionally, and never across kinds.
  for (const [key, sources] of [
    ['scanComposites', shipped.scanComposites],
    ['domeScanComposites', shipped.domeScanComposites],
  ] as [string, ReadonlyArray<{ id: string; data: (number | null)[][] }>][]) {
    const items = serialized[key];
    if (!Array.isArray(items)) continue;
    const gridById = new Map(sources.map((c) => [c.id, c.data]));
    for (const item of items as Record<string, unknown>[]) {
      const data = gridById.get(item.id as string);
      if (data !== undefined) item.data = quantizeGrid(data);
    }
  }
  return serialized;
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
}

/**
 * Build a complete bundle: one manifest plus one model (and optional
 * screenshot) per vessel.
 *
 * Order matters and is load-bearing: stats are computed from the FULL state,
 * then the state is sanitised for shipping. Swapping those two lines would make
 * a published coverage percentage disagree with the app's.
 */
export function buildShareBundle(params: BuildShareBundleParams): ShareBundle {
  const { project, vessels, published, revision, publishedAt } = params;
  const files: ShareBundleFile[] = [];
  const manifestVessels: ShareManifestVessel[] = [];

  for (const vessel of vessels) {
    const { rows, rollup } = buildShareStats(vessel.vesselState);
    // Rule 3 applies to wall loss exactly as it does to coverage: it is an
    // AGGREGATE DELIVERABLE, not a layer, so it is computed from the full state
    // and ships even when the scans layer itself was left unticked. Publishing
    // must never change a number.
    const wallLoss = buildShareWallLoss(vessel.vesselState);
    const shipped = sanitizeVesselStateForShare(vessel.vesselState, published);

    const modelPath = vesselModelPath(vessel.id);
    // Attach BEFORE the wire round-trip. Nothing copies the grids on the way
    // through the sanitiser, so `shipped` still points at the app's own arrays —
    // but `attachShippedGrids` quantises, which means what lands in the bundle is
    // already a fresh copy; the round-trip then settles the rest of the object,
    // and between them a later edit to the model cannot reach into a published
    // snapshot.
    //
    // `encoding` is a note to the UPLOAD layer, which is where the gzip happens:
    // `body` stays the plain wire JSON so this object can still be read (and
    // grepped by the exclusion tests) as the thing the client receives.
    files.push({
      path: modelPath,
      body: toWireJson(
        attachShippedGrids(serializeVesselState(shipped, { path: 'cloud' }), shipped)
      ),
      contentType: 'application/gzip',
      encoding: 'gzip',
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
      wallLoss,
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
