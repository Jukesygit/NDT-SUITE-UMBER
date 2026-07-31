// =============================================================================
// appendage-rect-geometry — coverage-rect overlay on an appendage (Phase 4 §4)
// =============================================================================
// The outline/fill are sampled straight from the appendage SurfaceFrame: every
// vertex sits on the appendage cylinder at the standoff, the outline's first
// corner lands at (posLo, angLo), and pos is clamped to the cylinder span.
// =============================================================================

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type CoverageRectConfig,
  type VesselState,
} from '../../types';
import {
  createAppendageRectOutline,
  createAppendageRectFill,
} from '../appendage-rect-geometry';
import { resolveBodyFrame } from '../body-frame';
import { SCALE } from '../materials';

const sump: AppendageConfig = {
  id: 'app-1',
  name: 'Sump',
  mountPos: 3000,
  mountAngle: 270,
  diameter: 1000, // radius 500
  length: 1500,
  endClosure: 'flat',
};

function makeState(): VesselState {
  return { ...DEFAULT_VESSEL_STATE, id: 3000, length: 6000, appendages: [sump] };
}

function rect(overrides: Partial<CoverageRectConfig> = {}): CoverageRectConfig {
  return {
    id: 1,
    name: 'C1',
    pos: 600,
    angle: 30,
    width: 400,
    height: 300,
    color: '#00cc66',
    lineWidth: 2,
    filled: true,
    fillOpacity: 0.2,
    bodyId: 'app-1',
    ...overrides,
  };
}

/** Perpendicular distance (world units) of a point from the appendage axis line. */
function axisDistance(v: THREE.Vector3, origin: THREE.Vector3, axis: THREE.Vector3): number {
  const rel = v.clone().sub(origin);
  const along = rel.dot(axis);
  return rel.addScaledVector(axis, -along).length();
}

describe('appendage coverage-rect geometry', () => {
  const state = makeState();
  const frame = resolveBodyFrame(state, 'app-1');
  const origin = frame.surfacePoint(0, 0, -frame.radius);
  const axis = frame.surfacePoint(1, 0, -frame.radius).sub(origin).normalize();

  it('outline: first corner lands at (posLo, angLo) on the standoff surface', () => {
    const r = rect();
    const surfaceOffset = 4;
    const circumference = 2 * Math.PI * frame.radius;
    const posLo = r.pos - r.width / 2; // 400, within [0, length]
    const angHalfSpan = (r.height / 2 / circumference) * 360;
    const angLo = r.angle - angHalfSpan;

    const outline = createAppendageRectOutline(r, state, surfaceOffset);
    const pos = outline.geometry.getAttribute('position');
    const first = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0));
    expect(first.distanceTo(frame.surfacePoint(posLo, angLo, surfaceOffset))).toBeLessThan(1e-6);
  });

  it('fill: every vertex lies on the appendage cylinder at the fill standoff', () => {
    const surfaceOffset = 4;
    const fillRadial = (frame.radius + (surfaceOffset - 0.5)) * SCALE;
    const fill = createAppendageRectFill(rect(), state, surfaceOffset);
    const pos = fill.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      expect(axisDistance(v, origin, axis)).toBeCloseTo(fillRadial, 4);
    }
  });

  it('clamps pos so the patch never leaves the cylinder span [0, length]', () => {
    // A rect centred past the far end: posHi clamps to length, posLo clamps too.
    const r = rect({ pos: 3000, width: 400 });
    const outline = createAppendageRectOutline(r, state, 4);
    const posAttr = outline.geometry.getAttribute('position');
    // The whole outline collapses onto the end ring (posLo=posHi=length) — every
    // vertex is at axial coordinate = length along the body axis.
    for (let i = 0; i < posAttr.count; i++) {
      const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      const along = v.clone().sub(origin).dot(axis) / SCALE;
      expect(along).toBeCloseTo(frame.axialLength, 3);
    }
  });
});
