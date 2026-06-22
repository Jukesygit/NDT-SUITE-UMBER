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
// deserializeNozzle
// ---------------------------------------------------------------------------

/**
 * Normalise a raw (loaded or imported) nozzle record into a {@link NozzleConfig}.
 *
 * Shared by every project-load path so the deserialisers cannot drift apart.
 * Critically, an intentionally-blank name (`''`) is preserved rather than
 * coerced to the `'N'` default: a blank-named nozzle is treated as an unlabelled
 * "building block" and renders without a 3D label (see the `!nozzle?.name`
 * guards in ThreeViewport / gltf-export). Only a genuinely missing or
 * non-string name falls back to `'N'`.
 */
export function deserializeNozzle(raw: any): NozzleConfig {
    // Migration: the pad and weld neck used to share the single `hideRepad`
    // flag. New records carry independent `showRepad` / `showWeldNeck`.
    // The reinforcing pad is an opt-in detail, so it defaults OFF unless the
    // record explicitly enables it. The weld neck keeps its historical default
    // (shown unless the legacy `hideRepad` hid it).
    const legacyWeldNeckVisible = raw?.hideRepad !== true;
    return {
        name: typeof raw?.name === 'string' ? raw.name : 'N',
        pos: raw?.pos ?? 0,
        proj: raw?.proj ?? 200,
        angle: raw?.angle ?? 90,
        size: raw?.size ?? 100,
        orientationMode: raw?.orientationMode,
        azimuthRotation: raw?.azimuthRotation,
        flangeOD: raw?.flangeOD,
        flangeThk: raw?.flangeThk,
        pipeOD: raw?.pipeOD,
        style: raw?.style,
        hideRepad: raw?.hideRepad,
        showRepad: raw?.showRepad ?? false,
        showWeldNeck: raw?.showWeldNeck ?? legacyWeldNeckVisible,
        repadOD: raw?.repadOD,
        repadThickness: raw?.repadThickness,
    };
}

// ---------------------------------------------------------------------------
// buildConformingRepad
// ---------------------------------------------------------------------------

/** Default reinforcing pad outside-diameter multiplier (× pipe OD). */
const DEFAULT_REPAD_OD_RATIO = 1.8;
/** Default reinforcing pad thickness in mm. */
const DEFAULT_REPAD_THICKNESS = 10;

/**
 * Build a reinforcing pad as a flat circular plate **bent to the shell radius**
 * — a true repad rather than a domed sphere-cap.
 *
 * Starts from a thin disc (`CylinderGeometry`, which has clean outward winding)
 * and displaces every vertex down by the shell-curvature sagitta
 * `R − √(R² − ρ²)` (ρ = distance from the nozzle axis), so the plate seats on
 * the shell: bottom-centre touches at the origin (y = 0) and the rim dips to
 * follow the curve, keeping ~uniform thickness. Normals are recomputed from the
 * primitive's preserved winding, so the plate shades correctly. On dome ends
 * `R` is the cylinder radius — an accepted approximation.
 *
 * All inputs are in **world units** (already scaled).
 */
function buildConformingRepad(
  repadRadius: number,
  repadThickness: number,
  bendRadius: number,
  material: THREE.Material,
): THREE.Mesh {
  const R = bendRadius;
  const geom = new THREE.CylinderGeometry(repadRadius, repadRadius, repadThickness, 48, 1);
  // Move the disc so its (flat) bottom face starts at y = 0, then bend it down.
  geom.translate(0, repadThickness / 2, 0);

  const pos = geom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const rho = Math.hypot(x, z);
    const sag = R - Math.sqrt(Math.max(0, R * R - rho * rho));
    pos.setY(i, pos.getY(i) - sag);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom, material);
  mesh.userData = { part: 'repad' };
  return mesh;
}

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
  material: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  const isPlainPipe = nozzle.style === 'plain-pipe';

  // -- Pad / weld-neck visibility (independent; migrate from legacy hideRepad)
  // The pad is opt-in (defaults off); the weld neck keeps its historical default.
  const showRepad = nozzle.showRepad ?? false;
  const showWeldNeck = nozzle.showWeldNeck ?? (nozzle.hideRepad !== true);

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

  // -- Reinforcing pad (flat plate bent to the shell radius) ----------------
  if (!isPlainPipe && showRepad) {
    const repadOD = nozzle.repadOD || pipeOD * DEFAULT_REPAD_OD_RATIO;
    const repadRadius = (repadOD / 2) * SCALE;
    const repadThickness = (nozzle.repadThickness ?? DEFAULT_REPAD_THICKNESS) * SCALE;
    const repad = buildConformingRepad(
      repadRadius,
      repadThickness,
      shellRadius * SCALE,
      material,
    );
    group.add(repad);
  }

  // -- Inner stub (penetrates into the shell) --------------------------------
  // Flares to blend into the reinforced junction only when the weld neck shows.
  const stubLength = penetrationDepth;
  const stubGeom = new THREE.CylinderGeometry(
    showWeldNeck ? pipeRadius * 1.1 : pipeRadius,
    showWeldNeck ? pipeRadius * 1.3 : pipeRadius,
    stubLength,
    32,
  );
  const stub = new THREE.Mesh(stubGeom, material);
  stub.position.y = -stubLength / 2; // Extends below origin (into shell)
  group.add(stub);

  // -- Weld neck (tapered section emerging from the pad) ---------------------
  // Fixed size based on pipe diameter, not projection length
  const weldNeckLength = showWeldNeck ? Math.min(pipeRadius * 0.8, 40 * SCALE) : 0;
  if (showWeldNeck) {
    const weldNeckGeom = new THREE.CylinderGeometry(
      pipeRadius,
      pipeRadius * 1.15,
      weldNeckLength,
      32,
    );
    const weldNeck = new THREE.Mesh(weldNeckGeom, material);
    weldNeck.position.y = weldNeckLength / 2;
    weldNeck.userData = { part: 'weldNeck' };
    group.add(weldNeck);
  }

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

  if (!isPlainPipe) {
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
  }

  // -- Connection point ring for plain-pipe nozzles --------------------------
  if (isPlainPipe) {
    const ringGeom = new THREE.RingGeometry(
      pipeRadius * 0.8,
      pipeRadius * 1.2,
      32,
    );
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x004422,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.y = weldNeckLength + pipeLength;
    ring.rotation.x = Math.PI / 2;
    ring.userData = { isConnectionPoint: true };
    group.add(ring);
  }

  // Nozzle is built along +Y axis; orientation is handled in buildVesselScene
  return group;
}

// ---------------------------------------------------------------------------
// rotateNormalAboutVertical
// ---------------------------------------------------------------------------

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Yaw a surface normal about the world vertical (+Y) axis by `deg` degrees,
 * mutating and returning it. The angle is normalised to `[0, 360)`, so a value
 * of 0 (or any multiple of 360) is a no-op.
 *
 * Used to let a dome-end nozzle be stepped 90° at a time so it protrudes
 * straight out of the end instead of sideways. A vertical (Y-parallel) normal
 * is unaffected because it is parallel to the rotation axis.
 */
export function rotateNormalAboutVertical(
  normal: THREE.Vector3,
  deg: number,
): THREE.Vector3 {
  const norm = ((deg % 360) + 360) % 360;
  if (norm !== 0) {
    normal.applyAxisAngle(WORLD_UP, (norm * Math.PI) / 180);
  }
  return normal;
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
