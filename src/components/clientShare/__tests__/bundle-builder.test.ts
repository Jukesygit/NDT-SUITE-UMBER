// =============================================================================
// bundle-builder — what a client actually receives
// =============================================================================
// This is the file that decides what leaves the building, so the tests are
// written as the design's verification plan reads:
//
//   • unpublished layers are ABSENT from the bundle, not hidden in it;
//   • the hard-coded exclusions hold no matter which layers were ticked
//     (the design's "automated grep over a test bundle" is its own file,
//     `bundle-exclusions.test.ts`);
//   • no shipped entity carries a `visible` flag — what the modeler had hidden
//     is working state, and the client's layer chips are their only control;
//   • publishing never changes a number, and never changes a reading: stats come
//     from the full-fidelity state and the grids ship at full resolution, cell
//     for cell — quantised to 0.0001 mm as a WIRE ENCODING, which is a hundred
//     times finer than the gauge and is the only thing that may differ.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AnnotationShapeConfig,
  type AppendageConfig,
  type CoverageRectConfig,
  type DomeScanConfig,
  type ScanCompositeConfig,
  type VesselState,
} from '../../VesselModeler/types';
import type { LayerKey } from '../../VesselModeler/outliner-tree';
import { computeComparisonRows } from '../../VesselModeler/engine/coverage-comparison';
import { deserializeVesselState } from '../../VesselModeler/engine/vessel-serialization';
import {
  SHARE_LAYER_DEFAULTS,
  buildShareBundle,
  buildShareStats,
  sanitizeVesselStateForShare,
} from '../bundle-builder';
import { MANIFEST_PATH, SHARE_BUNDLE_FORMAT } from '../bundle-types';

const RECT: CoverageRectConfig = {
  id: 1,
  name: 'Shell band A',
  pos: 2000,
  angle: 90,
  width: 400,
  height: 400,
  color: '#ffffff',
  lineWidth: 10,
  filled: false,
  fillOpacity: 0.2,
  technique: 'paut-corrosion-mapping',
  techniqueOther: 'ask Dave about the rate',
  note: 'Client contact is Jane Roe, 07700 900000 — do not scan during shift change',
};

const ANNOTATION = {
  id: 1,
  name: 'Pitting cluster',
  type: 'rectangle',
  pos: 1000,
  angle: 90,
  width: 200,
  height: 200,
  color: '#ff0000',
  lineWidth: 5,
  showLabel: true,
} as AnnotationShapeConfig;

const APPENDAGE: AppendageConfig = {
  id: 'app-1',
  name: 'Boot 1',
  mountPos: 3000,
  mountAngle: 270,
  diameter: 600,
  length: 900,
  endClosure: 'dished',
  headRatio: 2,
};

function makeComposite(overrides: Partial<ScanCompositeConfig> = {}): ScanCompositeConfig {
  return {
    id: 'sc-1',
    name: 'Scan 1',
    data: [
      [10, 10],
      [10, 10],
    ],
    xAxis: [0, 100],
    yAxis: [0, 100],
    stats: { min: 10, max: 10, mean: 10, median: 10, stdDev: 0, validArea: 1_000_000 },
    indexStartMm: 0,
    datumAngleDeg: 0,
    scanDirection: 'cw',
    indexDirection: 'forward',
    orientationConfirmed: true,
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...overrides,
  };
}

function makeDomeComposite(overrides: Partial<DomeScanConfig> = {}): DomeScanConfig {
  return {
    id: 'ds-1',
    name: 'Dome scan 1',
    head: 'left',
    centerPhi: 30,
    centerTheta: 90,
    scanDirection: 'cw',
    indexDirection: 'outward',
    orientationConfirmed: true,
    data: [
      [10, 10],
      [10, 10],
    ],
    xAxis: [0, 100],
    yAxis: [0, 100],
    stats: { min: 10, max: 10, mean: 10, median: 10, stdDev: 0, validArea: 1_000_000 },
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...overrides,
  };
}

function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    coverageRects: [RECT],
    annotations: [ANNOTATION],
    scanComposites: [makeComposite()],
    ...overrides,
  };
}

const ALL_LAYERS = new Set(Object.keys(SHARE_LAYER_DEFAULTS) as LayerKey[]);

/**
 * An inspector-resolution grid: no two neighbours match, and roughly one cell in
 * a hundred is a null where the probe read nothing. Both properties matter —
 * equality against a grid of one repeated value could pass while shipping the
 * wrong cells, and nulls are the part a lossy transform would quietly fill in.
 */
function variedGrid(rows: number, cols: number, offsetMm = 0): (number | null)[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      (r * 7 + c * 13) % 97 === 0 ? null : 12 - ((r * 31 + c * 17) % 53) / 10 + offsetMm
    )
  );
}

/**
 * The same grid as it is WRITTEN to the wire: 4 decimal places, nulls kept.
 *
 * The rule is restated here rather than imported so the expectation is a
 * statement of the contract, not a re-run of the implementation. For readings
 * that already have short decimals it is the identity — the fixtures above are
 * built with arithmetic like `12 - 5.3`, whose Float64 result is
 * `6.699999999999999`, and that difference is exactly what the wire encoding
 * exists to drop.
 */
function quantized(grid: (number | null)[][]): (number | null)[][] {
  return grid.map((row) => row.map((v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v)));
}

/** Deliberately non-square and far past any historical cap, so a reintroduced
 *  decimation step could not hide behind a coincidence. */
const GRID_ROWS = 400;
const GRID_COLS = 500;
const X_AXIS = Array.from({ length: GRID_COLS }, (_, i) => i * 5);
const Y_AXIS = Array.from({ length: GRID_ROWS }, (_, i) => i * 4);

/** Every collection whose entities must ship without a `visible` flag. */
const VISIBILITY_NORMALIZED = [
  'nozzles',
  'welds',
  'liftingLugs',
  'saddles',
  'scanComposites',
  'domeScanComposites',
  'annotations',
  'coverageRects',
  'inspectionImages',
  'rulers',
  'pipelines',
  'textures',
  // Not a layer anyone can toggle, but its flag hides a whole body.
  'appendages',
] as const;

/** One hidden entity in every collection above, shaped only enough to copy. */
function stateWithEverythingHidden(): VesselState {
  const hidden = Object.fromEntries(
    VISIBILITY_NORMALIZED.map((key) => [key, [{ id: `${key}-1`, name: 'hidden', visible: false }]])
  );
  return { ...DEFAULT_VESSEL_STATE, ...(hidden as unknown as Partial<VesselState>) };
}

/** Own-property check — `visible: undefined` is a different (and wrong) answer. */
function hasVisibleKey(entity: unknown): boolean {
  return Object.prototype.hasOwnProperty.call(entity as object, 'visible');
}

describe('sanitizeVesselStateForShare — exclusion is removal', () => {
  it('empties every collection whose layer was not published', () => {
    const shipped = sanitizeVesselStateForShare(makeState(), new Set<LayerKey>(['scans']));

    expect(shipped.scanComposites).toHaveLength(1);
    expect(shipped.coverageRects).toEqual([]);
    expect(shipped.annotations).toEqual([]);
    expect(shipped.nozzles).toEqual([]);
    expect(shipped.textures).toEqual([]);
    expect(shipped.inspectionImages).toEqual([]);
  });

  it('keeps published collections intact', () => {
    const shipped = sanitizeVesselStateForShare(makeState(), ALL_LAYERS);
    expect(shipped.coverageRects).toHaveLength(1);
    expect(shipped.annotations).toHaveLength(1);
  });

  it('never mutates the state it was handed', () => {
    const state = makeState();
    sanitizeVesselStateForShare(state, new Set<LayerKey>());
    expect(state.coverageRects).toHaveLength(1);
    expect(state.coverageRects[0].note).toBe(RECT.note);
  });

  it('drops reference drawings, which are not a layer anyone can tick', () => {
    const state = makeState({
      referenceDrawings: [{ id: 1, name: 'GA', imageData: 'data:image/png;base64,AAA' } as never],
    });
    expect(sanitizeVesselStateForShare(state, ALL_LAYERS).referenceDrawings).toEqual([]);
  });
});

describe('sanitizeVesselStateForShare — hard-coded exclusions', () => {
  it('strips rect notes and free-text technique even with every layer published', () => {
    const [rect] = sanitizeVesselStateForShare(makeState(), ALL_LAYERS).coverageRects;
    expect(rect.note).toBeUndefined();
    expect(rect.techniqueOther).toBeUndefined();
  });

  it('keeps the technique enum, which is a closed vocabulary', () => {
    const [rect] = sanitizeVesselStateForShare(makeState(), ALL_LAYERS).coverageRects;
    expect(rect.technique).toBe('paut-corrosion-mapping');
  });

  it('keeps the rest of the rect so the plan still renders', () => {
    const [rect] = sanitizeVesselStateForShare(makeState(), ALL_LAYERS).coverageRects;
    expect(rect).toMatchObject({ id: 1, name: 'Shell band A', pos: 2000, angle: 90 });
  });
});

// =============================================================================
// Modeler visibility is working state, not publish intent
// =============================================================================
// A model saved with entities hidden used to ship those flags, and the client's
// chip for that category could then never reveal them: effective visibility in
// the read-only scene is `entity.visible !== false` AND the layer. Inclusion is
// the publish dialog's decision; display is the client's.
// =============================================================================

describe('sanitizeVesselStateForShare — visibility normalisation', () => {
  const view = (state: VesselState): Record<string, { visible?: boolean }[]> =>
    state as unknown as Record<string, { visible?: boolean }[]>;

  it('removes the visible key from every shipped collection, appendages included', () => {
    const shipped = view(sanitizeVesselStateForShare(stateWithEverythingHidden(), ALL_LAYERS));

    for (const collection of VISIBILITY_NORMALIZED) {
      const [entity] = shipped[collection];
      expect(entity, `${collection} was emptied, so nothing was asserted`).toBeDefined();
      // REMOVED, not `visible: true` — absent-means-visible is the wire format's
      // own convention, and a legacy model has no key here either.
      expect(hasVisibleKey(entity), `${collection} still carries a visible key`).toBe(false);
    }
  });

  it('leaves a visible entity alone — it had no key to begin with', () => {
    const state = makeState({ scanComposites: [makeComposite()], coverageRects: [RECT] });
    const shipped = sanitizeVesselStateForShare(state, ALL_LAYERS);

    expect(hasVisibleKey(shipped.scanComposites[0])).toBe(false);
    expect(hasVisibleKey(shipped.coverageRects[0])).toBe(false);
  });

  it('touches nothing but `visible`', () => {
    const state = makeState({
      scanComposites: [makeComposite({ visible: false })],
      appendages: [{ ...APPENDAGE, visible: false, locked: true }],
    });
    const shipped = sanitizeVesselStateForShare(state, ALL_LAYERS);

    expect(shipped.scanComposites[0]).toEqual({ ...makeComposite(), visible: undefined });
    expect(shipped.appendages[0]).toMatchObject({ ...APPENDAGE, locked: true });
    expect(hasVisibleKey(shipped.appendages[0])).toBe(false);
  });

  it('never mutates the publisher’s own entities', () => {
    const state = stateWithEverythingHidden();
    sanitizeVesselStateForShare(state, ALL_LAYERS);

    for (const collection of VISIBILITY_NORMALIZED) {
      const [entity] = view(state)[collection];
      expect(entity.visible, `${collection} was mutated in place`).toBe(false);
    }
  });
});

describe('buildShareStats', () => {
  it('is the engine rows, projected — never a second calculation', () => {
    const state = makeState();
    const engineRows = computeComparisonRows(state);
    const { rows } = buildShareStats(state);

    expect(rows.map((r) => r.key)).toEqual(engineRows.map((r) => r.key));
    rows.forEach((row, i) => {
      expect(row.achievedPct).toBe(engineRows[i].achievedPct);
      expect(row.targetPct).toBe(engineRows[i].targetPct);
      expect(row.status).toBe(engineRows[i].status);
    });
  });
});

describe('buildShareBundle', () => {
  const params = {
    project: { name: 'Karstoe 2026', number: 'P-2026-14' },
    vessels: [{ id: 'v-1', name: 'Knockout Drum', tag: 'V-101', vesselState: makeState() }],
    published: ALL_LAYERS,
    revision: 3,
    publishedAt: '2026-08-20T09:00:00.000Z',
  };

  it('puts the manifest first, so an upload that dies mid-way leaves no live index', () => {
    expect(buildShareBundle(params).files[0].path).toBe(MANIFEST_PATH);
  });

  it('emits one model per vessel at the manifest-declared path', () => {
    const bundle = buildShareBundle(params);
    const vessel = bundle.manifest.vessels[0];
    expect(bundle.files.some((f) => f.path === vessel.modelPath)).toBe(true);
  });

  it('records the format version, revision and publish time', () => {
    const { manifest } = buildShareBundle(params);
    expect(manifest.formatVersion).toBe(SHARE_BUNDLE_FORMAT);
    expect(manifest.revision).toBe(3);
    expect(manifest.publishedAt).toBe('2026-08-20T09:00:00.000Z');
  });

  it('lists exactly the published layers as the client-side toggle set', () => {
    const bundle = buildShareBundle({
      ...params,
      published: new Set<LayerKey>(['scans', 'coverage']),
    });
    expect([...bundle.manifest.publishedLayers].sort()).toEqual(['coverage', 'scans']);
  });

  it('computes stats from the full-fidelity state — publishing changes no number', () => {
    const state = makeState({
      scanComposites: [
        makeComposite({
          data: variedGrid(GRID_ROWS, GRID_COLS),
          xAxis: X_AXIS,
          yAxis: Y_AXIS,
        }),
      ],
    });
    const expected = buildShareStats(state).rows;
    const bundle = buildShareBundle({
      ...params,
      vessels: [{ id: 'v-1', name: 'V', vesselState: state }],
    });
    expect(bundle.manifest.vessels[0].stats).toEqual(expected);
  });

  it('includes a screenshot only when one was captured', () => {
    const withShot = buildShareBundle({
      ...params,
      vessels: [
        {
          id: 'v-1',
          name: 'V',
          vesselState: makeState(),
          screenshot: new Blob(['x'], { type: 'image/png' }),
        },
      ],
    });
    expect(withShot.manifest.vessels[0].screenshotPath).toBe('vessels/v-1/screenshot.png');
    expect(withShot.files.some((f) => f.path === 'vessels/v-1/screenshot.png')).toBe(true);

    expect(buildShareBundle(params).manifest.vessels[0].screenshotPath).toBeUndefined();
  });
});

// =============================================================================
// The emitted model — asserted AFTER serialization, which is where the bundle
// used to lose its heatmaps.
// =============================================================================
// Every test above this line inspects the sanitized STATE. The state was always
// right; `serializeVesselState(..., { path: 'cloud' })` then dropped every
// composite's `data` (correct for a cloud save, whose grids live in their own
// table) and shipped a model with axes, stats and no readings — a blank heatmap
// and a hover that reports nothing. So these tests parse the file body the
// client actually downloads.
//
// They are also where "the bundle ships every cell the inspector scanned" is
// pinned: a DECIMATION step reintroduced anywhere between the sanitiser and the
// wire would show up here as a grid of the wrong shape. The 4-decimal wire
// encoding is the one permitted difference, and it is pinned too.
// =============================================================================

interface WireEntity {
  id?: string | number;
  visible?: boolean;
}

interface WireComposite extends WireEntity {
  data?: (number | null)[][];
  xAxis?: number[];
  yAxis?: number[];
  stats?: Record<string, number>;
}

interface WireModel {
  scanComposites: WireComposite[];
  domeScanComposites: WireComposite[];
  coverageRects: WireEntity[];
  appendages: WireEntity[];
}

const MODEL_PATH = 'vessels/v-1/model.json.gz';

function emittedModelFile(vesselState: VesselState, published: ReadonlySet<LayerKey> = ALL_LAYERS) {
  const bundle = buildShareBundle({
    project: { name: 'Karstoe 2026' },
    vessels: [{ id: 'v-1', name: 'Knockout Drum', vesselState }],
    published,
    revision: 1,
    publishedAt: '2026-08-20T09:00:00.000Z',
  });
  const file = bundle.files.find((f) => f.path === MODEL_PATH);
  if (!file) throw new Error(`bundle has no ${MODEL_PATH}`);
  return file;
}

/** The model bytes a client would receive, parsed back. */
function emittedModel(vesselState: VesselState, published: ReadonlySet<LayerKey> = ALL_LAYERS) {
  const file = emittedModelFile(vesselState, published);
  if (file.body instanceof Blob) throw new Error('the model body is not inspectable JSON');
  // Through JSON on purpose: the client fetches bytes, not this object.
  return JSON.parse(JSON.stringify(file.body)) as WireModel;
}

// =============================================================================
// Wire encoding — how the model is written, not what it says
// =============================================================================
// A publish of full-resolution grids as raw JSON was refused outright by Storage
// (2026-08-21: "The object exceeded the maximum allowed size", the project's
// ~50MB cap). Two things fixed that, and neither may quietly regress: gzip, and
// 4-decimal readings. Compression itself happens in the upload layer — the
// builder only MARKS the file — so that the object here stays plain JSON the
// exclusion sweep can grep.
// =============================================================================

describe('the model file — wire encoding', () => {
  it('names the model with a .gz suffix, which is what tells the viewer to inflate', () => {
    const bundle = buildShareBundle({
      project: { name: 'Karstoe 2026' },
      vessels: [{ id: 'v-1', name: 'Knockout Drum', vesselState: makeState() }],
      published: ALL_LAYERS,
      revision: 1,
      publishedAt: '2026-08-20T09:00:00.000Z',
    });

    // The manifest is the contract: the viewer branches on the path it names.
    expect(bundle.manifest.vessels[0].modelPath).toBe(MODEL_PATH);
    expect(bundle.files.some((f) => f.path === MODEL_PATH)).toBe(true);
  });

  it('marks the model for gzip and types it as gzip', () => {
    const file = emittedModelFile(makeState());
    expect(file.encoding).toBe('gzip');
    expect(file.contentType).toBe('application/gzip');
  });

  it('leaves the body as plain JSON — the builder is pure and sync', () => {
    // Compression is the upload layer's job. If the body were bytes here, the
    // exclusion sweep could no longer read what a client receives.
    expect(emittedModelFile(makeState()).body).not.toBeInstanceOf(Blob);
  });

  it('does not gzip the manifest — it is small and it is the entry request', () => {
    const bundle = buildShareBundle({
      project: { name: 'Karstoe 2026' },
      vessels: [{ id: 'v-1', name: 'Knockout Drum', vesselState: makeState() }],
      published: ALL_LAYERS,
      revision: 1,
      publishedAt: '2026-08-20T09:00:00.000Z',
    });
    const manifest = bundle.files.find((f) => f.path === MANIFEST_PATH);
    expect(manifest?.encoding).toBeUndefined();
    expect(manifest?.contentType).toBe('application/json');
  });
});

describe('the emitted model — readings are quantised to 0.0001 mm', () => {
  const NOISY = 12.699999809265137;
  const noisyState = makeState({
    scanComposites: [
      makeComposite({
        // A Float64 reading as it arrives from a probe, a hole, and a value that
        // is already short enough that quantising must be the identity.
        data: [[NOISY, null, 12.34]],
        xAxis: [0.1, 0.30000000000000004, 0.7],
        yAxis: [0.30000000000000004],
      }),
    ],
  });

  it('rounds a Float64 reading to four places', () => {
    const [sc] = emittedModel(noisyState).scanComposites;
    expect(sc.data?.[0][0]).toBe(12.7);
  });

  it('rides nulls through — a hole is where the probe read nothing', () => {
    expect(emittedModel(noisyState).scanComposites[0].data?.[0][1]).toBeNull();
  });

  it('leaves a reading that already fits alone', () => {
    expect(emittedModel(noisyState).scanComposites[0].data?.[0][2]).toBe(12.34);
  });

  it('does not touch the axes — those are positions, not readings', () => {
    const [sc] = emittedModel(noisyState).scanComposites;
    expect(sc.xAxis).toEqual([0.1, 0.30000000000000004, 0.7]);
    expect(sc.yAxis).toEqual([0.30000000000000004]);
  });

  it('never rewrites the app’s own grid', () => {
    const state = makeState({ scanComposites: [makeComposite({ data: [[NOISY]] })] });
    emittedModel(state);
    expect(state.scanComposites[0].data[0][0]).toBe(NOISY);
  });
});

describe('the emitted model — the client has no second copy', () => {
  const scanGrid = variedGrid(GRID_ROWS, GRID_COLS);
  const domeGrid = variedGrid(GRID_ROWS, GRID_COLS, -1.5);
  const scanStats = { min: 2.1, max: 12, mean: 11.4, median: 11.6, stdDev: 0.4, validArea: 7 };
  const state = makeState({
    scanComposites: [
      makeComposite({
        id: 'sc-big',
        data: scanGrid,
        xAxis: X_AXIS,
        yAxis: Y_AXIS,
        stats: scanStats,
      }),
    ],
    domeScanComposites: [
      makeDomeComposite({ id: 'ds-big', data: domeGrid, xAxis: X_AXIS, yAxis: Y_AXIS }),
    ],
  });

  it('carries the scan composite’s grid, cell for cell', () => {
    const [sc] = emittedModel(state).scanComposites;
    expect(sc.id).toBe('sc-big');
    // Cell for cell, nulls included: the client hovers the reading the inspector
    // took, at the position the inspector took it — written to 0.0001 mm.
    expect(sc.data).toEqual(quantized(scanGrid));
    expect(sc.xAxis).toEqual(X_AXIS);
    expect(sc.yAxis).toEqual(Y_AXIS);
  });

  it('carries the dome composite’s grid, cell for cell', () => {
    const [ds] = emittedModel(state).domeScanComposites;
    expect(ds.id).toBe('ds-big');
    // A dome scan is wall thickness on a head — no less a deliverable than a
    // shell scan, and shipped at the same fidelity.
    expect(ds.data).toEqual(quantized(domeGrid));
    expect(ds.xAxis).toEqual(X_AXIS);
    expect(ds.yAxis).toEqual(Y_AXIS);
  });

  it('ships the full grid dimensions — nothing downsamples on the way out', () => {
    const model = emittedModel(state);
    for (const composite of [model.scanComposites[0], model.domeScanComposites[0]]) {
      const data = composite.data as (number | null)[][];
      expect(data).toHaveLength(GRID_ROWS);
      expect(data[0]).toHaveLength(GRID_COLS);
      // Axes must agree with the grid, or the viewer maps cells to the wrong mm.
      expect(composite.yAxis).toHaveLength(data.length);
      expect(composite.xAxis).toHaveLength(data[0].length);
    }
  });

  it('leaves stats alone — they describe the scan, not the file', () => {
    expect(emittedModel(state).scanComposites[0].stats).toEqual(scanStats);
  });

  it('keeps the two grids distinct — data is matched to its composite by id', () => {
    const model = emittedModel(state);
    expect(model.scanComposites[0].data).not.toEqual(quantized(domeGrid));
    expect(model.domeScanComposites[0].data).not.toEqual(quantized(scanGrid));
  });

  it('attaches from the SANITIZED state — an unpublished scan stays unpublished', () => {
    // The grids are re-attached after serialization, so the source of that
    // attach is load-bearing: reading the caller's raw state would put back the
    // very composites the layer ticks had just deleted.
    const model = emittedModel(state, new Set<LayerKey>(['coverage']));

    expect(model.scanComposites).toEqual([]);
    expect(model.domeScanComposites).toEqual([]);
  });

  it('reloads through the deserializer the client uses, grid intact', () => {
    const model = emittedModel(state) as unknown as Record<string, unknown>;
    const restored = deserializeVesselState(model, { path: 'cloud', textures: [] });

    expect(restored.scanComposites[0].data).toEqual(quantized(scanGrid));
    expect(restored.domeScanComposites[0].data).toEqual(quantized(domeGrid));
  });

  it('ships a small grid unchanged too', () => {
    const [sc] = emittedModel(makeState()).scanComposites;
    expect(sc.data).toEqual([
      [10, 10],
      [10, 10],
    ]);
  });
});

describe('the emitted model — no entity ships a visibility flag', () => {
  const hiddenState = makeState({
    coverageRects: [{ ...RECT, visible: false }],
    scanComposites: [makeComposite({ visible: false, data: variedGrid(8, 8) })],
    appendages: [{ ...APPENDAGE, visible: false }],
  });

  it('drops a hidden coverage rect’s flag while still shipping the rect', () => {
    const [rect] = emittedModel(hiddenState).coverageRects;
    expect(rect).toMatchObject({ id: 1, name: 'Shell band A' });
    expect(hasVisibleKey(rect)).toBe(false);
  });

  it('drops a hidden scan composite’s flag while still shipping its grid', () => {
    const [sc] = emittedModel(hiddenState).scanComposites;
    expect(hasVisibleKey(sc)).toBe(false);
    expect(sc.data).toEqual(quantized(variedGrid(8, 8)));
  });

  it('drops a hidden appendage’s flag — otherwise the whole body is unreachable', () => {
    const [appendage] = emittedModel(hiddenState).appendages;
    expect(appendage).toMatchObject({ id: 'app-1', name: 'Boot 1' });
    expect(hasVisibleKey(appendage)).toBe(false);
  });

  it('restores as visible through the client’s own deserializer', () => {
    const model = emittedModel(hiddenState) as unknown as Record<string, unknown>;
    const restored = deserializeVesselState(model, { path: 'cloud', textures: [] });

    // `visible !== false` is what the read-only scene tests, so an absent key
    // renders — which is the entire point of removing it rather than setting it.
    expect(restored.coverageRects[0].visible).not.toBe(false);
    expect(restored.scanComposites[0].visible).not.toBe(false);
    expect(restored.appendages[0].visible).not.toBe(false);
  });
});
