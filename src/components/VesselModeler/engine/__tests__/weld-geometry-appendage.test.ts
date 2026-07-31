// =============================================================================
// weld-geometry — appendage welds (Phase 4 §1)
// =============================================================================
// A weld carrying `bodyId` is built on the appendage cylinder via that body's
// SurfaceFrame: circ welds are bead rings centred on the appendage axis, long
// welds are strips sampled along the axis at the datum angle. A weld with no
// bodyId keeps the byte-identical legacy main-shell geometry (golden).
// =============================================================================

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type VesselState,
  type WeldConfig,
} from '../../types';
import { createWeldGeometry } from '../weld-geometry';
import { resolveBodyFrame } from '../body-frame';
import { SCALE } from '../materials';

const sump: AppendageConfig = {
  id: 'app-1',
  name: 'Sump',
  mountPos: 3000,
  mountAngle: 270,
  diameter: 1000,
  length: 1500,
  endClosure: 'flat',
};

function makeState(): VesselState {
  return { ...DEFAULT_VESSEL_STATE, id: 3000, length: 6000, appendages: [sump] };
}

const mat = () => new THREE.MeshStandardMaterial();

/** First Mesh descendant of a group. */
function firstMesh(group: THREE.Object3D): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  group.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  if (!found) throw new Error('no mesh in group');
  return found;
}

describe('createWeldGeometry — legacy main-shell path (golden, no bodyId)', () => {
  it('circumferential weld: torus ring radius = shell radius, positioned axially', () => {
    const state = makeState();
    const weld: WeldConfig = { name: 'W', type: 'circumferential', pos: 1000, color: '#888' };
    const group = createWeldGeometry(weld, state, mat());

    const torus = firstMesh(group).geometry as THREE.TorusGeometry;
    expect(torus.parameters.radius).toBeCloseTo((state.id / 2) * SCALE, 6);
    // Horizontal vessel: group sits at the axial offset on X.
    expect(group.position.x).toBeCloseTo((1000 - state.length / 2) * SCALE, 6);
    expect(group.position.y).toBeCloseTo(0, 6);
  });

  it('longitudinal weld builds a strip mesh with vertices', () => {
    const state = makeState();
    const weld: WeldConfig = {
      name: 'LW',
      type: 'longitudinal',
      pos: 500,
      endPos: 3000,
      angle: 90,
      color: '#888',
    };
    const group = createWeldGeometry(weld, state, mat());
    const geom = firstMesh(group).geometry;
    expect(geom.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('createWeldGeometry — appendage welds (bodyId set)', () => {
  it('circ weld: ring radius = appendage radius, centred at pos along the body axis', () => {
    const state = makeState();
    const frame = resolveBodyFrame(state, 'app-1');
    const weld: WeldConfig = {
      name: 'W',
      type: 'circumferential',
      pos: 600,
      color: '#888',
      bodyId: 'app-1',
    };
    const group = createWeldGeometry(weld, state, mat());

    // Ring radius equals the appendage radius, not the main shell.
    const torus = firstMesh(group).geometry as THREE.TorusGeometry;
    expect(torus.parameters.radius).toBeCloseTo(frame.radius * SCALE, 6);

    // Group centre = origin + pos·axis (recovered from the frame the same way the
    // builder does), so the ring sits at pos mm along the appendage axis.
    const origin = frame.surfacePoint(0, 0, -frame.radius);
    const axis = frame.surfacePoint(1, 0, -frame.radius).sub(origin).normalize();
    const expected = origin.clone().addScaledVector(axis, 600 * SCALE);
    expect(group.position.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('circ weld clamps pos to the cylinder span [0, length]', () => {
    const state = makeState();
    const frame = resolveBodyFrame(state, 'app-1');
    const weld: WeldConfig = {
      name: 'W',
      type: 'circumferential',
      pos: 99999,
      color: '#888',
      bodyId: 'app-1',
    };
    const group = createWeldGeometry(weld, state, mat());
    const origin = frame.surfacePoint(0, 0, -frame.radius);
    const axis = frame.surfacePoint(1, 0, -frame.radius).sub(origin).normalize();
    const expected = origin.clone().addScaledVector(axis, frame.axialLength * SCALE);
    expect(group.position.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('long weld samples the appendage surface: crest vertex lands on the datum meridian', () => {
    const state = makeState();
    const frame = resolveBodyFrame(state, 'app-1');
    const beadRadiusMm = 8 / 2; // default cap width 8 → bead radius 4
    const weld: WeldConfig = {
      name: 'LW',
      type: 'longitudinal',
      pos: 200,
      endPos: 1200,
      angle: 45,
      color: '#888',
      bodyId: 'app-1',
    };
    const group = createWeldGeometry(weld, state, mat());
    const pos = firstMesh(group).geometry.getAttribute('position');

    // Vertex index 3 = (segment 0, profile point 3): u=0.5 → crest of the bead at
    // localHeight = beadRadius, zero circumferential offset → datum meridian.
    const v = new THREE.Vector3(pos.getX(3), pos.getY(3), pos.getZ(3));
    const expected = frame.surfacePoint(200, 45, beadRadiusMm);
    expect(v.distanceTo(expected)).toBeLessThan(1e-6);
  });
});
