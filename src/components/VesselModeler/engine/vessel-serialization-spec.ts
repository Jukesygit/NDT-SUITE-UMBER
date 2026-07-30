// =============================================================================
// Vessel Serialization — Field Specs (data-driven)
// =============================================================================
// Single source of truth for how each attachable array is (de)serialized. The
// four historical hand-written field lists in VesselModeler.tsx — saveProject
// (local JSON export), buildSaveConfig (cloud config), and the two load mappers
// (applyModelConfig / loadProject) — all now flow through these specs via the
// serializeItem / deserializeItem engine in `vessel-serialization.ts`.
//
// The local and cloud paths genuinely differ (they always have); those
// differences are encoded EXPLICITLY here (`saveOn` / `loadOn`) rather than
// papered over, so the serialized shapes stay byte-compatible with what each
// site produced before this consolidation:
//   - welds.capWidth      : saved on both paths, but only the CLOUD load mapper
//                            restored it (local load dropped it).
//   - scanComposites.useGlobalOrigin : LOCAL path only (save + load).
//   - domeScanComposites.sectionType : CLOUD save only (derived field for the
//                            scan_composites.section_type column).
//   - scanComposites.sectionType     : CLOUD save only, appendage scans only
//                            ('appendage:<id>' for the same column; omitted for
//                            main-shell scans so their shape is unchanged).
//   - annotations.labelMode          : saved on both paths, restored on neither.
//   - scanComposites.data            : stripped on save, defaulted on load.
// =============================================================================

/** Which serialization path a call belongs to. */
export type SerPath = 'local' | 'cloud';

/** Raw JSON item as read back from a saved project (untyped by nature). */
export type RawItem = Record<string, unknown>;

/** A default that may be a literal or a thunk (thunks give fresh objects/arrays). */
type SpecDefault = unknown | (() => unknown);

/**
 * Declarative (de)serialization rule for a single field on an attachable item.
 *
 * SAVE (`save`) — how the serialized value is derived from the runtime item:
 *   - omitted     → passthrough `item[key]`
 *   - 'skip'      → not written on save (load-only field, e.g. scan `data`)
 *   - { or }      → `item[key] || or`         (matches historical `x || d`)
 *   - { compute } → `compute(item)`           (derived, e.g. dome sectionType)
 *
 * LOAD (`load`) — how the config value is derived from the raw item:
 *   - omitted       → passthrough `raw[key]`
 *   - 'skip'        → not restored on load (save-only field, e.g. labelMode)
 *   - { or }        → `raw[key] || or`
 *   - { nullish }   → `raw[key] ?? nullish`
 *   - { transform } → `transform(raw)`        (custom, receives the whole item)
 */
export interface FieldSpec {
  key: string;
  /** Restrict SERIALIZE to this path (default: both). */
  saveOn?: SerPath;
  /** Restrict DESERIALIZE to this path (default: both). */
  loadOn?: SerPath;
  save?: 'skip' | { or: SpecDefault } | { compute: (item: RawItem) => unknown };
  load?:
    | 'skip'
    | { or: SpecDefault }
    | { nullish: SpecDefault }
    | { transform: (raw: RawItem) => unknown };
}

// ---------------------------------------------------------------------------
// Nozzles — save: field list; load: deserializeNozzle() (own migration logic)
// ---------------------------------------------------------------------------
export const NOZZLE_SPEC: FieldSpec[] = [
  { key: 'name' },
  { key: 'bodyId' },
  { key: 'pos' },
  { key: 'proj' },
  { key: 'angle' },
  { key: 'size' },
  { key: 'orientationMode' },
  { key: 'azimuthRotation' },
  { key: 'flangeOD' },
  { key: 'flangeThk' },
  { key: 'pipeOD' },
  { key: 'style' },
  { key: 'hideRepad' },
  { key: 'showRepad' },
  { key: 'showWeldNeck' },
  { key: 'repadOD' },
  { key: 'repadThickness' },
];

// ---------------------------------------------------------------------------
// Lifting lugs
// ---------------------------------------------------------------------------
export const LUG_SPEC: FieldSpec[] = [
  { key: 'name', load: { or: 'L' } },
  { key: 'pos', load: { nullish: 0 } },
  { key: 'angle', load: { nullish: 90 } },
  { key: 'style', load: { or: 'padEye' } },
  { key: 'swl', load: { or: '5t' } },
  { key: 'width' },
  { key: 'height' },
  { key: 'thickness' },
  { key: 'holeDiameter' },
];

// ---------------------------------------------------------------------------
// Saddles — save: field list; load: deserializeSaddle() (accepts legacy number)
// ---------------------------------------------------------------------------
export const SADDLE_SPEC: FieldSpec[] = [
  { key: 'pos' },
  { key: 'color', save: { or: '#2244ff' } },
  { key: 'height' },
  { key: 'depth' },
  { key: 'wearPlate' },
  { key: 'wearPlateThickness' },
  { key: 'wearPlateArcOverhang' },
  { key: 'wearPlateAxialOverhang' },
];

// ---------------------------------------------------------------------------
// Welds — capWidth restored on the cloud load path only (local load dropped it)
// ---------------------------------------------------------------------------
export const WELD_SPEC: FieldSpec[] = [
  { key: 'name', load: { or: 'W' } },
  { key: 'type', load: { or: 'circumferential' } },
  { key: 'pos', load: { nullish: 0 } },
  { key: 'endPos' },
  { key: 'angle' },
  { key: 'capWidth', loadOn: 'cloud' },
  { key: 'color', load: { or: '#888888' } },
];

// ---------------------------------------------------------------------------
// Textures — save: field list; load: handled by the caller (async renderer)
// ---------------------------------------------------------------------------
export const TEXTURE_SPEC: FieldSpec[] = [
  { key: 'id' },
  { key: 'name' },
  { key: 'imageData' },
  { key: 'pos' },
  { key: 'angle' },
  { key: 'scaleX', save: { or: 1.0 } },
  { key: 'scaleY', save: { or: 1.0 } },
  { key: 'rotation', save: { or: 0 } },
  { key: 'flipH', save: { or: false } },
  { key: 'flipV', save: { or: false } },
];

// ---------------------------------------------------------------------------
// Annotations — labelMode is saved but never restored (historical behavior)
// ---------------------------------------------------------------------------
export const ANNOTATION_SPEC: FieldSpec[] = [
  { key: 'id', load: { or: 0 } },
  { key: 'name', load: { or: 'A' } },
  { key: 'type', load: { transform: (r) => (r.type === 'restriction' ? 'restriction' : 'scan') } },
  { key: 'pos', load: { nullish: 0 } },
  { key: 'angle', load: { nullish: 90 } },
  { key: 'width', load: { nullish: 100 } },
  { key: 'height', load: { nullish: 100 } },
  { key: 'color', load: { or: '#ff3333' } },
  { key: 'lineWidth', load: { nullish: 2 } },
  { key: 'showLabel', load: { transform: (r) => r.showLabel !== false } },
  { key: 'leaderLength' },
  { key: 'labelOffset' },
  { key: 'visible' },
  { key: 'locked' },
  { key: 'restrictionNotes' },
  { key: 'restrictionImage' },
  { key: 'restrictionImageName' },
  { key: 'includeInReport' },
  { key: 'attachments', load: { nullish: () => [] } },
  { key: 'labelMode', load: 'skip' },
];

// ---------------------------------------------------------------------------
// Rulers
// ---------------------------------------------------------------------------
export const RULER_SPEC: FieldSpec[] = [
  { key: 'id', load: { or: 0 } },
  { key: 'name', load: { or: 'R' } },
  { key: 'startPos', load: { nullish: 0 } },
  { key: 'startAngle', load: { nullish: 90 } },
  { key: 'endPos', load: { nullish: 100 } },
  { key: 'endAngle', load: { nullish: 90 } },
  { key: 'color', load: { or: '#ffaa00' } },
  { key: 'showLabel', load: { transform: (r) => r.showLabel !== false } },
];

// ---------------------------------------------------------------------------
// Coverage rectangles (gains bodyId in a later appendage phase)
// ---------------------------------------------------------------------------
export const COVERAGE_RECT_SPEC: FieldSpec[] = [
  { key: 'id', load: { or: 0 } },
  { key: 'name', load: { or: 'C' } },
  { key: 'pos', load: { nullish: 0 } },
  { key: 'angle', load: { nullish: 90 } },
  { key: 'width', load: { nullish: 300 } },
  { key: 'height', load: { nullish: 200 } },
  { key: 'color', load: { or: '#00cc66' } },
  { key: 'lineWidth', load: { nullish: 2 } },
  { key: 'filled', load: { nullish: true } },
  { key: 'fillOpacity', load: { nullish: 0.2 } },
  { key: 'locked' },
];

// ---------------------------------------------------------------------------
// Inspection images
// ---------------------------------------------------------------------------
export const INSPECTION_IMAGE_SPEC: FieldSpec[] = [
  { key: 'id', load: { or: 0 } },
  { key: 'name', load: { or: 'IMG' } },
  { key: 'imageData', load: { or: '' } },
  { key: 'pos', load: { nullish: 0 } },
  { key: 'angle', load: { nullish: 90 } },
  { key: 'description' },
  { key: 'date' },
  { key: 'inspector' },
  { key: 'method' },
  { key: 'result' },
  { key: 'leaderLength' },
  { key: 'labelOffset' },
  { key: 'visible' },
  { key: 'locked' },
];

// ---------------------------------------------------------------------------
// Scan composites — data stripped on save; useGlobalOrigin is LOCAL-path only.
// bodyId round-trips on both paths (undefined = main shell). sectionType is a
// CLOUD-save-only derived field for the scan_composites.section_type column,
// emitted only for appendage scans (mirrors the dome_left/dome_right pattern).
// ---------------------------------------------------------------------------
export const SCAN_COMPOSITE_SPEC: FieldSpec[] = [
  { key: 'id', load: { or: () => `sc_${Date.now()}` } },
  { key: 'name', load: { or: 'Untitled' } },
  { key: 'cloudId' },
  { key: 'bodyId' },
  { key: 'data', save: 'skip', load: { or: () => [] } },
  { key: 'xAxis', load: { or: () => [] } },
  { key: 'yAxis', load: { or: () => [] } },
  { key: 'stats', load: { or: () => ({ min: 0, max: 0, mean: 0, median: 0, stdDev: 0 }) } },
  { key: 'indexStartMm', load: { nullish: 0 } },
  { key: 'datumAngleDeg', load: { nullish: 0 } },
  { key: 'scanDirection', load: { or: 'cw' } },
  { key: 'indexDirection', load: { or: 'forward' } },
  { key: 'orientationConfirmed', load: { nullish: true } },
  { key: 'useGlobalOrigin', saveOn: 'local', loadOn: 'local' },
  { key: 'colorScale', load: { or: 'Jet' } },
  { key: 'rangeMin', load: { nullish: null } },
  { key: 'rangeMax', load: { nullish: null } },
  { key: 'opacity', load: { nullish: 1 } },
  { key: 'sourceNdeFile' },
  { key: 'sourceFiles' },
  {
    key: 'sectionType',
    saveOn: 'cloud',
    save: { compute: (sc) => (sc.bodyId ? `appendage:${String(sc.bodyId)}` : undefined) },
    load: 'skip',
  },
];

// ---------------------------------------------------------------------------
// Dome scan composites — save: field list (sectionType derived, cloud only);
// load: normalizeDomeScanComposite() (the single dome defaulting point).
// `data` is intentionally absent (stripped on save, defaulted by normalize).
// ---------------------------------------------------------------------------
export const DOME_SCAN_SPEC: FieldSpec[] = [
  { key: 'id' },
  { key: 'name' },
  { key: 'cloudId' },
  { key: 'head' },
  { key: 'centerPhi' },
  { key: 'centerTheta' },
  { key: 'scanDirection' },
  { key: 'indexDirection' },
  { key: 'orientationConfirmed' },
  { key: 'xAxis' },
  { key: 'yAxis' },
  { key: 'stats' },
  { key: 'colorScale' },
  { key: 'rangeMin' },
  { key: 'rangeMax' },
  { key: 'opacity' },
  { key: 'sourceFiles' },
  { key: 'sectionType', saveOn: 'cloud', save: { compute: (ds) => `dome_${String(ds.head)}` } },
];

// Appendage bodies — save: passthrough (no heavy data to strip);
// load: normalizeAppendage() (the single appendage defaulting point).
export const APPENDAGE_SPEC: FieldSpec[] = [
  { key: 'id' },
  { key: 'name' },
  { key: 'mountPos' },
  { key: 'mountAngle' },
  { key: 'diameter' },
  { key: 'length' },
  { key: 'endClosure' },
  { key: 'headRatio' },
  { key: 'flangeJoint' },
  { key: 'nominalThickness' },
  { key: 'visible' },
  { key: 'locked' },
];
