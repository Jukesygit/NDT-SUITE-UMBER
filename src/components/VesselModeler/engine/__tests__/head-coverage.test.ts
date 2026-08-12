// =============================================================================
// head-coverage — dome-end coverage measured on the drawn drape
// =============================================================================
// A coverage rect touching a head is DRAWN as a rigid geodesic drape, so its
// covered area must be measured on that drape. The old box model read meridian
// overhang as axial z (cells clamp to ~zero area) and froze the angular span at
// its equator value, so a rect visually covering most of a head reported ~25%.
//
// Oracles used here:
//   - the raster's own band sum (headRasterTotalArea) and the axial integral in
//     computeRegionTotalAreas, which must agree within ~0.5%;
//   - the analytic cylinder cell area R·dθ·dPos for the untouched legacy path;
//   - the OLD box model, recomputed inline from the box math (not imported) as
//     the regression floor.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { DEFAULT_VESSEL_STATE, type CoverageRectConfig, type VesselState } from '../../types';
import { computeCoverage, computeRegionTotalAreas } from '../coverage-calculator';
import { domeArcLength } from '../dome-arc';
import { computeHeadCoveredAreas, headRasterTotalArea } from '../head-coverage';

const R = 750; // shell radius (mm) → id 1500
const D = 375; // head depth for a 2:1 head
const LENGTH = 2000; // tan-tan (mm)
const CIRC = Math.PI * 2 * R; // developed circumference (mm)
const APEX_ARC = domeArcLength(R, D);

function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: 2 * R,
    length: LENGTH,
    headRatio: 2,
    appendages: [],
    nozzles: [],
    coverageRects: [],
    ...overrides,
  };
}

function rect(o: Partial<CoverageRectConfig> & Pick<CoverageRectConfig, 'pos' | 'width' | 'height'>): CoverageRectConfig {
  return {
    id: o.id ?? 1,
    name: o.name ?? 'C',
    angle: o.angle ?? 90,
    color: '#0c6',
    lineWidth: 1,
    filled: false,
    fillOpacity: 0,
    ...o,
  } as CoverageRectConfig;
}

/**
 * The pre-fix box model, recomputed inline: the rect is an axial-pos ×
 * fixed-equator-angle box, head cells integrated as
 * dA = r(z)·sqrt(1+(dr/dz)²)·dθ·dz with the ratio clamped at 0.999.
 */
function oldBoxHeadArea(r: CoverageRectConfig, head: 'left' | 'right'): number {
  const dTheta = ((r.height / CIRC) * 2 * Math.PI);
  const posMin = r.pos - r.width / 2;
  const posMax = r.pos + r.width / 2;
  const lo = head === 'left' ? Math.max(-D, Math.min(0, posMin)) : Math.max(LENGTH, Math.min(LENGTH + D, posMin));
  const hi = head === 'left' ? Math.max(-D, Math.min(0, posMax)) : Math.max(LENGTH, Math.min(LENGTH + D, posMax));
  if (hi <= lo) return 0;

  const steps = 2000;
  const dz = (hi - lo) / steps;
  let area = 0;
  for (let i = 0; i < steps; i++) {
    const pos = lo + (i + 0.5) * dz;
    const zLocal = head === 'left' ? -pos : pos - LENGTH;
    const ratio = Math.min(0.999, Math.abs(zLocal / D));
    const rLocal = R * Math.sqrt(1 - ratio * ratio);
    const drdz = (R * ratio) / (D * Math.sqrt(1 - ratio * ratio));
    area += rLocal * Math.sqrt(1 + drdz * drdz) * dTheta * dz;
  }
  return area;
}

// ---------------------------------------------------------------------------

describe('head-coverage raster — self-consistency', () => {
  it('agrees with the axial head integral to within 0.5%', () => {
    const rasterTotal = headRasterTotalArea(R, D, LENGTH);
    const axialTotal = computeRegionTotalAreas(makeState()).leftHead;
    expect(rasterTotal).toBeGreaterThan(0);
    expect(Math.abs(rasterTotal - axialTotal) / axialTotal).toBeLessThan(0.005);
  });

  it('returns zero for a flat closure or with no rects', () => {
    const r = [{ pos: LENGTH + 100, angle: 90, width: 400, height: 400 }];
    expect(computeHeadCoveredAreas({ R, D: 0, L: LENGTH, rects: r })).toEqual({ left: 0, right: 0 });
    expect(computeHeadCoveredAreas({ R, D, L: LENGTH, rects: [] })).toEqual({ left: 0, right: 0 });
  });
});

describe('full-cover oracle', () => {
  // CLAIRAUT NOTE (do not "fix" these oracles back to a spanning rect): a rigid
  // drape's lateral edges are geodesics, and on a surface of revolution a
  // geodesic launched at local radius r0 can never reach radii below r0
  // (Clairaut: r·sinψ = const) — it bounces AWAY from the pole and dives onto
  // the cylinder. So a tangent-centred rect wrapping the full circumference
  // genuinely covers only ~50% of a head, in stats AND in the drawn drape.
  // The rect that does blanket a head is POLE-CENTRED: its centre meridian
  // passes through the apex, so every station launches from the pole cap.
  const poleLeft = rect({ id: 1, pos: -D, width: 2 * APEX_ARC, height: CIRC, angle: 90 });
  const poleRight = rect({ id: 2, pos: LENGTH + D, width: 2 * APEX_ARC, height: CIRC, angle: 90 });
  // Spans the whole cylinder; its head parts are irrelevant here.
  const span = rect({ id: 3, pos: LENGTH / 2, width: LENGTH + 2 * APEX_ARC, height: CIRC, angle: 90 });

  it('a pole-centred rect covers 97–100.5% of its head', () => {
    const totals = computeRegionTotalAreas(makeState());
    const covered = computeHeadCoveredAreas({ R, D, L: LENGTH, rects: [poleLeft, poleRight] });

    const leftPct = (covered.left / totals.leftHead) * 100;
    const rightPct = (covered.right / totals.rightHead) * 100;
    expect(leftPct).toBeGreaterThanOrEqual(97);
    expect(leftPct).toBeLessThanOrEqual(100.5);
    expect(rightPct).toBeGreaterThanOrEqual(97);
    expect(rightPct).toBeLessThanOrEqual(100.5);
  });

  it('reports ~100% on all three regions through computeCoverage (clamped ≤ total)', () => {
    const rects = [span, poleLeft, poleRight];
    const state = makeState({ coverageRects: rects });
    const res = computeCoverage(rects, state);
    expect(res.leftHead.percent).toBeGreaterThanOrEqual(97);
    expect(res.leftHead.percent).toBeLessThanOrEqual(100);
    expect(res.rightHead.percent).toBeGreaterThanOrEqual(97);
    expect(res.rightHead.percent).toBeLessThanOrEqual(100);
    // The cylinder part of the spanning rect is the clamped box → full shell.
    expect(res.cylinder.percent).toBeCloseTo(100, 6);
  });

  it('a tangent-centred full-wrap rect stays near 50% (Clairaut bounce, mirrors the visual)', () => {
    const totals = computeRegionTotalAreas(makeState());
    const covered = computeHeadCoveredAreas({ R, D, L: LENGTH, rects: [span] });
    const rightPct = (covered.right / totals.rightHead) * 100;
    expect(rightPct).toBeGreaterThan(40);
    expect(rightPct).toBeLessThan(60);
  });
});

describe('union / overlap-awareness', () => {
  it('two identical head-touching rects cover exactly what one covers', () => {
    const a = rect({ id: 1, pos: LENGTH + 150, width: 800, height: 900, angle: 90 });
    const b = rect({ ...a, id: 2, name: 'C2' });

    const one = computeHeadCoveredAreas({ R, D, L: LENGTH, rects: [a] });
    const two = computeHeadCoveredAreas({ R, D, L: LENGTH, rects: [a, b] });

    expect(two.right).toBe(one.right);
    expect(two.left).toBe(one.left);
    expect(one.right).toBeGreaterThan(0);
  });

  it('two partially overlapping rects cover less than the sum of their areas', () => {
    const a = rect({ id: 1, pos: LENGTH + 100, width: 700, height: 800, angle: 90 });
    const b = rect({ id: 2, pos: LENGTH + 100, width: 700, height: 800, angle: 110 });

    const areaA = computeHeadCoveredAreas({ R, D, L: LENGTH, rects: [a] }).right;
    const areaB = computeHeadCoveredAreas({ R, D, L: LENGTH, rects: [b] }).right;
    const both = computeHeadCoveredAreas({ R, D, L: LENGTH, rects: [a, b] }).right;

    expect(both).toBeGreaterThan(Math.max(areaA, areaB));
    expect(both).toBeLessThan(areaA + areaB);
  });
});

describe('pure-cylinder rects — legacy path untouched', () => {
  it('matches the analytic cylinder area exactly and leaves the heads empty', () => {
    const r = rect({ id: 1, pos: 1000, width: 400, height: 300, angle: 90 });
    const state = makeState({ coverageRects: [r] });
    const res = computeCoverage([r], state);

    const angSpanDeg = (300 / CIRC) * 360;
    const expectedMm2 = R * ((angSpanDeg / 360) * 2 * Math.PI) * 400;
    expect(res.cylinder.covered).toBeCloseTo(expectedMm2 / 1e6, 9);
    expect(res.leftHead.covered).toBe(0);
    expect(res.rightHead.covered).toBe(0);
  });

  it('overlapping pure-cylinder rects still union through the one sweep', () => {
    const a = rect({ id: 1, pos: 1000, width: 400, height: 300, angle: 90 });
    const b = rect({ id: 2, pos: 1200, width: 400, height: 300, angle: 90 });
    const state = makeState({ coverageRects: [a, b] });

    const angSpanDeg = (300 / CIRC) * 360;
    const unionMm2 = R * ((angSpanDeg / 360) * 2 * Math.PI) * 600; // pos 800..1400
    expect(computeCoverage([a, b], state).cylinder.covered).toBeCloseTo(unionMm2 / 1e6, 9);
  });
});

describe('tangent-line seam', () => {
  // Straddles the right tangent line: half box on the cylinder, half drape on the head.
  const straddle = rect({ id: 1, pos: LENGTH, width: 600, height: 500, angle: 90 });

  it('cylinder contribution equals the clamped box, exactly', () => {
    const state = makeState({ coverageRects: [straddle] });
    const res = computeCoverage([straddle], state);

    // Clamped box: pos ∈ [LENGTH-300, LENGTH], full angular span.
    const angSpanDeg = (500 / CIRC) * 360;
    const expectedMm2 = R * ((angSpanDeg / 360) * 2 * Math.PI) * 300;
    expect(res.cylinder.covered).toBeCloseTo(expectedMm2 / 1e6, 9);
  });

  it('adds head area without touching the far head, and never exceeds the totals', () => {
    const state = makeState({ coverageRects: [straddle] });
    const res = computeCoverage([straddle], state);

    expect(res.rightHead.covered).toBeGreaterThan(0);
    expect(res.leftHead.covered).toBe(0);
    expect(res.rightHead.covered).toBeLessThanOrEqual(res.rightHead.total);
    expect(res.total.covered).toBeCloseTo(
      res.leftHead.covered + res.cylinder.covered + res.rightHead.covered,
      12,
    );
  });
});

describe('regression — rect covering most of a head', () => {
  // Deep meridian reach (centre near the apex), height ≈ half the circumference:
  // this drape visibly blankets the head (the user-reported scenario). The old
  // box model froze the angular span at its equator value, so it could never
  // report more than height/circumference (= 50%) of the head, no matter how
  // much of it the drape covered.
  const big = rect({
    id: 1,
    pos: LENGTH + APEX_ARC / 2,
    width: 2 * APEX_ARC,
    height: CIRC / 2,
    angle: 90,
  });

  it('reports ~the whole head where the old box model capped out at ~50%', () => {
    const totals = computeRegionTotalAreas(makeState());
    const res = computeCoverage([big], makeState({ coverageRects: [big] }));
    const coveredPct = ((res.rightHead.covered * 1e6) / totals.rightHead) * 100;
    const oldPct = (oldBoxHeadArea(big, 'right') / totals.rightHead) * 100;

    expect(oldPct).toBeGreaterThan(0); // the old model did report something…
    expect(oldPct).toBeLessThanOrEqual(55); // …but the wrap under-count capped it
    expect(coveredPct).toBeGreaterThanOrEqual(95);
    expect(coveredPct).toBeLessThanOrEqual(100);
  });
});

describe('monotonicity and bounds', () => {
  it('covered area grows with rect height and never exceeds the head total', () => {
    const total = computeRegionTotalAreas(makeState()).rightHead;
    const heights = [400, 800, 1600, 3200];
    let prev = 0;
    for (const height of heights) {
      const r = rect({ id: 1, pos: LENGTH + 200, width: 900, height, angle: 90 });
      const covered = computeHeadCoveredAreas({ R, D, L: LENGTH, rects: [r] }).right;
      expect(covered).toBeGreaterThan(prev);
      expect(covered).toBeLessThanOrEqual(total * 1.005);
      prev = covered;
    }
  });

  it('covered area grows with rect width (deeper meridian overhang)', () => {
    let prev = 0;
    for (const width of [200, 400, 800, 1600]) {
      const r = rect({ id: 1, pos: LENGTH, width, height: 600, angle: 90 });
      const covered = computeHeadCoveredAreas({ R, D, L: LENGTH, rects: [r] }).right;
      expect(covered).toBeGreaterThan(prev);
      prev = covered;
    }
  });
});
