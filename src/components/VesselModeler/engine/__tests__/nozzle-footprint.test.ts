// =============================================================================
// nozzle-footprint + coverage nozzle-bore cutout (design 2026-08-05 §R1)
// =============================================================================
// Nozzle bores are unmappable openings on cylindrical shells: their footprint
// subtracts from the shell area total and drops out of coverage sweeps, via the
// SAME containsCell predicate as an appendage junction (parent design §9.4).
// Exercised here:
//   1. Opening derivation mirrors the 3D geometry (pipeOD, not the nominal bore).
//   2. A radial nozzle footprint is byte-identical to buildJunctionFootprint at
//      the opening diameter → exact area reconciliation on the shell total.
//   3. computeCoverage's sweep drops exactly the covered cells inside a bore.
//   4. A boot nozzle subtracts from ITS boot lateral total only.
//   5. Zero-nozzle models stay byte-identical.
//   6. Non-radial nozzles use the projected bore ellipse (documented approx).
//   7. The heatmap exclude mask marks bore pixels (alpha=0 signal).
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VESSEL_STATE,
  findClosestPipeSize,
  type AppendageConfig,
  type CoverageRectConfig,
  type NozzleConfig,
  type VesselState,
} from '../../types';
import {
  computeAppendageCoverageTotals,
  computeCoverage,
  computeRegionTotalAreas,
} from '../coverage-calculator';
import { buildJunctionFootprint } from '../junction-footprint';
import {
  appendageNozzleFootprintParams,
  buildMainShellNozzleFootprints,
  isHeadMountedNozzle,
  mainShellNozzleFootprintParams,
  nozzleOpeningDiameter,
  resolveNozzleFootprintParams,
} from '../nozzle-footprint';
import { buildFootprintExcludeMask } from '../texture-manager';

const R = 1000; // shell outer radius (mm) → id 2000
const LENGTH = 6000; // tan-tan (mm)
const CIRC = 2 * Math.PI * R;

function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: 2 * R,
    length: LENGTH,
    headRatio: 2,
    orientation: 'horizontal',
    appendages: [],
    nozzles: [],
    coverageRects: [],
    ...overrides,
  };
}

function nozzle(overrides: Partial<NozzleConfig> = {}): NozzleConfig {
  return {
    id: 'noz-1',
    name: 'N1',
    pos: 3000,
    proj: 1200,
    angle: 90,
    size: 200,
    ...overrides,
  };
}

function appendage(overrides: Partial<AppendageConfig> = {}): AppendageConfig {
  return {
    id: 'app-1',
    name: 'Boot',
    mountPos: 2000,
    mountAngle: 270,
    diameter: 800, // boot radius 400
    length: 1000,
    endClosure: 'flat',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
describe('nozzleOpeningDiameter — mirrors the 3D shell opening', () => {
  it('uses the pipeOD override when present (the stub that penetrates the shell)', () => {
    expect(nozzleOpeningDiameter({ size: 150, pipeOD: 800 })).toBe(800);
  });

  it('falls back to the closest standard pipe OD from the nominal bore', () => {
    const n = { size: 100 };
    expect(nozzleOpeningDiameter(n)).toBe(findClosestPipeSize(100).od);
    // The opening (pipe OD) is larger than the nominal bore (inside diameter).
    expect(nozzleOpeningDiameter(n)).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
describe('resolveNozzleFootprintParams — radial is the exact circle', () => {
  it('a radial nozzle maps to a circle at the opening diameter (no ellipse)', () => {
    const params = resolveNozzleFootprintParams(nozzle({ pipeOD: 800 }), false);
    expect(params).toEqual({ id: 'noz-1', mountPos: 3000, mountAngle: 90, diameter: 800 });
    expect(params.ellipse).toBeUndefined();
  });

  it('the radial footprint is byte-identical to buildJunctionFootprint(opening)', () => {
    const n = nozzle({ pipeOD: 800, pos: 2500, angle: 120 });
    const fp = buildMainShellNozzleFootprints(makeState({ nozzles: [n] }))[0];
    const ref = buildJunctionFootprint(R, {
      id: n.id,
      mountPos: n.pos,
      mountAngle: n.angle,
      diameter: 800,
    });
    expect(fp.areaMm2).toBe(ref.areaMm2);
    // Same predicate → identical membership at a grid of probes.
    for (const p of [2400, 2500, 2600]) {
      for (const a of [110, 120, 130]) {
        expect(fp.containsCell(p, a)).toBe(ref.containsCell(p, a));
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('head-mounted nozzles are out of scope v1 (no footprint)', () => {
  it('skips a nozzle on the left head (pos < 0) and the right head (pos > length)', () => {
    expect(isHeadMountedNozzle(-100, LENGTH)).toBe(true);
    expect(isHeadMountedNozzle(LENGTH + 100, LENGTH)).toBe(true);
    expect(isHeadMountedNozzle(3000, LENGTH)).toBe(false);

    const state = makeState({
      nozzles: [nozzle({ id: 'noz-h', pos: -100 }), nozzle({ id: 'noz-r', pos: LENGTH + 50 })],
    });
    expect(mainShellNozzleFootprintParams(state)).toHaveLength(0);
    expect(buildMainShellNozzleFootprints(state)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('computeRegionTotalAreas — exact nozzle cutout reconciliation', () => {
  const uncut = computeRegionTotalAreas(makeState()).cylinder;

  it('is byte-identical with no nozzles (== 2πRL)', () => {
    expect(uncut).toBe(2 * Math.PI * R * LENGTH);
    expect(computeRegionTotalAreas(makeState({ nozzles: [] })).cylinder).toBe(uncut);
  });

  it('subtracts exactly Σ nozzle footprint area from the cylinder total', () => {
    const nozzles = [
      nozzle({ id: 'n1', pipeOD: 800, pos: 2000, angle: 90 }),
      nozzle({ id: 'n2', pipeOD: 600, pos: 4000, angle: 270 }),
    ];
    const cut = computeRegionTotalAreas(makeState({ nozzles })).cylinder;
    const sumFp =
      buildJunctionFootprint(R, { id: 'n1', mountPos: 2000, mountAngle: 90, diameter: 800 })
        .areaMm2 +
      buildJunctionFootprint(R, { id: 'n2', mountPos: 4000, mountAngle: 270, diameter: 600 })
        .areaMm2;

    expect(sumFp).toBeGreaterThan(0);
    expect(Math.abs(cut + sumFp - uncut)).toBeLessThan(uncut * 1e-9);
    // Heads untouched.
    expect(computeRegionTotalAreas(makeState({ nozzles })).leftHead).toBe(
      computeRegionTotalAreas(makeState()).leftHead
    );
  });

  it('head-mounted nozzles do not change the cylinder total', () => {
    const cut = computeRegionTotalAreas(makeState({ nozzles: [nozzle({ pos: -200 })] })).cylinder;
    expect(cut).toBe(uncut);
  });
});

// ---------------------------------------------------------------------------
describe('computeCoverage — sweep drops covered cells inside a nozzle bore', () => {
  const dPos = 200;
  const dAngleDeg = 10;
  const posCenters = Array.from({ length: 10 }, (_, i) => 1100 + i * dPos); // 1100..2900
  const angleCenters = Array.from({ length: 10 }, (_, i) => 45 + i * dAngleDeg); // 45..135
  const rectHeight = (dAngleDeg / 360) * CIRC;
  const cellMm2 = R * ((dAngleDeg / 360) * 2 * Math.PI) * dPos;

  const rects: CoverageRectConfig[] = [];
  let rid = 1;
  for (const pos of posCenters) {
    for (const angle of angleCenters) {
      rects.push({
        id: rid++,
        name: `r${rid}`,
        pos,
        angle,
        width: dPos,
        height: rectHeight,
        color: '#fff',
        lineWidth: 1,
        filled: false,
        fillOpacity: 0,
      });
    }
  }

  it('loses exactly the bore cells when a nozzle cuts the covered band', () => {
    const n = nozzle({ pipeOD: 800, pos: 2000, angle: 90 }); // opening radius 400
    const withNoz = makeState({ coverageRects: rects, nozzles: [n] });
    const without = makeState({ coverageRects: rects });

    const coveredWith = computeCoverage(rects, withNoz).cylinder.covered;
    const coveredWithout = computeCoverage(rects, without).cylinder.covered;

    const fp = buildJunctionFootprint(R, {
      id: n.id,
      mountPos: 2000,
      mountAngle: 90,
      diameter: 800,
    });
    let excludedMm2 = 0;
    for (const pos of posCenters) {
      for (const angle of angleCenters) {
        if (fp.containsCell(pos, angle)) excludedMm2 += cellMm2;
      }
    }
    expect(excludedMm2).toBeGreaterThan(0);
    expect(coveredWithout - coveredWith).toBeCloseTo(excludedMm2 / 1e6, 6);
  });
});

// ---------------------------------------------------------------------------
describe('computeAppendageCoverageTotals — boot bores subtract from that boot only', () => {
  it("a boot nozzle subtracts from ITS lateral total; a main nozzle does not", () => {
    const app = appendage(); // radius 400, length 1000
    const bootRadius = app.diameter / 2;
    const bootNoz = nozzle({ id: 'noz-b', bodyId: 'app-1', pipeOD: 200, pos: 500, angle: 90 });
    const mainNoz = nozzle({ id: 'noz-m', pipeOD: 800, pos: 3000, angle: 90 });

    const bootFpArea = buildJunctionFootprint(bootRadius, {
      id: 'noz-b',
      mountPos: 500,
      mountAngle: 90,
      diameter: 200,
    }).areaMm2;
    const lateral = 2 * Math.PI * bootRadius * app.length;

    // Boot nozzle present → boot lateral reduced by exactly its footprint area.
    const withBoot = makeState({ appendages: [app], nozzles: [bootNoz] });
    const rowB = computeAppendageCoverageTotals(withBoot).find((t) => t.appendageId === 'app-1')!;
    expect(bootFpArea).toBeGreaterThan(0);
    expect(rowB.totalMm2).toBeCloseTo(lateral - bootFpArea, 3);

    // Only the MAIN nozzle → boot lateral is the full uncut cylinder.
    const withMain = makeState({ appendages: [app], nozzles: [mainNoz] });
    const rowM = computeAppendageCoverageTotals(withMain).find((t) => t.appendageId === 'app-1')!;
    expect(rowM.totalMm2).toBeCloseTo(lateral, 6);
  });

  it('boot lateral total is byte-identical with no nozzles', () => {
    const app = appendage();
    const row = computeAppendageCoverageTotals(
      makeState({ appendages: [app], nozzles: [] })
    ).find((t) => t.appendageId === 'app-1')!;
    expect(row.totalMm2).toBe(2 * Math.PI * (app.diameter / 2) * app.length);
  });

  it('appendageNozzleFootprintParams selects only that boot’s nozzles', () => {
    const state = makeState({
      appendages: [appendage()],
      nozzles: [
        nozzle({ id: 'noz-b', bodyId: 'app-1' }),
        nozzle({ id: 'noz-m' }), // main
        nozzle({ id: 'noz-x', bodyId: 'app-2' }), // other body
      ],
    });
    const params = appendageNozzleFootprintParams(state, 'app-1');
    expect(params.map((p) => p.id)).toEqual(['noz-b']);
  });
});

// ---------------------------------------------------------------------------
describe('non-radial nozzles — projected bore ellipse (documented approximation)', () => {
  it('a tilted nozzle footprint is larger than the equivalent radial circle', () => {
    // Horizontal vessel, vertical-up mode at 45° → cosα = |sin45| ≈ 0.707,
    // circumferential stretch ×1/0.707. Ellipse area = π·r·(r/cosα) > π·r².
    const n = nozzle({ pipeOD: 400, angle: 45, orientationMode: 'vertical-up' });
    const params = resolveNozzleFootprintParams(n, false);
    expect(params.ellipse).toBeDefined();
    const r = 200;
    const fp = buildMainShellNozzleFootprints(makeState({ nozzles: [n] }))[0];
    expect(fp.areaMm2).toBeGreaterThan(Math.PI * r * r);
    // Centre is inside; a probe just past the stretched circumferential edge is out.
    expect(fp.containsCell(n.pos, n.angle)).toBe(true);
  });

  it('vertical-up/down on a vertical vessel stretches axially (clamped)', () => {
    const n = nozzle({ pipeOD: 400, angle: 90, orientationMode: 'vertical-up' });
    const params = resolveNozzleFootprintParams(n, true);
    expect(params.ellipse).toBeDefined();
    // Axial semi-axis is stretched (> r), circumferential stays r.
    expect(params.ellipse!.aPosMm).toBeGreaterThan(params.ellipse!.aCircMm);
    expect(params.ellipse!.aCircMm).toBeCloseTo(200, 6);
  });

  it('horizontal mode on a vertical vessel is radial (no ellipse)', () => {
    const n = nozzle({ pipeOD: 400, angle: 30, orientationMode: 'horizontal' });
    expect(resolveNozzleFootprintParams(n, true).ellipse).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('buildFootprintExcludeMask — nozzle bore pixels (alpha=0 signal)', () => {
  // Main-shell composite over the bore: datum 0 (+90 TDC), cw, forward,
  // indexStartMm 2000, xAxis [0, ...], yAxis [0, 300, 900]. Nozzle opening 800
  // (radius 400) at pos 2000, angle 90.
  const state = makeState({ nozzles: [nozzle({ pipeOD: 800, pos: 2000, angle: 90 })] });
  const footprints = buildMainShellNozzleFootprints(state);
  const composite = {
    bodyId: undefined as string | undefined,
    xAxis: [0, 800],
    yAxis: [0, 300, 900],
    indexStartMm: 2000,
    datumAngleDeg: 0,
    scanDirection: 'cw' as const,
    indexDirection: 'forward' as const,
  };

  it('marks the pixel at the bore centre and clears pixels outside it', () => {
    const mask = buildFootprintExcludeMask(composite, state, footprints);
    expect(mask).toBeDefined();
    expect(mask!(0, 0)).toBe(true); // pos 2000, angle 90 → bore centre
    expect(mask!(2, 0)).toBe(false); // pos 2900 → 900 mm axially past (> r)
  });
});
