// =============================================================================
// vessel-geometry — appendage nozzle placement
// =============================================================================
// Guards P2-T1: a nozzle carrying `bodyId` is placed on the appendage cylinder
// surface via that body's SurfaceFrame (design §5/§6), while a main-shell nozzle
// (bodyId undefined) stays on the exact legacy inline path. The built nozzle
// group's world position is asserted directly against resolveBodyFrame(...).
// =============================================================================

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type LiftingLugConfig,
  type NozzleConfig,
  type VesselState,
} from '../../types';
import { buildVesselScene } from '../vessel-geometry';
import { resolveBodyFrame } from '../body-frame';

const sump: AppendageConfig = {
  id: 'app-1',
  name: 'Sump',
  mountPos: 3000,
  mountAngle: 270,
  diameter: 1000,
  length: 1500,
  endClosure: 'dished',
  headRatio: 2,
};

function makeState(
  nozzles: NozzleConfig[],
  orientation: VesselState['orientation'] = 'horizontal'
): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: 3000,
    length: 6000,
    orientation,
    appendages: [sump],
    nozzles,
  };
}

/** Build the scene with a single throwaway material for every slot. */
function buildScene(state: VesselState) {
  const mat = new THREE.MeshBasicMaterial();
  return buildVesselScene(state, mat, mat, mat, mat, mat, mat, {}, -1, -1, -1, -1);
}

describe('buildVesselScene appendage nozzle placement', () => {
  it('places an appendage-mounted nozzle on the appendage surface via its body frame', () => {
    const state = makeState([
      { name: 'N-main', pos: 1000, proj: 200, angle: 90, size: 150 },
      { name: 'N-app', pos: 500, proj: 200, angle: 0, size: 100, bodyId: 'app-1' },
    ]);
    const { nozzleMeshes } = buildScene(state);
    const expected = resolveBodyFrame(state, 'app-1').surfacePoint(500, 0);
    expect(nozzleMeshes[1].position.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('holds for a vertical vessel too', () => {
    const state = makeState(
      [{ name: 'N-app', pos: 800, proj: 200, angle: 135, size: 100, bodyId: 'app-1' }],
      'vertical'
    );
    const { nozzleMeshes } = buildScene(state);
    const expected = resolveBodyFrame(state, 'app-1').surfacePoint(800, 135);
    expect(nozzleMeshes[0].position.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('clamps the appendage nozzle pos to the cylinder span [0, length]', () => {
    const state = makeState([
      { name: 'N-app', pos: 99999, proj: 200, angle: 45, size: 100, bodyId: 'app-1' },
    ]);
    const { nozzleMeshes } = buildScene(state);
    const frame = resolveBodyFrame(state, 'app-1');
    const expected = frame.surfacePoint(frame.axialLength, 45);
    expect(nozzleMeshes[0].position.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('leaves the main-shell nozzle on the exact legacy cylinder path', () => {
    const state = makeState([
      { name: 'N-main', pos: 1000, proj: 200, angle: 90, size: 150 },
      { name: 'N-app', pos: 500, proj: 200, angle: 0, size: 100, bodyId: 'app-1' },
    ]);
    const { nozzleMeshes } = buildScene(state);
    // On the cylinder region the legacy inline path equals the main-frame surface point.
    const expected = resolveBodyFrame(state).surfacePoint(1000, 90);
    expect(nozzleMeshes[0].position.distanceTo(expected)).toBeLessThan(1e-6);
  });
});

// ---------------------------------------------------------------------------
// Lifting lugs — same appendage placement contract as nozzles (Phase 4 §3).
// ---------------------------------------------------------------------------

function makeLugState(lugs: LiftingLugConfig[]): VesselState {
  return { ...DEFAULT_VESSEL_STATE, id: 3000, length: 6000, appendages: [sump], liftingLugs: lugs };
}

describe('buildVesselScene appendage lifting-lug placement', () => {
  it('places an appendage-mounted lug on the appendage surface via its body frame', () => {
    const state = makeLugState([
      { name: 'L-main', pos: 1000, angle: 90, style: 'padEye', swl: '5t' },
      { name: 'L-app', pos: 500, angle: 0, style: 'padEye', swl: '5t', bodyId: 'app-1' },
    ]);
    const { lugMeshes } = buildScene(state);
    const expected = resolveBodyFrame(state, 'app-1').surfacePoint(500, 0);
    expect(lugMeshes[1].position.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('clamps the appendage lug pos to the cylinder span [0, length]', () => {
    const state = makeLugState([
      { name: 'L-app', pos: 99999, angle: 30, style: 'trunnion', swl: '5t', bodyId: 'app-1' },
    ]);
    const { lugMeshes } = buildScene(state);
    const frame = resolveBodyFrame(state, 'app-1');
    const expected = frame.surfacePoint(frame.axialLength, 30);
    expect(lugMeshes[0].position.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('leaves a main-shell lug on the legacy cylinder path', () => {
    const state = makeLugState([{ name: 'L-main', pos: 1500, angle: 90, style: 'padEye', swl: '5t' }]);
    const { lugMeshes } = buildScene(state);
    const expected = resolveBodyFrame(state).surfacePoint(1500, 90);
    expect(lugMeshes[0].position.distanceTo(expected)).toBeLessThan(1e-6);
  });
});
