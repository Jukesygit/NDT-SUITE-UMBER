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
  projectLongWeld,
  projectSaddle,
  projectLiftingLug,
  getCircumference,
  wrapCircumCenters,
  getAxialOrientation,
  axialToIndexMm,
  axialFrac,
  fitScale,
} from './geometry-projection';

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
