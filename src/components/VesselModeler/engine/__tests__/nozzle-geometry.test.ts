import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import { rotateNormalAboutVertical } from '../nozzle-geometry';

// ---------------------------------------------------------------------------
// rotateNormalAboutVertical — yaw a surface normal about the world +Y axis.
// Used so a dome-end nozzle can be stepped (90° at a time) to point straight
// out the end instead of sideways.
// ---------------------------------------------------------------------------

describe('rotateNormalAboutVertical', () => {
  it('turns +Z into +X at 90°', () => {
    const n = rotateNormalAboutVertical(new THREE.Vector3(0, 0, 1), 90);
    expect(n.x).toBeCloseTo(1, 6);
    expect(n.y).toBeCloseTo(0, 6);
    expect(n.z).toBeCloseTo(0, 6);
  });

  it('turns +Z into -X at 270°', () => {
    const n = rotateNormalAboutVertical(new THREE.Vector3(0, 0, 1), 270);
    expect(n.x).toBeCloseTo(-1, 6);
    expect(n.y).toBeCloseTo(0, 6);
    expect(n.z).toBeCloseTo(0, 6);
  });

  it('turns +Z into -Z at 180°', () => {
    const n = rotateNormalAboutVertical(new THREE.Vector3(0, 0, 1), 180);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(0, 6);
    expect(n.z).toBeCloseTo(-1, 6);
  });

  it('leaves the normal unchanged at 0°', () => {
    const n = rotateNormalAboutVertical(new THREE.Vector3(0, 0, 1), 0);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(0, 6);
    expect(n.z).toBeCloseTo(1, 6);
  });

  it('normalises negative and >360 angles (−90° === 270°)', () => {
    const n = rotateNormalAboutVertical(new THREE.Vector3(0, 0, 1), -90);
    expect(n.x).toBeCloseTo(-1, 6);
    expect(n.z).toBeCloseTo(0, 6);
  });

  it('leaves a vertical (Y-parallel) normal unchanged at any angle', () => {
    const up = rotateNormalAboutVertical(new THREE.Vector3(0, 1, 0), 90);
    expect(up.x).toBeCloseTo(0, 6);
    expect(up.y).toBeCloseTo(1, 6);
    expect(up.z).toBeCloseTo(0, 6);

    const down = rotateNormalAboutVertical(new THREE.Vector3(0, -1, 0), 180);
    expect(down.x).toBeCloseTo(0, 6);
    expect(down.y).toBeCloseTo(-1, 6);
    expect(down.z).toBeCloseTo(0, 6);
  });
});
