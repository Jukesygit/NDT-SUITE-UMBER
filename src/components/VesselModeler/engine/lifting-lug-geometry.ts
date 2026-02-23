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
 * Curve the bottom face of a BoxGeometry to conform to a cylindrical shell.
 *
 * The box sits on the shell surface with its Y axis pointing outward (radial).
 * Vertices along Z (circumferential) are pushed inward by the sagitta so the
 * base wraps the cylinder:  offset = R - sqrt(R² - z²)
 *
 * @param geom   - BoxGeometry to modify in-place (needs Z subdivisions)
 * @param R      - Shell radius in world units (mm * SCALE)
 */
function curveBaseToShell(geom: THREE.BufferGeometry, R: number): void {
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const z = posAttr.getZ(i);
    const sagitta = R - Math.sqrt(Math.max(0, R * R - z * z));
    // Shift vertex downward (toward shell centre) by sagitta amount
    posAttr.setY(i, posAttr.getY(i) - sagitta);
  }
  posAttr.needsUpdate = true;
  geom.computeVertexNormals();
}

/**
 * Curve the bottom face of a CylinderGeometry base plate to conform to
 * a cylindrical shell. Same sagitta logic as curveBaseToShell but applied
 * using the XZ distance from axis for a circular base.
 */
function curveCylinderBaseToShell(geom: THREE.BufferGeometry, R: number): void {
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const z = posAttr.getZ(i);
    const x = posAttr.getX(i);
    // Use the circumferential distance (along Z for pad-eye, radial for cylinder)
    const dist = Math.sqrt(x * x + z * z);
    const sagitta = R - Math.sqrt(Math.max(0, R * R - dist * dist));
    posAttr.setY(i, posAttr.getY(i) - sagitta);
  }
  posAttr.needsUpdate = true;
  geom.computeVertexNormals();
}

/**
 * Build a pad-eye lifting lug as a THREE.Group.
 *
 * Modelled after real welded pad-eye lugs: a flat rectangular base plate
 * with a single vertical plate that tapers from a wide base to a rounded
 * top containing the shackle hole.
 *
 * Components (from shell surface outward along +Y):
 *   1. Base plate (curved rectangular pad conforming to shell surface)
 *   2. Vertical plate (tapered profile extruded to plate thickness,
 *      with shackle hole cut through the rounded top)
 */
function createPadEyeLug(
  lug: LiftingLugConfig,
  material: THREE.MeshPhongMaterial,
  vesselRadius: number,
): THREE.Group {
  const group = new THREE.Group();
  const size = findLiftingLugSize(lug.swl);

  const width = (lug.width || size.width) * SCALE * 1.3;   // wider plate
  const height = (lug.height || size.height) * SCALE;
  const thickness = (lug.thickness || size.thickness) * SCALE;
  const holeDia = (lug.holeDiameter || size.holeDiameter) * SCALE;
  const baseDia = size.baseDiameter * SCALE;

  // -- 1. Base plate (curved rectangular pad conforming to shell) --
  // Long dimension along Z (circumferential), short along X (longitudinal)
  // Use Z subdivisions so vertices can be curved to the shell radius.
  const baseThk = thickness * 0.5;
  const baseLong = baseDia;           // long dimension (circumferential)
  const baseShort = baseDia * 0.35;   // short dimension (longitudinal)
  const baseGeom = new THREE.BoxGeometry(baseShort, baseThk, baseLong, 1, 1, 16);
  const R = vesselRadius * SCALE;
  if (R > 0) curveBaseToShell(baseGeom, R);
  const basePlate = new THREE.Mesh(baseGeom, material);
  basePlate.position.y = baseThk / 2;
  group.add(basePlate);

  // -- 2. Vertical plate (tapered profile with integrated eye hole) --
  // Profile built in XY then rotated 90° around Y so the plate face spans
  // the circumferential axis (Z in local lug space).
  const halfBase = width / 2;
  const rimThk = holeDia * 0.45;                 // material around the hole
  const earR = holeDia / 2 + rimThk;             // outer radius of the rounded top
  const holeY = height * 0.42;                   // shorter profile

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
  // Rotate 90° around Y so plate face spans circumferential (Z) axis,
  // then offset to centre thickness along X and sit on base plate.
  plate.rotation.y = Math.PI / 2;
  plate.position.set(-thickness / 2, baseThk, 0);
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
  vesselRadius: number,
): THREE.Group {
  const group = new THREE.Group();
  const size = findLiftingLugSize(lug.swl);

  const pipeOD = (lug.width || size.width) * SCALE;
  const stubHeight = (lug.height || size.height) * SCALE;
  const wallThk = (lug.thickness || size.thickness) * SCALE;
  const pinDia = (lug.holeDiameter || size.holeDiameter) * SCALE;
  const baseDia = size.baseDiameter * SCALE;

  // -- 1. Base plate (curved to conform to shell) --
  const baseThk = wallThk * 0.6;
  const baseGeom = new THREE.CylinderGeometry(baseDia / 2, baseDia / 2, baseThk, 32);
  const R = vesselRadius * SCALE;
  if (R > 0) curveCylinderBaseToShell(baseGeom, R);
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
 * @param lug          - Lifting lug configuration
 * @param material     - Material to apply to all sub-meshes
 * @param vesselRadius - Vessel inner radius in mm (used to curve base plate)
 * @returns A THREE.Group containing the complete lug geometry
 */
export function createLiftingLug(
  lug: LiftingLugConfig,
  material: THREE.MeshPhongMaterial,
  vesselRadius: number,
): THREE.Group {
  if (lug.style === 'trunnion') {
    return createTrunnionLug(lug, material, vesselRadius);
  }
  return createPadEyeLug(lug, material, vesselRadius);
}
