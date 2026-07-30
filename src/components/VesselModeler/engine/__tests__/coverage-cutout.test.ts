// =============================================================================
// coverage-calculator — appendage cutout (P3-T2, design §9.1 / §9.4)
// =============================================================================
// Two plug-ins are exercised here:
//   1. computeRegionTotalAreas subtracts each junction footprint's exact
//      excluded area from the cylinder total. Reconciliation must be EXACT:
//      cutout-adjusted cylinder + Σ footprint areas = uncut cylinder.
//   2. computeCoverage's sweep drops covered cells whose centre lies inside a
//      footprint, using the SAME containsCell predicate — so a coverage grid
//      overlapping the cutout loses exactly the overlapping cells' area.
// With zero appendages every path is byte-identical to the pre-appendage code.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type CoverageRectConfig,
  type VesselState,
} from '../../types';
import { computeCoverage, computeRegionTotalAreas } from '../coverage-calculator';
import { buildJunctionFootprint } from '../junction-footprint';

const R = 1000; // shell outer radius (mm) → id 2000
const LENGTH = 6000; // tan-tan (mm)
const CIRC = 2 * Math.PI * R; // developed circumference (mm)

function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: 2 * R,
    length: LENGTH,
    headRatio: 2,
    appendages: [],
    coverageRects: [],
    ...overrides,
  };
}

function appendage(overrides: Partial<AppendageConfig> = {}): AppendageConfig {
  return {
    id: 'app-1',
    name: 'Sump',
    mountPos: 2000,
    mountAngle: 90,
    diameter: 800,
    length: 1000,
    endClosure: 'flat',
    ...overrides,
  };
}

describe('computeRegionTotalAreas — cutout area reconciliation', () => {
  const uncutCylinder = computeRegionTotalAreas(makeState()).cylinder;

  it('leaves the cylinder total unchanged with no appendages (byte-identical)', () => {
    expect(uncutCylinder).toBe(2 * Math.PI * R * LENGTH);
  });

  it('reconciles EXACTLY for one appendage: cut cylinder + footprint = uncut', () => {
    const app = appendage();
    const state = makeState({ appendages: [app] });
    const cut = computeRegionTotalAreas(state).cylinder;
    const footprintArea = buildJunctionFootprint(R, app).areaMm2;

    expect(footprintArea).toBeGreaterThan(0);
    expect(cut).toBeLessThan(uncutCylinder);
    // Exact within floating epsilon (same ops, same footprint integral).
    expect(Math.abs(cut + footprintArea - uncutCylinder)).toBeLessThan(uncutCylinder * 1e-9);
    // Heads are untouched by the cutout.
    expect(computeRegionTotalAreas(state).leftHead).toBe(computeRegionTotalAreas(makeState()).leftHead);
  });

  it('reconciles EXACTLY for two appendages: cut cylinder + Σ footprints = uncut', () => {
    const a1 = appendage({ id: 'a1', mountPos: 1500, mountAngle: 90, diameter: 800 });
    const a2 = appendage({ id: 'a2', mountPos: 4000, mountAngle: 270, diameter: 600 });
    const state = makeState({ appendages: [a1, a2] });
    const cut = computeRegionTotalAreas(state).cylinder;
    const sumFootprints =
      buildJunctionFootprint(R, a1).areaMm2 + buildJunctionFootprint(R, a2).areaMm2;

    expect(Math.abs(cut + sumFootprints - uncutCylinder)).toBeLessThan(uncutCylinder * 1e-9);
  });
});

describe('computeCoverage — sweep excludes cells inside a footprint', () => {
  // A fine grid of abutting coverage rects tiling pos∈[1000,3000] × angle∈[40,140].
  // Because the rect edges become the compression grid, each compressed cell is
  // exactly one tile, so covered area = Σ tile areas and the exclusion is exact.
  const dPos = 200;
  const dAngleDeg = 10;
  const posCenters = Array.from({ length: 10 }, (_, i) => 1100 + i * dPos); // 1100..2900
  const angleCenters = Array.from({ length: 10 }, (_, i) => 45 + i * dAngleDeg); // 45..135
  const rectHeight = (dAngleDeg / 360) * CIRC; // circumferential mm for a 10° tile
  const cellMm2 = R * ((dAngleDeg / 360) * 2 * Math.PI) * dPos; // cylinder cell area

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

  it('covers the whole tiled band when there is no appendage (byte-identical)', () => {
    const covered = computeCoverage(rects, makeState({ coverageRects: rects })).cylinder.covered;
    const expected = (posCenters.length * angleCenters.length * cellMm2) / 1e6;
    expect(covered).toBeCloseTo(expected, 6);
  });

  it('loses exactly the overlapping cells when an appendage cuts the band', () => {
    const app = appendage({ mountPos: 2000, mountAngle: 90, diameter: 800 }); // r = 400
    const withApp = makeState({ coverageRects: rects, appendages: [app] });
    const without = makeState({ coverageRects: rects });

    const coveredWith = computeCoverage(rects, withApp).cylinder.covered;
    const coveredWithout = computeCoverage(rects, without).cylinder.covered;

    // Independent expected exclusion: sum cell area over tile centres inside the
    // footprint, using the SAME containsCell predicate the sweep uses.
    const fp = buildJunctionFootprint(R, app);
    let excludedMm2 = 0;
    for (const pos of posCenters) {
      for (const angle of angleCenters) {
        if (fp.containsCell(pos, angle)) excludedMm2 += cellMm2;
      }
    }
    const excludedM2 = excludedMm2 / 1e6;

    expect(excludedM2).toBeGreaterThan(0); // footprint really overlaps the band
    expect(coveredWithout - coveredWith).toBeCloseTo(excludedM2, 6);
  });
});
