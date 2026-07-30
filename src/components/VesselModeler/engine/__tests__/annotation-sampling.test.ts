import { describe, it, expect } from 'vitest';

import type {
  AnnotationShapeConfig,
  DomeScanConfig,
  ScanCompositeConfig,
  VesselState,
} from '../../types';
import { DEFAULT_VESSEL_STATE } from '../../types';
import { COLOR_SCALES, interpolateColor } from '../../../../utils/colorscales';
import {
  sampleAnnotationFootprint,
  sampleSurfacePoint,
  normAngle,
  sampleComposite,
} from '../scan-sampling';
import { computeAnnotationThicknessStats } from '../annotation-stats';
import { buildAnnotationHeatmapPixels } from '../annotation-heatmap';

// DEFAULT_VESSEL_STATE geometry: id 3000 (R 1500), headRatio 2 (D 750), L 8000.
const R = 1500;
const D = 750;
const L = 8000;

function makeVessel(over?: Partial<VesselState>): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: 2 * R,
    length: L,
    headRatio: 2,
    orientation: 'horizontal',
    scanComposites: [],
    domeScanComposites: [],
    appendages: [],
    ...over,
  };
}

function makeAnn(over: Partial<AnnotationShapeConfig>): AnnotationShapeConfig {
  return {
    id: 1,
    name: 'a',
    type: 'scan',
    pos: L / 2,
    angle: 90,
    width: 120,
    height: 90,
    color: '#ff0000',
    lineWidth: 1,
    showLabel: false,
    ...over,
  };
}

// A cylindrical composite covering pos 3500..4500, angle ~80..~123 (ccw from datum).
function makeShellComposite(over?: Partial<ScanCompositeConfig>): ScanCompositeConfig {
  const rows = 21; // index axis
  const cols = 31; // scan axis
  const data: (number | null)[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => 10 + ((r * 3 + c * 7) % 11) * 0.13),
  );
  return {
    id: 'shell',
    name: 'shell',
    data,
    xAxis: Array.from({ length: cols }, (_, i) => i * 20), // scan range 600
    yAxis: Array.from({ length: rows }, (_, i) => i * 50), // index range 1000
    stats: { min: 10, max: 11.3, mean: 10.6, median: 10.6, stdDev: 0.4 },
    indexStartMm: 3500,
    datumAngleDeg: 350, // datumConv = normAngle(350 + 90) = 80
    scanDirection: 'ccw',
    indexDirection: 'forward',
    orientationConfirmed: true,
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...over,
  };
}

function makeDomeComposite(over?: Partial<DomeScanConfig>): DomeScanConfig {
  const rows = 11;
  const cols = 11;
  const data: (number | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 15),
  );
  return {
    id: 'dome',
    name: 'dome',
    head: 'right',
    centerPhi: 45,
    centerTheta: 90,
    scanDirection: 'cw',
    indexDirection: 'outward',
    orientationConfirmed: true,
    data,
    xAxis: Array.from({ length: cols }, (_, i) => i * 20),
    yAxis: Array.from({ length: rows }, (_, i) => i * 40),
    stats: { min: 15, max: 15, mean: 15, median: 15, stdDev: 0 },
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Legacy reference implementations (pre-dome behaviour) for the golden lock.
// Copies of the old annotation-stats loop and annotation-heatmap pixel loop.
// ---------------------------------------------------------------------------

function legacyStats(ann: AnnotationShapeConfig, vessel: VesselState) {
  const circumference = Math.PI * vessel.id;
  const composites = vessel.scanComposites.filter((c) => !c.bodyId);
  const STEP = 2;
  const halfWidthMm = ann.width / 2;
  const halfHeightMm = ann.height / 2;
  const halfHeightDeg = (halfHeightMm / circumference) * 360;
  const axialStart = ann.pos - halfWidthMm;
  const axialEnd = ann.pos + halfWidthMm;
  const angleStart = ann.angle - halfHeightDeg;
  const angleEnd = ann.angle + halfHeightDeg;
  const degPerMm = 360 / circumference;
  const angleDegStep = STEP * degPerMm;

  const values: number[] = [];
  const positions: Array<{ pos: number; angle: number }> = [];
  for (let axial = axialStart; axial <= axialEnd; axial += STEP) {
    for (let angle = angleStart; angle <= angleEnd; angle += angleDegStep) {
      const sampleAngle = normAngle(angle);
      for (let i = composites.length - 1; i >= 0; i--) {
        const comp = composites[i];
        if (!comp.orientationConfirmed) continue;
        const val = sampleComposite(comp, axial, sampleAngle, circumference);
        if (val !== undefined) {
          values.push(val);
          positions.push({ pos: axial, angle: sampleAngle });
          break;
        }
      }
    }
  }
  if (values.length === 0) return undefined;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let minIdx = 0;
  let maxIdx = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    sum += v;
    if (v < min) {
      min = v;
      minIdx = i;
    }
    if (v > max) {
      max = v;
      maxIdx = i;
    }
  }
  const avg = sum / values.length;
  let sq = 0;
  for (let i = 0; i < values.length; i++) sq += (values[i] - avg) ** 2;
  return {
    min,
    max,
    avg,
    stdDev: Math.sqrt(sq / values.length),
    minPoint: positions[minIdx],
    maxPoint: positions[maxIdx],
    sampleCount: values.length,
  };
}

function legacyHeatmapPixels(ann: AnnotationShapeConfig, vessel: VesselState, colorScale: string) {
  const circumference = Math.PI * vessel.id;
  const composites = vessel.scanComposites.filter((c) => !c.bodyId);
  let composite: ScanCompositeConfig | undefined;
  // findOverlappingComposite equivalent: topmost that samples anywhere in bounds.
  for (let i = composites.length - 1; i >= 0 && !composite; i--) {
    const c = composites[i];
    if (!c.orientationConfirmed) continue;
    composite = c; // fixtures use a single overlapping composite
  }
  if (!composite) return null;
  const scale = COLOR_SCALES[colorScale] ?? COLOR_SCALES.Jet;
  const rangeMin = composite.rangeMin ?? composite.stats.min;
  const rangeMax = composite.rangeMax ?? composite.stats.max;
  const range = rangeMax - rangeMin;
  const halfWidthMm = ann.width / 2;
  const halfHeightDeg = (ann.height / 2 / circumference) * 360;
  const axialStart = ann.pos - halfWidthMm;
  const axialEnd = ann.pos + halfWidthMm;
  const angleStart = ann.angle - halfHeightDeg;
  const angleEnd = ann.angle + halfHeightDeg;
  const STEP = 2;
  const degPerMm = 360 / circumference;
  const angleDegStep = STEP * degPerMm;
  const cols = Math.max(1, Math.ceil((axialEnd - axialStart) / STEP));
  const rows = Math.max(1, Math.ceil((angleEnd - angleStart) / angleDegStep));
  const maxDim = 256;
  const canvasW = Math.min(cols, maxDim);
  const canvasH = Math.min(rows, maxDim);
  const pixels = new Uint8ClampedArray(canvasW * canvasH * 4);
  const axialStep = (axialEnd - axialStart) / canvasW;
  const angleStep = (angleEnd - angleStart) / canvasH;
  const flipV = composite.scanDirection !== 'cw';
  const flipU = composite.indexDirection === 'forward';
  for (let py = 0; py < canvasH; py++) {
    const yFrac = flipV ? canvasH - 1 - py : py;
    const angle = angleStart + (yFrac + 0.5) * angleStep;
    for (let px = 0; px < canvasW; px++) {
      const xFrac = flipU ? canvasW - 1 - px : px;
      const axial = axialStart + (xFrac + 0.5) * axialStep;
      const idx = (py * canvasW + px) * 4;
      const sampleAngle = normAngle(angle);
      const val = sampleComposite(composite, axial, sampleAngle, circumference);
      if (val === undefined) {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      } else {
        const t = range > 0 ? (val - rangeMin) / range : 0.5;
        const [r, g, b] = interpolateColor(t, scale, true);
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = 255;
      }
    }
  }
  return { pixels, width: canvasW, height: canvasH };
}

function hashBytes(a: Uint8ClampedArray): number {
  let h = 5381;
  for (let i = 0; i < a.length; i++) h = (Math.imul(h, 33) ^ a[i]) >>> 0;
  return h;
}

// ---------------------------------------------------------------------------
// (1) Golden — pure-cylinder byte-identical stats + heatmap buffer
// ---------------------------------------------------------------------------

describe('golden — pure-cylinder stats + heatmap byte-identical to legacy', () => {
  const vessel = makeVessel({ scanComposites: [makeShellComposite()] });
  const ann = makeAnn({ pos: 4000, angle: 90, width: 120, height: 90 });

  it('stats deep-equal the legacy loop', () => {
    const got = computeAnnotationThicknessStats(ann, vessel);
    const legacy = legacyStats(ann, vessel);
    expect(legacy).toBeDefined();
    expect(got).toEqual(legacy);
    // sanity: the fixture actually produced readings
    expect(got!.sampleCount).toBeGreaterThan(100);
  });

  it('heatmap pixel buffer is byte-identical (hash + dims) to legacy', () => {
    const got = buildAnnotationHeatmapPixels(ann, vessel, 'Jet');
    const legacy = legacyHeatmapPixels(ann, vessel, 'Jet');
    expect(got).not.toBeNull();
    expect(legacy).not.toBeNull();
    expect(got!.width).toBe(legacy!.width);
    expect(got!.height).toBe(legacy!.height);
    expect(got!.pixels.length).toBe(legacy!.pixels.length);
    expect(hashBytes(got!.pixels)).toBe(hashBytes(legacy!.pixels));
  });
});

// ---------------------------------------------------------------------------
// (2) Dome — annotation fully on a head samples domeScanComposites
// ---------------------------------------------------------------------------

describe('dome — annotation on a head reflects the dome grid', () => {
  // Annotation centred on the right head at sx = 300 (phi_ds = acos(300/750) = 66.4).
  const ann = makeAnn({ pos: L + 0.4 * D, angle: 90, width: 400, height: 200 });
  // Dome scan centred at the same surface point, planting a known min at its centre cell.
  const domeData: (number | null)[][] = Array.from({ length: 11 }, () =>
    Array.from({ length: 11 }, () => 15),
  );
  domeData[5][5] = 5; // known minimum at the grid centre = annotation centre
  const dome = makeDomeComposite({
    centerPhi: 66.4,
    centerTheta: 90,
    data: domeData,
    xAxis: Array.from({ length: 11 }, (_, i) => i * 20), // scan range 200 (circ)
    yAxis: Array.from({ length: 11 }, (_, i) => i * 40), // index range 400 (meridian)
    stats: { min: 5, max: 15, mean: 14, median: 15, stdDev: 2 },
  });
  const vessel = makeVessel({ domeScanComposites: [dome] });

  it('stats min/max/count reflect the dome grid', () => {
    const stats = computeAnnotationThicknessStats(ann, vessel);
    expect(stats).toBeDefined();
    expect(stats!.sampleCount).toBeGreaterThan(0);
    expect(stats!.min).toBe(5); // the planted minimum cell was sampled
    expect(stats!.max).toBe(15);
  });

  it('heatmap min equals the stats min (same sampled cells)', () => {
    const stats = computeAnnotationThicknessStats(ann, vessel);
    const px = buildAnnotationHeatmapPixels(ann, vessel, 'Jet');
    expect(px).not.toBeNull();
    expect(px!.dataMin).toBe(stats!.min);
  });
});

// ---------------------------------------------------------------------------
// (3) Straddle — cylinder + dome parts, sampled once each (no seam double-count)
// ---------------------------------------------------------------------------

describe('straddle — tangent-line crossing samples both regions once', () => {
  // Shell composite (uniform 20) covers the cylinder side near the TL; dome
  // composite (uniform 10) covers the head side. Distinct values expose which
  // region each sampled cell came from.
  const shell = makeShellComposite({
    data: Array.from({ length: 21 }, () => Array.from({ length: 31 }, () => 20)),
    indexStartMm: 7500,
    yAxis: Array.from({ length: 21 }, (_, i) => i * 30), // 7500..8130
    stats: { min: 20, max: 20, mean: 20, median: 20, stdDev: 0 },
  });
  const dome = makeDomeComposite({
    centerPhi: 80,
    centerTheta: 90,
    data: Array.from({ length: 21 }, () => Array.from({ length: 21 }, () => 10)),
    xAxis: Array.from({ length: 21 }, (_, i) => i * 50), // range 1000
    yAxis: Array.from({ length: 21 }, (_, i) => i * 50), // range 1000
    stats: { min: 10, max: 10, mean: 10, median: 10, stdDev: 0 },
  });
  const vessel = makeVessel({ scanComposites: [shell], domeScanComposites: [dome] });
  const ann = makeAnn({ pos: L, angle: 90, width: 800, height: 300 });

  it('both regions contribute; each cell reads its own region only', () => {
    const samples = sampleAnnotationFootprint(ann, vessel);
    const cyl = samples.filter((s) => s.pos <= L);
    const head = samples.filter((s) => s.pos > L);

    expect(cyl.length).toBeGreaterThan(0);
    expect(head.length).toBeGreaterThan(0);
    // Cylinder cells read the shell composite (20); head cells the dome (10).
    expect(cyl.every((s) => s.value === 20)).toBe(true);
    expect(head.every((s) => s.value === 10)).toBe(true);
    // Partition: every sample belongs to exactly one region (no seam double-count).
    expect(cyl.length + head.length).toBe(samples.length);
  });
});

// ---------------------------------------------------------------------------
// (4) Apex — the pole is reachable (no untouchable disk)
// ---------------------------------------------------------------------------

describe('apex — footprint over the pole samples the apex region', () => {
  const dome = makeDomeComposite({
    centerPhi: 1, // near the apex
    centerTheta: 90,
    data: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => 12)),
    xAxis: Array.from({ length: 16 }, (_, i) => i * 100), // range 1500
    yAxis: Array.from({ length: 16 }, (_, i) => i * 100), // range 1500
    stats: { min: 12, max: 12, mean: 12, median: 12, stdDev: 0 },
  });
  const vessel = makeVessel({ domeScanComposites: [dome] });
  const ann = makeAnn({ pos: L + D, angle: 90, width: 600, height: 600 });

  it('samples reach within 1% of the pole and read the apex data', () => {
    const samples = sampleAnnotationFootprint(ann, vessel);
    expect(samples.length).toBeGreaterThan(0);
    const maxPos = Math.max(...samples.map((s) => s.pos));
    // Apex is at pos = L + D; the old 0.99 radius clamp left a forbidden disk.
    expect(maxPos).toBeGreaterThanOrEqual(L + 0.99 * D);
    // Every sampled apex cell reads the uniform dome value.
    expect(samples.every((s) => s.value === 12)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (5) Body scoping — an appendage composite never feeds a main-shell annotation
// ---------------------------------------------------------------------------

describe('body scoping — appendage composite excluded from main-shell annotation', () => {
  const ann = makeAnn({ pos: 4000, angle: 90, width: 120, height: 90 });

  it('a bodyId=app1 composite contributes nothing to a main-shell annotation', () => {
    const vessel = makeVessel({ scanComposites: [makeShellComposite({ bodyId: 'app1' })] });
    // Main-shell annotation (body undefined) must see no data from app1.
    expect(computeAnnotationThicknessStats(ann, vessel)).toBeUndefined();
    // But the same composite IS visible when sampling body 'app1'.
    const v = sampleSurfacePoint(vessel, 4000, normAngle(90), 'app1');
    expect(v).toBeDefined();
  });

  it('the same composite on the main shell (no bodyId) does feed the annotation', () => {
    const vessel = makeVessel({ scanComposites: [makeShellComposite()] });
    expect(computeAnnotationThicknessStats(ann, vessel)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// (6) Agreement — heatmap min === stats min on a mixed fixture
// ---------------------------------------------------------------------------

describe('agreement — heatmap min equals stats min on a mixed fixture', () => {
  const shell = makeShellComposite({
    data: Array.from({ length: 21 }, () => Array.from({ length: 31 }, () => 20)),
    indexStartMm: 7500,
    yAxis: Array.from({ length: 21 }, (_, i) => i * 30),
    stats: { min: 20, max: 20, mean: 20, median: 20, stdDev: 0 },
  });
  const dome = makeDomeComposite({
    centerPhi: 80,
    centerTheta: 90,
    data: Array.from({ length: 21 }, () => Array.from({ length: 21 }, () => 10)),
    xAxis: Array.from({ length: 21 }, (_, i) => i * 50),
    yAxis: Array.from({ length: 21 }, (_, i) => i * 50),
    stats: { min: 10, max: 10, mean: 10, median: 10, stdDev: 0 },
  });
  const vessel = makeVessel({ scanComposites: [shell], domeScanComposites: [dome] });
  const ann = makeAnn({ pos: L, angle: 90, width: 800, height: 300 });

  it('dataMin from the heatmap builder equals the stats minimum', () => {
    const stats = computeAnnotationThicknessStats(ann, vessel);
    const px = buildAnnotationHeatmapPixels(ann, vessel, 'Jet');
    expect(stats).toBeDefined();
    expect(px).not.toBeNull();
    expect(px!.dataMin).toBe(stats!.min);
    expect(stats!.min).toBe(10); // the dome (thinner) side drives the minimum
  });
});
