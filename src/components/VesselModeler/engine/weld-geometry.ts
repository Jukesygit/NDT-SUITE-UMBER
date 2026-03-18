// =============================================================================
// Vessel Modeler - Weld Geometry Module
// =============================================================================
// Creates 3D geometry for circumferential and longitudinal weld seams on the
// vessel surface. Welds are visualised as raised beads (ridges) on the shell.
//
// - Circumferential welds: full 360° torus rings at a given axial position.
// - Longitudinal welds:    raised strips along the vessel axis at a given
//   circumferential angle, spanning from `pos` to `endPos`.
// =============================================================================

import * as THREE from 'three';
import type { WeldConfig, VesselState } from '../types';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Weld bead cross-section: tube radius of the torus / half-width of long weld */
const BEAD_RADIUS_MM = 4;

// ---------------------------------------------------------------------------
// Circumferential Weld (Torus Ring)
// ---------------------------------------------------------------------------

/**
 * Create a circumferential (girth) weld at the given axial position.
 * The weld is a torus that wraps 360° around the vessel at `weld.pos` mm
 * from the left tangent line.
 */
function createCircumferentialWeld(
  weld: WeldConfig,
  vesselRadius: number,
  tanTan: number,
  headRatio: number,
  isVertical: boolean,
  material: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group();

  // Determine the local radius at this axial position (may be on an ellipsoidal head)
  const HEAD_DEPTH = vesselRadius / headRatio;
  let r_local = vesselRadius;

  if (weld.pos < 0) {
    const ratio = Math.min(0.99, Math.abs(weld.pos / HEAD_DEPTH));
    r_local = vesselRadius * Math.sqrt(1 - ratio * ratio);
  } else if (weld.pos > tanTan) {
    const ratio = Math.min(0.99, Math.abs((weld.pos - tanTan) / HEAD_DEPTH));
    r_local = vesselRadius * Math.sqrt(1 - ratio * ratio);
  }

  const torusGeom = new THREE.TorusGeometry(
    r_local * SCALE,       // ring radius (distance from center of torus to center of tube)
    BEAD_RADIUS_MM * SCALE, // tube radius (cross-section of the bead)
    12,                     // radial segments (tube cross-section)
    64,                     // tubular segments (around the ring)
  );

  const torus = new THREE.Mesh(torusGeom, material);

  // Position the torus at the correct axial location
  const axialOffset = (weld.pos - tanTan / 2) * SCALE;

  if (isVertical) {
    // Vertical vessel: ring is in the XZ plane, positioned along Y
    torus.rotation.x = Math.PI / 2;
    group.position.set(0, axialOffset, 0);
  } else {
    // Horizontal vessel: ring is in the YZ plane, positioned along X
    torus.rotation.y = Math.PI / 2;
    group.position.set(axialOffset, 0, 0);
  }

  group.add(torus);
  return group;
}

// ---------------------------------------------------------------------------
// Longitudinal Weld (Raised Strip)
// ---------------------------------------------------------------------------

/**
 * Create a longitudinal weld seam running along the vessel axis.
 * The weld is a curved strip on the shell surface from `pos` to `endPos`
 * at a fixed circumferential angle.
 */
function createLongitudinalWeld(
  weld: WeldConfig,
  vesselRadius: number,
  tanTan: number,
  isVertical: boolean,
  material: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group();

  const startPos = weld.pos;
  const endPos = weld.endPos ?? tanTan;
  const angle = weld.angle ?? 90;
  const rad = (angle * Math.PI) / 180;

  const weldLength = Math.abs(endPos - startPos);
  const segments = Math.max(2, Math.ceil(weldLength / 50)); // segment every ~50mm

  // Build a curved strip on the vessel surface
  const beadR = BEAD_RADIUS_MM * SCALE;
  const R = vesselRadius * SCALE;

  // Create the weld bead as a series of small cylinder segments following the surface
  const vertices: number[] = [];
  const indices: number[] = [];

  // Cross-section: semi-circular bead profile (6 points across)
  const profilePoints = 6;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const axialPos = startPos + t * (endPos - startPos);
    const axialWorld = (axialPos - tanTan / 2) * SCALE;

    for (let j = 0; j <= profilePoints; j++) {
      const u = j / profilePoints;
      const profileAngle = u * Math.PI; // 0 to PI (semi-circle)
      const localHeight = Math.sin(profileAngle) * beadR;
      const localWidth = (u - 0.5) * 2 * beadR;

      // Surface point at this position
      const surfaceR = R + localHeight;

      if (isVertical) {
        // Offset the profile width along the circumference
        const adjustedRad = rad + localWidth / R;
        const x = surfaceR * Math.cos(adjustedRad);
        const z = surfaceR * Math.sin(adjustedRad);
        vertices.push(x, axialWorld, z);
      } else {
        const adjustedRad = rad + localWidth / R;
        const y = surfaceR * Math.sin(adjustedRad);
        const z = surfaceR * Math.cos(adjustedRad);
        vertices.push(axialWorld, y, z);
      }
    }
  }

  // Create triangle indices
  const stride = profilePoints + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < profilePoints; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + j + 1;
      const d = i * stride + j + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  return group;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create the 3D geometry for a single weld seam.
 */
export function createWeldGeometry(
  weld: WeldConfig,
  state: VesselState,
  material: THREE.MeshStandardMaterial,
): THREE.Group {
  const RADIUS = state.id / 2;
  const TAN_TAN = state.length;
  const isVertical = state.orientation === 'vertical';

  if (weld.type === 'circumferential') {
    return createCircumferentialWeld(weld, RADIUS, TAN_TAN, state.headRatio, isVertical, material);
  } else {
    return createLongitudinalWeld(weld, RADIUS, TAN_TAN, isVertical, material);
  }
}
