// =============================================================================
// coverage-feature-framing — bounds/poses for "click a row, look at it"
// =============================================================================
// Framing is judged by geometry, not pixels, so the assertions are structural:
// each feature's bounds sit on its own body's axis at the right station, a cap
// is tighter than the barrel it caps, a deleted boot resolves to null rather
// than throwing, the whole-vessel bounds swallow every feature, and the pose is
// the canonical one for those bounds (no bespoke distance maths).
// =============================================================================

import { describe, it, expect } from 'vitest';

import { DEFAULT_VESSEL_STATE, type AppendageConfig, type VesselState } from '../../types';
import { canonicalPose } from '../canonical-views';
import { resolveBodyFrame } from '../body-frame';
import { SCALE } from '../materials';
import {
  featureFramePose,
  featureViewBounds,
  wholeVesselBounds,
  wholeVesselPose,
} from '../coverage-feature-framing';

const BOOT: AppendageConfig = {
  id: 'app-1',
  name: 'Boot 1',
  mountPos: 4000,
  mountAngle: 270,
  diameter: 1000,
  length: 1500,
  endClosure: 'dished',
  headRatio: 2.0,
  visible: true,
  locked: false,
};

function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return { ...DEFAULT_VESSEL_STATE, saddles: [], ...overrides };
}

describe('featureViewBounds', () => {
  it('centres the shell at mid-length on the vessel axis', () => {
    const state = makeState();
    const frame = resolveBodyFrame(state, undefined);
    const bounds = featureViewBounds(state, { scope: 'main', key: 'cylinder' })!;

    expect(
      bounds.center.distanceTo(frame.surfacePoint(state.length / 2, 0, -frame.radius))
    ).toBeLessThan(1e-9);
    expect(bounds.radius).toBeCloseTo(Math.hypot(state.length / 2, frame.radius) * SCALE, 9);
  });

  it('puts each head cap beyond its own tangent line, on opposite sides', () => {
    const state = makeState();
    const frame = resolveBodyFrame(state, undefined);
    const left = featureViewBounds(state, { scope: 'main', key: 'leftHead' })!;
    const right = featureViewBounds(state, { scope: 'main', key: 'rightHead' })!;
    const leftTangent = frame.surfacePoint(0, 0, -frame.radius);
    const rightTangent = frame.surfacePoint(state.length, 0, -frame.radius);

    // Each cap centre sits outboard of its tangent, by half the head depth.
    expect(left.center.distanceTo(leftTangent)).toBeCloseTo((frame.headDepth / 2) * SCALE, 9);
    expect(right.center.distanceTo(rightTangent)).toBeCloseTo((frame.headDepth / 2) * SCALE, 9);
    expect(left.center.distanceTo(right.center)).toBeGreaterThan(state.length * SCALE);
  });

  it('frames a cap tighter than the barrel it caps', () => {
    const state = makeState();
    const barrel = featureViewBounds(state, { scope: 'main', key: 'cylinder' })!;
    const cap = featureViewBounds(state, { scope: 'main', key: 'rightHead' })!;
    expect(cap.radius).toBeLessThan(barrel.radius);
  });

  it('frames a boot on the boot, not on the vessel', () => {
    const state = makeState({ appendages: [BOOT] });
    const bootFrame = resolveBodyFrame(state, BOOT.id);
    const shell = featureViewBounds(state, {
      scope: 'appendage',
      appendageId: BOOT.id,
      slot: 'shell',
    })!;

    expect(
      shell.center.distanceTo(bootFrame.surfacePoint(BOOT.length / 2, 0, -bootFrame.radius))
    ).toBeLessThan(1e-9);
    // Tight around the boot, not the whole vessel.
    expect(shell.radius).toBeLessThan(
      featureViewBounds(state, { scope: 'main', key: 'cylinder' })!.radius
    );
  });

  it('places a boot dome outboard of the boot shell', () => {
    const state = makeState({ appendages: [BOOT] });
    const shell = featureViewBounds(state, {
      scope: 'appendage',
      appendageId: BOOT.id,
      slot: 'shell',
    })!;
    const dome = featureViewBounds(state, {
      scope: 'appendage',
      appendageId: BOOT.id,
      slot: 'dome',
    })!;
    const mainCentre = featureViewBounds(state, { scope: 'main', key: 'cylinder' })!.center;

    // The dome is the far end, so it is further from the vessel than the shell.
    expect(dome.center.distanceTo(mainCentre)).toBeGreaterThan(shell.center.distanceTo(mainCentre));
  });

  it('returns null for a boot that no longer exists', () => {
    const state = makeState();
    expect(
      featureViewBounds(state, { scope: 'appendage', appendageId: 'ghost', slot: 'shell' })
    ).toBeNull();
  });
});

describe('featureFramePose', () => {
  it('is exactly the canonical iso pose for the feature bounds', () => {
    const state = makeState();
    const ref = { scope: 'main', key: 'cylinder' } as const;
    const bounds = featureViewBounds(state, ref)!;
    const expected = canonicalPose('iso', state, bounds);
    const pose = featureFramePose(state, ref)!;

    expect(pose.position.distanceTo(expected.position)).toBeLessThan(1e-9);
    expect(pose.target.distanceTo(expected.target)).toBeLessThan(1e-9);
  });

  it('is null when the feature cannot be resolved', () => {
    expect(
      featureFramePose(makeState(), {
        scope: 'appendage',
        appendageId: 'ghost',
        slot: 'dome',
      })
    ).toBeNull();
  });
});

describe('wholeVesselBounds', () => {
  it('contains every feature of the model, boots included', () => {
    const state = makeState({ appendages: [BOOT] });
    const whole = wholeVesselBounds(state);

    const refs = [
      { scope: 'main', key: 'leftHead' },
      { scope: 'main', key: 'cylinder' },
      { scope: 'main', key: 'rightHead' },
      { scope: 'appendage', appendageId: BOOT.id, slot: 'shell' },
      { scope: 'appendage', appendageId: BOOT.id, slot: 'dome' },
    ] as const;

    for (const ref of refs) {
      const bounds = featureViewBounds(state, ref)!;
      // Every feature sphere fits inside the whole-model sphere.
      expect(whole.center.distanceTo(bounds.center) + bounds.radius).toBeLessThanOrEqual(
        whole.radius + 1e-9
      );
    }
  });

  it('frames the model isometrically', () => {
    const state = makeState({ appendages: [BOOT] });
    const expected = canonicalPose('iso', state, wholeVesselBounds(state));
    const pose = wholeVesselPose(state);
    expect(pose.position.distanceTo(expected.position)).toBeLessThan(1e-9);
  });
});
