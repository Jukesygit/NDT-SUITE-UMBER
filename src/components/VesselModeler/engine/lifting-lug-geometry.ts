// =============================================================================
// Vessel Modeler - Lifting Lug Geometry Module
// =============================================================================
// Creates lifting lug geometry for pressure vessel visualization.
// Supports two styles:
//   1. Pad Eye  - Flat vertical plate with a circular hole, welded to a base plate
//   2. Trunnion - Cylindrical pipe stub with a cross-pin hole
// =============================================================================

import * as THREE from 'three';
import { type LiftingLugConfig, findLiftingLugSize } from '../types';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// Pad Eye Lug
// ---------------------------------------------------------------------------

/**
 * Build a pad-eye lifting lug as a THREE.Group.
 *
 * Components (from shell surface outward along +Y):
 *   1. Base plate (curved disc on shell surface)
 *   2. Vertical plate (flat box rising from base)
 *   3. Eye ring (torus at top of plate for shackle/hook)
 *   4. Gusset plates (2x triangular reinforcements on each side)
 */
function createPadEyeLug(
  lug: LiftingLugConfig,
  material: THREE.MeshPhongMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const size = findLiftingLugSize(lug.swl);

  const width = (lug.width || size.width) * SCALE;
  const height = (lug.height || size.height) * SCALE;
  const thickness = (lug.thickness || size.thickness) * SCALE;
  const holeDia = (lug.holeDiameter || size.holeDiameter) * SCALE;
  const baseDia = size.baseDiameter * SCALE;

  // -- 1. Base plate (flat cylinder on shell surface) --
  const baseThk = thickness * 0.6;
  const baseGeom = new THREE.CylinderGeometry(baseDia / 2, baseDia / 2, baseThk, 32);
  const basePlate = new THREE.Mesh(baseGeom, material);
  basePlate.position.y = baseThk / 2;
  group.add(basePlate);

  // -- 2. Vertical plate (the main lug body) --
  const plateGeom = new THREE.BoxGeometry(thickness, height, width);
  const plate = new THREE.Mesh(plateGeom, material);
  plate.position.y = baseThk + height / 2;
  group.add(plate);

  // -- 3. Eye ring (torus at top of plate) --
  const eyeOuterRadius = holeDia / 2 + thickness * 0.6;
  const eyeTubeRadius = thickness * 0.55;
  const eyeGeom = new THREE.TorusGeometry(eyeOuterRadius, eyeTubeRadius, 16, 32);
  const eye = new THREE.Mesh(eyeGeom, material);
  eye.position.y = baseThk + height + eyeOuterRadius * 0.3;
  // Torus is built in XY plane, rotate to stand upright in XY
  eye.rotation.x = Math.PI / 2;
  group.add(eye);

  // -- 4. Gusset plates (triangular reinforcement on each side) --
  const gussetHeight = height * 0.5;
  const gussetLength = width * 0.35;
  const gussetThk = thickness * 0.5;

  const gussetShape = new THREE.Shape();
  gussetShape.moveTo(0, 0);
  gussetShape.lineTo(gussetLength, 0);
  gussetShape.lineTo(0, gussetHeight);
  gussetShape.closePath();

  const extrudeSettings = { depth: gussetThk, bevelEnabled: false };
  const gussetGeom = new THREE.ExtrudeGeometry(gussetShape, extrudeSettings);

  // Left gusset
  const gussetL = new THREE.Mesh(gussetGeom, material);
  gussetL.position.set(thickness / 2, baseThk, -gussetThk / 2);
  group.add(gussetL);

  // Right gusset (mirrored)
  const gussetR = new THREE.Mesh(gussetGeom, material);
  gussetR.position.set(-thickness / 2, baseThk, gussetThk / 2);
  gussetR.rotation.y = Math.PI;
  group.add(gussetR);

  return group;
}

// ---------------------------------------------------------------------------
// Trunnion Lug
// ---------------------------------------------------------------------------

/**
 * Build a trunnion-style lifting lug as a THREE.Group.
 *
 * Components (from shell surface outward along +Y):
 *   1. Base plate (flat cylinder on shell surface)
 *   2. Main pipe stub (vertical cylinder)
 *   3. Cap plate (flat disc on top)
 *   4. Cross-pin sleeve (horizontal cylinder through the stub near the top)
 */
function createTrunnionLug(
  lug: LiftingLugConfig,
  material: THREE.MeshPhongMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const size = findLiftingLugSize(lug.swl);

  const pipeOD = (lug.width || size.width) * SCALE;
  const stubHeight = (lug.height || size.height) * SCALE;
  const wallThk = (lug.thickness || size.thickness) * SCALE;
  const pinDia = (lug.holeDiameter || size.holeDiameter) * SCALE;
  const baseDia = size.baseDiameter * SCALE;

  // -- 1. Base plate --
  const baseThk = wallThk * 0.6;
  const baseGeom = new THREE.CylinderGeometry(baseDia / 2, baseDia / 2, baseThk, 32);
  const basePlate = new THREE.Mesh(baseGeom, material);
  basePlate.position.y = baseThk / 2;
  group.add(basePlate);

  // -- 2. Main pipe stub (outer cylinder) --
  const stubGeom = new THREE.CylinderGeometry(
    pipeOD / 2,
    pipeOD / 2 * 1.05, // Slight taper at base
    stubHeight,
    32,
  );
  const stub = new THREE.Mesh(stubGeom, material);
  stub.position.y = baseThk + stubHeight / 2;
  group.add(stub);

  // -- 3. Cap plate --
  const capThk = wallThk * 0.5;
  const capGeom = new THREE.CylinderGeometry(pipeOD / 2 * 1.1, pipeOD / 2, capThk, 32);
  const cap = new THREE.Mesh(capGeom, material);
  cap.position.y = baseThk + stubHeight + capThk / 2;
  group.add(cap);

  // -- 4. Cross-pin sleeve (horizontal cylinder through stub) --
  const pinLength = pipeOD * 1.4;
  const pinGeom = new THREE.CylinderGeometry(pinDia / 2 + wallThk * 0.3, pinDia / 2 + wallThk * 0.3, pinLength, 16);
  const pin = new THREE.Mesh(pinGeom, material);
  pin.position.y = baseThk + stubHeight * 0.75;
  pin.rotation.x = Math.PI / 2; // Horizontal
  group.add(pin);

  return group;
}

// ---------------------------------------------------------------------------
// Public Factory
// ---------------------------------------------------------------------------

/**
 * Create a lifting lug mesh group based on configuration.
 *
 * The lug is built along +Y axis starting at origin (shell surface).
 * Positioning and orientation on the vessel is handled by the caller
 * (vessel-geometry.ts) using quaternion rotation, identical to nozzles.
 *
 * @param lug      - Lifting lug configuration
 * @param material - Material to apply to all sub-meshes
 * @returns A THREE.Group containing the complete lug geometry
 */
export function createLiftingLug(
  lug: LiftingLugConfig,
  material: THREE.MeshPhongMaterial,
): THREE.Group {
  if (lug.style === 'trunnion') {
    return createTrunnionLug(lug, material);
  }
  return createPadEyeLug(lug, material);
}
