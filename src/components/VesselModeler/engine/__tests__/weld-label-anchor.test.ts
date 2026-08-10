// =============================================================================
// weld-label-anchor — weld name-label anchoring (Phase 4A follow-up)
// =============================================================================
// A weld carrying `bodyId` anchors its label on the appendage cylinder via that
// body's SurfaceFrame, the same way the appendage weld MESH is built: pos/endPos
// clamped to [0, length], circ labels at a ring angle (default 90 deg = top of
// ring, or a caller-supplied camera-facing angle), long labels at the axial
// midpoint on the weld's own datum angle, all 30mm proud. A weld with no bodyId
// resolves the main-shell frame and reproduces the legacy top-of-ring / midpoint
// placement (golden equivalence).
// =============================================================================

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import {
  DEFAULT_VESSEL_STATE,
  type AppendageConfig,
  type VesselState,
  type WeldConfig,
} from '../../types';
import {
  computeWeldLabelAnchor,
  weldLabelAnchorOnFrame,
  WELD_LABEL_RADIAL_OFFSET_MM,
} from '../weld-label-anchor';
import { resolveBodyFrame } from '../body-frame';
import { SCALE } from '../materials';

const sump: AppendageConfig = {
  id: 'app-1',
  name: 'Sump',
  mountPos: 3000,
  mountAngle: 270,
  diameter: 1000,
  length: 1500,
  endClosure: 'flat',
};

function makeState(): VesselState {
  // Horizontal main shell (DEFAULT_VESSEL_STATE orientation) with one appendage.
  return { ...DEFAULT_VESSEL_STATE, id: 3000, length: 6000, appendages: [sump] };
}

describe('weld label anchor — appendage welds (bodyId set)', () => {
  it('circ label anchors at the top of the ring (datum 90 deg), 30mm proud, at pos along the body axis', () => {
    const state = makeState();
    const frame = resolveBodyFrame(state, 'app-1');
    const weld: WeldConfig = {
      name: 'W',
      type: 'circumferential',
      pos: 600,
      color: '#888',
      bodyId: 'app-1',
    };

    const anchor = computeWeldLabelAnchor(weld, state);
    const expected = frame.surfacePoint(600, 90, WELD_LABEL_RADIAL_OFFSET_MM);
    expect(anchor.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('circ label honours an explicit (camera-facing) datum angle', () => {
    const state = makeState();
    const frame = resolveBodyFrame(state, 'app-1');
    const weld: WeldConfig = {
      name: 'W',
      type: 'circumferential',
      pos: 600,
      color: '#888',
      bodyId: 'app-1',
    };

    const anchor = weldLabelAnchorOnFrame(frame, weld, 217);
    const expected = frame.surfacePoint(600, 217, WELD_LABEL_RADIAL_OFFSET_MM);
    expect(anchor.distanceTo(expected)).toBeLessThan(1e-6);
    // A different ring angle yields a genuinely different anchor point.
    expect(
      anchor.distanceTo(frame.surfacePoint(600, 90, WELD_LABEL_RADIAL_OFFSET_MM))
    ).toBeGreaterThan(0.1);
  });

  it('circ label clamps pos to the cylinder span [0, length]', () => {
    const state = makeState();
    const frame = resolveBodyFrame(state, 'app-1');
    const weld: WeldConfig = {
      name: 'W',
      type: 'circumferential',
      pos: 99999,
      color: '#888',
      bodyId: 'app-1',
    };

    const anchor = computeWeldLabelAnchor(weld, state);
    const expected = frame.surfacePoint(frame.axialLength, 90, WELD_LABEL_RADIAL_OFFSET_MM);
    expect(anchor.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('long label anchors at the axial midpoint on the weld datum angle, 30mm proud', () => {
    const state = makeState();
    const frame = resolveBodyFrame(state, 'app-1');
    const weld: WeldConfig = {
      name: 'LW',
      type: 'longitudinal',
      pos: 200,
      endPos: 1200,
      angle: 45,
      color: '#888',
      bodyId: 'app-1',
    };

    const anchor = computeWeldLabelAnchor(weld, state);
    const expected = frame.surfacePoint((200 + 1200) / 2, 45, WELD_LABEL_RADIAL_OFFSET_MM);
    expect(anchor.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('long label clamps start/end to the span and defaults endPos to body length', () => {
    const state = makeState();
    const frame = resolveBodyFrame(state, 'app-1');
    // pos below 0 clamps to 0; endPos omitted -> defaults to axialLength (1500).
    const weld: WeldConfig = {
      name: 'LW',
      type: 'longitudinal',
      pos: -500,
      angle: 90,
      color: '#888',
      bodyId: 'app-1',
    };

    const anchor = computeWeldLabelAnchor(weld, state);
    const expectedMid = (0 + frame.axialLength) / 2;
    const expected = frame.surfacePoint(expectedMid, 90, WELD_LABEL_RADIAL_OFFSET_MM);
    expect(anchor.distanceTo(expected)).toBeLessThan(1e-6);
  });
});

describe('weld label anchor — main-shell frame (golden equivalence, no bodyId)', () => {
  it('circ anchor at datum 90 deg reproduces the legacy main-shell top-of-ring anchor', () => {
    const state = makeState(); // horizontal
    const weld: WeldConfig = { name: 'W', type: 'circumferential', pos: 1000, color: '#888' };

    const anchor = computeWeldLabelAnchor(weld, state);

    // Legacy main-shell export formula (horizontal): (axial, (R+30)*SCALE, 0).
    const R = state.id / 2;
    const axial = (1000 - state.length / 2) * SCALE;
    const expected = new THREE.Vector3(axial, (R + WELD_LABEL_RADIAL_OFFSET_MM) * SCALE, 0);
    expect(anchor.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('long anchor reproduces the legacy main-shell midpoint anchor', () => {
    const state = makeState(); // horizontal
    const weld: WeldConfig = {
      name: 'LW',
      type: 'longitudinal',
      pos: 500,
      endPos: 2500,
      angle: 90,
      color: '#888',
    };

    const anchor = computeWeldLabelAnchor(weld, state);

    // Legacy main-shell export formula (horizontal): (axial, r*sin, r*cos).
    const R = state.id / 2;
    const midPos = (500 + 2500) / 2;
    const axial = (midPos - state.length / 2) * SCALE;
    const r = (R + WELD_LABEL_RADIAL_OFFSET_MM) * SCALE;
    const angleRad = (90 * Math.PI) / 180;
    const expected = new THREE.Vector3(axial, r * Math.sin(angleRad), r * Math.cos(angleRad));
    expect(anchor.distanceTo(expected)).toBeLessThan(1e-6);
  });
});
