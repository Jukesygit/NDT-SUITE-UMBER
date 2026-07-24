// =============================================================================
// Vessel Modeler - Appendage Geometry Module
// =============================================================================
// Builds a self-contained THREE.Group for a secondary appendage body
// (sump / boot / riser): an open-ended cylinder, an optional end closure, and
// an optional girth-flange pair at the junction. The junction is rendered by
// interpenetration (the cylinder seats a small depth INTO the shell) plus the
// flange rings — no mesh boolean, mirroring how nozzles connect today.
//
// BINDING CONSTRAINT (design §6 Phase 0 notes): the group's world transform is
// built from the SurfaceFrame's own orthonormal basis (datum, axis, cross), NOT
// a shortest-arc quaternion. A shortest-arc quaternion fixes only the axis and
// leaves the roll about it unspecified, so the mesh's angle-0 generator would
// drift from the frame's datum and diverge from the (Phase 2) scan/overlay math.
// Deriving the transform from the frame keeps mesh and frame in lock-step:
//   local +X -> datum (angle 0),  local +Y -> axis (outward),  local +Z -> cross
// so a cylinder vertex on the angle-0 generator lands exactly on
// frame.surfacePoint(pos, 0). Locked by the acceptance test.
//
// See design: docs/plans/2026-07-21-secondary-appendage-body-design.md §6, §7.
// =============================================================================

import * as THREE from 'three';
import type { AppendageConfig, VesselState } from '../types';
import { SCALE } from './materials';
import { resolveBodyFrame } from './body-frame';

/** Radial tessellation for the cylinder / closure / flange primitives. */
const RADIAL_SEGMENTS = 48;
/** Default girth-flange OD as a multiple of the appendage diameter. */
const DEFAULT_FLANGE_OD_RATIO = 1.15;
/** Default girth-flange plate thickness in mm. */
const DEFAULT_FLANGE_THICKNESS = 30;

/**
 * Depth (mm) the cylinder is buried into the main shell so no gap shows where
 * the shell curves away beneath the appendage footprint. Sized from the shell
 * sagitta across the appendage radius (plus a small margin), so it stays correct
 * for large boots as well as small risers.
 */
function penetrationDepthMm(state: VesselState, radiusMm: number): number {
  const mainRadius = state.id / 2;
  const rClamp = Math.min(radiusMm, mainRadius * 0.999);
  const sagitta = mainRadius - Math.sqrt(mainRadius * mainRadius - rClamp * rClamp);
  return sagitta + radiusMm * 0.05;
}

/**
 * Build the end-closure mesh for the far (outer) end of the appendage cylinder.
 *
 * - `dished`: an ellipsoidal cap reusing the main-head technique — an upper
 *   SphereGeometry hemisphere scaled to (radius, headDepth, radius), pole facing
 *   outward (+local-Y), seated on the cylinder tangent line.
 * - `flat`: a disc facing outward.
 * - `open`: no closure (returns null).
 *
 * All inputs are in **world units** (already scaled).
 */
function buildEndClosure(
  appendage: AppendageConfig,
  radiusWU: number,
  lengthWU: number,
  headDepthWU: number,
  material: THREE.Material,
  bodyId: string
): THREE.Mesh | null {
  if (appendage.endClosure === 'open') return null;

  let geom: THREE.BufferGeometry;
  if (appendage.endClosure === 'dished') {
    geom = new THREE.SphereGeometry(1, RADIAL_SEGMENTS, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    geom.scale(radiusWU, headDepthWU, radiusWU);
    geom.translate(0, lengthWU, 0);
  } else {
    // flat disc facing +Y (outward)
    geom = new THREE.CircleGeometry(radiusWU, RADIAL_SEGMENTS);
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, lengthWU, 0);
  }

  const mesh = new THREE.Mesh(geom, material);
  mesh.userData = { type: 'appendage', bodyId, part: 'closure' };
  return mesh;
}

/**
 * Build the girth-flange pair at the junction: two stacked solid discs (the same
 * solid-flange convention the nozzle flange face uses), sitting just outside the
 * shell so they read as a bolted flange joint and visually cover the seam.
 */
function buildFlangePair(
  appendage: AppendageConfig,
  radiusMm: number,
  material: THREE.Material,
  bodyId: string
): THREE.Mesh[] {
  const flange = appendage.flangeJoint;
  if (!flange || !flange.show) return [];

  const odMm = flange.od ?? appendage.diameter * DEFAULT_FLANGE_OD_RATIO;
  const outerR = Math.max(odMm / 2, radiusMm) * SCALE;
  const thkWU = (flange.thickness ?? DEFAULT_FLANGE_THICKNESS) * SCALE;

  const meshes: THREE.Mesh[] = [];
  // Two plates stacked face-to-face at the base (y = 0 is the shell surface).
  for (let i = 0; i < 2; i++) {
    const geom = new THREE.CylinderGeometry(outerR, outerR, thkWU, RADIAL_SEGMENTS);
    geom.translate(0, thkWU / 2 + i * thkWU, 0);
    const mesh = new THREE.Mesh(geom, material);
    mesh.userData = { type: 'appendage', bodyId, part: 'flange' };
    meshes.push(mesh);
  }
  return meshes;
}

/**
 * Build a THREE.Group for a single appendage body, oriented and positioned in
 * world space via the body's SurfaceFrame.
 *
 * Visibility and lock state are stored on the group so they can be updated
 * without a structural rebuild. Drag interaction itself lands in Phase 2.
 *
 * @param appendage  The appendage configuration.
 * @param state      The full vessel state (used to resolve the body frame).
 * @param material   Shell material applied to every sub-mesh (mirrors the main
 *                   shell / saddle base material path in vessel-geometry.ts).
 */
export function buildAppendageGroup(
  appendage: AppendageConfig,
  state: VesselState,
  material: THREE.Material
): THREE.Group {
  const frame = resolveBodyFrame(state, appendage.id);
  const radiusMm = frame.radius;
  const radiusWU = radiusMm * SCALE;
  const lengthWU = frame.axialLength * SCALE;
  const headDepthWU = frame.headDepth * SCALE;
  const penetrationWU = penetrationDepthMm(state, radiusMm) * SCALE;

  const group = new THREE.Group();

  // -- Frame-derived world basis (design §6 Phase 0 notes) ------------------
  // Pulled from the SurfaceFrame's public API only:
  //   centerBase = mount centreline point (offset -radius cancels the radial term)
  //   axisN      = direction of increasing axial pos (outward, unit)
  //   datumD     = outward radial at angle 0 (the datum / local +X)
  //   crossE     = outward radial at angle 90 (local +Z)
  const centerBase = frame.surfacePoint(0, 0, -radiusMm);
  const axisN = frame.surfacePoint(1, 0, -radiusMm).sub(centerBase).normalize();
  const datumD = frame.surfaceNormal(0, 0);
  const crossE = frame.surfaceNormal(0, 90);

  // makeBasis(datumD, axisN, crossE) is a proper rotation (det +1): local +X ->
  // datum, +Y -> axis, +Z -> cross. The roll about the axis therefore comes from
  // the datum, satisfying the binding constraint.
  const basis = new THREE.Matrix4().makeBasis(datumD, axisN, crossE);
  group.quaternion.setFromRotationMatrix(basis);
  group.position.copy(centerBase);

  // -- Open-ended cylinder (the appendage shell) ----------------------------
  // Spans local y from -penetration (into the shell) to +length (outer tangent).
  const cylHeight = lengthWU + penetrationWU;
  const cylGeom = new THREE.CylinderGeometry(
    radiusWU,
    radiusWU,
    cylHeight,
    RADIAL_SEGMENTS,
    1,
    true
  );
  // Align the geometry seam (theta = 0, at local +Z) to the datum (local +X).
  cylGeom.rotateY(Math.PI / 2);
  // Centre the span: midpoint between top (+length) and bottom (-penetration).
  cylGeom.translate(0, (lengthWU - penetrationWU) / 2, 0);
  const cylinder = new THREE.Mesh(cylGeom, material);
  cylinder.userData = { type: 'appendage', bodyId: appendage.id, part: 'shell', isShell: true };
  group.add(cylinder);

  // -- End closure ----------------------------------------------------------
  const closure = buildEndClosure(
    appendage,
    radiusWU,
    lengthWU,
    headDepthWU,
    material,
    appendage.id
  );
  if (closure) group.add(closure);

  // -- Girth-flange pair at the junction ------------------------------------
  for (const flange of buildFlangePair(appendage, radiusMm, material, appendage.id)) {
    group.add(flange);
  }

  group.visible = appendage.visible !== false;
  group.userData = {
    type: 'appendage',
    bodyId: appendage.id,
    locked: appendage.locked === true,
  };
  return group;
}
