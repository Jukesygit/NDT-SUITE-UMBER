import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { frameEntityPose } from '../frame-entity';
import { resolveBodyFrame } from '../body-frame';
import { DEFAULT_VESSEL_STATE, type VesselState } from '../../types';

// C14 — pure entity framing. Verifies each entity type yields a sensible pose,
// unresolvable refs return null, and boot-mounted entities anchor via the boot's
// SurfaceFrame (never a hand-rolled pos/angle→world path).

function camera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(45, 16 / 10, 0.1, 1000);
}

function expectVecClose(a: THREE.Vector3, b: THREE.Vector3): void {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
  expect(a.z).toBeCloseTo(b.z, 6);
}

/** Vessel with a boot (app-1), a boot-mounted nozzle + weld, and main entities. */
function makeVessel(overrides: Partial<VesselState> = {}): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: 3000,
    length: 8000,
    headRatio: 2.0,
    orientation: 'horizontal',
    appendages: [
      {
        id: 'app-1',
        name: 'Boot 1',
        mountPos: 4000,
        mountAngle: 270,
        diameter: 800,
        length: 1200,
        endClosure: 'dished',
        headRatio: 2.0,
      },
    ],
    nozzles: [
      { id: 'noz-1', name: 'N1', pos: 1000, proj: 200, angle: 90, size: 200 },
      { id: 'noz-2', name: 'N2', pos: 300, proj: 150, angle: 45, size: 150, bodyId: 'app-1' },
    ],
    liftingLugs: [{ name: 'L1', pos: 2000, angle: 90, style: 'padEye', swl: '5t' }],
    saddles: [{ pos: 1500 }],
    welds: [
      { name: 'W-boot', type: 'longitudinal', pos: 400, angle: 30, color: '#888', bodyId: 'app-1' },
    ],
    annotations: [
      {
        id: 1,
        name: 'A1',
        type: 'scan',
        pos: 3000,
        angle: 120,
        width: 300,
        height: 200,
        color: '#f00',
        lineWidth: 2,
        showLabel: true,
      },
    ],
    rulers: [
      { id: 4, name: 'R1', startPos: 500, startAngle: 90, endPos: 1500, endAngle: 90, color: '#fff', showLabel: true },
    ],
    domeScanComposites: [
      {
        id: 'ds-1',
        name: 'D1',
        head: 'right',
        centerPhi: 30,
        centerTheta: 0,
        scanDirection: 'cw',
        indexDirection: 'outward',
        orientationConfirmed: true,
        data: [],
        xAxis: [],
        yAxis: [],
        stats: { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
        colorScale: 'Jet',
        rangeMin: null,
        rangeMax: null,
        opacity: 1,
      },
    ],
    pipelines: [{ id: 'p-1', nozzleId: 'noz-1', pipeDiameter: 200, segments: [] }],
    ...overrides,
  };
}

describe('frameEntityPose', () => {
  it('frames a main-shell nozzle (non-degenerate pose)', () => {
    const state = makeVessel();
    const pose = frameEntityPose({ type: 'nozzle', index: 0 }, state, camera());
    expect(pose).not.toBeNull();
    expect(pose!.position.distanceTo(pose!.target)).toBeGreaterThan(0);
  });

  it('anchors a boot-mounted nozzle on the boot SurfaceFrame', () => {
    const state = makeVessel();
    const pose = frameEntityPose({ type: 'nozzle', index: 1 }, state, camera())!;
    const expected = resolveBodyFrame(state, 'app-1').surfacePoint(300, 45, 0);
    expectVecClose(pose.target, expected);
  });

  it('anchors a boot-mounted weld on the boot SurfaceFrame at its angle', () => {
    const state = makeVessel();
    const pose = frameEntityPose({ type: 'weld', index: 0 }, state, camera())!;
    const expected = resolveBodyFrame(state, 'app-1').surfacePoint(400, 30, 0);
    expectVecClose(pose.target, expected);
  });

  it('anchors a main-shell annotation on the main frame (== shellPoint)', () => {
    const state = makeVessel();
    const pose = frameEntityPose({ type: 'annotation', id: 1 }, state, camera())!;
    const expected = resolveBodyFrame(state, undefined).surfacePoint(3000, 120, 0);
    expectVecClose(pose.target, expected);
  });

  it('anchors a saddle on the underside (270°)', () => {
    const state = makeVessel();
    const pose = frameEntityPose({ type: 'saddle', index: 0 }, state, camera())!;
    const expected = resolveBodyFrame(state, undefined).surfacePoint(1500, 270, 0);
    expectVecClose(pose.target, expected);
  });

  it('anchors a lug and a ruler on the main frame', () => {
    const state = makeVessel();
    const lug = frameEntityPose({ type: 'lug', index: 0 }, state, camera())!;
    expectVecClose(lug.target, resolveBodyFrame(state, undefined).surfacePoint(2000, 90, 0));
    const ruler = frameEntityPose({ type: 'ruler', id: 4 }, state, camera())!;
    expectVecClose(ruler.target, resolveBodyFrame(state, undefined).surfacePoint(500, 90, 0));
  });

  it('frames a dome scan and a nozzle-attached pipeline', () => {
    const state = makeVessel();
    expect(frameEntityPose({ type: 'domeScan', id: 'ds-1' }, state, camera())).not.toBeNull();
    expect(frameEntityPose({ type: 'pipeline', id: 'p-1' }, state, camera())).not.toBeNull();
  });

  it('returns null for unresolvable refs', () => {
    const state = makeVessel();
    expect(frameEntityPose({ type: 'nozzle', index: 99 }, state, camera())).toBeNull();
    expect(frameEntityPose({ type: 'annotation', id: 999 }, state, camera())).toBeNull();
    expect(frameEntityPose({ type: 'scanComposite', id: 'nope' }, state, camera())).toBeNull();
  });
});
