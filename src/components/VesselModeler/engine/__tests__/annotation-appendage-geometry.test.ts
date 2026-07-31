// =============================================================================
// annotation-appendage-geometry — outlines render on the appendage surface
// =============================================================================
// Phase 4B: a bodyId-set annotation's outline vertices must lie on that
// appendage's surface as resolved by body-frame.ts — the cylinder for a
// cylinder rect, and the DISHED CLOSURE (radius curving in past the tangent
// line) for a closure-touching rect. A bodyId=undefined annotation is
// byte-identical to the legacy main-shell path (appendages present or not).
// =============================================================================

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import { DEFAULT_VESSEL_STATE, type AnnotationShapeConfig, type AppendageConfig, type VesselState } from '../../types';
import { createRectOutline } from '../annotation-geometry';
import { resolveBodyFrame } from '../body-frame';
import { SCALE } from '../materials';

// Dished appendage: R 400, D 200 (headRatio 2), cylinder L 1200.
const APP_R = 400;
const APP_D = 200;
const APP_L = 1200;

const appendage: AppendageConfig = {
  id: 'app1',
  name: 'Sump',
  mountPos: DEFAULT_VESSEL_STATE.length / 2,
  mountAngle: 270,
  diameter: 2 * APP_R,
  length: APP_L,
  endClosure: 'dished',
  headRatio: 2,
};

function stateWithAppendage(): VesselState {
  return { ...DEFAULT_VESSEL_STATE, appendages: [appendage] };
}

function makeAnn(over: Partial<AnnotationShapeConfig>): AnnotationShapeConfig {
  return {
    id: 1,
    name: 'A',
    type: 'scan',
    pos: APP_L / 2,
    angle: 90,
    width: 120,
    height: 90,
    color: '#ff0000',
    lineWidth: 1,
    showLabel: false,
    ...over,
  };
}

function outlineVerts(loop: THREE.LineLoop): THREE.Vector3[] {
  const pos = loop.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  return out;
}

const OFFSET = 3; // createAnnotationShape's standoff (mm)

describe('appendage annotation — outline lies on the body surface (frame round-trip)', () => {
  const state = stateWithAppendage();
  const frame = resolveBodyFrame(state, 'app1');
  // Appendage axis from the frame's public API (mirrors the drape placement).
  const centerBase = frame.surfacePoint(0, 0, -APP_R);
  const axisN = frame.surfacePoint(1, 0, -APP_R).sub(centerBase).normalize();

  /** Radial distance (mm) of a world point from the appendage axis. */
  function radialMm(p: THREE.Vector3): number {
    const rel = p.clone().sub(centerBase);
    const axial = rel.dot(axisN);
    return rel.addScaledVector(axisN, -axial).length() / SCALE;
  }

  it('every cylinder-rect vertex sits at radius R+offset on the appendage cylinder', () => {
    const ann = makeAnn({ bodyId: 'app1', pos: APP_L / 2, width: 120, height: 90 });
    const verts = outlineVerts(createRectOutline(ann, state, OFFSET));
    expect(verts.length).toBeGreaterThan(0);
    for (const p of verts) {
      // On the body surface: frame.toLocal -> frame.surfacePoint round-trips exactly.
      const local = frame.toLocal(p);
      const back = frame.surfacePoint(local.pos, local.angle, OFFSET);
      expect(back.distanceTo(p)).toBeLessThan(1e-6);
      // On the CYLINDER: radius is the full R + standoff, axial within the body.
      expect(radialMm(p)).toBeCloseTo(APP_R + OFFSET, 3);
      expect(local.pos).toBeGreaterThan(0);
      expect(local.pos).toBeLessThan(APP_L);
    }
  });

  it('a closure-touching rect drapes onto the dished end (radius curves in past L)', () => {
    const ann = makeAnn({ bodyId: 'app1', pos: APP_L + 0.4 * APP_D, width: 260, height: 160 });
    const verts = outlineVerts(createRectOutline(ann, state, OFFSET));
    expect(verts.length).toBeGreaterThan(0);

    // Every vertex is on the frame surface (cylinder or closure).
    for (const p of verts) {
      const local = frame.toLocal(p);
      const back = frame.surfacePoint(local.pos, local.angle, OFFSET);
      expect(back.distanceTo(p)).toBeLessThan(1e-6);
    }

    // The drape reaches PAST the tangent line into the closure...
    const maxPos = Math.max(...verts.map((p) => frame.toLocal(p).pos));
    expect(maxPos).toBeGreaterThan(APP_L);
    // ...and there the radius curves inward (dished), so at least one vertex sits
    // well inside the cylinder radius — proof it lands on the closure, not floating
    // at cylinder radius (the pre-4B appendage-frame behaviour).
    const minRadius = Math.min(...verts.map(radialMm));
    expect(minRadius).toBeLessThan(APP_R - 1);
  });
});

describe('appendage annotation — bodyId undefined is byte-identical to the main shell', () => {
  it('a main-shell annotation renders identically whether or not appendages exist', () => {
    const ann = makeAnn({ bodyId: undefined, pos: DEFAULT_VESSEL_STATE.length / 2, width: 400, height: 300 });
    const withApp = outlineVerts(createRectOutline(ann, stateWithAppendage(), OFFSET));
    const noApp = outlineVerts(createRectOutline(ann, DEFAULT_VESSEL_STATE, OFFSET));
    expect(withApp.length).toBe(noApp.length);
    for (let i = 0; i < withApp.length; i++) {
      expect(withApp[i].x).toBe(noApp[i].x);
      expect(withApp[i].y).toBe(noApp[i].y);
      expect(withApp[i].z).toBe(noApp[i].z);
    }
  });
});
