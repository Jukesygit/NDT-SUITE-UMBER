import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

import {
  isTerminalSegment,
  type PipeSegmentType,
  type PipeSegment,
  type Pipeline,
  type NozzleConfig,
} from '../../types';
import {
  advanceFrame,
  buildDomeMesh,
  buildPipelineGroup,
  getConnectionPoints,
  type PipeFrame,
} from '../pipeline-geometry';
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

  it('clamps a degenerate headRatio of 0 to a finite, non-degenerate dome', () => {
    const pipeDiameter = 100; // mm
    const mesh = buildDomeMesh(identityFrame(), domeSegment({ headRatio: 0 }), pipeDiameter, mat);
    const box = new THREE.Box3().setFromObject(mesh);

    expect(Number.isFinite(box.max.y)).toBe(true);
    expect(box.max.y).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Fixtures for the buildPipelineGroup/getConnectionPoints suites below.
// ---------------------------------------------------------------------------

const ringMat = new THREE.MeshBasicMaterial();

/** A free-standing (not nozzle-attached) single-segment pipeline. */
function freePipeline(segment: PipeSegment): Pipeline {
  return {
    id: 'pipe-1',
    nozzleIndex: -1,
    pipeDiameter: 100,
    segments: [segment],
    freeOrigin: { position: [0, 0, 0], direction: [0, 1, 0] },
  };
}

/** A free-standing pipeline with an explicit multi-segment chain. */
function freeMultiSegmentPipeline(segments: PipeSegment[]): Pipeline {
  return {
    id: 'pipe-1',
    nozzleIndex: -1,
    pipeDiameter: 100,
    segments,
    freeOrigin: { position: [0, 0, 0], direction: [0, 1, 0] },
  };
}

function hasConnectionRing(group: THREE.Group): boolean {
  return group.children.some((child) => child.userData?.isConnectionPoint === true);
}

function hasSegmentMesh(group: THREE.Group, segmentId: string): boolean {
  return group.children.some((child) => child.userData?.segmentId === segmentId);
}

// ---------------------------------------------------------------------------
// buildPipelineGroup — a dome-terminated chain builds a dome mesh and
// suppresses the end-of-chain connection ring, same as cap. Non-terminal
// chains are unaffected by the isTerminalSegment refactor.
// ---------------------------------------------------------------------------

describe('buildPipelineGroup — dome termination', () => {
  it('builds a dome mesh for a dome-terminated chain', () => {
    const group = buildPipelineGroup(freePipeline(domeSegment()), null, null, 500, mat, ringMat);
    expect(hasSegmentMesh(group, 'dome-1')).toBe(true);
  });

  it('suppresses the connection-point ring for a dome-terminated chain', () => {
    const group = buildPipelineGroup(freePipeline(domeSegment()), null, null, 500, mat, ringMat);
    expect(hasConnectionRing(group)).toBe(false);
  });

  it('still adds the ring for a non-terminal (straight) chain', () => {
    const straight: PipeSegment = { id: 'straight-1', type: 'straight', rotation: 0, length: 100 };
    const group = buildPipelineGroup(freePipeline(straight), null, null, 500, mat, ringMat);
    expect(hasConnectionRing(group)).toBe(true);
  });

  it('still suppresses the ring for a cap-terminated chain (regression)', () => {
    const cap: PipeSegment = { id: 'cap-1', type: 'cap', rotation: 0 };
    const group = buildPipelineGroup(freePipeline(cap), null, null, 500, mat, ringMat);
    expect(hasConnectionRing(group)).toBe(false);
  });

  it('advances the frame through a preceding straight run before placing a terminal dome (multi-segment chain)', () => {
    const segments: PipeSegment[] = [
      { id: 's-1', type: 'straight', rotation: 0, length: 300 },
      { id: 's-2', type: 'dome', rotation: 0 },
    ];
    const group = buildPipelineGroup(
      freeMultiSegmentPipeline(segments),
      null,
      null,
      500,
      mat,
      ringMat
    );
    const domeMesh = group.children.find((child) => child.userData?.segmentId === 's-2');
    expect(domeMesh).toBeDefined();
    expect(domeMesh!.position.y).toBeCloseTo(300 * SCALE, 5);
  });
});

// ---------------------------------------------------------------------------
// getConnectionPoints — a dome-terminated pipeline is closed, same as cap:
// it contributes no snap target at its end.
// ---------------------------------------------------------------------------

describe('getConnectionPoints — dome termination', () => {
  function makeNozzle(overrides: Partial<NozzleConfig> = {}): NozzleConfig {
    return { name: 'N', pos: 0, proj: 300, angle: 90, size: 100, ...overrides };
  }

  it('yields no endpoint for a dome-terminated pipeline', () => {
    // Minimal vesselGroup/nozzleGroup fixture: computeInitialFrame only reads
    // matrixWorld, so a bare tagged Group (no real nozzle geometry) suffices.
    const nozzleGroup = new THREE.Group();
    nozzleGroup.userData = { type: 'nozzle', nozzleIdx: 0 };
    const vesselGroup = new THREE.Group();
    vesselGroup.add(nozzleGroup);

    const pipeline: Pipeline = {
      id: 'pipe-1',
      nozzleIndex: 0,
      pipeDiameter: 100,
      segments: [domeSegment()],
    };

    const points = getConnectionPoints([pipeline], [makeNozzle()], vesselGroup, 500);
    expect(points).toHaveLength(0);
  });

  it('yields exactly one open endpoint for a straight-terminated (non-terminal) pipeline', () => {
    const nozzleGroup = new THREE.Group();
    nozzleGroup.userData = { type: 'nozzle', nozzleIdx: 0 };
    const vesselGroup = new THREE.Group();
    vesselGroup.add(nozzleGroup);

    const pipeline: Pipeline = {
      id: 'pipe-1',
      nozzleIndex: 0,
      pipeDiameter: 100,
      segments: [{ id: 'straight-1', type: 'straight', rotation: 0, length: 300 }],
    };

    const points = getConnectionPoints([pipeline], [makeNozzle()], vesselGroup, 500);
    expect(points).toHaveLength(1);
    expect(points[0].type).toBe('pipeline');
  });
});
