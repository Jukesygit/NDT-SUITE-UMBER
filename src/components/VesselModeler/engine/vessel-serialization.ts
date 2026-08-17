// =============================================================================
// Vessel Serialization — Engine
// =============================================================================
// `serializeVesselState` / `deserializeVesselState` are the single entry points
// consumed by all four historical field lists in VesselModeler.tsx:
//   - saveProject       → serializeVesselState(state, { path: 'local' })
//   - buildSaveConfig   → serializeVesselState(state, { path: 'cloud', modelType })
//   - loadProject       → deserializeVesselState(raw,  { path: 'local', textures })
//   - applyModelConfig  → deserializeVesselState(raw,  { path: 'cloud', textures })
//
// Field-level rules (names + defaults + per-path inclusion) live in
// `vessel-serialization-spec.ts`; this module only runs them. Textures are
// serialized here but restored by the caller (their load path is async and
// renderer-bound), so `deserializeVesselState` takes pre-loaded textures.
// =============================================================================

import { DEFAULT_VESSEL_STATE, type VesselState } from '../types';
import { deserializeNozzle } from './nozzle-geometry';
import { deserializeSaddle } from './saddle-geometry';
import { normalizeDomeScanComposite } from './dome-scan-geometry';
import { normalizeAppendage } from './appendage-config';
import { backfillNozzleIds, migratePipelineNozzleRefs } from './nozzle-id';
import {
  type FieldSpec,
  type RawItem,
  type SerPath,
  NOZZLE_SPEC,
  LUG_SPEC,
  SADDLE_SPEC,
  WELD_SPEC,
  TEXTURE_SPEC,
  ANNOTATION_SPEC,
  RULER_SPEC,
  COVERAGE_RECT_SPEC,
  INSPECTION_IMAGE_SPEC,
  SCAN_COMPOSITE_SPEC,
  DOME_SCAN_SPEC,
  APPENDAGE_SPEC,
} from './vessel-serialization-spec';

// Re-export the path discriminator so callers depend only on this entry point.
export type { SerPath } from './vessel-serialization-spec';

// ---------------------------------------------------------------------------
// Spec engine
// ---------------------------------------------------------------------------

const resolveDefault = (d: unknown): unknown =>
  typeof d === 'function' ? (d as () => unknown)() : d;

/** Coerce an unknown value to an array of raw items (mirrors the old `x || []`). */
const asArray = (v: unknown): RawItem[] => (Array.isArray(v) ? (v as RawItem[]) : []);

/** Serialize one attachable item for the given path per its field spec. The
 *  runtime configs are interfaces (no string index signature), so read fields
 *  through a Record view rather than casting each caller. */
function serializeItem(item: object, spec: FieldSpec[], path: SerPath): RawItem {
  const src = item as RawItem;
  const out: RawItem = {};
  for (const f of spec) {
    if (f.saveOn && f.saveOn !== path) continue;
    if (f.save === 'skip') continue;
    if (f.save && 'compute' in f.save) {
      // A compute returning undefined omits the key entirely. This keeps
      // main-shell scan composites byte-identical: only appendage scans emit a
      // derived sectionType. (Dome sectionType always computes a string.)
      const computed = f.save.compute(src);
      if (computed !== undefined) out[f.key] = computed;
      continue;
    }
    const v = src[f.key];
    out[f.key] = f.save && 'or' in f.save ? v || resolveDefault(f.save.or) : v;
  }
  return out;
}

/** Deserialize one attachable item for the given path per its field spec. */
function deserializeItem(raw: RawItem, spec: FieldSpec[], path: SerPath): RawItem {
  const out: RawItem = {};
  for (const f of spec) {
    if (f.loadOn && f.loadOn !== path) continue;
    if (f.load === 'skip') continue;
    if (f.load && 'transform' in f.load) {
      out[f.key] = f.load.transform(raw);
      continue;
    }
    const v = raw[f.key];
    if (f.load && 'or' in f.load) out[f.key] = v || resolveDefault(f.load.or);
    else if (f.load && 'nullish' in f.load) out[f.key] = v ?? resolveDefault(f.load.nullish);
    else out[f.key] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pipelines & reference drawings — nested defaulting, shared by both load paths
// ---------------------------------------------------------------------------

function deserializeSegment(s: RawItem): RawItem {
  return {
    id: s.id || crypto.randomUUID(),
    type: s.type || 'straight',
    rotation: s.rotation ?? 0,
    length: s.length,
    angle: s.angle,
    bendRadius: s.bendRadius,
    endDiameter: s.endDiameter,
    branchDiameter: s.branchDiameter,
    style: s.style,
  };
}

function deserializePipeline(p: RawItem): RawItem {
  // Carry both reference forms through untouched here; migratePipelineNozzleRefs
  // (called once with the id-backfilled nozzle list) resolves legacy `nozzleIndex`
  // to the stable `nozzleId` and drops the index. A pipeline saved by a current
  // build already carries `nozzleId`; a legacy save carries only `nozzleIndex`.
  return {
    id: p.id || crypto.randomUUID(),
    ...(p.nozzleId ? { nozzleId: p.nozzleId } : {}),
    ...(p.nozzleIndex !== undefined ? { nozzleIndex: p.nozzleIndex } : {}),
    pipeDiameter: p.pipeDiameter ?? 100,
    color: p.color,
    segments: asArray(p.segments).map(deserializeSegment),
    locked: p.locked,
    visible: p.visible,
    ...(p.freeOrigin ? { freeOrigin: p.freeOrigin } : {}),
  };
}

function deserializeReferenceDrawing(d: RawItem): RawItem {
  return {
    id: d.id || Date.now(),
    title: d.title || '',
    imageData: d.imageData || '',
    fileName: d.fileName || '',
  };
}

/**
 * Coverage targets load as an opaque object EXCEPT for one shape migration: the
 * per-appendage value used to be a bare `CoverageTargetEntry` and is now
 * `{ shell, dome? }` (design 2026-08-17). Saves written before that split are
 * normalized here — bare entry ⇒ `{ shell: entry }` — so runtime state carries
 * exactly one shape. The persisted KEYS (leftHead / cylinder / rightHead /
 * appendages) are unchanged, and a payload already in the new shape passes
 * through untouched (byte-identical re-save).
 */
function normalizeCoverageTargets(raw: unknown): VesselState['coverageTargets'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const targets = raw as Record<string, unknown>;
  const appendages = targets.appendages;
  if (!appendages || typeof appendages !== 'object') {
    return targets as unknown as VesselState['coverageTargets'];
  }

  const normalized: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(appendages as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    // A legacy bare entry is recognised by its own scalar keys; the current
    // shape is recognised by `shell`.
    normalized[id] = 'shell' in value ? value : { shell: value };
  }
  return { ...targets, appendages: normalized } as unknown as VesselState['coverageTargets'];
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

export interface SerializeOptions {
  path: SerPath;
  /** Cloud path only — the resolved modelType string written to the config. */
  modelType?: string;
  /** Override the generated timestamp (mainly for deterministic tests). */
  timestamp?: string;
}

/**
 * Build the plain serialized object for a save. The caller keeps its own
 * NaN/Infinity sanitization and IO (blob download / DB write) — this returns
 * the pre-sanitize object matching the historical `projectData` / `config`.
 */
export function serializeVesselState(
  state: VesselState,
  opts: SerializeOptions
): Record<string, unknown> {
  const { path } = opts;
  const arrays = {
    nozzles: state.nozzles.map((n) => serializeItem(n, NOZZLE_SPEC, path)),
    liftingLugs: state.liftingLugs.map((l) => serializeItem(l, LUG_SPEC, path)),
    saddles: state.saddles.map((s) => serializeItem(s, SADDLE_SPEC, path)),
    welds: state.welds.map((w) => serializeItem(w, WELD_SPEC, path)),
    textures: state.textures.map((t) => serializeItem(t, TEXTURE_SPEC, path)),
    annotations: state.annotations.map((a) => serializeItem(a, ANNOTATION_SPEC, path)),
    rulers: state.rulers.map((r) => serializeItem(r, RULER_SPEC, path)),
    coverageRects: state.coverageRects.map((r) => serializeItem(r, COVERAGE_RECT_SPEC, path)),
    inspectionImages: state.inspectionImages.map((i) =>
      serializeItem(i, INSPECTION_IMAGE_SPEC, path)
    ),
    scanComposites: state.scanComposites.map((sc) => serializeItem(sc, SCAN_COMPOSITE_SPEC, path)),
    domeScanComposites: state.domeScanComposites.map((ds) =>
      serializeItem(ds, DOME_SCAN_SPEC, path)
    ),
    appendages: state.appendages.map((a) => serializeItem(a, APPENDAGE_SPEC, path)),
  };

  return {
    version: 1,
    timestamp: opts.timestamp ?? new Date().toISOString(),
    ...(path === 'cloud' ? { modelType: opts.modelType } : {}),
    vessel: {
      id: state.id,
      length: state.length,
      headRatio: state.headRatio,
      orientation: state.orientation,
      vesselName: state.vesselName,
      location: state.location,
      inspectionDate: state.inspectionDate,
    },
    ...arrays,
    pipelines: state.pipelines,
    referenceDrawings: state.referenceDrawings ?? [],
    measurementConfig: { ...state.measurementConfig },
    // coordinateOrigin + originSourceScanId are persisted on the LOCAL path only.
    ...(path === 'local'
      ? {
          coordinateOrigin: { ...state.coordinateOrigin },
          originSourceScanId: state.originSourceScanId,
        }
      : {}),
    labelsTidied: state.labelsTidied,
    annotationTablePosition: state.annotationTablePosition,
    annotationTableSize: state.annotationTableSize,
    // Top-level field (annotationTablePosition precedent). Undefined ⇒ dropped by
    // JSON, so a model with no bookmarks serializes byte-identically to before.
    cameraBookmarks: state.cameraBookmarks,
    wallLossGroups: state.wallLossGroups,
    // Coverage targets round-trip as an opaque object on both paths (plain data,
    // no functions). The nested `appendages` map therefore survives automatically.
    // undefined for legacy models → dropped by JSON → shape unchanged.
    coverageTargets: state.coverageTargets,
    visuals: { ...state.visuals },
  };
}

// ---------------------------------------------------------------------------
// Deserialize
// ---------------------------------------------------------------------------

export interface DeserializeOptions {
  path: SerPath;
  /** Pre-loaded textures — their restore path is async/renderer-bound and stays in the caller. */
  textures: VesselState['textures'];
}

/**
 * Rebuild a (pre-validation) VesselState from a saved payload. The caller runs
 * `validateVesselState` and the id-ref / cloud-rehydration bookkeeping around
 * this exactly as before.
 */
export function deserializeVesselState(
  raw: Record<string, unknown>,
  opts: DeserializeOptions
): VesselState {
  const { path, textures } = opts;
  const vessel = (raw.vessel ?? {}) as RawItem;

  // Deserialize + id-backfill nozzles up front so pipelines can migrate their
  // legacy positional `nozzleIndex` onto the resolved stable `nozzleId`.
  const nozzles = backfillNozzleIds(asArray(raw.nozzles).map(deserializeNozzle));
  const pipelines = migratePipelineNozzleRefs(
    asArray(raw.pipelines).map(deserializePipeline) as unknown as VesselState['pipelines'],
    nozzles
  );

  const state: VesselState = {
    id: (vessel.id as number) || 3000,
    length: (vessel.length as number) || 8000,
    headRatio: (vessel.headRatio as number) || 2.0,
    orientation: (vessel.orientation as VesselState['orientation']) || 'horizontal',
    vesselName: (vessel.vesselName as string) || '',
    location: (vessel.location as string) || '',
    inspectionDate: (vessel.inspectionDate as string) || '',
    nozzles,
    liftingLugs: asArray(raw.liftingLugs).map((l) =>
      deserializeItem(l, LUG_SPEC, path)
    ) as unknown as VesselState['liftingLugs'],
    saddles: asArray(raw.saddles).map(deserializeSaddle),
    welds: asArray(raw.welds).map((w) =>
      deserializeItem(w, WELD_SPEC, path)
    ) as unknown as VesselState['welds'],
    textures,
    annotations: asArray(raw.annotations).map((a) =>
      deserializeItem(a, ANNOTATION_SPEC, path)
    ) as unknown as VesselState['annotations'],
    rulers: asArray(raw.rulers).map((r) =>
      deserializeItem(r, RULER_SPEC, path)
    ) as unknown as VesselState['rulers'],
    coverageRects: asArray(raw.coverageRects).map((r) =>
      deserializeItem(r, COVERAGE_RECT_SPEC, path)
    ) as unknown as VesselState['coverageRects'],
    inspectionImages: asArray(raw.inspectionImages).map((i) =>
      deserializeItem(i, INSPECTION_IMAGE_SPEC, path)
    ) as unknown as VesselState['inspectionImages'],
    scanComposites: asArray(raw.scanComposites).map((sc) =>
      deserializeItem(sc, SCAN_COMPOSITE_SPEC, path)
    ) as unknown as VesselState['scanComposites'],
    domeScanComposites: asArray(raw.domeScanComposites).map(normalizeDomeScanComposite),
    appendages: asArray(raw.appendages).map(normalizeAppendage),
    pipelines,
    referenceDrawings: asArray(raw.referenceDrawings).map(
      deserializeReferenceDrawing
    ) as unknown as VesselState['referenceDrawings'],
    measurementConfig: {
      ...DEFAULT_VESSEL_STATE.measurementConfig,
      ...((raw.measurementConfig ?? {}) as Partial<VesselState['measurementConfig']>),
    },
    // Local file mapper seeds from DEFAULT; cloud mapper uses a bare fallback.
    coordinateOrigin:
      path === 'local'
        ? {
            ...DEFAULT_VESSEL_STATE.coordinateOrigin,
            ...((raw.coordinateOrigin ?? {}) as Partial<VesselState['coordinateOrigin']>),
          }
        : (raw.coordinateOrigin as VesselState['coordinateOrigin']) || { indexMm: 0, scanMm: 0 },
    originSourceScanId: raw.originSourceScanId as string | undefined,
    hasModel: true,
    visuals: {
      ...DEFAULT_VESSEL_STATE.visuals,
      ...((raw.visuals ?? {}) as Partial<VesselState['visuals']>),
    },
    // Top-level field, restored on both paths (a new field has no cloud-only
    // legacy quirk to preserve). Undefined for legacy models ⇒ shape unchanged.
    cameraBookmarks: raw.cameraBookmarks as VesselState['cameraBookmarks'],
    wallLossGroups: raw.wallLossGroups as VesselState['wallLossGroups'],
    // Coverage targets restore as an opaque object (undefined for legacy models;
    // the consumer defaults via `?? DEFAULT_TARGETS`). The nested `appendages`
    // map round-trips with it, normalized to the `{ shell, dome? }` value shape.
    coverageTargets: normalizeCoverageTargets(raw.coverageTargets),
  };

  // The cloud load mapper (applyModelConfig) restored these three; the local
  // file mapper (loadProject) never did — preserve that difference exactly.
  if (path === 'cloud') {
    state.labelsTidied = (raw.labelsTidied as boolean) ?? false;
    state.annotationTablePosition =
      raw.annotationTablePosition as VesselState['annotationTablePosition'];
    state.annotationTableSize = raw.annotationTableSize as VesselState['annotationTableSize'];
  }

  return state;
}
