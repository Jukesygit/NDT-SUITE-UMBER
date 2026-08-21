// =============================================================================
// coverage-feature-framing — bounds/poses for "click a row, look at it"
// =============================================================================
// Framing is judged by geometry, not pixels, so the assertions are structural:
// each feature's bounds sit on its own body's axis at the right station, a cap
// is tighter than the barrel it caps, a deleted boot resolves to null rather
// than throwing, the whole-vessel bounds swallow every feature, and the pose is
// the canonical one for those bounds (no bespoke distance maths).
//
// Cap rows carry the extra closure contract (2026-08-20): the camera stands
// OUTBOARD of the cap along the OWNING body's axis, looks back inboard at the
// cap centre, and stands far enough off that the canonical fit distance holds.
// The boot fixtures are mounted on three different clock angles precisely so
// that framing a dome on the world axis, or on the MAIN vessel's axis, fails.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { DEFAULT_VESSEL_STATE, type AppendageConfig, type VesselState } from '../../types';
import { canonicalDirection, canonicalPose, fitDistance } from '../canonical-views';
import { resolveBodyFrame, type SurfaceFrame } from '../body-frame';
import type { FeatureTargetRef } from '../coverage-comparison';
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

/**
 * Side-mounted boot: vessel-clock 0° is the +Z flank (90° = TDC), so its axis is
 * perpendicular to BOTH the main vessel axis and the world up — a dome framed on
 * either of those instead of the boot's own axis lands inside the boot barrel.
 */
const SIDE_BOOT: AppendageConfig = {
  ...BOOT,
  id: 'app-2',
  name: 'Boot 2',
  mountPos: 2000,
  mountAngle: 0,
  diameter: 900,
  length: 1200,
};

/**
 * Diagonal boot: at vessel-clock 45° on a horizontal vessel the iso direction is
 * exactly PERPENDICULAR to the boot axis, so a plain "mirror iso's axial
 * component" would leave the camera in the cap's own tangent plane. Pins the
 * minimum outboard tilt.
 */
const DIAGONAL_BOOT: AppendageConfig = {
  ...BOOT,
  id: 'app-3',
  name: 'Boot 3',
  mountPos: 6000,
  mountAngle: 45,
  diameter: 800,
  length: 1000,
};

/** The outboard tilt band a cap view is held to (sines of 25° and 65°). */
const MIN_TILT_SIN = Math.sin((25 * Math.PI) / 180);
const MAX_TILT_SIN = Math.sin((65 * Math.PI) / 180);

/** Shell margin kept inboard of a cap's tangent plane, as a fraction of radius. */
const CAP_SHELL_MARGIN_FRACTION = 0.15;

function makeState(overrides: Partial<VesselState> = {}): VesselState {
  return { ...DEFAULT_VESSEL_STATE, saddles: [], ...overrides };
}

/** The body's own axis (unit), near tangent → far tangent, from the frame alone. */
function frameAxis(frame: SurfaceFrame) {
  return frame
    .surfacePoint(frame.axialLength, 0, -frame.radius)
    .sub(frame.surfacePoint(0, 0, -frame.radius))
    .normalize();
}

/**
 * Assert every property the closure ruling demands of one cap row, and hand the
 * caller the pieces so it can add body-specific checks. `end` is +1 for the far
 * closure of `bodyId`'s frame, −1 for the near one.
 */
function checkCapPose(
  state: VesselState,
  ref: FeatureTargetRef,
  bodyId: string | undefined,
  end: 1 | -1
) {
  const frame = resolveBodyFrame(state, bodyId);
  const outboard = frameAxis(frame).multiplyScalar(end);
  const tangent = frame.surfacePoint(end > 0 ? frame.axialLength : 0, 0, -frame.radius);
  const apex = tangent.clone().addScaledVector(outboard, frame.headDepth * SCALE);

  const bounds = featureViewBounds(state, ref)!;
  const pose = featureFramePose(state, ref)!;
  const dist = pose.position.distanceTo(bounds.center);
  const offset = pose.position.clone().sub(bounds.center);

  // (a) The camera's axial coordinate is outboard of the cap's tangent station —
  //     and clear of the apex, so it is nowhere inside the body envelope.
  expect(pose.position.clone().sub(tangent).dot(outboard)).toBeGreaterThan(0);
  expect(pose.position.clone().sub(apex).dot(outboard)).toBeGreaterThan(0);
  // ...by a real three-quarter tilt, not a hair above the tangent plane.
  expect(offset.dot(outboard)).toBeGreaterThanOrEqual(dist * MIN_TILT_SIN - 1e-9);
  // ...and still a three-quarter view, not a flat-on bullseye down the axis.
  expect(offset.dot(outboard)).toBeLessThanOrEqual(dist * MAX_TILT_SIN + 1e-9);

  // (b) It looks AT the cap centre, and its view direction points back INBOARD.
  expect(pose.target.distanceTo(bounds.center)).toBeLessThan(1e-9);
  const view = pose.target.clone().sub(pose.position).normalize();
  const toCentre = bounds.center.clone().sub(pose.position).normalize();
  expect(view.distanceTo(toCentre)).toBeLessThan(1e-9);
  expect(view.dot(outboard)).toBeLessThan(0);

  // (c) Far enough back that the cap bounds fit the canonical FOV assumption, and
  //     outside the cap sphere entirely — nothing to clip.
  expect(dist).toBeGreaterThanOrEqual(fitDistance(bounds.radius) - 1e-9);
  expect(dist).toBeGreaterThan(bounds.radius);

  return { frame, outboard, bounds, pose, dist, tangent };
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

    // The cap sphere spans −margin…+headDepth about the tangent plane, so its
    // centre is the midpoint of that span — still outboard of the tangent.
    const margin = frame.radius * CAP_SHELL_MARGIN_FRACTION;
    const offset = ((frame.headDepth - margin) / 2) * SCALE;
    expect(offset).toBeGreaterThan(0);
    expect(left.center.distanceTo(leftTangent)).toBeCloseTo(offset, 9);
    expect(right.center.distanceTo(rightTangent)).toBeCloseTo(offset, 9);
    expect(left.center.distanceTo(right.center)).toBeGreaterThan(state.length * SCALE);
  });

  it('encloses the whole cap plus a strip of shell behind it', () => {
    const state = makeState({ appendages: [BOOT] });
    const cases = [
      { ref: { scope: 'main', key: 'leftHead' }, bodyId: undefined, end: -1 as const },
      { ref: { scope: 'main', key: 'rightHead' }, bodyId: undefined, end: 1 as const },
      {
        ref: { scope: 'appendage', appendageId: BOOT.id, slot: 'dome' },
        bodyId: BOOT.id,
        end: 1 as const,
      },
    ] as const;

    for (const { ref, bodyId, end } of cases) {
      const frame = resolveBodyFrame(state, bodyId);
      const bounds = featureViewBounds(state, ref)!;
      const tangentPos = end > 0 ? frame.axialLength : 0;
      const margin = frame.radius * CAP_SHELL_MARGIN_FRACTION;

      // Walk the meridian from a margin of shell, over the tangent, to the apex.
      for (let step = 0; step <= 12; step += 1) {
        const along = -margin + ((frame.headDepth + margin) * step) / 12;
        for (const angle of [0, 90, 180, 270]) {
          const surface = frame.surfacePoint(tangentPos + end * along, angle, 0);
          expect(bounds.center.distanceTo(surface)).toBeLessThanOrEqual(bounds.radius + 1e-9);
        }
      }
    }
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

  it('leaves a boot shell row on the plain canonical iso pose too', () => {
    const state = makeState({ appendages: [BOOT] });
    const ref = { scope: 'appendage', appendageId: BOOT.id, slot: 'shell' } as const;
    const expected = canonicalPose('iso', state, featureViewBounds(state, ref)!);
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

describe('featureFramePose — closure rows stand outboard of their own cap', () => {
  const state = makeState({ appendages: [BOOT, SIDE_BOOT, DIAGONAL_BOOT] });

  it('frames the left head from beyond the left apex, not back down the shell', () => {
    const { pose, outboard, frame } = checkCapPose(
      state,
      { scope: 'main', key: 'leftHead' },
      undefined,
      -1
    );

    // The old world-fixed iso put this camera on the +X (inboard) side of the cap,
    // above the barrel, looking back along the shell. It now stands past the apex.
    expect(outboard.x).toBeCloseTo(-1, 9);
    expect(pose.position.x).toBeLessThan((-state.length / 2 - frame.headDepth) * SCALE);
  });

  it('frames the right head from beyond the right apex', () => {
    const { pose, outboard, frame } = checkCapPose(
      state,
      { scope: 'main', key: 'rightHead' },
      undefined,
      1
    );
    expect(outboard.x).toBeCloseTo(1, 9);
    expect(pose.position.x).toBeGreaterThan((state.length / 2 + frame.headDepth) * SCALE);
  });

  it('mirrors only the axial component — the far head keeps the plain iso direction', () => {
    // Iso already points outboard at the far end, so the DIRECTION is unchanged
    // there (the cap stands further back than plain iso — CAP_FIT_FACTOR — so
    // only the direction, not the position, is canonical); the near end is its
    // mirror through the tangent plane's normal.
    const ref = { scope: 'main', key: 'rightHead' } as const;
    const expected = canonicalPose('iso', state, featureViewBounds(state, ref)!);
    const pose = featureFramePose(state, ref)!;

    const expectedDir = expected.position.clone().sub(expected.target).normalize();
    const poseDir = pose.position.clone().sub(pose.target).normalize();
    expect(poseDir.distanceTo(expectedDir)).toBeLessThan(1e-9);

    const left = featureFramePose(state, { scope: 'main', key: 'leftHead' })!;
    const leftBounds = featureViewBounds(state, { scope: 'main', key: 'leftHead' })!;
    const rightOffset = pose.position.clone().sub(expected.target);
    const leftOffset = left.position.clone().sub(leftBounds.center);

    // Same elevation and same cross-axis azimuth; only the axial sign flips.
    expect(leftOffset.x).toBeCloseTo(-rightOffset.x, 9);
    expect(leftOffset.y).toBeCloseTo(rightOffset.y, 9);
    expect(leftOffset.z).toBeCloseTo(rightOffset.z, 9);
  });

  const domeCases: Array<[string, AppendageConfig]> = [
    ['bottom-mounted', BOOT],
    ['side-mounted', SIDE_BOOT],
    ['diagonally mounted', DIAGONAL_BOOT],
  ];

  it.each(domeCases)(
    'frames a %s boot dome along the boot axis, not the vessel axis',
    (_label, boot) => {
      const ref = { scope: 'appendage', appendageId: boot.id, slot: 'dome' } as const;
      const { outboard, bounds, dist } = checkCapPose(state, ref, boot.id, 1);

      // The boot's outboard axis IS its own mount normal on the main shell — it
      // tracks the mount angle...
      const mainFrame = resolveBodyFrame(state, undefined);
      const mountNormal = mainFrame.surfaceNormal(boot.mountPos, boot.mountAngle);
      expect(outboard.distanceTo(mountNormal)).toBeLessThan(1e-9);
      // ...and is perpendicular to the main vessel axis for every one of these
      // mounts, so "outboard" cannot have been read off the main axis.
      expect(Math.abs(outboard.dot(frameAxis(mainFrame)))).toBeLessThan(1e-9);

      // Proof the fix is not a no-op here: the plain world-fixed iso pose — what a
      // main-axis or world-axis choice produces — fails the outboard test (a).
      const isoOffset = canonicalPose('iso', state, bounds).position.clone().sub(bounds.center);
      expect(isoOffset.dot(outboard)).toBeLessThan(dist * MIN_TILT_SIN);
    }
  );

  it('keeps the side-mounted dome exactly one mirrored-iso step out', () => {
    // Iso's axial component on a +Z boot axis is −1/√3; mirrored it is +1/√3, and
    // it is in the tilt band so the magnitude is untouched. Any other axis choice
    // (main +X, world up) produces a different number here.
    const ref = { scope: 'appendage', appendageId: SIDE_BOOT.id, slot: 'dome' } as const;
    const { pose, bounds, dist } = checkCapPose(state, ref, SIDE_BOOT.id, 1);
    const offset = pose.position.clone().sub(bounds.center);

    expect(offset.z).toBeCloseTo(dist / Math.sqrt(3), 9);
    expect(offset.x).toBeCloseTo(dist / Math.sqrt(3), 9);
    expect(offset.y).toBeCloseTo(dist / Math.sqrt(3), 9);
  });

  it('still tilts outboard when iso is perpendicular to the boot axis', () => {
    // A 45° mount makes iso·axis exactly 0 — a bare mirror would leave the camera
    // in the cap's tangent plane, looking along the surface it is meant to show.
    const ref = { scope: 'appendage', appendageId: DIAGONAL_BOOT.id, slot: 'dome' } as const;
    const frame = resolveBodyFrame(state, DIAGONAL_BOOT.id);
    const outboard = frameAxis(frame);
    const iso = canonicalDirection('iso', state);
    expect(Math.abs(iso.dot(outboard))).toBeLessThan(1e-9);

    const { pose, bounds, dist } = checkCapPose(state, ref, DIAGONAL_BOOT.id, 1);
    const axial = pose.position.clone().sub(bounds.center).dot(outboard);
    expect(axial).toBeCloseTo(dist * MIN_TILT_SIN, 9);
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
