// =============================================================================
// wall-loss compute — nozzle-bore cutouts (design 2026-08-05 §R1)
// =============================================================================
// Nozzle bores are unmappable openings: their cells contribute ZERO area to the
// wall-loss distribution, on the MAIN shell (via req.footprints) AND on a boot
// body (via WallLossBodyInput.footprints). The worker rebuilds each footprint
// from serialisable params through buildFootprintFromParams — radial circles and
// non-radial ellipses alike — so the cutout matches coverage + heatmap exactly.
// Zero-footprint requests stay byte-identical (covered by the existing suite).
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  compute,
  type CompositeSlim,
  type FootprintParamsSlim,
  type WallLossBodyInput,
  type WallLossRequest,
} from '../wall-loss-compute';

function makeShellComposite(overrides: Partial<CompositeSlim> = {}): CompositeSlim {
  return {
    id: 'sc_1',
    orientationConfirmed: true,
    data: [
      [8, 8, 8],
      [8, 8, 8],
      [8, 8, 8],
    ],
    xAxis: [0, 100, 200],
    yAxis: [0, 1000, 2000], // rows 1000 mm apart → a small bore catches one row
    indexStartMm: 1000,
    datumAngleDeg: 0,
    scanDirection: 'cw',
    indexDirection: 'forward',
    ...overrides,
  };
}

function makeRequest(overrides: Partial<WallLossRequest> = {}): WallLossRequest {
  return {
    id: 1,
    composites: [],
    domeComposites: [],
    vesselId: 3000,
    vesselLength: 8000,
    headRatio: 2,
    nominalThickness: 10,
    binCount: 5,
    binMode: 'equal',
    shellNominalThickness: 10,
    domeNominalThickness: 10,
    ...overrides,
  };
}

describe('wall-loss — main-shell nozzle bore excludes shell cells', () => {
  it('drops exactly the cells inside a radial nozzle footprint', () => {
    // Bore at mountPos 1500 (r 200) catches row 0 (pos mid 1500) not row 1 (2500).
    const composite = makeShellComposite();
    const footprints: FootprintParamsSlim[] = [
      { id: 'noz-1', mountPos: 1500, mountAngle: 86, diameter: 400 },
    ];
    const withCut = compute(makeRequest({ composites: [composite], footprints }));
    const noCut = compute(makeRequest({ composites: [composite] }));

    expect(noCut.totalDataPoints).toBe(4);
    expect(withCut.totalDataPoints).toBe(2); // row-0 cells removed
    expect(withCut.totalScannedArea).toBeLessThan(noCut.totalScannedArea);
  });
});

describe('wall-loss — boot nozzle bore excludes that boot’s cells only', () => {
  // Boot cylinder: diameter 1000 (R 500), long enough to keep all cells on the
  // cylinder. A bore at mountPos 1500 (r 250) catches the boot scan's row 0.
  const bootScan = makeShellComposite({ id: 'app-sc' });
  const bootFootprints: FootprintParamsSlim[] = [
    { id: 'noz-b', mountPos: 1500, mountAngle: 78, diameter: 500 },
  ];
  const bootBody = (footprints?: FootprintParamsSlim[]): WallLossBodyInput => ({
    bodyId: 'app-1',
    name: 'Boot',
    composites: [bootScan],
    footprints,
    vesselId: 1000,
    vesselLength: 4000,
    headRatio: 2,
    nominalThickness: 10,
  });

  it('removes the bore cells from the boot distribution', () => {
    const withCut = compute(makeRequest({ bodies: [bootBody(bootFootprints)] }));
    const noCut = compute(makeRequest({ bodies: [bootBody(undefined)] }));

    const bootWith = withCut.bodies.find((b) => b.bodyId === 'app-1')!;
    const bootNo = noCut.bodies.find((b) => b.bodyId === 'app-1')!;

    expect(bootNo.totalDataPoints).toBe(4);
    expect(bootWith.totalDataPoints).toBe(2); // row-0 bore cells removed
    expect(bootWith.totalScannedArea).toBeLessThan(bootNo.totalScannedArea);
  });

  it('a boot bore does NOT touch the main shell distribution', () => {
    const mainScan = makeShellComposite({ id: 'main-sc' });
    const res = compute(
      makeRequest({ composites: [mainScan], bodies: [bootBody(bootFootprints)] })
    );
    const main = res.bodies.find((b) => b.bodyId === undefined)!;
    // Main shell keeps all 4 cells — the boot's footprint is body-scoped.
    expect(main.totalDataPoints).toBe(4);
  });

  it('is byte-identical with no boot footprints vs an empty list', () => {
    const undef = compute(makeRequest({ bodies: [bootBody(undefined)] }));
    const empty = compute(makeRequest({ id: 2, bodies: [bootBody([])] }));
    const bootUndef = undef.bodies.find((b) => b.bodyId === 'app-1')!;
    const bootEmpty = empty.bodies.find((b) => b.bodyId === 'app-1')!;
    expect(bootEmpty.bins).toEqual(bootUndef.bins);
    expect(bootEmpty.totalScannedArea).toBe(bootUndef.totalScannedArea);
    expect(bootUndef.totalDataPoints).toBe(4);
  });
});

describe('wall-loss — non-radial nozzle ellipse crosses the worker boundary', () => {
  it('excludes cells inside a projected-ellipse footprint', () => {
    // An ellipse footprint (aPos 250 axial × aCirc 250 circ) centred on row 0 of
    // the main scan removes those cells, proving buildFootprintFromParams rebuilds
    // the ellipse predicate inside the worker.
    const composite = makeShellComposite();
    const footprints: FootprintParamsSlim[] = [
      {
        id: 'noz-e',
        mountPos: 1500,
        mountAngle: 86,
        diameter: 400,
        ellipse: { aPosMm: 250, aCircMm: 400 },
      },
    ];
    const withCut = compute(makeRequest({ composites: [composite], footprints }));
    const noCut = compute(makeRequest({ composites: [composite] }));

    expect(noCut.totalDataPoints).toBe(4);
    expect(withCut.totalDataPoints).toBeLessThan(4);
  });
});
