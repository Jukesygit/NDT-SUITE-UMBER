import { describe, it, expect } from 'vitest';

import type { ScanCompositeConfig, WeldConfig, LiftingLugConfig, NozzleConfig } from '../types';
import {
  attachablesForBody,
  compositesForBody,
  forEachCompositeCell,
  mainSurfaceProjector,
  stripSurfaceProjector,
  findThicknessAt,
  type HeatCell,
  type SurfaceView,
} from './scan-surface';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OD = 1000;

function composite(p: Partial<ScanCompositeConfig>): ScanCompositeConfig {
  return {
    id: 'c',
    name: 'c',
    data: [
      [5, 6],
      [7, 8],
    ],
    xAxis: [0, 10],
    yAxis: [0, 10],
    stats: { min: 5, max: 8, mean: 6.5, median: 6.5, stdDev: 1 },
    indexStartMm: 100,
    datumAngleDeg: 0,
    scanDirection: 'cw',
    indexDirection: 'forward',
    orientationConfirmed: true,
    colorScale: 'jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...p,
  } as ScanCompositeConfig;
}

const VIEW: SurfaceView = {
  pxPerMm: 1,
  marginX: 0,
  marginY: 0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

function collectCells(
  composites: ScanCompositeConfig[],
  projector: ReturnType<typeof mainSurfaceProjector>,
): HeatCell[] {
  const out: HeatCell[] = [];
  for (const c of composites) {
    forEachCompositeCell(c, projector, 4000, 4000, (cell) => out.push(cell));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Body routing — the single split between the main surface and appendage panels
// ---------------------------------------------------------------------------
describe('compositesForBody (routing)', () => {
  const main = composite({ id: 'main', bodyId: undefined });
  const app1 = composite({ id: 'a1', bodyId: 'app-1' });
  const app2 = composite({ id: 'a2', bodyId: 'app-2' });
  const all = [main, app1, app2];

  it('routes only non-body composites to the main surface', () => {
    expect(compositesForBody(all, undefined).map((c) => c.id)).toEqual(['main']);
  });

  it('routes only the matching body composites to a panel', () => {
    expect(compositesForBody(all, 'app-1').map((c) => c.id)).toEqual(['a1']);
    expect(compositesForBody(all, 'app-2').map((c) => c.id)).toEqual(['a2']);
  });

  it('is idempotent for the main surface (removing body composites changes nothing)', () => {
    expect(compositesForBody(all, undefined)).toEqual(
      compositesForBody(all.filter((c) => !c.bodyId), undefined),
    );
  });
});

// ---------------------------------------------------------------------------
// Main-surface golden — a bodyId composite paints ONLY on its panel
// ---------------------------------------------------------------------------
describe('forEachCompositeCell (body routing golden)', () => {
  const main = composite({ id: 'main', bodyId: undefined, datumAngleDeg: 0 });
  const app = composite({ id: 'a1', bodyId: 'app-1', datumAngleDeg: 90 });
  const mixed = [main, app];

  const mainProjector = mainSurfaceProjector(VIEW, 1000, OD, false);

  it('main-surface pixels are byte-identical with vs without the appendage composites', () => {
    const withAppendage = collectCells(compositesForBody(mixed, undefined), mainProjector);
    const withoutAppendage = collectCells(
      compositesForBody(mixed.filter((c) => !c.bodyId), undefined),
      mainProjector,
    );
    expect(withAppendage).toEqual(withoutAppendage);
    expect(withAppendage.length).toBeGreaterThan(0); // guard: the golden is non-trivial
  });

  it('the filter is load-bearing — the appendage composite WOULD paint on the main projector', () => {
    // If it were not routed away, it would contribute cells to the main surface.
    const leaked = collectCells([app], mainProjector);
    expect(leaked.length).toBeGreaterThan(0);
  });

  it('the appendage composite paints onto its own strip projector', () => {
    const stripProjector = stripSurfaceProjector(VIEW, 200, 400);
    const out: HeatCell[] = [];
    forEachCompositeCell(
      compositesForBody(mixed, 'app-1')[0],
      stripProjector,
      4000,
      4000,
      (cell) => out.push(cell),
    );
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// findThicknessAt — body-scoped hover lookup
// ---------------------------------------------------------------------------
describe('findThicknessAt (body-scoped)', () => {
  // Appendage scan: 1×1 grid, value 5.1, at appendage axial 100 / datum 0°.
  const appOD = 400;
  const appCirc = Math.PI * appOD;
  const app = composite({
    id: 'a1',
    bodyId: 'app-1',
    data: [[5.1]],
    xAxis: [0],
    yAxis: [0],
    indexStartMm: 100,
    datumAngleDeg: 0,
  });

  it('returns the appendage value inside its own panel lookup', () => {
    // datum 0° → circ mm 0 on the appendage; axial 100 = indexStartMm.
    const hit = findThicknessAt([app], 'app-1', 100, 0, appCirc, appOD);
    expect(hit).toBeCloseTo(5.1, 6);
  });

  it('returns null on the main surface at the same query (appendage scans excluded)', () => {
    const vesselCirc = Math.PI * OD;
    expect(findThicknessAt([app], undefined, 100, 0, vesselCirc, OD)).toBeNull();
  });

  it('a main composite is invisible to an appendage-scoped lookup', () => {
    const main = composite({ id: 'main', bodyId: undefined, data: [[3.3]], xAxis: [0], yAxis: [0] });
    expect(findThicknessAt([main], 'app-1', 100, 0, appCirc, appOD)).toBeNull();
    expect(findThicknessAt([main], undefined, 100, 0, Math.PI * OD, OD)).toBeCloseTo(3.3, 6);
  });
});

// ---------------------------------------------------------------------------
// attachablesForBody — the ONE routing rule shared by welds, lugs and rects
// ---------------------------------------------------------------------------
// The flattened view partitions every bodyId-tagged attachable the same way it
// partitions composites: main surface = bodyId undefined; a strip = its own id.
// A main weld/lug is NEVER drawn on a strip, and an appendage weld/lug is NEVER
// drawn on the main surface (the render loops apply the same predicate per index).
// ---------------------------------------------------------------------------
describe('attachablesForBody (weld/lug/rect routing)', () => {
  const mainWeld = { name: 'W0', type: 'circumferential', pos: 100, color: '#fff' } as WeldConfig;
  const appWeld1 = { name: 'W1', type: 'longitudinal', pos: 50, angle: 0, color: '#fff', bodyId: 'app-1' } as WeldConfig;
  const appWeld2 = { name: 'W2', type: 'longitudinal', pos: 80, angle: 0, color: '#fff', bodyId: 'app-2' } as WeldConfig;
  const welds = [mainWeld, appWeld1, appWeld2];

  const mainLug = { name: 'L0', pos: 100, angle: 90, style: 'padEye', swl: '1t' } as LiftingLugConfig;
  const appLug = { name: 'L1', pos: 60, angle: 0, style: 'padEye', swl: '1t', bodyId: 'app-1' } as LiftingLugConfig;
  const lugs = [mainLug, appLug];

  const mainNozzle = { name: 'N0', pos: 100, proj: 100, angle: 90, size: 80 } as NozzleConfig;
  const appNozzle1 = { name: 'N1', pos: 40, proj: 60, angle: 0, size: 50, bodyId: 'app-1' } as NozzleConfig;
  const appNozzle2 = { name: 'N2', pos: 90, proj: 60, angle: 0, size: 50, bodyId: 'app-2' } as NozzleConfig;
  const nozzles = [mainNozzle, appNozzle1, appNozzle2];

  it('routes only main-shell welds to the main surface (a strip weld never on main)', () => {
    expect(attachablesForBody(welds, undefined).map((w) => w.name)).toEqual(['W0']);
  });

  it('routes only its own welds to a strip (a main weld never in a strip)', () => {
    expect(attachablesForBody(welds, 'app-1').map((w) => w.name)).toEqual(['W1']);
    expect(attachablesForBody(welds, 'app-2').map((w) => w.name)).toEqual(['W2']);
  });

  it('partitions welds disjointly across the main surface and every strip', () => {
    const partitioned = [
      ...attachablesForBody(welds, undefined),
      ...attachablesForBody(welds, 'app-1'),
      ...attachablesForBody(welds, 'app-2'),
    ];
    expect(partitioned).toHaveLength(welds.length);
    expect(new Set(partitioned.map((w) => w.name)).size).toBe(welds.length);
  });

  it('applies the same routing to lugs (generic over any bodyId-tagged item)', () => {
    expect(attachablesForBody(lugs, undefined).map((l) => l.name)).toEqual(['L0']);
    expect(attachablesForBody(lugs, 'app-1').map((l) => l.name)).toEqual(['L1']);
  });

  it('applies the same routing to nozzles (a strip nozzle never on main, and vice-versa)', () => {
    expect(attachablesForBody(nozzles, undefined).map((n) => n.name)).toEqual(['N0']);
    expect(attachablesForBody(nozzles, 'app-1').map((n) => n.name)).toEqual(['N1']);
    expect(attachablesForBody(nozzles, 'app-2').map((n) => n.name)).toEqual(['N2']);
  });

  it('partitions nozzles disjointly across the main surface and every strip', () => {
    const partitioned = [
      ...attachablesForBody(nozzles, undefined),
      ...attachablesForBody(nozzles, 'app-1'),
      ...attachablesForBody(nozzles, 'app-2'),
    ];
    expect(partitioned).toHaveLength(nozzles.length);
    expect(new Set(partitioned.map((n) => n.name)).size).toBe(nozzles.length);
  });

  it('main-surface set is byte-identical with vs without the appendage attachables (golden)', () => {
    const withAppendages = attachablesForBody(welds, undefined);
    const withoutAppendages = attachablesForBody(
      welds.filter((w) => !w.bodyId),
      undefined,
    );
    expect(withAppendages).toEqual(withoutAppendages);
    expect(withAppendages.length).toBeGreaterThan(0);
  });

  it('main-surface nozzle set is byte-identical with vs without the appendage nozzles (golden)', () => {
    const withAppendages = attachablesForBody(nozzles, undefined);
    const withoutAppendages = attachablesForBody(
      nozzles.filter((n) => !n.bodyId),
      undefined,
    );
    expect(withAppendages).toEqual(withoutAppendages);
    expect(withAppendages.map((n) => n.name)).toEqual(['N0']);
  });
});
