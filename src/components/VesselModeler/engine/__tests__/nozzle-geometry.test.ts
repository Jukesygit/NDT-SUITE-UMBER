import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import type { NozzleConfig } from '../../types';
import { rotateNormalAboutVertical, deserializeNozzle, createFlangedNozzle } from '../nozzle-geometry';
import { SCALE } from '../materials';

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

// ---------------------------------------------------------------------------
// deserializeNozzle — normalise a raw (loaded/imported) nozzle record into a
// NozzleConfig. The key contract: an intentionally-blank name is preserved so
// that the nozzle renders without a label (a "building block" nozzle), instead
// of being coerced back to the "N" default on reload.
// ---------------------------------------------------------------------------

describe('deserializeNozzle', () => {
  it('retains an intentionally-blank name (does NOT coerce to "N")', () => {
    expect(deserializeNozzle({ name: '', pos: 100, size: 50 }).name).toBe('');
  });

  it('passes a real name through unchanged', () => {
    expect(deserializeNozzle({ name: 'N3' }).name).toBe('N3');
  });

  it('falls back to "N" when the name is missing or not a string', () => {
    expect(deserializeNozzle({ pos: 0 }).name).toBe('N');
    expect(deserializeNozzle({ name: null }).name).toBe('N');
    expect(deserializeNozzle({ name: 42 }).name).toBe('N');
  });

  it('applies numeric defaults for missing geometry fields', () => {
    const n = deserializeNozzle({ name: '' });
    expect(n.pos).toBe(0);
    expect(n.proj).toBe(200);
    expect(n.angle).toBe(90);
    expect(n.size).toBe(100);
  });

  it('preserves a 0 position rather than treating it as missing', () => {
    expect(deserializeNozzle({ name: 'N1', pos: 0 }).pos).toBe(0);
  });

  it('round-trips optional fields, including hideRepad', () => {
    const n = deserializeNozzle({
      name: 'N2',
      pos: 10,
      proj: 300,
      angle: 45,
      size: 80,
      orientationMode: 'vertical-up',
      azimuthRotation: 90,
      flangeOD: 200,
      flangeThk: 20,
      pipeOD: 150,
      style: 'flanged',
      hideRepad: true,
    });
    expect(n).toMatchObject({
      name: 'N2',
      pos: 10,
      proj: 300,
      angle: 45,
      size: 80,
      orientationMode: 'vertical-up',
      azimuthRotation: 90,
      flangeOD: 200,
      flangeThk: 20,
      pipeOD: 150,
      style: 'flanged',
      hideRepad: true,
    });
  });

  it('defaults the pad off and derives the weld neck from legacy hideRepad', () => {
    // Pad is opt-in → always off unless explicitly enabled.
    expect(deserializeNozzle({ hideRepad: true })).toMatchObject({
      showRepad: false,
      showWeldNeck: false,
    });
    expect(deserializeNozzle({ hideRepad: false })).toMatchObject({
      showRepad: false,
      showWeldNeck: true,
    });
    expect(deserializeNozzle({})).toMatchObject({
      showRepad: false,
      showWeldNeck: true,
    });
  });

  it('prefers explicit new flags over the legacy hideRepad', () => {
    const n = deserializeNozzle({ hideRepad: true, showRepad: true });
    expect(n.showRepad).toBe(true); // explicit wins
    expect(n.showWeldNeck).toBe(false); // still derived from hideRepad
  });

  it('round-trips repad dimension overrides', () => {
    const n = deserializeNozzle({ repadOD: 350, repadThickness: 14 });
    expect(n.repadOD).toBe(350);
    expect(n.repadThickness).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// createFlangedNozzle — reinforcing pad & weld neck
// ---------------------------------------------------------------------------

const mat = new THREE.MeshBasicMaterial();

function makeNozzle(overrides: Partial<NozzleConfig> = {}): NozzleConfig {
  return { name: 'N', pos: 0, proj: 300, angle: 90, size: 100, ...overrides };
}

function findPart(group: THREE.Group, part: string): THREE.Object3D | undefined {
  return group.children.find((c) => c.userData?.part === part);
}

describe('createFlangedNozzle reinforcing pad', () => {
  it('shows the weld neck but not the pad by default (pad is opt-in)', () => {
    const group = createFlangedNozzle(makeNozzle(), 1000, mat);
    expect(findPart(group, 'repad')).toBeUndefined();
    expect(findPart(group, 'weldNeck')).toBeDefined();
  });

  it('omits the pad but keeps the weld neck when showRepad is false', () => {
    const group = createFlangedNozzle(
      makeNozzle({ showRepad: false, showWeldNeck: true }),
      1000,
      mat,
    );
    expect(findPart(group, 'repad')).toBeUndefined();
    expect(findPart(group, 'weldNeck')).toBeDefined();
  });

  it('omits the weld neck but keeps the pad when showWeldNeck is false', () => {
    const group = createFlangedNozzle(
      makeNozzle({ showRepad: true, showWeldNeck: false }),
      1000,
      mat,
    );
    expect(findPart(group, 'repad')).toBeDefined();
    expect(findPart(group, 'weldNeck')).toBeUndefined();
  });

  it('hides both for a legacy hideRepad nozzle', () => {
    const group = createFlangedNozzle(makeNozzle({ hideRepad: true }), 1000, mat);
    expect(findPart(group, 'repad')).toBeUndefined();
    expect(findPart(group, 'weldNeck')).toBeUndefined();
  });

  it('bends the pad rim down to the shell radius', () => {
    const shellRadius = 1000; // mm
    const repadOD = 400; // mm
    const group = createFlangedNozzle(makeNozzle({ showRepad: true, repadOD }), shellRadius, mat);
    const pad = findPart(group, 'repad')!;
    const box = new THREE.Box3().setFromObject(pad);

    // The pad's lowest point is its rim, dropped by the shell-curvature sagitta.
    const R = shellRadius * SCALE;
    const rimRho = (repadOD / 2) * SCALE;
    const expectedDip = R - Math.sqrt(R * R - rimRho * rimRho);
    expect(box.min.y).toBeCloseTo(-expectedDip, 6);
  });
});
