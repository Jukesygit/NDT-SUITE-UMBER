import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_VESSEL_STATE, type AppendageConfig, type VesselState } from '../../types';
import { buildAppendageGroup } from '../appendage-geometry';
import { resolveBodyFrame } from '../body-frame';

const appendage: AppendageConfig = {
  id: 'app-1',
  name: 'Sump',
  mountPos: 2400,
  mountAngle: 270,
  diameter: 900,
  length: 1400,
  endClosure: 'dished',
  headRatio: 2,
  flangeJoint: { show: true },
};

function makeState(orientation: VesselState['orientation'], mountAngle: number): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: 2400,
    length: 6000,
    orientation,
    appendages: [{ ...appendage, mountAngle }],
  };
}

function cylinderFrom(group: THREE.Group): THREE.Mesh {
  const cylinder = group.children.find(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.userData.part === 'shell'
  );
  if (!cylinder) throw new Error('appendage cylinder mesh was not built');
  return cylinder;
}

function closestVertexDistance(mesh: THREE.Mesh, expected: THREE.Vector3): number {
  mesh.updateWorldMatrix(true, false);
  const positions = mesh.geometry.getAttribute('position');
  let closest = Number.POSITIVE_INFINITY;
  const vertex = new THREE.Vector3();

  for (let index = 0; index < positions.count; index += 1) {
    vertex.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
    closest = Math.min(closest, vertex.distanceTo(expected));
  }

  return closest;
}

describe('buildAppendageGroup', () => {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    for (const mountAngle of [0, 90, 270]) {
      it(`aligns angle 0 to the frame datum (${orientation}, ${mountAngle} degrees)`, () => {
        const state = makeState(orientation, mountAngle);
        const group = buildAppendageGroup(
          state.appendages[0],
          state,
          new THREE.MeshBasicMaterial()
        );
        const cylinder = cylinderFrom(group);
        const expected = resolveBodyFrame(state, appendage.id).surfacePoint(appendage.length, 0);

        expect(closestVertexDistance(cylinder, expected)).toBeLessThan(1e-6);
      });
    }
  }

  it('tags every mesh with bodyId and marks the cylinder as shell geometry', () => {
    const state = makeState('horizontal', 270);
    const group = buildAppendageGroup(state.appendages[0], state, new THREE.MeshBasicMaterial());
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });

    expect(meshes.length).toBeGreaterThan(1);
    expect(meshes.every((mesh) => mesh.userData.bodyId === appendage.id)).toBe(true);
    expect(cylinderFrom(group).userData.isShell).toBe(true);
  });

  it('keeps hidden and locked appendages in the scene for cosmetic updates', () => {
    const state = makeState('horizontal', 270);
    state.appendages[0] = { ...state.appendages[0], visible: false, locked: true };
    const group = buildAppendageGroup(state.appendages[0], state, new THREE.MeshBasicMaterial());

    expect(group.visible).toBe(false);
    expect(group.userData.locked).toBe(true);
  });
});
