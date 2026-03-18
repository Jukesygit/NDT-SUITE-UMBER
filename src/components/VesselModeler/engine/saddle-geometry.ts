// =============================================================================
// Vessel Modeler - Saddle Geometry Module
// =============================================================================
// Factory functions for creating realistic saddle support geometry.
// Each saddle consists of a curved cradle, a center web, two side web
// plates, and a horizontal base plate.
// =============================================================================

import * as THREE from 'three';
import type { SaddleConfig, VesselState } from '../types';
import { SCALE } from './materials';

/** Saddle cradle arc extent in radians (120°) */
const CRADLE_ARC = (120 * Math.PI) / 180;
/** Saddle plate thickness in mm */
const PLATE_THICKNESS = 20;
/** Number of segments for the cradle arc */
const ARC_SEGMENTS = 32;

/**
 * Build an extruded cradle arc that wraps the bottom of the vessel.
 *
 * The 2D cross-section is drawn in a local XY plane:
 *   X = transverse  (maps to world -Z after rotateY(π/2))
 *   Y = vertical    (maps to world  Y)
 *
 * The arc is centered at angle -π/2 (bottom of circle) so the cradle
 * sits beneath the vessel shell.
 */
function buildCradleGeometry(
  vesselRadius: number,
  saddleWidth: number,
): THREE.ExtrudeGeometry {
  const r = vesselRadius * SCALE;
  const thickness = PLATE_THICKNESS * SCALE;
  const halfArc = CRADLE_ARC / 2;

  const outerR = r + thickness;

  // Arc centered at -π/2 (bottom of vessel cross-section)
  const startAngle = -Math.PI / 2 - halfArc; // -150°
  const endAngle = -Math.PI / 2 + halfArc;   // -30°

  const shape = new THREE.Shape();

  // Outer arc (from start to end)
  shape.moveTo(
    Math.cos(startAngle) * outerR,
    Math.sin(startAngle) * outerR,
  );
  for (let i = 1; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const angle = startAngle + (endAngle - startAngle) * t;
    shape.lineTo(
      Math.cos(angle) * outerR,
      Math.sin(angle) * outerR,
    );
  }

  // Inner arc (reverse direction, from end back to start)
  for (let i = ARC_SEGMENTS; i >= 0; i--) {
    const t = i / ARC_SEGMENTS;
    const angle = startAngle + (endAngle - startAngle) * t;
    shape.lineTo(
      Math.cos(angle) * r,
      Math.sin(angle) * r,
    );
  }

  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: saddleWidth * SCALE,
    bevelEnabled: false,
  });

  // Center the extrusion along its depth (local Z) axis
  geom.translate(0, 0, -(saddleWidth * SCALE) / 2);

  return geom;
}

/** Default saddle height as a multiplier of vessel radius */
const DEFAULT_HEIGHT_RATIO = 1.2;

/**
 * Compute the world-Y of the saddle base plate bottom edge.
 * Exported so vessel-geometry can use it to position the ground grid.
 */
export function getSaddleBaseY(vesselState: VesselState): number {
  const RADIUS = vesselState.id / 2;
  const maxHeight = vesselState.saddles.reduce((h, s) => {
    const saddleHeight = s.height ?? RADIUS * DEFAULT_HEIGHT_RATIO;
    return Math.max(h, saddleHeight);
  }, RADIUS * DEFAULT_HEIGHT_RATIO);
  return -maxHeight * SCALE;
}

/**
 * Create a single saddle support group.
 *
 * The group contains:
 * - A curved cradle that wraps the bottom of the vessel shell
 * - A center web plate (fills the space between the two side webs)
 * - Two vertical web plates (stiffener ribs) on each side
 * - A horizontal base plate at the bottom
 */
export function createSaddleGroup(
  saddle: SaddleConfig,
  index: number,
  vesselState: VesselState,
  isSelected: boolean,
  highlightMaterial: THREE.Material,
): THREE.Group {
  const RADIUS = vesselState.id / 2;
  const TAN_TAN = vesselState.length;
  const x = (saddle.pos - TAN_TAN / 2) * SCALE;
  const color = saddle.color || '#2244ff';

  const mat: THREE.Material = isSelected
    ? highlightMaterial
    : new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.6,
        metalness: 0.5,
      });

  const saddleWidth = 400; // mm along vessel axis
  const thickness = PLATE_THICKNESS;
  const halfArc = CRADLE_ARC / 2;

  // Total saddle height from base to vessel center (configurable)
  const totalHeight = saddle.height ?? RADIUS * DEFAULT_HEIGHT_RATIO;

  // Y coordinate where the cradle arc edges end
  // cos(60°) = 0.5, so edge Y = -0.5 * R
  const cradleEdgeY = -Math.cos(halfArc) * RADIUS * SCALE;

  // Base plate sits at the bottom of the total height
  const baseY = -totalHeight * SCALE;

  // Web dimensions
  const webHeight = Math.abs(baseY - cradleEdgeY);
  const webCenterY = (cradleEdgeY + baseY) / 2;

  // Z positions of the side webs (at the transverse edges of the cradle arc)
  const webZ = Math.sin(halfArc) * RADIUS * SCALE;

  // Base plate spans the full transverse width
  const baseWidth = webZ * 2 + thickness * SCALE;

  const group = new THREE.Group();

  // -- 1. Curved cradle -------------------------------------------------------
  const cradleGeom = buildCradleGeometry(RADIUS, saddleWidth);
  // Rotate so extrusion depth goes along X (vessel axis) instead of Z
  cradleGeom.rotateY(Math.PI / 2);
  const cradleMesh = new THREE.Mesh(cradleGeom, mat);
  group.add(cradleMesh);

  // -- 2. Center web plate (fills the gap under the cradle) -------------------
  // Spans from the very bottom of the cradle arc down to the base
  const cradleBottomY = -RADIUS * SCALE; // lowest point of the inner arc
  const centerWebHeight = Math.abs(cradleBottomY - baseY);
  const centerWebGeom = new THREE.BoxGeometry(
    saddleWidth * SCALE,
    centerWebHeight,
    thickness * SCALE,
  );
  const centerWeb = new THREE.Mesh(centerWebGeom, mat);
  centerWeb.position.set(0, (cradleBottomY + baseY) / 2, 0);
  group.add(centerWeb);

  // -- 3. Side web plates (two ribs at the arc edges) -------------------------
  const webGeom = new THREE.BoxGeometry(
    saddleWidth * SCALE,
    webHeight,
    thickness * SCALE,
  );

  const leftWeb = new THREE.Mesh(webGeom, mat);
  leftWeb.position.set(0, webCenterY, webZ);
  group.add(leftWeb);

  const rightWeb = new THREE.Mesh(webGeom, mat);
  rightWeb.position.set(0, webCenterY, -webZ);
  group.add(rightWeb);

  // -- 4. Intermediate webs (between center and side webs) --------------------
  // Placed at the midpoint between center (Z=0) and each side web (Z=±webZ).
  // Their top edge follows the cradle inner arc at that Z position.
  const midZ = webZ / 2;
  // The cradle inner radius at this Z: Y = -sqrt(R² - Z²)
  const midCradleY = -Math.sqrt(RADIUS * RADIUS - (midZ / SCALE) * (midZ / SCALE)) * SCALE;
  const midWebHeight = Math.abs(midCradleY - baseY);
  const midWebCenterY = (midCradleY + baseY) / 2;

  const midWebGeom = new THREE.BoxGeometry(
    saddleWidth * SCALE,
    midWebHeight,
    thickness * SCALE,
  );

  const leftMidWeb = new THREE.Mesh(midWebGeom, mat);
  leftMidWeb.position.set(0, midWebCenterY, midZ);
  group.add(leftMidWeb);

  const rightMidWeb = new THREE.Mesh(midWebGeom, mat);
  rightMidWeb.position.set(0, midWebCenterY, -midZ);
  group.add(rightMidWeb);

  // -- 5. Fill panels between webs (front/back thin walls) --------------------
  // These thin panels close the gaps, making the saddle look solid from the side
  const fillWidth = webZ - thickness * SCALE / 2; // from center web edge to side web edge
  const fillGeom = new THREE.BoxGeometry(
    thickness * SCALE,
    webHeight,
    fillWidth,
  );

  const leftFill = new THREE.Mesh(fillGeom, mat);
  leftFill.position.set(0, webCenterY, fillWidth / 2 + thickness * SCALE / 2);
  group.add(leftFill);

  const rightFill = new THREE.Mesh(fillGeom, mat);
  rightFill.position.set(0, webCenterY, -(fillWidth / 2 + thickness * SCALE / 2));
  group.add(rightFill);

  // -- 4. Base plate ----------------------------------------------------------
  const baseGeom = new THREE.BoxGeometry(
    saddleWidth * SCALE,
    thickness * SCALE,
    baseWidth,
  );
  const basePlate = new THREE.Mesh(baseGeom, mat);
  basePlate.position.set(0, baseY + (thickness * SCALE) / 2, 0);
  group.add(basePlate);

  // -- Position the whole group -----------------------------------------------
  group.position.set(x, 0, 0);
  group.userData = { type: 'saddle', saddleIdx: index };

  return group;
}
