import { describe, it, expect } from 'vitest';

import type {
  VesselState,
  ScanCompositeConfig,
  AppendageConfig,
  WeldConfig,
  LiftingLugConfig,
  NozzleConfig,
} from '../types';
import {
  fitScale,
  projectCircWeld,
  projectStripLongWeld,
  projectStripLiftingLug,
  projectStripNozzle,
  wrapCircumCenters,
} from './geometry-projection';
import {
  computeStackLayout,
  buildStripSpecs,
  stripToCanvasX,
  stripToCanvasY,
  stripFromCanvasX,
  stripFromCanvasY,
  stripPx,
  stripPy,
  stripPosAt,
  stripCircAt,
  type StripSpec,
  type StripCanvasView,
} from './appendage-panels';

const OPTS = { titlePx: 18, gapPx: 16 };

// ---------------------------------------------------------------------------
// computeStackLayout — one shared to-scale pxPerMm for main + strips
// ---------------------------------------------------------------------------
describe('computeStackLayout', () => {
  it('reduces EXACTLY to fitScale when there are no strips (main plot unchanged)', () => {
    const layout = computeStackLayout(1000, 500, 5000, 2500, [], OPTS);
    const fs = fitScale(1000, 500, 5000, 2500);
    expect(layout.pxPerMm).toBeCloseTo(fs.pxPerMm, 9);
    expect(layout.marginX).toBeCloseTo(fs.marginX, 9);
    expect(layout.marginY).toBeCloseTo(fs.marginY, 9);
    expect(layout.panels).toEqual([]);
  });

  it('matches fitScale letterboxing with no strips (looser axis centred)', () => {
    const layout = computeStackLayout(1000, 500, 5000, 1000, [], OPTS);
    const fs = fitScale(1000, 500, 5000, 1000);
    expect(layout.pxPerMm).toBeCloseTo(fs.pxPerMm, 9);
    expect(layout.marginX).toBeCloseTo(fs.marginX, 9);
    expect(layout.marginY).toBeCloseTo(fs.marginY, 9); // 150
  });

  it('stacks strips below the main plot with fixed title/gap overhead', () => {
    const strips: StripSpec[] = [
      { id: 'app-1', name: 'S1', lengthMm: 500, circumferenceMm: 250 },
      { id: 'app-2', name: 'S2', lengthMm: 800, circumferenceMm: 300 },
    ];
    const layout = computeStackLayout(1000, 2000, 1000, 500, strips, OPTS);
    // width-bound: contentWidth = 1000, availH = 2000-68 = 1932 ⇒ pxPerMm = 1.
    expect(layout.pxPerMm).toBeCloseTo(1, 9);
    expect(layout.panels).toHaveLength(2);
    // panel0 top = mainCirc*px + gap + title = 500 + 16 + 18 = 534
    expect(layout.panels[0].topBasePx).toBeCloseTo(534, 9);
    // panel1 top = 534 + s1.circ*px + gap + title = 534 + 250 + 34 = 818
    expect(layout.panels[1].topBasePx).toBeCloseTo(818, 9);
    // Same shared pxPerMm carried onto each panel spec.
    expect(layout.panels[0].circumferenceMm).toBe(250);
    expect(layout.panels[1].lengthMm).toBe(800);
  });

  it('shrinks the shared scale uniformly when the stack overflows (never per-axis stretch)', () => {
    const mainOnly = fitScale(1000, 600, 1000, 500).pxPerMm; // 1.0
    const strips: StripSpec[] = [{ id: 'app-1', name: 'S1', lengthMm: 1000, circumferenceMm: 400 }];
    const layout = computeStackLayout(1000, 600, 1000, 500, strips, OPTS);
    // Adding the strip pushes total height past the canvas ⇒ pxPerMm must drop.
    expect(layout.pxPerMm).toBeLessThan(mainOnly);
    // One scalar drives both axes — a strip spans (circ × px) tall and (len × px)
    // wide with the SAME px, so it stays to-scale.
    expect(layout.pxPerMm).toBeGreaterThan(0);
  });

  it('returns zeros for degenerate inputs', () => {
    expect(computeStackLayout(0, 500, 5000, 2500, [], OPTS).pxPerMm).toBe(0);
    expect(computeStackLayout(1000, 500, 0, 2500, [], OPTS).pxPerMm).toBe(0);
    // Overhead alone exceeds the canvas height ⇒ no room for any panel.
    const strips: StripSpec[] = [{ id: 'a', name: 'S', lengthMm: 100, circumferenceMm: 100 }];
    expect(computeStackLayout(1000, 20, 1000, 500, strips, OPTS).pxPerMm).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeStackLayout — vertical orientation (portrait transpose)
// ---------------------------------------------------------------------------
// A vertical vessel is presented portrait: axial → screen-Y, circumference (and
// the panel stack) → screen-X. Horizontal remains the default and byte-identical.
// ---------------------------------------------------------------------------
describe('computeStackLayout (vertical orientation)', () => {
  it('horizontal is the default — an explicit horizontal arg changes nothing', () => {
    const def = computeStackLayout(1000, 500, 5000, 2500, [], OPTS);
    const explicit = computeStackLayout(1000, 500, 5000, 2500, [], OPTS, 'horizontal');
    expect(explicit).toEqual(def);
  });

  it('swaps content axes: axial fits the height, circumference fits the width', () => {
    // draw 2000×1000; axial 5000, circ 1000. pxPerMm = min(2000/1000, 1000/5000) = 0.2.
    const layout = computeStackLayout(2000, 1000, 5000, 1000, [], OPTS, 'vertical');
    expect(layout.pxPerMm).toBeCloseTo(0.2, 9);
    // marginX letterboxes circ: (2000 - 1000·0.2)/2 = 900; marginY letterboxes axial: (1000 - 5000·0.2)/2 = 0.
    expect(layout.marginX).toBeCloseTo(900, 9);
    expect(layout.marginY).toBeCloseTo(0, 9);
  });

  it('stacks strips along the circumferential (screen-X) axis with the title/gap overhead', () => {
    const strips: StripSpec[] = [{ id: 'a', name: 'S', lengthMm: 1000, circumferenceMm: 500 }];
    const layout = computeStackLayout(4000, 2000, 1000, 1000, strips, OPTS, 'vertical');
    expect(layout.panels).toHaveLength(1);
    // panel0 top offset = mainCirc·px + gap + title (same walk as horizontal, along the stack axis).
    expect(layout.panels[0].topBasePx).toBeCloseTo(
      1000 * layout.pxPerMm + OPTS.gapPx + OPTS.titlePx,
      6,
    );
  });
});

// ---------------------------------------------------------------------------
// buildStripSpecs — only appendages with confirmed scan data get a panel
// ---------------------------------------------------------------------------
describe('buildStripSpecs', () => {
  function appendage(p: Partial<AppendageConfig>): AppendageConfig {
    return {
      id: 'app-1',
      name: 'Sump',
      mountPos: 0,
      mountAngle: 270,
      diameter: 1000,
      length: 1500,
      endClosure: 'dished',
      ...p,
    } as AppendageConfig;
  }
  function comp(p: Partial<ScanCompositeConfig>): ScanCompositeConfig {
    return {
      id: 'c',
      name: 'c',
      data: [[1]],
      xAxis: [0],
      yAxis: [0],
      stats: { min: 0, max: 1, mean: 0, median: 0, stdDev: 0 },
      indexStartMm: 0,
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

  it('includes appendages with confirmed data and excludes the rest', () => {
    const state = {
      appendages: [
        appendage({ id: 'app-1', name: 'Sump', diameter: 1000, length: 1500 }),
        appendage({ id: 'app-2', name: 'Boot', diameter: 500, length: 800 }),
        appendage({ id: 'app-3', name: 'Riser', diameter: 300, length: 600 }),
      ],
      scanComposites: [
        comp({ id: 'm', bodyId: undefined }), // main → no panel
        comp({ id: 'c1', bodyId: 'app-1' }), // confirmed → panel
        comp({ id: 'c2', bodyId: 'app-2', orientationConfirmed: false }), // unconfirmed → none
        comp({ id: 'c3', bodyId: 'app-nope' }), // no matching appendage
      ],
    } as unknown as VesselState;

    const specs = buildStripSpecs(state);
    expect(specs).toEqual([
      { id: 'app-1', name: 'Sump', lengthMm: 1500, circumferenceMm: Math.PI * 1000 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Strip canvas projection — round-trip, datum-top, shared 1:1 scale
// ---------------------------------------------------------------------------
describe('strip canvas projection', () => {
  const view: StripCanvasView = {
    pxPerMm: 0.7,
    marginX: 12,
    marginY: 40,
    zoom: 1.3,
    offsetX: 25,
    offsetY: -18,
    paddingLeft: 70,
    paddingTop: 80,
    topBasePx: 534,
  };

  it('round-trips axial and circumferential coordinates', () => {
    for (const pos of [0, 137.5, 900]) {
      expect(stripFromCanvasX(stripToCanvasX(pos, view), view)).toBeCloseTo(pos, 6);
    }
    for (const circ of [0, 55, 623.4]) {
      expect(stripFromCanvasY(stripToCanvasY(circ, view), view)).toBeCloseTo(circ, 6);
    }
  });

  it('places the appendage datum 0° at the panel top', () => {
    const panelTop =
      view.paddingTop + view.marginY + view.topBasePx * view.zoom + view.offsetY;
    expect(stripToCanvasY(0, view)).toBeCloseTo(panelTop, 9);
  });

  it('uses one shared pixel scale on both axes (to-scale 1:1)', () => {
    const perMmX = stripToCanvasX(100, view) - stripToCanvasX(0, view);
    const perMmY = stripToCanvasY(100, view) - stripToCanvasY(0, view);
    expect(perMmX).toBeCloseTo(perMmY, 9);
    expect(perMmX).toBeCloseTo(100 * view.pxPerMm * view.zoom, 9);
  });

  it('degrades safely to 0 for a zero scale', () => {
    const bad = { ...view, pxPerMm: 0 };
    expect(stripFromCanvasX(123, bad)).toBe(0);
    expect(stripFromCanvasY(123, bad)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Orientation-aware strip transforms (portrait transpose for a vertical vessel)
// ---------------------------------------------------------------------------
describe('orientation-aware strip transforms', () => {
  const view: StripCanvasView = {
    pxPerMm: 0.7,
    marginX: 12,
    marginY: 40,
    zoom: 1.3,
    offsetX: 25,
    offsetY: -18,
    paddingLeft: 70,
    paddingTop: 80,
    topBasePx: 534,
  };

  it('horizontal stripPx/stripPy equal the legacy stripToCanvasX/stripToCanvasY', () => {
    for (const [pos, circ] of [
      [0, 0],
      [250, 90],
      [900, 410],
    ]) {
      expect(stripPx(pos, circ, view, 'horizontal')).toBeCloseTo(stripToCanvasX(pos, view), 9);
      expect(stripPy(pos, circ, view, 'horizontal')).toBeCloseTo(stripToCanvasY(circ, view), 9);
    }
  });

  it('vertical: X tracks circumference (with the stack offset), Y tracks physical axial pos', () => {
    // More circumference → further right; axial pos does not move X.
    expect(stripPx(100, 250, view, 'vertical')).toBeGreaterThan(stripPx(100, 50, view, 'vertical'));
    expect(stripPx(999, 50, view, 'vertical')).toBeCloseTo(stripPx(100, 50, view, 'vertical'), 9);
    // More axial pos → further down; circumference does not move Y.
    expect(stripPy(400, 50, view, 'vertical')).toBeGreaterThan(stripPy(100, 50, view, 'vertical'));
    expect(stripPy(100, 999, view, 'vertical')).toBeCloseTo(stripPy(100, 50, view, 'vertical'), 9);
  });

  it('round-trips axial + circumferential coordinates in both orientations', () => {
    for (const orientation of ['horizontal', 'vertical'] as const) {
      for (const [pos, circ] of [
        [0, 0],
        [137.5, 55],
        [900, 623.4],
      ]) {
        const x = stripPx(pos, circ, view, orientation);
        const y = stripPy(pos, circ, view, orientation);
        expect(stripPosAt(x, y, view, orientation)).toBeCloseTo(pos, 6);
        expect(stripCircAt(x, y, view, orientation)).toBeCloseTo(circ, 6);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Strip weld & lug placement — projection + strip canvas transform, seam wrap
// ---------------------------------------------------------------------------
// The strip renders welds/lugs with the SAME visual language as the main surface,
// mapped onto the appendage strip: circ weld = a vertical line at its axial X, long
// weld = a horizontal segment at its datum angle, lug = a fixed marker at (pos, datum
// angle). All seam-wrap inside the strip circumference. The strip axis is PHYSICAL
// (0 = junction on the left), never mirrored with the main scan index — asserted here.
// ---------------------------------------------------------------------------
describe('strip weld & lug placement', () => {
  const APP_OD = 400;
  const APP_CIRC = Math.PI * APP_OD;
  const view: StripCanvasView = {
    pxPerMm: 0.7,
    marginX: 12,
    marginY: 40,
    zoom: 1.3,
    offsetX: 25,
    offsetY: -18,
    paddingLeft: 70,
    paddingTop: 80,
    topBasePx: 534,
  };
  const panelTop = view.paddingTop + view.marginY + view.topBasePx * view.zoom + view.offsetY;

  function weld(p: Partial<WeldConfig>): WeldConfig {
    return { name: 'W', type: 'longitudinal', pos: 200, color: '#fff', ...p } as WeldConfig;
  }
  function lug(p: Partial<LiftingLugConfig>): LiftingLugConfig {
    return { name: 'L', pos: 200, angle: 0, style: 'padEye', swl: '1t', ...p } as LiftingLugConfig;
  }
  function nozzle(p: Partial<NozzleConfig>): NozzleConfig {
    return { name: 'N', pos: 200, proj: 100, angle: 0, size: 80, ...p } as NozzleConfig;
  }

  it('lands a circ weld at the strip X of its axial pos', () => {
    const p = 333;
    const cw = projectCircWeld(weld({ type: 'circumferential', pos: p }), APP_OD);
    // The vertical line is drawn at this X, top→bottom of the panel.
    expect(stripToCanvasX(cw.x1, view)).toBeCloseTo(stripToCanvasX(p, view), 9);
    // Round-trips back to the physical axial pos (no mirror).
    expect(stripFromCanvasX(stripToCanvasX(cw.x1, view), view)).toBeCloseTo(p, 6);
  });

  it('lands a datum-0 long weld at the strip top (Y = 0) and wraps at the seam', () => {
    const lw = projectStripLongWeld(weld({ angle: 0, pos: 100, endPos: 500 }), APP_OD);
    expect(stripToCanvasY(lw.y1, view)).toBeCloseTo(panelTop, 9);
    // A weld on the datum cut (bead half-width > 0) is drawn on BOTH strip edges.
    const capHalf = 4; // default capWidth 8 / 2
    const centers = wrapCircumCenters(lw.y1, capHalf, APP_CIRC);
    expect(centers).toHaveLength(2);
    expect(centers).toContain(0);
    expect(centers).toContain(APP_CIRC);
  });

  it('does not wrap a long weld comfortably inside the strip band', () => {
    // datum 180° → half-way down the strip, far from either seam.
    const lw = projectStripLongWeld(weld({ angle: 180 }), APP_OD);
    expect(wrapCircumCenters(lw.y1, 4, APP_CIRC)).toHaveLength(1);
    expect(lw.y1).toBeCloseTo(APP_CIRC / 2, 6);
  });

  it('places a datum-0 lug at the strip top and wraps its fixed marker at the seam', () => {
    const m = projectStripLiftingLug(lug({ angle: 0, pos: 250 }), APP_OD);
    expect(stripToCanvasY(m.cy, view)).toBeCloseTo(panelTop, 9);
    expect(stripToCanvasX(m.cx, view)).toBeCloseTo(stripToCanvasX(250, view), 9);
    // The 6px triangle's mm half-height wraps the datum-0 marker to both edges.
    const lugRadiusMm = 6 / (view.pxPerMm * view.zoom);
    const centers = wrapCircumCenters(m.cy, lugRadiusMm, APP_CIRC);
    expect(centers).toHaveLength(2);
    expect(centers).toContain(0);
    expect(centers).toContain(APP_CIRC);
  });

  it('places a datum-0 nozzle at the strip top at its axial pos, seam-wrapped by bore radius', () => {
    const m = projectStripNozzle(nozzle({ angle: 0, pos: 250, size: 80 }), APP_OD);
    expect(stripToCanvasY(m.cy, view)).toBeCloseTo(panelTop, 9);
    expect(stripToCanvasX(m.cx, view)).toBeCloseTo(stripToCanvasX(250, view), 9);
    // The bore radius (size / 2 mm) wraps the datum-0 marker to both strip edges.
    const centers = wrapCircumCenters(m.cy, m.radius, APP_CIRC);
    expect(centers).toHaveLength(2);
    expect(centers).toContain(0);
    expect(centers).toContain(APP_CIRC);
  });

  it('does not wrap a nozzle comfortably inside the strip band (datum 180°)', () => {
    const m = projectStripNozzle(nozzle({ angle: 180, size: 80 }), APP_OD);
    expect(m.cy).toBeCloseTo(APP_CIRC / 2, 6);
    expect(wrapCircumCenters(m.cy, m.radius, APP_CIRC)).toHaveLength(1);
  });

  it('derives per-axis nozzle pixel radii the way the render does — equal under the shared 1:1 scale', () => {
    // The strip nozzle marker takes rxPx from the X transform and ryPx from the Y
    // transform (exactly like the main path). Both axes share one pxPerMm, so the
    // ellipse is a circle: rxPx === ryPx === radius · pxPerMm · zoom.
    const m = projectStripNozzle(nozzle({ angle: 90, pos: 300, size: 120 }), APP_OD);
    const cx = stripToCanvasX(m.cx, view);
    const rxPx = Math.abs(stripToCanvasX(m.cx + m.radius, view) - cx);
    const cyBase = stripToCanvasY(m.cy, view);
    const ryPx = Math.abs(stripToCanvasY(m.cy + m.radius, view) - cyBase);
    const expected = m.radius * view.pxPerMm * view.zoom;
    expect(rxPx).toBeCloseTo(expected, 9);
    expect(ryPx).toBeCloseTo(expected, 9);
    expect(rxPx).toBeCloseTo(ryPx, 9);
  });

  it('keeps the strip axis PHYSICAL — X increases with pos (never mirrored)', () => {
    // Two welds at increasing axial pos map to strictly increasing X: the strip is
    // read junction-on-the-left, independent of any main-shell scan reversal.
    const near = stripToCanvasX(projectCircWeld(weld({ type: 'circumferential', pos: 100 }), APP_OD).x1, view);
    const far = stripToCanvasX(projectCircWeld(weld({ type: 'circumferential', pos: 900 }), APP_OD).x1, view);
    expect(far).toBeGreaterThan(near);
    // pos 0 sits at the panel's left content origin.
    expect(stripToCanvasX(0, view)).toBeCloseTo(
      view.paddingLeft + view.marginX + view.offsetX,
      9,
    );
  });
});
