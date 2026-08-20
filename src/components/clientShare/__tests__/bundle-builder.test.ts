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
//   • publishing never changes a number — stats come from the full-fidelity
//     state, before any decimation;
//   • decimation is conservative: the thinnest reading survives downsampling,
//     because a published grid that hides a thin spot is worse than no grid.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AnnotationShapeConfig,
  type CoverageRectConfig,
  type DomeScanConfig,
  type ScanCompositeConfig,
  type VesselState,
} from '../../VesselModeler/types';
import type { LayerKey } from '../../VesselModeler/outliner-tree';
import { computeComparisonRows } from '../../VesselModeler/engine/coverage-comparison';
import { deserializeVesselState } from '../../VesselModeler/engine/vessel-serialization';
import {
  MAX_GRID_DIMENSION,
  SHARE_LAYER_DEFAULTS,
  buildShareBundle,
  buildShareStats,
  decimateComposite,
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

/** Grid whose one thin cell would be lost by any stride-based decimation. */
function gridWithHiddenThinSpot(size: number, thinAt: [number, number]): (number | null)[][] {
  const data: (number | null)[][] = [];
  for (let r = 0; r < size; r++) {
    const row: (number | null)[] = [];
    for (let c = 0; c < size; c++) {
      row.push(r === thinAt[0] && c === thinAt[1] ? 2.1 : 12);
    }
    data.push(row);
  }
  return data;
}

/** A grid where no two neighbours match, so a min-pool check cannot pass by luck. */
function variedGrid(size: number, offsetMm = 0): (number | null)[][] {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => 12 - ((r * 31 + c * 17) % 53) / 10 + offsetMm)
  );
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

describe('decimateComposite', () => {
  it('leaves a grid that is already small alone, identity-and-all', () => {
    const composite = makeComposite();
    expect(decimateComposite(composite)).toBe(composite);
  });

  it('brings both axes within the cap', () => {
    const size = MAX_GRID_DIMENSION * 3;
    const decimated = decimateComposite(
      makeComposite({
        data: gridWithHiddenThinSpot(size, [5, 7]),
        xAxis: Array.from({ length: size }, (_, i) => i),
        yAxis: Array.from({ length: size }, (_, i) => i),
      })
    );

    expect(decimated.data.length).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
    expect(decimated.data[0].length).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
    expect(decimated.yAxis).toHaveLength(decimated.data.length);
    expect(decimated.xAxis).toHaveLength(decimated.data[0].length);
  });

  it('keeps the thinnest reading — a stride would have dropped it', () => {
    const size = MAX_GRID_DIMENSION * 3;
    const decimated = decimateComposite(
      makeComposite({
        // Index 5,7 is not on any block boundary, so sampling would miss it.
        data: gridWithHiddenThinSpot(size, [5, 7]),
        xAxis: Array.from({ length: size }, (_, i) => i),
        yAxis: Array.from({ length: size }, (_, i) => i),
      })
    );

    const flattened = decimated.data.flat().filter((v): v is number => v !== null);
    expect(Math.min(...flattened)).toBeCloseTo(2.1, 6);
  });

  it('carries nulls through as nulls when a block held no reading', () => {
    const size = MAX_GRID_DIMENSION * 2;
    const data: (number | null)[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => null)
    );
    const decimated = decimateComposite(
      makeComposite({
        data,
        xAxis: Array.from({ length: size }, (_, i) => i),
        yAxis: Array.from({ length: size }, (_, i) => i),
      })
    );
    expect(decimated.data.flat().every((v) => v === null)).toBe(true);
  });

  it('leaves stats alone — they describe the real scan, not the shipped grid', () => {
    const size = MAX_GRID_DIMENSION * 2;
    const composite = makeComposite({
      data: gridWithHiddenThinSpot(size, [3, 3]),
      xAxis: Array.from({ length: size }, (_, i) => i),
      yAxis: Array.from({ length: size }, (_, i) => i),
      stats: { min: 2.1, max: 12, mean: 11.9, median: 12, stdDev: 0.3, validArea: 5 },
    });
    expect(decimateComposite(composite).stats).toEqual(composite.stats);
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

  it('computes stats from the FULL state, not the decimated one', () => {
    // A grid coarse enough to be decimated must not move the coverage numbers.
    const size = MAX_GRID_DIMENSION * 2;
    const state = makeState({
      scanComposites: [
        makeComposite({
          data: gridWithHiddenThinSpot(size, [4, 4]),
          xAxis: Array.from({ length: size }, (_, i) => i * 10),
          yAxis: Array.from({ length: size }, (_, i) => i * 10),
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

  it('ships both heatmap kinds decimated — a dome scan is wall thickness too', () => {
    const size = MAX_GRID_DIMENSION * 2;
    const axis = Array.from({ length: size }, (_, i) => i * 5);
    const shipped = sanitizeVesselStateForShare(
      makeState({
        domeScanComposites: [
          makeDomeComposite({ data: variedGrid(size), xAxis: axis, yAxis: axis }),
        ],
      }),
      ALL_LAYERS
    );

    expect(shipped.domeScanComposites[0].data.length).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
    expect(shipped.domeScanComposites[0].data[0].length).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
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
// The emitted model.json — asserted AFTER serialization, which is where the
// bundle used to lose its heatmaps.
// =============================================================================
// Every test above this line inspects the sanitized STATE. The state was always
// right; `serializeVesselState(..., { path: 'cloud' })` then dropped every
// composite's `data` (correct for a cloud save, whose grids live in their own
// table) and shipped a model with axes, stats and no readings — a blank heatmap
// and a hover that reports nothing. So these tests parse the file body the
// client actually downloads.
// =============================================================================

const GRID_SIZE = MAX_GRID_DIMENSION * 2;
const AXIS = Array.from({ length: GRID_SIZE }, (_, i) => i * 5);

interface WireComposite {
  id: string;
  data?: (number | null)[][];
  xAxis?: number[];
  yAxis?: number[];
  stats?: { min: number };
}

interface WireModel {
  scanComposites: WireComposite[];
  domeScanComposites: WireComposite[];
}

/** The model.json bytes a client would receive, parsed back. */
function emittedModel(vesselState: VesselState): WireModel {
  const bundle = buildShareBundle({
    project: { name: 'Karstoe 2026' },
    vessels: [{ id: 'v-1', name: 'Knockout Drum', vesselState }],
    published: ALL_LAYERS,
    revision: 1,
    publishedAt: '2026-08-20T09:00:00.000Z',
  });
  const file = bundle.files.find((f) => f.path === 'vessels/v-1/model.json');
  if (!file || file.body instanceof Blob) throw new Error('bundle has no model.json');
  // Through JSON on purpose: the client fetches bytes, not this object.
  return JSON.parse(JSON.stringify(file.body)) as WireModel;
}

/** Thinnest reading in a source block — the value min-pooling must produce. */
function blockMin(
  data: (number | null)[][],
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number
): number | null {
  let min: number | null = null;
  for (let r = rowStart; r < rowEnd; r++) {
    for (let c = colStart; c < colEnd; c++) {
      const v = data[r]?.[c];
      if (v === null || v === undefined) continue;
      if (min === null || v < min) min = v;
    }
  }
  return min;
}

/** Assert a shipped grid is the min-pool of `source`, cell for cell. */
function expectMinPoolOf(shipped: (number | null)[][], source: (number | null)[][]): void {
  const rowBlock = Math.ceil(source.length / shipped.length);
  const colBlock = Math.ceil(source[0].length / shipped[0].length);
  expect(rowBlock).toBeGreaterThan(1);

  for (let r = 0; r < shipped.length; r++) {
    for (let c = 0; c < shipped[r].length; c++) {
      const expected = blockMin(
        source,
        r * rowBlock,
        Math.min((r + 1) * rowBlock, source.length),
        c * colBlock,
        Math.min((c + 1) * colBlock, source[0].length)
      );
      if (shipped[r][c] !== expected) {
        // One targeted failure beats 36,864 passing assertions of noise.
        expect({ r, c, got: shipped[r][c] }).toEqual({ r, c, got: expected });
      }
    }
  }
}

describe('the emitted model.json — the client has no second copy', () => {
  const scanGrid = variedGrid(GRID_SIZE);
  const domeGrid = variedGrid(GRID_SIZE, -1.5);
  const state = makeState({
    scanComposites: [makeComposite({ id: 'sc-big', data: scanGrid, xAxis: AXIS, yAxis: AXIS })],
    domeScanComposites: [
      makeDomeComposite({ id: 'ds-big', data: domeGrid, xAxis: AXIS, yAxis: AXIS }),
    ],
  });

  it('carries the thickness grid for a scan composite', () => {
    const [sc] = emittedModel(state).scanComposites;
    expect(sc.id).toBe('sc-big');
    expect(Array.isArray(sc.data)).toBe(true);
    expect(sc.data?.length).toBeGreaterThan(0);
  });

  it('carries the thickness grid for a dome scan composite', () => {
    const [ds] = emittedModel(state).domeScanComposites;
    expect(ds.id).toBe('ds-big');
    expect(Array.isArray(ds.data)).toBe(true);
    expect(ds.data?.length).toBeGreaterThan(0);
  });

  it('ships the DECIMATED grid, never the inspector-resolution one', () => {
    const model = emittedModel(state);
    for (const composite of [model.scanComposites[0], model.domeScanComposites[0]]) {
      const data = composite.data as (number | null)[][];
      expect(data.length).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
      expect(data[0].length).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
      expect(data.length).toBeLessThan(GRID_SIZE);
      // Axes must agree with the grid, or the viewer maps cells to the wrong mm.
      expect(composite.yAxis).toHaveLength(data.length);
      expect(composite.xAxis).toHaveLength(data[0].length);
    }
  });

  it('min-pools every shipped cell, so no thin spot is downsampled away', () => {
    const model = emittedModel(state);
    expectMinPoolOf(model.scanComposites[0].data as (number | null)[][], scanGrid);
    expectMinPoolOf(model.domeScanComposites[0].data as (number | null)[][], domeGrid);
  });

  it('keeps the two grids distinct — data is matched to its composite by id', () => {
    const model = emittedModel(state);
    const scanCell = model.scanComposites[0].data?.[0]?.[0];
    const domeCell = model.domeScanComposites[0].data?.[0]?.[0];
    expect(scanCell).not.toBe(domeCell);
    expect(domeCell).toBeCloseTo((scanCell as number) - 1.5, 6);
  });

  it('reloads through the deserializer the client uses, grid intact', () => {
    const model = emittedModel(state) as unknown as Record<string, unknown>;
    const restored = deserializeVesselState(model, { path: 'cloud', textures: [] });

    expect(restored.scanComposites[0].data.length).toBe(
      (emittedModel(state).scanComposites[0].data as (number | null)[][]).length
    );
    expect(restored.domeScanComposites[0].data.length).toBeGreaterThan(0);
    expect(restored.scanComposites[0].data[0].length).toBeLessThanOrEqual(MAX_GRID_DIMENSION);
  });

  it('leaves a small grid alone — decimation caps, it does not always shrink', () => {
    const [sc] = emittedModel(makeState()).scanComposites;
    expect(sc.data).toEqual([
      [10, 10],
      [10, 10],
    ]);
  });
});
