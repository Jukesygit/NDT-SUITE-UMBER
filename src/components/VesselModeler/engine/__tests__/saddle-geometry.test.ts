import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import type { SaddleConfig, VesselState } from '../../types';
import { DEFAULT_VESSEL_STATE } from '../../types';
import { createSaddleGroup, DEFAULT_SADDLE_DEPTH } from '../saddle-geometry';
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
