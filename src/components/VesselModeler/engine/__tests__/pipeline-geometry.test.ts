import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import { isTerminalSegment, type PipeSegmentType, type PipeSegment } from '../../types';
import { advanceFrame, buildDomeMesh, type PipeFrame } from '../pipeline-geometry';
import { SCALE } from '../materials';

// ---------------------------------------------------------------------------
// isTerminalSegment — single source of truth for "this part closes the run".
// Cap and dome end a pipeline; everything else keeps the chain open.
// ---------------------------------------------------------------------------

describe('isTerminalSegment', () => {
  it('treats cap and dome as terminal', () => {
    expect(isTerminalSegment('cap')).toBe(true);
    expect(isTerminalSegment('dome')).toBe(true);
  });

  it('treats all pass-through parts as non-terminal', () => {
    const open: PipeSegmentType[] = ['straight', 'elbow', 'reducer', 'tee', 'valve', 'flange'];
    for (const type of open) {
      expect(isTerminalSegment(type)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Fixtures shared by the advanceFrame/buildDomeMesh suites below.
// ---------------------------------------------------------------------------

const mat = new THREE.MeshBasicMaterial();

function identityFrame(): PipeFrame {
  return {
    origin: new THREE.Vector3(0, 0, 0),
    direction: new THREE.Vector3(0, 1, 0),
    up: new THREE.Vector3(0, 0, 1),
  };
}

function domeSegment(overrides: Partial<PipeSegment> = {}): PipeSegment {
  return { id: 'dome-1', type: 'dome', rotation: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// advanceFrame — dome is terminal, same as cap: the frame passes through
// unchanged so nothing downstream tries to continue the chain past a head.
// ---------------------------------------------------------------------------

describe('advanceFrame — dome', () => {
  it('treats dome as terminal: returns the frame unchanged', () => {
    const frame = identityFrame();
    const out = advanceFrame(frame, domeSegment(), 100);
    expect(out.origin.toArray()).toEqual(frame.origin.toArray());
    expect(out.direction.toArray()).toEqual(frame.direction.toArray());
    expect(out.up.toArray()).toEqual(frame.up.toArray());
  });
});

// ---------------------------------------------------------------------------
// buildDomeMesh — semi-ellipsoidal head: a hemisphere squashed along the pipe
// axis by 1/headRatio. Defaults to 2.0 (2:1), matching the vessel's own head
// convention.
// ---------------------------------------------------------------------------

describe('buildDomeMesh', () => {
  it('tags the mesh for selection like every other pipe part', () => {
    const mesh = buildDomeMesh(identityFrame(), domeSegment(), 100, mat);
    expect(mesh.userData).toMatchObject({ type: 'pipeSegment', segmentId: 'dome-1' });
  });

  it('positions the mesh at the frame origin', () => {
    const frame = identityFrame();
    frame.origin.set(1, 2, 3);
    const mesh = buildDomeMesh(frame, domeSegment(), 100, mat);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
  });

  it('squashes the default 2:1 head to half the radius deep, full diameter across', () => {
    const pipeDiameter = 100; // mm
    const radius = (pipeDiameter / 2) * SCALE;
    const mesh = buildDomeMesh(identityFrame(), domeSegment(), pipeDiameter, mat);
    const box = new THREE.Box3().setFromObject(mesh);

    // Depth along the pipe axis (Y): r / headRatio, default headRatio 2.0 → r / 2
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(radius / 2, 6);

    // Full diameter across the perpendicular plane (X/Z): unaffected by the squash
    expect(box.min.x).toBeCloseTo(-radius, 6);
    expect(box.max.x).toBeCloseTo(radius, 6);
    expect(box.min.z).toBeCloseTo(-radius, 6);
    expect(box.max.z).toBeCloseTo(radius, 6);
  });

  it('respects a custom headRatio (1.0 = full, unsquashed hemisphere)', () => {
    const pipeDiameter = 100; // mm
    const radius = (pipeDiameter / 2) * SCALE;
    const mesh = buildDomeMesh(identityFrame(), domeSegment({ headRatio: 1.0 }), pipeDiameter, mat);
    const box = new THREE.Box3().setFromObject(mesh);

    expect(box.max.y).toBeCloseTo(radius, 6);
  });
});
