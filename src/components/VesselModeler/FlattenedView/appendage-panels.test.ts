import { describe, it, expect } from 'vitest';

import type { VesselState, ScanCompositeConfig, AppendageConfig } from '../types';
import { fitScale } from './geometry-projection';
import {
  computeStackLayout,
  buildStripSpecs,
  stripToCanvasX,
  stripToCanvasY,
  stripFromCanvasX,
  stripFromCanvasY,
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
