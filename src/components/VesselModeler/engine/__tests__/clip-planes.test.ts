import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_CLIP_CONFIG,
  buildClipPlanes,
  clipAxisDirection,
  type ClipConfig,
  type ClipMode,
} from '../clip-planes';
import { SCALE } from '../materials';
import { DEFAULT_VESSEL_STATE, type VesselState } from '../../types';

// C15 — pure clip-plane construction. Locks the plane normal + constant for
// every mode × orientation × flip × offset combination, so the section cut can
// never silently drift from the body-frame basis it mirrors.

function vessel(orientation: 'horizontal' | 'vertical'): VesselState {
  return { ...DEFAULT_VESSEL_STATE, id: 3000, length: 8000, headRatio: 2.0, orientation };
}

function cfg(overrides: Partial<ClipConfig> = {}): ClipConfig {
  return { ...DEFAULT_CLIP_CONFIG, enabled: true, ...overrides };
}

function expectNormal(plane: THREE.Plane, x: number, y: number, z: number): void {
  expect(plane.normal.x).toBe(x);
  expect(plane.normal.y).toBe(y);
  expect(plane.normal.z).toBe(z);
}

/** Expected world directions per mode × orientation (the body-frame basis). */
const DIRECTIONS: Record<
  ClipMode,
  { horizontal: [number, number, number]; vertical: [number, number, number] }
> = {
  transverse: { horizontal: [1, 0, 0], vertical: [0, 1, 0] },
  'longitudinal-h': { horizontal: [0, 1, 0], vertical: [0, 0, 1] },
  'longitudinal-v': { horizontal: [0, 0, 1], vertical: [1, 0, 0] },
};

const MODES: ClipMode[] = ['transverse', 'longitudinal-h', 'longitudinal-v'];
const ORIENTATIONS = ['horizontal', 'vertical'] as const;
const OFFSETS = [0, 500, -1250.5];

describe('clip-planes', () => {
  it('DEFAULT_CLIP_CONFIG is disabled, transverse, centred, unflipped, helper off', () => {
    expect(DEFAULT_CLIP_CONFIG).toEqual({
      enabled: false,
      mode: 'transverse',
      offsetMm: 0,
      flip: false,
      showHelper: false,
    });
  });

  it('returns no planes when disabled, whatever the rest of the config says', () => {
    for (const orientation of ORIENTATIONS) {
      for (const mode of MODES) {
        const planes = buildClipPlanes(
          { enabled: false, mode, offsetMm: 900, flip: true, showHelper: true },
          vessel(orientation)
        );
        expect(planes).toEqual([]);
      }
    }
  });

  it('builds exactly one plane when enabled', () => {
    for (const mode of MODES) {
      expect(buildClipPlanes(cfg({ mode }), vessel('horizontal'))).toHaveLength(1);
    }
  });

  it('normal and constant are exact for every mode × orientation × flip × offset', () => {
    for (const orientation of ORIENTATIONS) {
      const state = vessel(orientation);
      for (const mode of MODES) {
        const [dx, dy, dz] = DIRECTIONS[mode][orientation];
        for (const offsetMm of OFFSETS) {
          for (const flip of [false, true]) {
            const sign = flip ? -1 : 1;
            const [plane] = buildClipPlanes(cfg({ mode, offsetMm, flip }), state);

            // Normal points at the KEPT half; flip negates it.
            expectNormal(plane, sign * dx, sign * dy, sign * dz);

            // constant = -normal · coplanarPoint, with coplanarPoint = dir · offsetWorld.
            expect(plane.constant).toBe(-(sign * (offsetMm * SCALE)));
          }
        }
      }
    }
  });

  it('places the cut at offsetMm along the mode direction (signed distance = 0 there)', () => {
    for (const orientation of ORIENTATIONS) {
      const state = vessel(orientation);
      for (const mode of MODES) {
        const dir = clipAxisDirection(mode, state);
        const offsetMm = 750;
        const [plane] = buildClipPlanes(cfg({ mode, offsetMm }), state);
        const onPlane = dir.clone().multiplyScalar(offsetMm * SCALE);
        expect(plane.distanceToPoint(onPlane)).toBeCloseTo(0, 12);
      }
    }
  });

  it('keeps the +direction half by default and the -direction half when flipped', () => {
    for (const orientation of ORIENTATIONS) {
      const state = vessel(orientation);
      for (const mode of MODES) {
        const dir = clipAxisDirection(mode, state);
        // A point 1 m further along the direction than the cut.
        const beyond = dir.clone().multiplyScalar(1);

        const [kept] = buildClipPlanes(cfg({ mode }), state);
        // three.js discards signed distance < 0, so positive = visible.
        expect(kept.distanceToPoint(beyond)).toBeGreaterThan(0);

        const [flipped] = buildClipPlanes(cfg({ mode, flip: true }), state);
        expect(flipped.distanceToPoint(beyond)).toBeLessThan(0);
      }
    }
  });

  it('a plane at offset 0 in either longitudinal mode contains the vessel axis', () => {
    for (const orientation of ORIENTATIONS) {
      const state = vessel(orientation);
      const axis =
        orientation === 'vertical' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      for (const mode of ['longitudinal-h', 'longitudinal-v'] as const) {
        const [plane] = buildClipPlanes(cfg({ mode, offsetMm: 0 }), state);
        expect(plane.distanceToPoint(axis.clone().multiplyScalar(2))).toBeCloseTo(0, 12);
        expect(plane.distanceToPoint(axis.clone().multiplyScalar(-2))).toBeCloseTo(0, 12);
      }
    }
  });

  it('transverse offset moves the cut along the axis only', () => {
    const state = vessel('horizontal');
    const [plane] = buildClipPlanes(cfg({ mode: 'transverse', offsetMm: 2000 }), state);
    // 2000 mm from centre → world x = 2.
    expect(plane.constant).toBe(-2);
    expect(plane.distanceToPoint(new THREE.Vector3(2, 5, -5))).toBeCloseTo(0, 12);
  });
});
