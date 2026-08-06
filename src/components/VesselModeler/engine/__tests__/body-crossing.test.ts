import { describe, it, expect } from 'vitest';

import type { Orientation, VesselState } from '../../types';
import { DEFAULT_VESSEL_STATE } from '../../types';
import { resolveBodyFrame, buildAppendageFrame, type AppendageFrameParams } from '../body-frame';
import {
  resolveCrossingHit,
  reprojectBetweenBodies,
  SEAM_HYSTERESIS_MM,
  SEAM_HYSTERESIS_WORLD,
  type BodyHit,
} from '../body-crossing';

// ---------------------------------------------------------------------------
// resolveCrossingHit — seam hysteresis decision
// ---------------------------------------------------------------------------

describe('resolveCrossingHit', () => {
  const M = SEAM_HYSTERESIS_WORLD; // deadband margin in world units

  it('returns null when there are no hits', () => {
    expect(resolveCrossingHit([], undefined)).toBeNull();
    expect(resolveCrossingHit([], 'boot-1')).toBeNull();
  });

  it('takes the globally nearest hit when the incumbent body was not hit', () => {
    // Cursor left the incumbent (main) entirely; only boot bodies under it now.
    const hits: BodyHit[] = [
      { bodyId: 'boot-2', distance: 1.0 },
      { bodyId: 'boot-1', distance: 1.2 },
    ];
    expect(resolveCrossingHit(hits, undefined)).toBe(hits[0]);
  });

  it('holds the incumbent when it is the only body hit', () => {
    const hits: BodyHit[] = [{ bodyId: 'boot-1', distance: 2.0 }];
    expect(resolveCrossingHit(hits, 'boot-1')).toBe(hits[0]);
  });

  it('holds the incumbent when a competitor is nearer but inside the deadband', () => {
    // Challenger beats incumbent by less than the margin -> no switch (anti-flap).
    const hits: BodyHit[] = [
      { bodyId: 'boot-1', distance: 1.0 - M * 0.5 }, // challenger, nearer but within margin
      { bodyId: undefined, distance: 1.0 }, // incumbent (main)
    ];
    const winner = resolveCrossingHit(hits, undefined);
    expect(winner?.bodyId).toBeUndefined();
  });

  it('switches to a competitor that clears the deadband', () => {
    const hits: BodyHit[] = [
      { bodyId: 'boot-1', distance: 1.0 - M * 2 }, // challenger clears margin
      { bodyId: undefined, distance: 1.0 }, // incumbent (main)
    ];
    const winner = resolveCrossingHit(hits, undefined);
    expect(winner?.bodyId).toBe('boot-1');
  });

  it('holds the incumbent on an exact tie', () => {
    const hits: BodyHit[] = [
      { bodyId: 'boot-1', distance: 1.0 },
      { bodyId: undefined, distance: 1.0 },
    ];
    // Incumbent = boot-1; even though main ties, boot-1 (found first at equal dist)
    // is the incumbent's own hit and holds.
    expect(resolveCrossingHit(hits, 'boot-1')?.bodyId).toBe('boot-1');
  });

  it('does not switch when the incumbent is actually nearer', () => {
    const hits: BodyHit[] = [
      { bodyId: undefined, distance: 1.0 }, // incumbent nearer
      { bodyId: 'boot-1', distance: 1.5 },
    ];
    expect(resolveCrossingHit(hits, undefined)?.bodyId).toBeUndefined();
  });

  it('picks the nearest competitor among several other bodies', () => {
    const hits: BodyHit[] = [
      { bodyId: 'boot-2', distance: 1.0 - M * 3 },
      { bodyId: 'boot-1', distance: 1.0 - M * 2 },
      { bodyId: undefined, distance: 1.0 }, // incumbent
    ];
    // boot-2 is the nearest non-incumbent and clears the margin.
    expect(resolveCrossingHit(hits, undefined)?.bodyId).toBe('boot-2');
  });

  it('respects a custom margin', () => {
    const hits: BodyHit[] = [
      { bodyId: 'boot-1', distance: 0.95 },
      { bodyId: undefined, distance: 1.0 },
    ];
    // With a 0.1 margin (> 0.05 gap) the challenger cannot switch.
    expect(resolveCrossingHit(hits, undefined, { marginWorld: 0.1 })?.bodyId).toBeUndefined();
    // With a 0.01 margin (< 0.05 gap) it can.
    expect(resolveCrossingHit(hits, undefined, { marginWorld: 0.01 })?.bodyId).toBe('boot-1');
  });

  it('exposes the margin in mm and world units consistently', () => {
    expect(SEAM_HYSTERESIS_WORLD).toBeCloseTo(SEAM_HYSTERESIS_MM * 0.001, 12);
    expect(SEAM_HYSTERESIS_MM).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// reprojectBetweenBodies — frame-conversion invariant
// ---------------------------------------------------------------------------

const RADIUS = 1500;
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

const BOOT: AppendageFrameParams = {
  mountPos: LENGTH / 2,
  mountAngle: 270, // bottom-mounted boot
  diameter: 900,
  length: 1200,
  endClosure: 'flat',
};

describe('reprojectBetweenBodies', () => {
  for (const orientation of ['horizontal', 'vertical'] as Orientation[]) {
    it(`is the identity when reprojecting a frame onto itself (${orientation})`, () => {
      const frame = resolveBodyFrame(makeState(orientation));
      for (const pos of [0, LENGTH / 4, LENGTH / 2]) {
        for (const angle of [0, 90, 180, 270]) {
          const out = reprojectBetweenBodies(frame, frame, pos, angle);
          expect(out.pos).toBeCloseTo(pos, 6);
          // Angle comparison mod 360.
          const d = Math.abs(((out.angle - angle + 540) % 360) - 180);
          expect(180 - d).toBeCloseTo(180, 6);
        }
      }
    });

    it(`composes fromFrame.surfacePoint then toFrame.toLocal (${orientation})`, () => {
      // The helper's contract is the projection compose — NOT a world-preserving
      // isometry (two bodies' surfaces sit at different radii, so a boot-surface
      // point projected onto the main frame lands on the main axis, discarding the
      // radial distance). Verify it equals the compose it documents.
      const state = makeState(orientation);
      const main = resolveBodyFrame(state);
      const boot = buildAppendageFrame(state, BOOT, 'boot-1');

      const bootPos = 400;
      const bootAngle = 30;
      const world = boot.surfacePoint(bootPos, bootAngle, 0);

      const viaHelper = reprojectBetweenBodies(boot, main, bootPos, bootAngle);
      const viaDirect = main.toLocal(world);
      expect(viaHelper.pos).toBeCloseTo(viaDirect.pos, 6);
      expect(viaHelper.angle).toBeCloseTo(viaDirect.angle, 6);
    });

    it(`preserves the world hit point across a crossing (${orientation})`, () => {
      const state = makeState(orientation);
      const boot = buildAppendageFrame(state, BOOT, 'boot-1');
      const main = resolveBodyFrame(state);

      // Cursor sits on a world point that is on the boot surface near the junction.
      const world = boot.surfacePoint(50, 90, 0);
      // The winning-body inverse (what the drag actually does) lands the item
      // exactly under that world point on the boot frame.
      const local = boot.toLocal(world);
      expect(boot.surfacePoint(local.pos, local.angle, 0).distanceTo(world)).toBeLessThan(1e-6);
      // And the main-frame inverse of the same world point is a valid main coord.
      const onMain = main.toLocal(world);
      expect(Number.isFinite(onMain.pos)).toBe(true);
      expect(Number.isFinite(onMain.angle)).toBe(true);
    });
  }
});
