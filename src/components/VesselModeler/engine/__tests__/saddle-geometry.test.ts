import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import type { SaddleConfig, VesselState } from '../../types';
import { DEFAULT_VESSEL_STATE } from '../../types';
import { createSaddleGroup, deserializeSaddle, DEFAULT_SADDLE_DEPTH } from '../saddle-geometry';
import { SCALE } from '../materials';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeVesselState(): VesselState {
  return { ...DEFAULT_VESSEL_STATE, id: 2000, length: 8000, saddles: [] };
}

/** Axial (X) extent of a saddle group in world units. */
function axialWidth(saddle: SaddleConfig): number {
  const mat = new THREE.MeshBasicMaterial();
  const group = createSaddleGroup(saddle, 0, makeVesselState(), false, mat, mat);
  const box = new THREE.Box3().setFromObject(group);
  return box.max.x - box.min.x;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSaddleGroup depth', () => {
  it('uses the default depth when none is specified', () => {
    expect(axialWidth({ pos: 1500 })).toBeCloseTo(DEFAULT_SADDLE_DEPTH * SCALE, 5);
  });

  it('drives the saddle axial width from the configured depth', () => {
    expect(axialWidth({ pos: 1500, depth: 800 })).toBeCloseTo(800 * SCALE, 5);
  });

  it('makes deeper supports wider along the vessel axis', () => {
    expect(axialWidth({ pos: 1500, depth: 600 })).toBeGreaterThan(
      axialWidth({ pos: 1500, depth: 300 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Wear / reinforcement plate
// ---------------------------------------------------------------------------

const mat = new THREE.MeshBasicMaterial();

function buildSaddle(saddle: SaddleConfig): THREE.Group {
  return createSaddleGroup(saddle, 0, makeVesselState(), false, mat, mat);
}

function findPart(group: THREE.Group, part: string): THREE.Object3D | undefined {
  return group.children.find((c) => c.userData?.part === part);
}

describe('createSaddleGroup wear plate', () => {
  it('omits the wear plate by default (legacy saddles unchanged)', () => {
    const group = buildSaddle({ pos: 1500 });
    expect(findPart(group, 'wearPlate')).toBeUndefined();
  });

  it('adds a wear plate mesh when enabled', () => {
    const group = buildSaddle({ pos: 1500, wearPlate: true });
    expect(findPart(group, 'wearPlate')).toBeDefined();
  });

  it('overhangs the cradle both axially and circumferentially', () => {
    const group = buildSaddle({
      pos: 1500,
      depth: 400,
      wearPlate: true,
      wearPlateAxialOverhang: 50,
      wearPlateArcOverhang: 6,
    });
    const cradle = findPart(group, 'cradle')!;
    const plate = findPart(group, 'wearPlate')!;
    const cb = new THREE.Box3().setFromObject(cradle);
    const pb = new THREE.Box3().setFromObject(plate);

    // Axial (X): plate extends past the cradle on both ends.
    expect(pb.max.x - pb.min.x).toBeGreaterThan(cb.max.x - cb.min.x);
    // Circumferential (Z): plate horns wrap wider than the cradle.
    expect(pb.max.z - pb.min.z).toBeGreaterThan(cb.max.z - cb.min.z);
  });

  it('shifts the cradle outward by the wear plate thickness', () => {
    const withoutPlate = findPart(buildSaddle({ pos: 1500 }), 'cradle')!;
    const withPlate = findPart(
      buildSaddle({ pos: 1500, wearPlate: true, wearPlateThickness: 12 }),
      'cradle',
    )!;
    const bWithout = new THREE.Box3().setFromObject(withoutPlate);
    const bWith = new THREE.Box3().setFromObject(withPlate);

    // Cradle bottom drops by ~ plate thickness so it rests on the plate.
    expect(bWithout.min.y - bWith.min.y).toBeCloseTo(12 * SCALE, 5);
  });
});

// ---------------------------------------------------------------------------
// deserializeSaddle — normalise a raw (loaded/imported) saddle record.
// ---------------------------------------------------------------------------

describe('deserializeSaddle', () => {
  it('expands a legacy numeric saddle into a positioned config', () => {
    expect(deserializeSaddle(1500)).toMatchObject({ pos: 1500, color: '#2244ff' });
  });

  it('preserves pos, height, and depth on an object saddle', () => {
    const s = deserializeSaddle({ pos: 2000, color: '#abc', height: 1100, depth: 600 });
    expect(s).toMatchObject({ pos: 2000, color: '#abc', height: 1100, depth: 600 });
  });

  it('round-trips the wear plate fields', () => {
    const s = deserializeSaddle({
      pos: 2000,
      wearPlate: true,
      wearPlateThickness: 16,
      wearPlateArcOverhang: 8,
      wearPlateAxialOverhang: 75,
    });
    expect(s).toMatchObject({
      wearPlate: true,
      wearPlateThickness: 16,
      wearPlateArcOverhang: 8,
      wearPlateAxialOverhang: 75,
    });
  });

  it('leaves the wear plate undefined for legacy saddles (renders off)', () => {
    expect(deserializeSaddle({ pos: 1500 }).wearPlate).toBeUndefined();
  });
});
