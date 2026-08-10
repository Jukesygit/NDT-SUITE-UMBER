import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import type { Orientation, VesselState } from '../../types';
import { DEFAULT_VESSEL_STATE } from '../../types';
import { shellPoint } from '../annotation-geometry';
import { buildAppendageFrame, resolveBodyFrame, type AppendageFrameParams } from '../body-frame';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DEG2RAD = Math.PI / 180;

// id=3000 (RADIUS 1500), headRatio 2 => HEAD_DEPTH 750, L 8000.
const RADIUS = 1500;
const HEAD_DEPTH = 750;
const LENGTH = 8000;

function makeState(orientation: Orientation): VesselState {
  return {
    ...DEFAULT_VESSEL_STATE,
    id: RADIUS * 2,
    length: LENGTH,
    headRatio: 2.0,
    orientation,
  };
}

/** Sample grid from the task card. */
const GRID_POS = [-HEAD_DEPTH / 2, 0, LENGTH / 4, LENGTH / 2, LENGTH, LENGTH + HEAD_DEPTH / 2];
const GRID_ANGLE = [0, 45, 90, 180, 270];
const ORIENTATIONS: Orientation[] = ['horizontal', 'vertical'];

/** Radial-from-axis direction of a world point (unnormalized). */
function radialFromAxis(orientation: Orientation, p: THREE.Vector3): THREE.Vector3 {
  return orientation === 'vertical'
    ? new THREE.Vector3(p.x, 0, p.z)
    : new THREE.Vector3(0, p.y, p.z);
}

// ---------------------------------------------------------------------------
// (a) Main-shell equivalence vs legacy shellPoint
// ---------------------------------------------------------------------------

describe('main frame surfacePoint === legacy shellPoint', () => {
  for (const orientation of ORIENTATIONS) {
    for (const offset of [0, 5]) {
      it(`matches across the pos/angle grid (${orientation}, offset ${offset})`, () => {
        const state = makeState(orientation);
        const frame = resolveBodyFrame(state);
        for (const pos of GRID_POS) {
          for (const angleDeg of GRID_ANGLE) {
            const got = frame.surfacePoint(pos, angleDeg, offset);
            const expected = shellPoint(pos, angleDeg * DEG2RAD, state, offset);
            expect(Math.abs(got.x - expected.x)).toBeLessThan(1e-9);
            expect(Math.abs(got.y - expected.y)).toBeLessThan(1e-9);
            expect(Math.abs(got.z - expected.z)).toBeLessThan(1e-9);
          }
        }
      });
    }
  }

  it('exposes the body dimensions on the frame', () => {
    const frame = resolveBodyFrame(makeState('horizontal'));
    expect(frame.bodyId).toBeUndefined();
    expect(frame.kind).toBe('main');
    expect(frame.radius).toBe(RADIUS);
    expect(frame.axialLength).toBe(LENGTH);
    expect(frame.headDepth).toBeCloseTo(HEAD_DEPTH, 9);
  });
});

// ---------------------------------------------------------------------------
// (b) Round-trip toLocal(surfacePoint(p,a)) ~= (p,a)
// ---------------------------------------------------------------------------

describe('main frame toLocal round-trip (cylinder region)', () => {
  const cylPos = [0, LENGTH / 4, LENGTH / 2, LENGTH];
  for (const orientation of ORIENTATIONS) {
    it(`recovers (pos, angle) for ${orientation}`, () => {
      const frame = resolveBodyFrame(makeState(orientation));
      for (const pos of cylPos) {
        for (const angleDeg of GRID_ANGLE) {
          const world = frame.surfacePoint(pos, angleDeg);
          const local = frame.toLocal(world);
          expect(Math.abs(local.pos - pos)).toBeLessThan(1e-6);
          expect(Math.abs(local.angle - angleDeg)).toBeLessThan(1e-6);
        }
      }
    });
  }
});

describe('appendage frame toLocal round-trip', () => {
  const params: AppendageFrameParams = {
    mountPos: LENGTH / 2,
    mountAngle: 270,
    diameter: 600,
    length: 1000,
    endClosure: 'flat',
  };
  const posAlong = [0, 250, 500, 1000];

  for (const orientation of ORIENTATIONS) {
    it(`recovers (pos, angle) for a sump on a ${orientation} vessel`, () => {
      const frame = buildAppendageFrame(makeState(orientation), params, 'app-1');
      expect(frame.kind).toBe('appendage');
      expect(frame.bodyId).toBe('app-1');
      expect(frame.radius).toBe(300);
      expect(frame.axialLength).toBe(1000);
      for (const pos of posAlong) {
        for (const angleDeg of GRID_ANGLE) {
          const world = frame.surfacePoint(pos, angleDeg);
          const local = frame.toLocal(world);
          expect(Math.abs(local.pos - pos)).toBeLessThan(1e-6);
          expect(Math.abs(local.angle - angleDeg)).toBeLessThan(1e-6);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// (c) Appendage datum convention: local 0° parallel to main +axis
// ---------------------------------------------------------------------------

describe('appendage datum (local 0° = main +axis projection)', () => {
  function datumDir(state: VesselState, mountAngle: number): THREE.Vector3 {
    const frame = buildAppendageFrame(state, {
      mountPos: LENGTH / 2,
      mountAngle,
      diameter: 600,
      length: 1000,
      endClosure: 'flat',
    });
    // local 0° direction is the outward radial at angle 0
    return frame.surfaceNormal(0, 0);
  }

  it('bottom sump on a horizontal vessel: 0° faces the right tangent (+X)', () => {
    const dir = datumDir(makeState('horizontal'), 270);
    expect(dir.x).toBeCloseTo(1, 9);
    expect(dir.y).toBeCloseTo(0, 9);
    expect(dir.z).toBeCloseTo(0, 9);
  });

  it('is parallel to +X for any cylinder mount angle on a horizontal vessel', () => {
    const mainAxis = new THREE.Vector3(1, 0, 0);
    for (const mountAngle of [0, 45, 90, 180, 270]) {
      const dir = datumDir(makeState('horizontal'), mountAngle);
      expect(dir.length()).toBeCloseTo(1, 9);
      // parallel: |cross| ~ 0 and same sense
      expect(dir.clone().cross(mainAxis).length()).toBeLessThan(1e-9);
      expect(dir.dot(mainAxis)).toBeGreaterThan(0);
    }
  });

  it('is parallel to +Y (main +axis) for a side mount on a vertical vessel', () => {
    const dir = datumDir(makeState('vertical'), 0);
    const mainAxis = new THREE.Vector3(0, 1, 0);
    expect(dir.clone().cross(mainAxis).length()).toBeLessThan(1e-9);
    expect(dir.dot(mainAxis)).toBeGreaterThan(0);
  });

  it('handedness: 90° = datum × normal ⇒ clockwise viewed from outside the closure', () => {
    // For a bottom sump (N = -Y, datum = +X) handedness E must be +X × N = (0,0,-1).
    const frame = buildAppendageFrame(makeState('horizontal'), {
      mountPos: LENGTH / 2,
      mountAngle: 270,
      diameter: 600,
      length: 1000,
      endClosure: 'flat',
    });
    const dir90 = frame.surfaceNormal(0, 90);
    expect(dir90.x).toBeCloseTo(0, 9);
    expect(dir90.y).toBeCloseTo(0, 9);
    expect(dir90.z).toBeCloseTo(-1, 9);
  });
});

// ---------------------------------------------------------------------------
// (d) surfaceNormal unit-length and outward
// ---------------------------------------------------------------------------

describe('main frame surfaceNormal is unit-length and outward', () => {
  for (const orientation of ORIENTATIONS) {
    it(`holds across the grid (${orientation})`, () => {
      const frame = resolveBodyFrame(makeState(orientation));
      for (const pos of GRID_POS) {
        for (const angleDeg of GRID_ANGLE) {
          const n = frame.surfaceNormal(pos, angleDeg);
          expect(n.length()).toBeCloseTo(1, 9);
          const p = frame.surfacePoint(pos, angleDeg);
          // outward = same hemisphere as the radial-from-axis direction
          expect(n.dot(radialFromAxis(orientation, p))).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe('appendage frame surfaceNormal is unit-length and outward', () => {
  const params: AppendageFrameParams = {
    mountPos: LENGTH / 2,
    mountAngle: 270,
    diameter: 600,
    length: 1000,
    endClosure: 'dished',
    headRatio: 2.0,
  };

  it('points radially outward from the appendage axis', () => {
    const frame = buildAppendageFrame(makeState('horizontal'), params);
    const eps = 1;
    for (const pos of [0, 500, 1000]) {
      for (const angleDeg of GRID_ANGLE) {
        const n = frame.surfaceNormal(pos, angleDeg);
        expect(n.length()).toBeCloseTo(1, 9);
        // outward: surface moves along +normal as the radial offset grows
        const outward = frame
          .surfacePoint(pos, angleDeg, eps)
          .sub(frame.surfacePoint(pos, angleDeg, 0));
        expect(n.dot(outward)).toBeGreaterThan(0);
      }
    }
  });

  it('reports a dished head depth and flat/open closures as zero depth', () => {
    const dished = buildAppendageFrame(makeState('horizontal'), params);
    expect(dished.headDepth).toBeCloseTo(600 / (2 * 2.0), 9);
    const flat = buildAppendageFrame(makeState('horizontal'), { ...params, endClosure: 'flat' });
    expect(flat.headDepth).toBe(0);
    const open = buildAppendageFrame(makeState('horizontal'), { ...params, endClosure: 'open' });
    expect(open.headDepth).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveBodyFrame error path
// ---------------------------------------------------------------------------

describe('resolveBodyFrame', () => {
  it('throws for an unknown appendage id (no appendages in Phase 0 state)', () => {
    expect(() => resolveBodyFrame(makeState('horizontal'), 'app-missing')).toThrow(
      /no appendage body/
    );
  });
});
