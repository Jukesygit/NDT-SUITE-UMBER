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
 * Modelled after real welded pad-eye lugs: a flat rectangular base plate
 * with a single vertical plate that tapers from a wide base to a rounded
 * top containing the shackle hole.
 *
 * Components (from shell surface outward along +Y):
 *   1. Base plate (flat rectangular pad on shell surface)
 *   2. Vertical plate (tapered profile extruded to plate thickness,
 *      with shackle hole cut through the rounded top)
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

  // -- 1. Base plate (flat rectangular pad on shell surface) --
  const baseThk = thickness * 0.5;
  const baseLong = baseDia;           // long dimension (along plate width)
  const baseShort = baseDia * 0.35;   // short dimension (plate thickness direction)
  const baseGeom = new THREE.BoxGeometry(baseLong, baseThk, baseShort);
  const basePlate = new THREE.Mesh(baseGeom, material);
  basePlate.position.y = baseThk / 2;
  group.add(basePlate);

  // -- 2. Vertical plate (tapered profile with integrated eye hole) --
  // Profile shape in XY: wide at bottom, tapers inward, rounded top with hole.
  // Extruded along Z by plate thickness.
  const halfBase = width / 2;
  const rimThk = holeDia * 0.45;                 // material around the hole
  const earR = holeDia / 2 + rimThk;             // outer radius of the rounded top
  const holeY = height;                           // Y of hole centre above base plate

  const plateShape = new THREE.Shape();
  plateShape.moveTo(-halfBase, 0);                // bottom-left
  plateShape.lineTo(halfBase, 0);                 // bottom-right
  plateShape.lineTo(earR, holeY);                 // taper right side up to ear
  plateShape.absarc(0, holeY, earR, 0, Math.PI, false);  // semicircular top
  plateShape.lineTo(-halfBase, 0);                // taper left side back down

  // Cut the shackle hole
  const holePath = new THREE.Path();
  holePath.absarc(0, holeY, holeDia / 2, 0, Math.PI * 2, true);
  plateShape.holes.push(holePath);

  const plateGeom = new THREE.ExtrudeGeometry(plateShape, {
    depth: thickness,
    bevelEnabled: false,
  });
  const plate = new THREE.Mesh(plateGeom, material);
  // Centre the extrusion on Z axis, sit on top of base plate
  plate.position.set(0, baseThk, -thickness / 2);
  group.add(plate);

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
