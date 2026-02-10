// =============================================================================
// Vessel Modeler - Nozzle Geometry Module
// =============================================================================
// Creates detailed flanged nozzle geometry for pressure vessel visualization.
// Ported from the standalone HTML tool's createFlangedNozzle() function.
//
// A flanged nozzle consists of (from shell outward):
//   1. Reinforcing pad (curved disc matching shell curvature)
//   2. Inner stub (penetrates into the shell)
//   3. Weld neck (tapered transition)
//   4. Main pipe body
//   5. Flange hub (transition from pipe to flange)
//   6. Flange face
//   7. Raised face (sealing surface)
// =============================================================================

import * as THREE from 'three';
import { type NozzleConfig, findClosestPipeSize } from '../types';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// createFlangedNozzle
// ---------------------------------------------------------------------------

/**
 * Build a flanged nozzle as a `THREE.Group` of cylinder / sphere meshes.
 *
 * The nozzle is constructed along the **+Y axis** starting at the origin
 * (shell surface). Orientation and positioning on the vessel is handled by
 * the caller (vessel-geometry.ts) via quaternion rotation.
 *
 * @param nozzle       - Nozzle configuration (size, projection, overrides)
 * @param shellRadius  - Vessel inner radius in **mm**
 * @param material     - Material to apply to all sub-meshes
 * @returns A `THREE.Group` containing all nozzle parts
 */
export function createFlangedNozzle(
  nozzle: NozzleConfig,
  shellRadius: number,
  material: THREE.MeshPhongMaterial,
): THREE.Group {
  const group = new THREE.Group();

  // -- Pipe dimensions from lookup table (with optional overrides) ----------
  const pipeID = nozzle.size;
  const closestPipe = findClosestPipeSize(pipeID);
  const pipeOD = nozzle.pipeOD || closestPipe.od;
  const flangeOD = nozzle.flangeOD || closestPipe.flangeOD;
  const flangeThk = nozzle.flangeThk || closestPipe.flangeThk;

  // -- Derived dimensions (all converted to world units via SCALE) ----------
  const nozzleLength = (nozzle.proj - shellRadius) * SCALE;
  const pipeRadius = (pipeOD / 2) * SCALE;
  const flangeRadius = (flangeOD / 2) * SCALE;
  const flangeThickness = flangeThk * SCALE;

  // Penetration depth - extend nozzle into the shell for proper visual connection
  const penetrationDepth = shellRadius * SCALE * 0.12;

  // -- Reinforcing pad (curved disc that follows shell curvature) -----------
  const repadOD = pipeOD * 1.8; // Typically 1.5-2x pipe OD
  const repadRadius = (repadOD / 2) * SCALE;
  const repadThickness = 10 * SCALE; // ~10mm thick pad

  const padSegments = 32;
  const padGeom = new THREE.SphereGeometry(
    repadRadius,
    padSegments,
    padSegments,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.25, // Only the top cap portion
  );
  const repad = new THREE.Mesh(padGeom, material);
  // Scale Y to flatten into a pad, and flip so curved side faces down (toward shell)
  repad.scale.set(1, 0.3, 1);
  repad.rotation.x = Math.PI; // Flip so curve matches shell
  repad.position.y = repadThickness * 0.5;
  group.add(repad);

  // -- Inner stub (penetrates into the shell) --------------------------------
  const stubLength = penetrationDepth;
  const stubGeom = new THREE.CylinderGeometry(
    pipeRadius * 1.1,
    pipeRadius * 1.3,
    stubLength,
    32,
  );
  const stub = new THREE.Mesh(stubGeom, material);
  stub.position.y = -stubLength / 2; // Extends below origin (into shell)
  group.add(stub);

  // -- Weld neck (tapered section emerging from the pad) ---------------------
  // Fixed size based on pipe diameter, not projection length
  const weldNeckLength = Math.min(pipeRadius * 0.8, 40 * SCALE);
  const weldNeckGeom = new THREE.CylinderGeometry(
    pipeRadius,
    pipeRadius * 1.15,
    weldNeckLength,
    32,
  );
  const weldNeck = new THREE.Mesh(weldNeckGeom, material);
  weldNeck.position.y = weldNeckLength / 2;
  group.add(weldNeck);

  // -- Main pipe body --------------------------------------------------------
  const pipeLength = Math.max(0.01, nozzleLength - weldNeckLength - flangeThickness);
  const pipeGeom = new THREE.CylinderGeometry(
    pipeRadius,
    pipeRadius,
    pipeLength,
    32,
  );
  const pipe = new THREE.Mesh(pipeGeom, material);
  pipe.position.y = weldNeckLength + pipeLength / 2;
  group.add(pipe);

  // -- Flange hub (transition from pipe to flange) ---------------------------
  const hubLength = flangeThickness * 0.4;
  const hubGeom = new THREE.CylinderGeometry(
    flangeRadius * 0.7,
    pipeRadius,
    hubLength,
    32,
  );
  const hub = new THREE.Mesh(hubGeom, material);
  hub.position.y = weldNeckLength + pipeLength + hubLength / 2;
  group.add(hub);

  // -- Flange face -----------------------------------------------------------
  const flangeBodyThk = flangeThickness * 0.5;
  const flangeGeom = new THREE.CylinderGeometry(
    flangeRadius,
    flangeRadius,
    flangeBodyThk,
    32,
  );
  const flange = new THREE.Mesh(flangeGeom, material);
  flange.position.y = weldNeckLength + pipeLength + hubLength + flangeBodyThk / 2;
  group.add(flange);

  // -- Raised face (the sealing surface) -------------------------------------
  const rfRadius = flangeRadius * 0.85;
  const rfThickness = flangeThickness * 0.1;
  const rfGeom = new THREE.CylinderGeometry(
    rfRadius,
    rfRadius,
    rfThickness,
    32,
  );
  const raisedFace = new THREE.Mesh(rfGeom, material);
  raisedFace.position.y =
    weldNeckLength + pipeLength + hubLength + flangeBodyThk + rfThickness / 2;
  group.add(raisedFace);

  // Nozzle is built along +Y axis; orientation is handled in buildVesselScene
  return group;
}

// ---------------------------------------------------------------------------
// disposeObject
// ---------------------------------------------------------------------------

/**
 * Recursively dispose of a Three.js object tree, freeing GPU resources
 * (geometry buffers, material programs, texture memory).
 *
 * Call this before removing an object from the scene to prevent memory leaks.
 * Does **not** dispose shared textures (only material instances).
 */
export function disposeObject(obj: THREE.Object3D): void {
  if (!obj) return;

  // Recursively dispose children
  if (obj.children) {
    while (obj.children.length > 0) {
      disposeObject(obj.children[0]);
      obj.remove(obj.children[0]);
    }
  }

  // Dispose geometry
  const mesh = obj as THREE.Mesh;
  if (mesh.geometry) {
    mesh.geometry.dispose();
  }

  // Dispose material(s) - but not the cached texture, just the material instance
  if (mesh.material) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((mat) => mat.dispose());
    } else {
      mesh.material.dispose();
    }
  }
}
