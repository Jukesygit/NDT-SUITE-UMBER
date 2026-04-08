// =============================================================================
// Vessel Modeler - Pipeline Geometry Module
// =============================================================================
// Creates pipe segment geometry and computes the sequential frame chain for
// pipeline routes attached to nozzles. Each segment receives an input frame
// (origin + direction + up) and outputs a new frame for the next segment.
// =============================================================================

import * as THREE from 'three';
import { type NozzleConfig, type Pipeline, type PipeSegment, findClosestPipeSize } from '../types';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// PipeFrame — the coordinate frame passed between segments
// ---------------------------------------------------------------------------

export interface PipeFrame {
  origin: THREE.Vector3;    // world-space connection point
  direction: THREE.Vector3; // unit vector along pipe axis (outward)
  up: THREE.Vector3;        // unit vector for bend plane reference
}

// ---------------------------------------------------------------------------
// Nozzle tip Y — local Y coordinate of the nozzle tip
// ---------------------------------------------------------------------------

/**
 * Compute the local Y coordinate of the nozzle tip. This must mirror the
 * dimension math in createFlangedNozzle() so the pipeline starts exactly
 * where the nozzle geometry ends.
 */
export function computeNozzleTipY(nozzle: NozzleConfig, shellRadius: number): number {
  const pipeID = nozzle.size;
  const closestPipe = findClosestPipeSize(pipeID);
  const pipeOD = nozzle.pipeOD || closestPipe.od;
  const flangeThk = nozzle.flangeThk || closestPipe.flangeThk;
  const pipeRadius = (pipeOD / 2) * SCALE;
  const flangeThickness = flangeThk * SCALE;
  const nozzleLength = (nozzle.proj - shellRadius) * SCALE;
  const weldNeckLength = Math.min(pipeRadius * 0.8, 40 * SCALE);
  const pipeLength = Math.max(0.01, nozzleLength - weldNeckLength - flangeThickness);

  if (nozzle.style === 'plain-pipe') {
    // Plain pipe: tip is at end of pipe body (no flange)
    return weldNeckLength + pipeLength;
  }
  // Flanged: tip is at end of raised face
  const hubLength = flangeThickness * 0.4;
  const flangeBodyThk = flangeThickness * 0.5;
  const rfThickness = flangeThickness * 0.1;
  return weldNeckLength + pipeLength + hubLength + flangeBodyThk + rfThickness;
}

// ---------------------------------------------------------------------------
// computeInitialFrame — derives frame from built nozzle mesh
// ---------------------------------------------------------------------------

/**
 * Compute the starting PipeFrame from a nozzle group's world matrix.
 * Reads the nozzle mesh's matrixWorld so we stay in sync with positioning
 * automatically — no duplicated coordinate math.
 */
export function computeInitialFrame(
  nozzleGroup: THREE.Group,
  nozzleConfig: NozzleConfig,
  shellRadius: number,
): PipeFrame {
  nozzleGroup.updateMatrixWorld(true);
  const tipY = computeNozzleTipY(nozzleConfig, shellRadius);
  const origin = new THREE.Vector3(0, tipY, 0).applyMatrix4(nozzleGroup.matrixWorld);
  const direction = new THREE.Vector3(0, 1, 0)
    .transformDirection(nozzleGroup.matrixWorld)
    .normalize();

  // Up: world Y projected perpendicular to direction (Gram-Schmidt)
  const up = new THREE.Vector3(0, 1, 0);
  up.sub(direction.clone().multiplyScalar(up.dot(direction)));
  if (up.lengthSq() < 0.001) {
    // Direction is parallel to world Y — use world Z instead
    up.set(0, 0, 1).sub(direction.clone().multiplyScalar(direction.z));
  }
  up.normalize();

  return { origin, direction, up };
}

// ---------------------------------------------------------------------------
// advanceFrame — computes output frame for one segment
// ---------------------------------------------------------------------------

/**
 * Advance the frame through one pipe segment. Returns the output frame
 * that the next segment will start from.
 */
export function advanceFrame(
  frame: PipeFrame,
  segment: PipeSegment,
  pipeDiameter: number,
): PipeFrame {
  const { origin, direction, up } = frame;

  switch (segment.type) {
    case 'straight':
    case 'reducer':
    case 'valve':
    case 'flange': {
      const len = (segment.length ?? pipeDiameter * 3) * SCALE;
      return {
        origin: origin.clone().addScaledVector(direction, len),
        direction: direction.clone(),
        up: up.clone(),
      };
    }

    case 'elbow': {
      const bendAngle = ((segment.angle ?? 90) * Math.PI) / 180;
      const rotationRad = ((segment.rotation ?? 0) * Math.PI) / 180;
      const radius = (segment.bendRadius ?? pipeDiameter * 1.5) * SCALE;

      // Rotate 'up' around 'direction' by the rotation parameter to get bendNormal
      const bendNormal = up.clone().applyAxisAngle(direction, rotationRad);

      // Torus center is offset from origin along bendNormal
      const center = origin.clone().addScaledVector(bendNormal, radius);

      // Axis perpendicular to the bend plane
      const bendAxis = new THREE.Vector3().crossVectors(direction, bendNormal).normalize();

      // Output direction: rotate incoming direction by bendAngle around bendAxis
      const outDir = direction.clone().applyAxisAngle(bendAxis, bendAngle).normalize();

      // Output up: rotate bendNormal by same angle
      const outUp = bendNormal.clone().applyAxisAngle(bendAxis, bendAngle).normalize();

      // Output origin: from center, step back along the rotated bendNormal
      const outOrigin = center.clone().addScaledVector(outUp, -radius);

      return { origin: outOrigin, direction: outDir, up: outUp };
    }

    case 'cap':
      // Terminal — no further connection
      return { origin: origin.clone(), direction: direction.clone(), up: up.clone() };

    default:
      return { origin: origin.clone(), direction: direction.clone(), up: up.clone() };
  }
}

// ---------------------------------------------------------------------------
// Geometry builders — one per segment type
// ---------------------------------------------------------------------------

/**
 * Build a straight pipe segment as a cylinder along the pipe axis.
 */
export function buildStraightMesh(
  frame: PipeFrame,
  segment: PipeSegment,
  pipeDiameter: number,
  material: THREE.Material,
): THREE.Mesh {
  const len = (segment.length ?? pipeDiameter * 3) * SCALE;
  const radius = (pipeDiameter / 2) * SCALE;
  const geom = new THREE.CylinderGeometry(radius, radius, len, 32);
  const mesh = new THREE.Mesh(geom, material);

  // Position at midpoint of the segment
  const midpoint = frame.origin.clone().addScaledVector(frame.direction, len / 2);
  mesh.position.copy(midpoint);

  // Rotate from default Y-up to frame.direction
  const defaultDir = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(defaultDir, frame.direction);

  mesh.userData = { type: 'pipeSegment', segmentId: segment.id };
  return mesh;
}

/**
 * Build an elbow segment as a partial torus.
 */
export function buildElbowMesh(
  frame: PipeFrame,
  segment: PipeSegment,
  pipeDiameter: number,
  material: THREE.Material,
): THREE.Mesh {
  const bendAngle = ((segment.angle ?? 90) * Math.PI) / 180;
  const rotationRad = ((segment.rotation ?? 0) * Math.PI) / 180;
  const bendRadius = (segment.bendRadius ?? pipeDiameter * 1.5) * SCALE;
  const pipeRadius = (pipeDiameter / 2) * SCALE;

  const tubularSegments = Math.max(8, Math.round((bendAngle / Math.PI) * 32));
  const geom = new THREE.TorusGeometry(bendRadius, pipeRadius, 16, tubularSegments, bendAngle);
  const mesh = new THREE.Mesh(geom, material);

  // Compute bend plane vectors
  const bendNormal = frame.up.clone().applyAxisAngle(frame.direction, rotationRad);
  const bendAxis = new THREE.Vector3().crossVectors(frame.direction, bendNormal).normalize();

  // Torus center
  const center = frame.origin.clone().addScaledVector(bendNormal, bendRadius);
  mesh.position.copy(center);

  // Align torus: Three.js TorusGeometry lies in XY plane (normal = +Z).
  // At u=0 tube center is at +X, tangent direction is +Y.
  // We map: +X → -bendNormal (toward origin), +Y → direction (pipe flow), +Z → bendAxis (ring normal)
  const negBendNormal = bendNormal.clone().negate();
  const mat4 = new THREE.Matrix4();
  mat4.makeBasis(negBendNormal, frame.direction, bendAxis);
  mesh.quaternion.setFromRotationMatrix(mat4);

  mesh.userData = { type: 'pipeSegment', segmentId: segment.id };
  return mesh;
}

/**
 * Build a reducer segment as a tapered cylinder.
 */
export function buildReducerMesh(
  frame: PipeFrame,
  segment: PipeSegment,
  pipeDiameter: number,
  material: THREE.Material,
): THREE.Mesh {
  const len = (segment.length ?? pipeDiameter * 2) * SCALE;
  const radiusStart = (pipeDiameter / 2) * SCALE;
  const radiusEnd = ((segment.endDiameter ?? pipeDiameter * 0.75) / 2) * SCALE;
  // CylinderGeometry: radiusTop is the end we're going toward, radiusBottom is where we start
  const geom = new THREE.CylinderGeometry(radiusEnd, radiusStart, len, 32);
  const mesh = new THREE.Mesh(geom, material);

  const midpoint = frame.origin.clone().addScaledVector(frame.direction, len / 2);
  mesh.position.copy(midpoint);

  const defaultDir = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(defaultDir, frame.direction);

  mesh.userData = { type: 'pipeSegment', segmentId: segment.id };
  return mesh;
}

/**
 * Build a flange segment as a wide disc.
 */
export function buildFlangeMesh(
  frame: PipeFrame,
  segment: PipeSegment,
  pipeDiameter: number,
  material: THREE.Material,
): THREE.Mesh {
  const len = (segment.length ?? 25) * SCALE;
  const flangeRadius = (pipeDiameter / 2) * SCALE * 1.6;
  const geom = new THREE.CylinderGeometry(flangeRadius, flangeRadius, len, 32);
  const mesh = new THREE.Mesh(geom, material);

  const midpoint = frame.origin.clone().addScaledVector(frame.direction, len / 2);
  mesh.position.copy(midpoint);

  const defaultDir = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(defaultDir, frame.direction);

  mesh.userData = { type: 'pipeSegment', segmentId: segment.id };
  return mesh;
}

/**
 * Build a cap segment as a flat disc or dished hemisphere.
 */
export function buildCapMesh(
  frame: PipeFrame,
  segment: PipeSegment,
  pipeDiameter: number,
  material: THREE.Material,
): THREE.Mesh {
  const radius = (pipeDiameter / 2) * SCALE;
  let geom: THREE.BufferGeometry;

  if (segment.style === 'dished') {
    geom = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  } else {
    geom = new THREE.CircleGeometry(radius, 32);
  }

  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(frame.origin);

  // Orient to face along pipe direction
  const defaultNormal = new THREE.Vector3(0, 0, 1);
  mesh.quaternion.setFromUnitVectors(defaultNormal, frame.direction);

  mesh.userData = { type: 'pipeSegment', segmentId: segment.id };
  return mesh;
}

// ---------------------------------------------------------------------------
// buildPipelineGroup — orchestrates the full segment chain
// ---------------------------------------------------------------------------

/**
 * Build a complete pipeline as a THREE.Group containing all segment meshes
 * and a connection point ring at the open end.
 */
export function buildPipelineGroup(
  pipeline: Pipeline,
  nozzleGroup: THREE.Group,
  nozzleConfig: NozzleConfig,
  shellRadius: number,
  material: THREE.Material,
  connectionPointMaterial: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'pipeline', pipelineId: pipeline.id };

  if (pipeline.visible === false) {
    group.visible = false;
  }

  let frame = computeInitialFrame(nozzleGroup, nozzleConfig, shellRadius);
  let currentDiameter = pipeline.pipeDiameter;

  for (const segment of pipeline.segments) {
    let mesh: THREE.Mesh;

    switch (segment.type) {
      case 'straight':
        mesh = buildStraightMesh(frame, segment, currentDiameter, material);
        break;
      case 'elbow':
        mesh = buildElbowMesh(frame, segment, currentDiameter, material);
        break;
      case 'reducer':
        mesh = buildReducerMesh(frame, segment, currentDiameter, material);
        break;
      case 'flange':
        mesh = buildFlangeMesh(frame, segment, currentDiameter, material);
        break;
      case 'cap':
        mesh = buildCapMesh(frame, segment, currentDiameter, material);
        break;
      default:
        // Unsupported type — skip (tee, valve added in later phases)
        frame = advanceFrame(frame, segment, currentDiameter);
        continue;
    }

    group.add(mesh);

    // Advance frame for next segment
    const prevDiameter = currentDiameter;
    if (segment.type === 'reducer' && segment.endDiameter) {
      currentDiameter = segment.endDiameter;
    }
    frame = advanceFrame(frame, segment, prevDiameter);
  }

  // Add connection point ring at chain end (unless capped)
  const lastSegment = pipeline.segments[pipeline.segments.length - 1];
  if (!lastSegment || lastSegment.type !== 'cap') {
    const ringRadius = (currentDiameter / 2) * SCALE;
    const ringGeom = new THREE.RingGeometry(ringRadius * 0.8, ringRadius * 1.2, 32);
    const ring = new THREE.Mesh(ringGeom, connectionPointMaterial);
    ring.position.copy(frame.origin);
    // Orient ring to face along pipe direction
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    ring.quaternion.setFromUnitVectors(defaultNormal, frame.direction);
    ring.userData = { isConnectionPoint: true, pipelineId: pipeline.id };
    group.add(ring);
  }

  return group;
}

// ---------------------------------------------------------------------------
// getConnectionPoints — computes all connection point positions
// ---------------------------------------------------------------------------

/**
 * Compute the world-space positions of all open connection points
 * (nozzle tips for plain-pipe nozzles without pipelines, and
 * pipeline endpoints that aren't capped).
 *
 * Used for snap-distance matching during drag-and-drop.
 */
export interface ConnectionPoint {
  position: THREE.Vector3;
  /** 'nozzle' = unattached plain-pipe nozzle, 'pipeline' = end of existing pipeline */
  type: 'nozzle' | 'pipeline';
  nozzleIndex: number;
  pipelineId?: string;
  pipeDiameter: number;
}

export function getConnectionPoints(
  pipelines: Pipeline[],
  nozzles: NozzleConfig[],
  vesselGroup: THREE.Group,
  shellRadius: number,
): ConnectionPoint[] {
  const points: ConnectionPoint[] = [];

  // Find nozzle groups in the vessel group
  const nozzleGroups = new Map<number, THREE.Group>();
  vesselGroup.traverse((child) => {
    if (child.userData?.type === 'nozzle' && child.userData?.nozzleIdx !== undefined) {
      nozzleGroups.set(child.userData.nozzleIdx as number, child as THREE.Group);
    }
  });

  // Plain-pipe nozzles that don't have a pipeline attached
  const attachedNozzleIndices = new Set(pipelines.map(p => p.nozzleIndex));

  nozzles.forEach((nozzle, idx) => {
    if (nozzle.style !== 'plain-pipe') return;
    const nozzleGroup = nozzleGroups.get(idx);
    if (!nozzleGroup) return;

    if (!attachedNozzleIndices.has(idx)) {
      // Unattached nozzle — connection point at tip
      const frame = computeInitialFrame(nozzleGroup, nozzle, shellRadius);
      const pipe = findClosestPipeSize(nozzle.size);
      points.push({
        position: frame.origin,
        type: 'nozzle',
        nozzleIndex: idx,
        pipeDiameter: pipe.od,
      });
    }
  });

  // Pipeline endpoints
  for (const pipeline of pipelines) {
    if (pipeline.visible === false) continue;
    const lastSeg = pipeline.segments[pipeline.segments.length - 1];
    if (lastSeg?.type === 'cap') continue; // capped — no connection point

    const nozzle = nozzles[pipeline.nozzleIndex];
    const nozzleGroup = nozzleGroups.get(pipeline.nozzleIndex);
    if (!nozzle || !nozzleGroup) continue;

    // Walk the chain to get the end frame
    let frame = computeInitialFrame(nozzleGroup, nozzle, shellRadius);
    let currentDiameter = pipeline.pipeDiameter;

    for (const segment of pipeline.segments) {
      frame = advanceFrame(frame, segment, currentDiameter);
      if (segment.type === 'reducer' && segment.endDiameter) {
        currentDiameter = segment.endDiameter;
      }
    }

    points.push({
      position: frame.origin,
      type: 'pipeline',
      nozzleIndex: pipeline.nozzleIndex,
      pipelineId: pipeline.id,
      pipeDiameter: currentDiameter,
    });
  }

  return points;
}
