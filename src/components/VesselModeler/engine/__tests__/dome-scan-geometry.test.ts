import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { degToRad } from 'three/src/math/MathUtils.js';

import type { AppendageConfig, DomeScanConfig, VesselState } from '../../types';
import {
  PHI_EPSILON,
  domeLocalFromPhiTheta,
  domePhiThetaFromPoint,
  createDomeScanPlane,
  clearDomeHeatmapCache,
  normalizeDomeScanComposite,
} from '../dome-scan-geometry';
import { resolveBodyFrame } from '../body-frame';
import { buildDomeTangentBasis, tangentOffsetsToSurface } from '../dome-tangent';
import { SCALE } from '../materials';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDomeScanConfig(overrides: Partial<DomeScanConfig> = {}): DomeScanConfig {
  const rows = 10;
  const cols = 10;
  return {
    id: 'ds_test',
    name: 'Test Dome Scan',
    head: 'right',
    centerPhi: 45,
    centerTheta: 0,
    scanDirection: 'cw',
    indexDirection: 'outward',
    orientationConfirmed: true,
    data: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => 10 + Math.random() * 5),
    ),
    xAxis: Array.from({ length: cols }, (_, i) => i * 10),
    yAxis: Array.from({ length: rows }, (_, i) => i * 10),
    stats: { min: 10, max: 15, mean: 12.5, median: 12.5, stdDev: 1 },
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
    ...overrides,
  };
}

function makeVesselState(overrides?: Partial<VesselState>): VesselState {
  return {
    id: 3000,
    length: 8000,
    headRatio: 2.0,
    orientation: 'horizontal' as const,
    vesselShape: 'vessel',
    vesselName: 'Test Vessel',
    location: '',
    inspectionDate: '',
    nozzles: [],
    liftingLugs: [],
    saddles: [],
    welds: [],
    textures: [],
    annotations: [],
    rulers: [],
    coverageRects: [],
    inspectionImages: [],
    scanComposites: [],
    domeScanComposites: [],
    pipelines: [],
    referenceDrawings: [],
    measurementConfig: { referenceTangent: 'left', circumDirection: 'CW', viewFromEnd: 'right' },
    coordinateOrigin: { indexMm: 0, scanMm: 0 },
    hasModel: true,
    visuals: {} as any,
    ...overrides,
  } as VesselState;
}

// ---------------------------------------------------------------------------
// normalizeDomeScanComposite — deserialization guard
// ---------------------------------------------------------------------------
// Projects persist dome scans WITHOUT the heavy `data`/`xAxis`/`yAxis` matrices
// (see VesselModeler save path). On load, those fields are therefore absent and
// MUST be backfilled with safe defaults so downstream consumers (structuralHash,
// dome-scan geometry, stats) never read `.length`/`.validArea` of undefined.

describe('normalizeDomeScanComposite', () => {
  it('backfills missing data/xAxis/yAxis with empty arrays', () => {
    // Simulates a composite restored from a saved project (data stripped on save).
    const raw = {
      id: 'ds_1',
      name: 'Saved Dome',
      head: 'left',
      centerPhi: 30,
      centerTheta: 90,
      scanDirection: 'cw',
      indexDirection: 'outward',
      colorScale: 'Jet',
      rangeMin: null,
      rangeMax: null,
      opacity: 1,
      // data, xAxis, yAxis, stats intentionally absent
    };

    const result = normalizeDomeScanComposite(raw);

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.data.length).toBe(0); // the exact access that used to crash
    expect(Array.isArray(result.xAxis)).toBe(true);
    expect(Array.isArray(result.yAxis)).toBe(true);
    expect(result.stats).toBeDefined();
    expect(typeof result.stats.min).toBe('number');
  });

  it('preserves real data and all persisted fields when present', () => {
    const raw = makeDomeScanConfig({ id: 'ds_keep', head: 'right' });
    const result = normalizeDomeScanComposite(raw);

    expect(result.id).toBe('ds_keep');
    expect(result.head).toBe('right');
    expect(result.data).toBe(raw.data); // not replaced
    expect(result.data.length).toBe(10);
    expect(result.xAxis).toBe(raw.xAxis);
    expect(result.stats).toBe(raw.stats);
  });

  it('derives head from legacy sectionType when head is absent', () => {
    expect(normalizeDomeScanComposite({ sectionType: 'dome_left' }).head).toBe('left');
    expect(normalizeDomeScanComposite({ sectionType: 'dome_right' }).head).toBe('right');
  });

  it('defaults orientationConfirmed to false when absent', () => {
    expect(normalizeDomeScanComposite({ head: 'left' }).orientationConfirmed).toBe(false);
    expect(
      normalizeDomeScanComposite({ head: 'left', orientationConfirmed: true }).orientationConfirmed,
    ).toBe(true);
  });

  it('carries bodyId through and forces head "end" for an appendage scan', () => {
    const result = normalizeDomeScanComposite({ bodyId: 'app-1', head: 'left' });
    expect(result.bodyId).toBe('app-1');
    // An appendage has one closure — the head is always 'end' regardless of a
    // stale persisted 'left'/'right'.
    expect(result.head).toBe('end');
  });

  it('maps a bodyId-less "end" head back to the right head (guard)', () => {
    // 'end' is meaningless without a body; the scan stays visible on the main
    // shell rather than being dropped.
    const result = normalizeDomeScanComposite({ head: 'end' });
    expect(result.bodyId).toBeUndefined();
    expect(result.head).toBe('right');
  });

  it('leaves a main-shell scan untouched (no bodyId, head preserved)', () => {
    expect(normalizeDomeScanComposite({ head: 'left' }).head).toBe('left');
    expect(normalizeDomeScanComposite({ head: 'right' }).bodyId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// domeLocalFromPhiTheta
// ---------------------------------------------------------------------------

describe('domeLocalFromPhiTheta', () => {
  const RADIUS = 1500; // mm
  const HEAD_DEPTH = 750; // mm (2:1 ellipsoidal)

  it('apex (phi=0): produces valid result with no NaN', () => {
    const result = domeLocalFromPhiTheta(0, 0, RADIUS, HEAD_DEPTH);
    expect(Number.isNaN(result.axialMm)).toBe(false);
    expect(Number.isNaN(result.rLocalMm)).toBe(false);
    expect(Number.isNaN(result.normal.x)).toBe(false);
    expect(Number.isNaN(result.normal.y)).toBe(false);
    expect(Number.isNaN(result.normal.z)).toBe(false);
  });

  it('near-apex ring: four distinct thetaRad values, similar rLocalMm', () => {
    const thetas = [0, 90, 180, 270];
    const results = thetas.map((t) => domeLocalFromPhiTheta(PHI_EPSILON, t, RADIUS, HEAD_DEPTH));

    // All should have very similar rLocalMm (near zero for near-apex)
    const rValues = results.map((r) => r.rLocalMm);
    for (let i = 1; i < rValues.length; i++) {
      expect(Math.abs(rValues[i] - rValues[0])).toBeLessThan(0.01);
    }

    // All should have distinct thetaRad values
    const thetaValues = results.map((r) => r.thetaRad);
    const uniqueThetas = new Set(thetaValues.map((t) => t.toFixed(4)));
    expect(uniqueThetas.size).toBe(4);
  });

  it('equator (phi=90): axialMm near 0, rLocalMm near radius', () => {
    const result = domeLocalFromPhiTheta(90, 0, RADIUS, HEAD_DEPTH);
    expect(result.axialMm).toBeCloseTo(0, 1);
    expect(result.rLocalMm).toBeCloseTo(RADIUS, 1);
  });

  it('mid-dome (phi=45): correct axialMm and rLocalMm', () => {
    const result = domeLocalFromPhiTheta(45, 0, RADIUS, HEAD_DEPTH);
    const expected_axial = HEAD_DEPTH * Math.cos(degToRad(45));
    const expected_r = RADIUS * Math.sin(degToRad(45));
    expect(result.axialMm).toBeCloseTo(expected_axial, 1);
    expect(result.rLocalMm).toBeCloseTo(expected_r, 1);
  });

  it('apex normal points along head axis (|normal.x| > 0.9)', () => {
    const result = domeLocalFromPhiTheta(PHI_EPSILON, 0, RADIUS, HEAD_DEPTH);
    expect(Math.abs(result.normal.x)).toBeGreaterThan(0.9);
  });

  it('equator normal points radially (|normal.x| < 0.15)', () => {
    const result = domeLocalFromPhiTheta(90, 0, RADIUS, HEAD_DEPTH);
    expect(Math.abs(result.normal.x)).toBeLessThan(0.15);
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests (forward + inverse)
// ---------------------------------------------------------------------------

describe('domePhiThetaFromPoint round-trip', () => {
  const RADIUS = 1500;
  const HEAD_DEPTH = 750;
  const TAN_TAN = 8000;

  const cases: Array<{ phi: number; theta: number; head: 'left' | 'right' }> = [
    { phi: 0.1, theta: 0, head: 'right' },
    { phi: 45, theta: 90, head: 'right' },
    { phi: 45, theta: 270, head: 'left' },
    { phi: 89, theta: 180, head: 'left' },
  ];

  for (const { phi, theta, head } of cases) {
    it(`round-trips phi=${phi} theta=${theta} head=${head}`, () => {
      const headSign = head === 'right' ? 1 : -1;
      const tangentLineMm = head === 'right' ? TAN_TAN : 0;
      const isVertical = false; // horizontal vessel

      // Forward: dome coords → local mm
      const local = domeLocalFromPhiTheta(phi, theta, RADIUS, HEAD_DEPTH);

      // Build scaled world point (horizontal vessel: x=axial, y=rSin(θ), z=rCos(θ))
      const axialPosMm = tangentLineMm + headSign * local.axialMm;
      const axialGlobal = (axialPosMm - TAN_TAN / 2) * SCALE;
      const rScaled = local.rLocalMm * SCALE;

      const worldPoint = new THREE.Vector3(
        axialGlobal,
        rScaled * Math.sin(local.thetaRad),
        rScaled * Math.cos(local.thetaRad),
      );

      // Inverse: world point → dome coords
      const tangentLineWorld = (tangentLineMm - TAN_TAN / 2) * SCALE;
      const result = domePhiThetaFromPoint(
        worldPoint,
        RADIUS,
        HEAD_DEPTH,
        tangentLineWorld,
        headSign,
        isVertical,
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.phiDeg).toBeCloseTo(phi, 1); // within 0.01 degrees (1 decimal toBeCloseTo precision)
        // Theta: normalize both to [0, 360) for comparison
        const expectedTheta = ((theta % 360) + 360) % 360;
        const actualTheta = ((result.thetaDeg % 360) + 360) % 360;
        expect(actualTheta).toBeCloseTo(expectedTheta, 0); // within 0.1 degrees
      }
    });
  }

  it('point on shell side returns null', () => {
    // A point clearly on the cylinder side, not on the dome
    // For right head: tangent line is at TAN_TAN. Shell-side means
    // the point is to the left (lower x) of the tangent line.
    const headSign = 1;
    const tangentLineMm = TAN_TAN;
    const tangentLineWorld = (tangentLineMm - TAN_TAN / 2) * SCALE;

    // Place point well into the shell region (at axial = TAN_TAN/2)
    const shellPoint = new THREE.Vector3(
      0, // axial global = 0 → at vessel center
      RADIUS * SCALE * 0.5,
      RADIUS * SCALE * 0.5,
    );

    const result = domePhiThetaFromPoint(
      shellPoint,
      RADIUS,
      HEAD_DEPTH,
      tangentLineWorld,
      headSign,
      false,
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createDomeScanPlane
// ---------------------------------------------------------------------------

describe('createDomeScanPlane', () => {
  beforeEach(() => {
    clearDomeHeatmapCache();
  });

  it('returns a mesh for valid config', () => {
    const config = makeDomeScanConfig();
    const vessel = makeVesselState();
    const mesh = createDomeScanPlane(config, vessel, '');

    expect(mesh).not.toBeNull();
    expect(mesh).toBeInstanceOf(THREE.Mesh);
  });

  it('returns null for empty data', () => {
    const config = makeDomeScanConfig({ data: [] });
    const vessel = makeVesselState();
    const mesh = createDomeScanPlane(config, vessel, '');

    expect(mesh).toBeNull();
  });

  it('returns null for xAxis with fewer than 2 entries', () => {
    const config = makeDomeScanConfig({ xAxis: [0] });
    const vessel = makeVesselState();
    const mesh = createDomeScanPlane(config, vessel, '');

    expect(mesh).toBeNull();
  });

  it('near-apex (centerPhi=5): no NaN in any vertex', () => {
    const config = makeDomeScanConfig({ centerPhi: 5 });
    const vessel = makeVesselState();
    const mesh = createDomeScanPlane(config, vessel, '');

    expect(mesh).not.toBeNull();
    if (mesh) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isNaN(positions.getX(i))).toBe(false);
        expect(Number.isNaN(positions.getY(i))).toBe(false);
        expect(Number.isNaN(positions.getZ(i))).toBe(false);
      }
    }
  });

  it('userData has type domeScan with expected fields', () => {
    const config = makeDomeScanConfig();
    const vessel = makeVesselState();
    const mesh = createDomeScanPlane(config, vessel, '');

    expect(mesh).not.toBeNull();
    if (mesh) {
      expect(mesh.userData.type).toBe('domeScan');
      expect(mesh.userData.id).toBe('ds_test');
      expect(mesh.userData.head).toBe('right');
      expect(mesh.userData.centerPhi).toBe(45);
      expect(mesh.userData.centerTheta).toBe(0);
      expect(mesh.userData.scanDirection).toBe('cw');
      expect(mesh.userData.indexDirection).toBe('outward');
      expect(mesh.userData.width).toBe(config.xAxis.length);
      expect(mesh.userData.height).toBe(config.yAxis.length);
    }
  });

  it('UV correctness: flipping scanDirection flips U', () => {
    const configCW = makeDomeScanConfig({ scanDirection: 'cw' });
    const configCCW = makeDomeScanConfig({ scanDirection: 'ccw' });
    const vessel = makeVesselState();

    const meshCW = createDomeScanPlane(configCW, vessel, '');
    const meshCCW = createDomeScanPlane(configCCW, vessel, '');

    expect(meshCW).not.toBeNull();
    expect(meshCCW).not.toBeNull();
    if (meshCW && meshCCW) {
      const uvCW = meshCW.geometry.getAttribute('uv');
      const uvCCW = meshCCW.geometry.getAttribute('uv');

      // First vertex: ix=0, iy=0 → u=0
      // CW: scanMapped = 1 - u = 1; CCW: scanMapped = u = 0
      // So the U value at vertex 0 should differ
      const uCW = uvCW.getX(0);
      const uCCW = uvCCW.getX(0);
      expect(uCW).not.toBeCloseTo(uCCW, 1);
    }
  });

  it('UV correctness: flipping indexDirection flips V', () => {
    const configOut = makeDomeScanConfig({ indexDirection: 'outward' });
    const configIn = makeDomeScanConfig({ indexDirection: 'inward' });
    const vessel = makeVesselState();

    const meshOut = createDomeScanPlane(configOut, vessel, '');
    const meshIn = createDomeScanPlane(configIn, vessel, '');

    expect(meshOut).not.toBeNull();
    expect(meshIn).not.toBeNull();
    if (meshOut && meshIn) {
      const uvOut = meshOut.geometry.getAttribute('uv');
      const uvIn = meshIn.geometry.getAttribute('uv');

      // First vertex: ix=0, iy=0 → v=0
      // outward: indexMapped = 1 - v = 1; inward: indexMapped = v = 0
      const vOut = uvOut.getY(0);
      const vIn = uvIn.getY(0);
      expect(vOut).not.toBeCloseTo(vIn, 1);
    }
  });

  it('selection border visible when selected, hidden when not', () => {
    const config = makeDomeScanConfig();
    const vessel = makeVesselState();

    const meshSelected = createDomeScanPlane(config, vessel, 'ds_test');
    const meshNotSelected = createDomeScanPlane(config, vessel, 'other_id');

    expect(meshSelected).not.toBeNull();
    expect(meshNotSelected).not.toBeNull();

    if (meshSelected) {
      const border = meshSelected.children.find(
        (c) => (c as THREE.Mesh).userData?.role === 'domeScan-border',
      );
      expect(border).toBeDefined();
      expect(border!.visible).toBe(true);
    }

    if (meshNotSelected) {
      const border = meshNotSelected.children.find(
        (c) => (c as THREE.Mesh).userData?.role === 'domeScan-border',
      );
      expect(border).toBeDefined();
      expect(border!.visible).toBe(false);
    }
  });

  it('selection border has renderOrder 1', () => {
    const config = makeDomeScanConfig();
    const vessel = makeVesselState();
    const mesh = createDomeScanPlane(config, vessel, 'ds_test');

    expect(mesh).not.toBeNull();
    if (mesh) {
      const border = mesh.children.find(
        (c) => (c as THREE.Mesh).userData?.role === 'domeScan-border',
      ) as THREE.Mesh | undefined;
      expect(border).toBeDefined();
      expect(border!.renderOrder).toBe(1);
    }
  });
});

describe('per-row angular span correction', () => {
  beforeEach(() => {
    clearDomeHeatmapCache();
  });

  it('large phi range: no NaN in any vertex', () => {
    const rows = 20;
    const cols = 20;
    const config = makeDomeScanConfig({
      centerPhi: 45,
      data: Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => 10),
      ),
      xAxis: Array.from({ length: cols }, (_, i) => i * 50),
      yAxis: Array.from({ length: rows }, (_, i) => i * 50),
    });
    const vessel = makeVesselState();

    const mesh = createDomeScanPlane(config, vessel, '');
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      expect(Number.isNaN(positions.getX(i))).toBe(false);
      expect(Number.isNaN(positions.getY(i))).toBe(false);
      expect(Number.isNaN(positions.getZ(i))).toBe(false);
    }
  });
});

describe('vertical vessel round-trip', () => {
  const RADIUS = 1500;
  const HEAD_DEPTH = 750;
  const TAN_TAN = 8000;

  const cases: Array<{ phi: number; theta: number; head: 'left' | 'right' }> = [
    { phi: 0.1, theta: 0, head: 'right' },
    { phi: 45, theta: 90, head: 'right' },
    { phi: 45, theta: 270, head: 'left' },
    { phi: 89, theta: 180, head: 'left' },
    { phi: 30, theta: 45, head: 'right' },
    { phi: 60, theta: 315, head: 'left' },
  ];

  for (const { phi, theta, head } of cases) {
    it(`vertical round-trips phi=${phi} theta=${theta} head=${head}`, () => {
      const headSign = head === 'right' ? 1 : -1;
      const tangentLineMm = head === 'right' ? TAN_TAN : 0;
      const isVertical = true;

      const local = domeLocalFromPhiTheta(phi, theta, RADIUS, HEAD_DEPTH);

      const axialPosMm = tangentLineMm + headSign * local.axialMm;
      const axialGlobal = (axialPosMm - TAN_TAN / 2) * SCALE;
      const rScaled = local.rLocalMm * SCALE;

      const worldPoint = new THREE.Vector3(
        rScaled * Math.cos(local.thetaRad),
        axialGlobal,
        rScaled * Math.sin(local.thetaRad),
      );

      const tangentLineWorld = (tangentLineMm - TAN_TAN / 2) * SCALE;
      const result = domePhiThetaFromPoint(
        worldPoint,
        RADIUS,
        HEAD_DEPTH,
        tangentLineWorld,
        headSign,
        isVertical,
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.phiDeg).toBeCloseTo(phi, 1);
        const expectedTheta = ((theta % 360) + 360) % 360;
        const actualTheta = ((result.thetaDeg % 360) + 360) % 360;
        expect(actualTheta).toBeCloseTo(expectedTheta, 0);
      }
    });
  }
});

describe('vertical vessel mesh creation', () => {
  beforeEach(() => {
    clearDomeHeatmapCache();
  });

  it('creates valid mesh for vertical vessel, right head', () => {
    const config = makeDomeScanConfig({ head: 'right', centerPhi: 45 });
    const vessel = makeVesselState({ orientation: 'vertical' });
    const mesh = createDomeScanPlane(config, vessel, '');

    expect(mesh).not.toBeNull();
    if (mesh) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isNaN(positions.getX(i))).toBe(false);
        expect(Number.isNaN(positions.getY(i))).toBe(false);
        expect(Number.isNaN(positions.getZ(i))).toBe(false);
      }
    }
  });

  it('creates valid mesh for vertical vessel, left head', () => {
    const config = makeDomeScanConfig({ head: 'left', centerPhi: 30 });
    const vessel = makeVesselState({ orientation: 'vertical' });
    const mesh = createDomeScanPlane(config, vessel, '');

    expect(mesh).not.toBeNull();
    if (mesh) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isNaN(positions.getX(i))).toBe(false);
        expect(Number.isNaN(positions.getY(i))).toBe(false);
        expect(Number.isNaN(positions.getZ(i))).toBe(false);
      }
    }
  });

  it('vertical vessel: axial axis is Y (mesh extents differ from horizontal)', () => {
    const config = makeDomeScanConfig({ head: 'right', centerPhi: 45 });
    const vesselH = makeVesselState({ orientation: 'horizontal' });
    const vesselV = makeVesselState({ orientation: 'vertical' });

    const meshH = createDomeScanPlane(config, vesselH, '');
    const meshV = createDomeScanPlane(config, vesselV, '');

    expect(meshH).not.toBeNull();
    expect(meshV).not.toBeNull();
    if (meshH && meshV) {
      meshH.geometry.computeBoundingBox();
      meshV.geometry.computeBoundingBox();

      const bbH = meshH.geometry.boundingBox!;
      const bbV = meshV.geometry.boundingBox!;

      const hXRange = bbH.max.x - bbH.min.x;
      const vYRange = bbV.max.y - bbV.min.y;

      expect(hXRange).toBeGreaterThan(0.01);
      expect(vYRange).toBeGreaterThan(0.01);

      const ratio = hXRange / vYRange;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2.0);
    }
  });
});

// ---------------------------------------------------------------------------
// Appendage end-closure dome scans (Phase 4C)
// ---------------------------------------------------------------------------
// A dished appendage (diameter 800 -> R 400, headRatio 2 -> D 200, cylinder
// length 1200) carries a dome scan on its closure. Placement resolves through
// the body SurfaceFrame; the closure is the 'right'-head analog (apex outward).

describe('createDomeScanPlane — appendage end closure', () => {
  const R = 400;
  const D = 200;
  const L = 1200;

  function appendage(over: Partial<AppendageConfig> = {}): AppendageConfig {
    return {
      id: 'app-1',
      name: 'Sump',
      mountPos: 4000,
      mountAngle: 270,
      diameter: 800,
      length: 1200,
      endClosure: 'dished',
      headRatio: 2.0,
      ...over,
    };
  }

  function appendageVessel(over: Partial<AppendageConfig> = {}): VesselState {
    return makeVesselState({ appendages: [appendage(over)] });
  }

  function appendageScan(over: Partial<DomeScanConfig> = {}): DomeScanConfig {
    return makeDomeScanConfig({ bodyId: 'app-1', head: 'end', centerPhi: 30, centerTheta: 60, ...over });
  }

  beforeEach(() => clearDomeHeatmapCache());

  it('returns a mesh tagged with bodyId + type domeScan', () => {
    const mesh = createDomeScanPlane(appendageScan(), appendageVessel(), '');
    expect(mesh).not.toBeNull();
    expect(mesh!.userData.type).toBe('domeScan');
    expect(mesh!.userData.bodyId).toBe('app-1');
    expect(mesh!.userData.head).toBe('end');
  });

  it('returns null when the appendage closure is not dished', () => {
    expect(createDomeScanPlane(appendageScan(), appendageVessel({ endClosure: 'flat' }), '')).toBeNull();
    expect(createDomeScanPlane(appendageScan(), appendageVessel({ endClosure: 'open' }), '')).toBeNull();
  });

  it('produces no NaN vertices', () => {
    const mesh = createDomeScanPlane(appendageScan({ centerPhi: 20 }), appendageVessel(), '');
    expect(mesh).not.toBeNull();
    const pos = mesh!.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isNaN(pos.getX(i))).toBe(false);
      expect(Number.isNaN(pos.getY(i))).toBe(false);
      expect(Number.isNaN(pos.getZ(i))).toBe(false);
    }
  });

  it('apex vertex sits at the closure pole per resolveBodyFrame', () => {
    const vessel = appendageVessel();
    const mesh = createDomeScanPlane(appendageScan({ centerPhi: PHI_EPSILON, centerTheta: 0 }), vessel, '');
    expect(mesh).not.toBeNull();

    const frame = resolveBodyFrame(vessel, 'app-1');
    const origin = frame.surfacePoint(0, 0, -R);
    const axis = frame.surfacePoint(1, 0, -R).sub(origin).normalize();
    // Closure pole = origin + axis * (L + D), in world units.
    const pole = origin.clone().addScaledVector(axis, (L + D) * SCALE);

    const pos = mesh!.geometry.getAttribute('position');
    let nearest = Infinity;
    let maxPos = 0;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      nearest = Math.min(nearest, v.distanceTo(pole));
      maxPos = Math.max(maxPos, frame.toLocal(v).pos);
    }
    // A vertex lands on the pole within the 2 mm surface offset (world units).
    expect(nearest).toBeLessThan(0.02);
    // The maximal axial reach is the pole depth L + D (mm).
    expect(maxPos).toBeCloseTo(L + D, 0);
  });

  it('theta = 0 maps to the appendage datum (scan centre on the datum meridian)', () => {
    // centerTheta = 0 -> the tangent-plane scan centre projects onto the datum
    // (local angle 0), which resolveBodyFrame defines as the main +axis projection.
    const basis = buildDomeTangentBasis(R, D, 45, 0);
    const centre = tangentOffsetsToSurface(basis, R, D, L, 'right', 0, 0);
    expect(Math.cos((centre.angle * Math.PI) / 180)).toBeCloseTo(1, 6);
  });

  it('vertices invert through the body frame to the dome-tangent forward map', () => {
    const vessel = appendageVessel();
    const config = appendageScan({
      centerPhi: 35,
      centerTheta: 120,
      xAxis: Array.from({ length: 10 }, (_, i) => i * 20), // range 180
      yAxis: Array.from({ length: 10 }, (_, i) => i * 20),
    });
    const mesh = createDomeScanPlane(config, vessel, '');
    expect(mesh).not.toBeNull();

    const pos = mesh!.geometry.getAttribute('position');
    const frame = resolveBodyFrame(vessel, 'app-1');
    const basis = buildDomeTangentBasis(R, D, config.centerPhi, config.centerTheta);
    const scanRange = Math.abs(config.xAxis[config.xAxis.length - 1] - config.xAxis[0]);
    const indexRange = Math.abs(config.yAxis[config.yAxis.length - 1] - config.yAxis[0]);
    const read = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));

    // First corner (u=0, v=0): scanMm = -range/2, indexMm = -range/2.
    const first = frame.toLocal(read(0));
    const fwdFirst = tangentOffsetsToSurface(basis, R, D, L, 'right', -scanRange / 2, -indexRange / 2);
    expect(fwdFirst.pos).toBeCloseTo(first.pos, 3);
    expect(Math.cos(((fwdFirst.angle - first.angle) * Math.PI) / 180)).toBeCloseTo(1, 4);

    // Last corner (u=1, v=1): scanMm = +range/2, indexMm = +range/2.
    const last = frame.toLocal(read(pos.count - 1));
    const fwdLast = tangentOffsetsToSurface(basis, R, D, L, 'right', scanRange / 2, indexRange / 2);
    expect(fwdLast.pos).toBeCloseTo(last.pos, 3);
    expect(Math.cos(((fwdLast.angle - last.angle) * Math.PI) / 180)).toBeCloseTo(1, 4);
  });
});
