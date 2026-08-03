import { describe, it, expect } from 'vitest';

import type {
  NozzleConfig,
  WeldConfig,
  SaddleConfig,
  LiftingLugConfig,
  ScanCompositeConfig,
} from '../types';
import {
  angleToCircumMm,
  datumToCircumMm,
  projectNozzle,
  projectCircWeld,
  projectLongWeld,
  projectSaddle,
  projectLiftingLug,
  projectStripLongWeld,
  projectStripLiftingLug,
  projectStripNozzle,
  getCircumference,
  wrapCircumCenters,
  getAxialOrientation,
  axialToIndexMm,
  axialFrac,
  fitScale,
  circumDisplayMm,
  developFootprintBoundary,
  displayFootprintPolyline,
} from './geometry-projection';
import { buildJunctionFootprint } from '../engine/junction-footprint';

// ---------------------------------------------------------------------------
// Convention under test
// ---------------------------------------------------------------------------
// The developed (flattened) view is cut at TDC: the circumferential Y axis runs
// 0 = TDC (12 o'clock) at the top, down to π·ID at the bottom (back to TDC).
//
// Feature angles use the vessel convention (90° = TDC, 0° = 3 o'clock, CCW+).
// Scan datum angles use the user convention (0° = TDC).
//
// Both must land a 12-o'clock feature / a datum-0 scan at Y = 0 (top).
// ---------------------------------------------------------------------------

const OD = 1000;
const CIRC = Math.PI * OD;

function nozzle(angle: number): NozzleConfig {
  return { name: 'N', pos: 1000, proj: 100, angle, size: 100 };
}

describe('flattened-view circumferential convention (TDC at top)', () => {
  it('maps vessel TDC (90°) to Y = 0', () => {
    expect(angleToCircumMm(90, OD)).toBeCloseTo(0, 6);
  });

  it('maps the vessel bottom (270°) to the middle of the developed view', () => {
    expect(angleToCircumMm(270, OD)).toBeCloseTo(CIRC / 2, 6);
  });

  it('places a 12-o\'clock nozzle at the top (cy = 0)', () => {
    expect(projectNozzle(nozzle(90), OD).cy).toBeCloseTo(0, 6);
  });

  it('places a 3-o\'clock nozzle a quarter of the way down', () => {
    expect(projectNozzle(nozzle(0), OD).cy).toBeCloseTo(CIRC / 4, 6);
  });

  it('places a top longitudinal weld at the top (y = 0)', () => {
    const weld: WeldConfig = {
      name: 'LW', type: 'longitudinal', pos: 0, endPos: 2000, angle: 90, color: '#fff',
    };
    expect(projectLongWeld(weld, OD).y1).toBeCloseTo(0, 6);
  });

  it('centres a saddle (bottom of vessel) on the middle of the developed view', () => {
    const saddle: SaddleConfig = { pos: 1500 };
    const rect = projectSaddle(saddle, OD);
    expect(rect.y + rect.height / 2).toBeCloseTo(CIRC / 2, 6);
  });

  it('places a 12-o\'clock lifting lug at the top (cy = 0)', () => {
    const lug: LiftingLugConfig = { name: 'L', pos: 1000, angle: 90, style: 'padEye', swl: '1t' };
    expect(projectLiftingLug(lug, OD).cy).toBeCloseTo(0, 6);
  });

  it('maps a datum-0 scan (user TDC) to Y = 0, aligned with a 12-o\'clock nozzle', () => {
    expect(datumToCircumMm(0, OD)).toBeCloseTo(0, 6);
    expect(datumToCircumMm(0, OD)).toBeCloseTo(projectNozzle(nozzle(90), OD).cy, 6);
  });

  it('getCircumference returns π·ID', () => {
    expect(getCircumference({ id: OD } as never)).toBeCloseTo(CIRC, 6);
  });
});

// ---------------------------------------------------------------------------
// Seam wrapping — features straddling the TDC cut must appear on both edges
// ---------------------------------------------------------------------------
describe('wrapCircumCenters (TDC seam wrapping)', () => {
  const R = 50; // 100 mm bore → 50 mm radius

  it('returns only the base centre for a feature well inside the band', () => {
    expect(wrapCircumCenters(CIRC / 2, R, CIRC)).toEqual([CIRC / 2]);
  });

  it('adds a copy one circumference below for a feature crossing the top seam (Y=0)', () => {
    // A 12-o'clock nozzle sits at cy = 0; its top half is above the seam.
    const centers = wrapCircumCenters(0, R, CIRC);
    expect(centers).toContain(0);
    expect(centers).toContain(CIRC);
    expect(centers).toHaveLength(2);
  });

  it('adds a copy one circumference above for a feature crossing the bottom seam (Y=circ)', () => {
    // A nozzle just below the seam at the bottom edge.
    const cy = CIRC - 10;
    const centers = wrapCircumCenters(cy, R, CIRC);
    expect(centers).toContain(cy);
    expect(centers).toContain(cy - CIRC);
    expect(centers).toHaveLength(2);
  });

  it('does not wrap a feature that touches but does not cross the seam', () => {
    expect(wrapCircumCenters(R, R, CIRC)).toEqual([R]);
  });

  it('returns just the base centre when circumference is non-positive', () => {
    expect(wrapCircumCenters(0, R, 0)).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// Axial axis orientation — horizontal axis follows the scan's index direction
// ---------------------------------------------------------------------------
// The developed view's X axis runs as the scan index: 0 = scan start on the
// left, increasing right. A reverse-direction scan (index 0 at a high vessel
// position) therefore mirrors the axis so the scan start lands on the left.
// ---------------------------------------------------------------------------
describe('axial axis orientation (scan-index, 0 on left)', () => {
  function composite(p: Partial<ScanCompositeConfig>): ScanCompositeConfig {
    return {
      id: 'c', name: 'c', data: [[1]], xAxis: [0], yAxis: [0],
      stats: { min: 0, max: 1, mean: 0, median: 0, stdDev: 0 },
      indexStartMm: 0, datumAngleDeg: 0, scanDirection: 'cw',
      indexDirection: 'forward', orientationConfirmed: true,
      colorScale: 'jet', rangeMin: null, rangeMax: null, opacity: 1,
      ...p,
    } as ScanCompositeConfig;
  }

  it('returns null when there is no confirmed composite with data', () => {
    expect(getAxialOrientation([])).toBeNull();
    expect(getAxialOrientation([composite({ orientationConfirmed: false })])).toBeNull();
    expect(getAxialOrientation([composite({ data: [] })])).toBeNull();
  });

  it('is not reversed for a forward scan', () => {
    const ori = getAxialOrientation([composite({ indexDirection: 'forward', indexStartMm: 1000 })]);
    expect(ori).toEqual({ reversed: false, indexStartMm: 1000, indexDirection: 'forward' });
  });

  it('is reversed for a reverse scan (scan start at a high vessel position)', () => {
    const ori = getAxialOrientation([composite({ indexDirection: 'reverse', indexStartMm: 5000 })]);
    expect(ori).toEqual({ reversed: true, indexStartMm: 5000, indexDirection: 'reverse' });
  });

  it('measures index distance from the scan start (forward)', () => {
    const ori = getAxialOrientation([composite({ indexDirection: 'forward', indexStartMm: 1000 })]);
    expect(axialToIndexMm(1000, ori)).toBe(0);
    expect(axialToIndexMm(2000, ori)).toBe(1000);
    expect(axialToIndexMm(0, ori)).toBe(-1000);
  });

  it('measures index distance from the scan start (reverse increases toward lower pos)', () => {
    const ori = getAxialOrientation([composite({ indexDirection: 'reverse', indexStartMm: 5000 })]);
    expect(axialToIndexMm(5000, ori)).toBe(0);
    expect(axialToIndexMm(4000, ori)).toBe(1000);
  });

  it('falls back to raw vessel position when there is no orientation', () => {
    expect(axialToIndexMm(1234, null)).toBe(1234);
  });

  it('axialFrac maps left→right normally, mirrored when reversed', () => {
    expect(axialFrac(0, 100, false)).toBeCloseTo(0, 6);
    expect(axialFrac(100, 100, false)).toBeCloseTo(1, 6);
    expect(axialFrac(0, 100, true)).toBeCloseTo(1, 6);
    expect(axialFrac(100, 100, true)).toBeCloseTo(0, 6);
    expect(axialFrac(25, 100, true)).toBeCloseTo(0.75, 6);
    expect(axialFrac(50, 0, false)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fitScale — equal mm/pixel on both axes (round nozzles, undistorted footprints)
// ---------------------------------------------------------------------------
describe('fitScale (1:1 aspect, letterboxed)', () => {
  it('uses one scale that fits both axes and centres the plot', () => {
    // Matching aspect: fills both axes, no margin.
    expect(fitScale(1000, 500, 5000, 2500)).toEqual({ pxPerMm: 0.2, marginX: 0, marginY: 0 });
  });

  it('letterboxes the looser axis (circumference shorter than the width allows)', () => {
    // pxPerMm = min(1000/5000=0.2, 500/1000=0.5) = 0.2; axial fills, circ centred.
    const s = fitScale(1000, 500, 5000, 1000);
    expect(s.pxPerMm).toBeCloseTo(0.2, 6);
    expect(s.marginX).toBeCloseTo(0, 6);
    expect(s.marginY).toBeCloseTo(150, 6); // (500 - 1000*0.2)/2
  });

  it('uses the same pixel scale on both axes (so a round bore stays round)', () => {
    const s = fitScale(800, 600, 4000, 2000);
    // A 200 mm bore: axial radius px === circumferential radius px.
    expect(200 * s.pxPerMm).toBeCloseTo(200 * s.pxPerMm, 6); // tautology guard
    expect(s.pxPerMm).toBeCloseTo(Math.min(800 / 4000, 600 / 2000), 6);
  });

  it('returns zeros for degenerate inputs', () => {
    expect(fitScale(0, 500, 5000, 2500)).toEqual({ pxPerMm: 0, marginX: 0, marginY: 0 });
    expect(fitScale(1000, 500, 0, 2500)).toEqual({ pxPerMm: 0, marginX: 0, marginY: 0 });
  });
});

// ---------------------------------------------------------------------------
// circumDisplayMm — circumferential handedness flip (view from the other end)
// ---------------------------------------------------------------------------
// When the axial axis is mirrored (reverse scan), the developed view is viewed
// from the opposite end — a 180° rotation about the vertical axis. That also
// reverses the circumferential handedness (3 o'clock ↔ 9 o'clock) while keeping
// TDC (y=0) fixed, so the view stays a proper rotation rather than a mirror.
// ---------------------------------------------------------------------------
describe('circumDisplayMm (circumferential handedness flip)', () => {
  const C = 100;

  it('is identity when not reversed', () => {
    expect(circumDisplayMm(0, C, false)).toBe(0);
    expect(circumDisplayMm(25, C, false)).toBe(25);
    expect(circumDisplayMm(75, C, false)).toBe(75);
  });

  it('keeps TDC (0) and BDC (½) fixed when reversed', () => {
    expect(circumDisplayMm(0, C, true)).toBeCloseTo(0, 6);
    expect(circumDisplayMm(50, C, true)).toBeCloseTo(50, 6);
  });

  it('swaps the quarter points (3 o\'clock ↔ 9 o\'clock) when reversed', () => {
    expect(circumDisplayMm(25, C, true)).toBeCloseTo(75, 6);
    expect(circumDisplayMm(75, C, true)).toBeCloseTo(25, 6);
  });

  it('is its own inverse', () => {
    for (const v of [0, 10, 25, 50, 75, 90]) {
      expect(circumDisplayMm(circumDisplayMm(v, C, true), C, true)).toBeCloseTo(v, 6);
    }
  });

  it('falls back to the raw value for non-positive circumference', () => {
    expect(circumDisplayMm(25, 0, true)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Appendage junction footprints developed onto the main shell
// ---------------------------------------------------------------------------
// A footprint boundary carries VESSEL-convention angles (90 = TDC), exactly like
// nozzle markers, so it maps through angleToCircumMm (never datumToCircumMm). The
// developed polyline stays continuous about the mount meridian so it does not
// tear at the TDC seam, and it flips with the reverse-scan view like the markers.
// ---------------------------------------------------------------------------
describe('developFootprintBoundary (footprint → developed coords)', () => {
  const R = OD / 2; // shell radius

  it('centres a TDC-mounted footprint (mountAngle 90) on Y = 0', () => {
    const fp = buildJunctionFootprint(R, { id: 'a', mountPos: 1000, mountAngle: 90, diameter: 200 });
    const dev = developFootprintBoundary(fp.boundary, 90, OD);
    expect(dev.centerMm).toBeCloseTo(0, 6);
    // Straddles the seam: some points above (yMm < 0), some below (yMm > 0).
    const ys = dev.points.map((p) => p.yMm);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(0);
    expect(dev.halfExtentMm).toBeGreaterThan(0);
    // x is the axial position (mount ± the axial half-extent = radius).
    const xs = dev.points.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(900, 4); // mountPos - r
    expect(Math.max(...xs)).toBeCloseTo(1100, 4); // mountPos + r
  });

  it('centres the footprint on the same Y a nozzle at the mount angle uses', () => {
    for (const mountAngle of [0, 45, 90, 210, 270]) {
      const fp = buildJunctionFootprint(R, { id: 'a', mountPos: 500, mountAngle, diameter: 300 });
      const dev = developFootprintBoundary(fp.boundary, mountAngle, OD);
      // projectNozzle uses the same angleToCircumMm — centres must coincide.
      expect(dev.centerMm).toBeCloseTo(projectNozzle(nozzle(mountAngle), OD).cy, 6);
    }
  });

  it('keeps points continuous about the centre (no seam tear at TDC)', () => {
    const fp = buildJunctionFootprint(R, { id: 'a', mountPos: 1000, mountAngle: 90, diameter: 400 });
    const dev = developFootprintBoundary(fp.boundary, 90, OD);
    for (const p of dev.points) {
      expect(Math.abs(p.yMm - dev.centerMm)).toBeLessThanOrEqual(dev.halfExtentMm + 1e-6);
    }
  });

  it('produces two seam-wrapped copies for a TDC footprint (crosses Y = 0)', () => {
    const fp = buildJunctionFootprint(R, { id: 'a', mountPos: 1000, mountAngle: 90, diameter: 200 });
    const dev = developFootprintBoundary(fp.boundary, 90, OD);
    const centers = wrapCircumCenters(dev.centerMm, dev.halfExtentMm, CIRC);
    expect(centers).toHaveLength(2);
    expect(centers).toContain(dev.centerMm);
    expect(centers).toContain(dev.centerMm + CIRC);
  });

  it('does not wrap a footprint well away from the seam (mid angle)', () => {
    const fp = buildJunctionFootprint(R, { id: 'a', mountPos: 1000, mountAngle: 0, diameter: 200 });
    const dev = developFootprintBoundary(fp.boundary, 0, OD);
    expect(dev.centerMm).toBeCloseTo(CIRC / 4, 6);
    expect(wrapCircumCenters(dev.centerMm, dev.halfExtentMm, CIRC)).toEqual([dev.centerMm]);
  });
});

// ---------------------------------------------------------------------------
// Appendage strip weld/lug projection — datum convention (0 = datum meridian)
// ---------------------------------------------------------------------------
// A weld/lug tagged with an appendage bodyId lives on that appendage's developed
// strip. Its angle is the appendage DATUM convention (0 = datum meridian at the
// strip top) — the SAME convention the strip scan overlay + coverage rects use, and
// the same angle engine/body-frame.ts feeds to the 3D surfacePoint. So the strip
// projectors map angle through datumToCircumMm (appendage 0 = datum), NOT
// angleToCircumMm (vessel 90 = TDC). A circumferential weld is angle-free (a full
// ring), so it reuses projectCircWeld with the appendage OD.
// ---------------------------------------------------------------------------
describe('appendage strip weld/lug projection (datum convention)', () => {
  const APP_OD = 400;
  const APP_CIRC = Math.PI * APP_OD;

  function weld(p: Partial<WeldConfig>): WeldConfig {
    return { name: 'W', type: 'longitudinal', pos: 200, color: '#fff', ...p } as WeldConfig;
  }
  function lug(p: Partial<LiftingLugConfig>): LiftingLugConfig {
    return { name: 'L', pos: 200, angle: 0, style: 'padEye', swl: '1t', ...p } as LiftingLugConfig;
  }

  it('places a datum-0 longitudinal weld at the strip top (y = 0)', () => {
    expect(projectStripLongWeld(weld({ bodyId: 'a', angle: 0 }), APP_OD).y1).toBeCloseTo(0, 6);
  });

  it('maps the long-weld angle through datumToCircumMm, NOT angleToCircumMm', () => {
    for (const angle of [0, 30, 90, 210]) {
      const y = projectStripLongWeld(weld({ bodyId: 'a', angle }), APP_OD).y1;
      expect(y).toBeCloseTo(datumToCircumMm(angle, APP_OD), 6);
    }
    // A datum-90 weld is a quarter-turn from the datum, NOT at the strip top.
    expect(projectStripLongWeld(weld({ bodyId: 'a', angle: 90 }), APP_OD).y1).not.toBeCloseTo(0, 3);
    expect(angleToCircumMm(90, APP_OD)).toBeCloseTo(0, 6); // guard: the vessel helper WOULD say top
  });

  it('runs the long weld from pos to endPos along the appendage axis (physical, unmirrored)', () => {
    const lw = projectStripLongWeld(weld({ bodyId: 'a', angle: 45, pos: 120, endPos: 700 }), APP_OD);
    expect(lw.x1).toBe(120);
    expect(lw.x2).toBe(700);
    expect(lw.y1).toBeCloseTo(lw.y2, 9); // horizontal
  });

  it('defaults an undefined long-weld angle to 90, matching the 3D appendage builder', () => {
    const lw = projectStripLongWeld(weld({ bodyId: 'a', angle: undefined }), APP_OD);
    expect(lw.y1).toBeCloseTo(datumToCircumMm(90, APP_OD), 6);
  });

  it('places a datum-0 lug at the strip top (cy = 0) at its axial pos', () => {
    const m = projectStripLiftingLug(lug({ bodyId: 'a', angle: 0, pos: 250 }), APP_OD);
    expect(m.cy).toBeCloseTo(0, 6);
    expect(m.cx).toBe(250);
  });

  it('maps the lug angle through datumToCircumMm (appendage datum), not the vessel convention', () => {
    for (const angle of [0, 45, 180, 270]) {
      expect(projectStripLiftingLug(lug({ bodyId: 'a', angle }), APP_OD).cy).toBeCloseTo(
        datumToCircumMm(angle, APP_OD),
        6,
      );
    }
  });

  it('aligns a strip weld and a strip lug at the same datum angle (share cy)', () => {
    // Same as the scan overlay: a datum-θ feature lands at datumToCircumMm(θ),
    // so welds/lugs line up with the body scan on the strip.
    for (const angle of [0, 60, 200]) {
      const wy = projectStripLongWeld(weld({ bodyId: 'a', angle }), APP_OD).y1;
      const ly = projectStripLiftingLug(lug({ bodyId: 'a', angle }), APP_OD).cy;
      expect(wy).toBeCloseTo(ly, 9);
    }
  });

  it('reuses projectCircWeld for a strip circ weld: vertical full-height line at pos', () => {
    const cw = projectCircWeld(weld({ bodyId: 'a', type: 'circumferential', pos: 333 }), APP_OD);
    expect(cw.x1).toBe(333);
    expect(cw.x2).toBe(333); // vertical
    expect(cw.y1).toBe(0);
    expect(cw.y2).toBeCloseTo(APP_CIRC, 6); // spans the full appendage circumference
  });
});

// ---------------------------------------------------------------------------
// Appendage strip nozzle projection — datum convention (0 = datum meridian)
// ---------------------------------------------------------------------------
// A nozzle tagged with an appendage bodyId lives on that appendage's developed
// strip. Its angle is the appendage DATUM convention (0 = datum meridian at the
// strip top) — the SAME angle vessel-geometry.ts feeds straight into
// bodyFrame.surfacePoint(posMm, n.angle) for the 3D appendage nozzle (no ±90;
// vessel-geometry.ts:469). So projectStripNozzle maps angle through datumToCircumMm
// (appendage 0 = datum), NOT angleToCircumMm (vessel 90 = TDC). The bore radius is
// derived exactly as the main-surface projectNozzle (size / 2).
// ---------------------------------------------------------------------------
describe('appendage strip nozzle projection (datum convention)', () => {
  const APP_OD = 400;

  function nozzle(p: Partial<NozzleConfig>): NozzleConfig {
    return { name: 'N', pos: 200, proj: 100, angle: 0, size: 80, ...p } as NozzleConfig;
  }

  it('places a datum-0 nozzle at the strip top (cy = 0) at its axial pos', () => {
    const c = projectStripNozzle(nozzle({ bodyId: 'a', angle: 0, pos: 250 }), APP_OD);
    expect(c.cy).toBeCloseTo(0, 6);
    expect(c.cx).toBe(250);
  });

  it('maps the nozzle angle through datumToCircumMm, NOT angleToCircumMm', () => {
    for (const angle of [0, 30, 90, 210]) {
      expect(projectStripNozzle(nozzle({ bodyId: 'a', angle }), APP_OD).cy).toBeCloseTo(
        datumToCircumMm(angle, APP_OD),
        6,
      );
    }
    // A datum-90 nozzle is a quarter-turn from the datum, NOT at the strip top.
    expect(projectStripNozzle(nozzle({ bodyId: 'a', angle: 90 }), APP_OD).cy).not.toBeCloseTo(0, 3);
    expect(angleToCircumMm(90, APP_OD)).toBeCloseTo(0, 6); // guard: the vessel helper WOULD say top
  });

  it('derives the bore radius exactly as the main-surface projectNozzle (size / 2)', () => {
    for (const size of [40, 80, 305]) {
      const strip = projectStripNozzle(nozzle({ bodyId: 'a', size }), APP_OD);
      const main = projectNozzle(nozzle({ size }), OD);
      expect(strip.radius).toBe(size / 2);
      expect(strip.radius).toBe(main.radius); // same size ⇒ same bore radius on either surface
    }
  });

  it('aligns a strip nozzle with a strip lug/weld at the same datum angle (share cy)', () => {
    // A datum-θ feature lands at datumToCircumMm(θ) regardless of feature type, so a
    // nozzle lines up with the body scan and its neighbours on the strip.
    for (const angle of [0, 60, 200]) {
      const ny = projectStripNozzle(nozzle({ bodyId: 'a', angle }), APP_OD).cy;
      const ly = projectStripLiftingLug(
        { name: 'L', pos: 200, angle, style: 'padEye', swl: '1t' } as LiftingLugConfig,
        APP_OD,
      ).cy;
      expect(ny).toBeCloseTo(ly, 9);
    }
  });
});

describe('displayFootprintPolyline (handedness flip, nozzle-consistent)', () => {
  const R = OD / 2;

  it('is identity when not reversed', () => {
    const fp = buildJunctionFootprint(R, { id: 'a', mountPos: 800, mountAngle: 30, diameter: 250 });
    const dev = developFootprintBoundary(fp.boundary, 30, OD);
    const shown = displayFootprintPolyline(dev, CIRC, false);
    expect(shown.centerMm).toBeCloseTo(dev.centerMm, 9);
    expect(shown.points).toEqual(dev.points);
  });

  it('flips the centre exactly like a reversed nozzle marker', () => {
    for (const mountAngle of [0, 45, 210, 270]) {
      const fp = buildJunctionFootprint(R, { id: 'a', mountPos: 500, mountAngle, diameter: 300 });
      const dev = developFootprintBoundary(fp.boundary, mountAngle, OD);
      const shown = displayFootprintPolyline(dev, CIRC, true);
      // A reversed nozzle at the same angle is placed at circumDisplayMm(cy).
      const nozzleReversedCy = circumDisplayMm(projectNozzle(nozzle(mountAngle), OD).cy, CIRC, true);
      expect(shown.centerMm).toBeCloseTo(nozzleReversedCy, 6);
    }
  });

  it('preserves continuity and half-extent under the flip', () => {
    const fp = buildJunctionFootprint(R, { id: 'a', mountPos: 500, mountAngle: 90, diameter: 400 });
    const dev = developFootprintBoundary(fp.boundary, 90, OD);
    const shown = displayFootprintPolyline(dev, CIRC, true);
    expect(shown.halfExtentMm).toBeCloseTo(dev.halfExtentMm, 9);
    for (const p of shown.points) {
      expect(Math.abs(p.yMm - shown.centerMm)).toBeLessThanOrEqual(shown.halfExtentMm + 1e-6);
    }
  });
});
