// =============================================================================
// Vessel Modeler - Saddle Geometry Module
// =============================================================================
// Factory functions for creating saddle support meshes.  Saddles are
// box-shaped supports that sit below a horizontal pressure vessel.
// Ported from the original buildScene() saddle creation logic.
// =============================================================================

import * as THREE from 'three';
import type { SaddleConfig, VesselState } from '../types';
import { SCALE } from './materials';

/**
 * Create a single saddle support mesh.
 *
 * Saddles are box-shaped supports positioned below a horizontal vessel.
 * The box width is a fixed 400 mm (scaled), while height and depth are
 * derived from the vessel radius so they scale proportionally with vessel
 * size.
 *
 * @param saddle        - Configuration for this saddle (position & color)
 * @param index         - Index of the saddle in the saddles array
 * @param vesselState   - Current vessel dimensions and orientation
 * @param isSelected    - Whether this saddle is currently selected
 * @param highlightMaterial - Shared highlight material for selected saddles
 * @returns A positioned THREE.Mesh ready to be added to the vessel group
 */
export function createSaddleMesh(
  saddle: SaddleConfig,
  index: number,
  vesselState: VesselState,
  isSelected: boolean,
  highlightMaterial: THREE.MeshPhongMaterial,
): THREE.Mesh {
  const RADIUS = vesselState.id / 2;
  const TAN_TAN = vesselState.length;

  const x = (saddle.pos - TAN_TAN / 2) * SCALE;
  const color = saddle.color || '#2244ff';

  const geom = new THREE.BoxGeometry(
    400 * SCALE,
    RADIUS * SCALE,
    RADIUS * 2.2 * SCALE,
  );

  let mat: THREE.MeshPhongMaterial;
  if (isSelected) {
    mat = highlightMaterial;
  } else {
    mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(color),
      shininess: 30,
    });
  }

  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, -RADIUS * 1.2 * SCALE, 0);
  mesh.userData = { type: 'saddle', id: index };

  return mesh;
}

/**
 * Create all saddle meshes for the current vessel state.
 *
 * Returns an empty array for vertical vessels because saddle supports
 * only apply to horizontal orientations.
 *
 * @param vesselState          - Current vessel dimensions, orientation, and saddle list
 * @param selectedSaddleIndex  - Index of the currently selected saddle (-1 for none)
 * @param highlightMaterial    - Shared highlight material for the selected saddle
 * @returns Array of positioned THREE.Mesh instances (one per saddle)
 */
export function createAllSaddles(
  vesselState: VesselState,
  selectedSaddleIndex: number,
  highlightMaterial: THREE.MeshPhongMaterial,
): THREE.Mesh[] {
  if (vesselState.orientation === 'vertical') return [];

  return vesselState.saddles.map((saddle, idx) =>
    createSaddleMesh(
      saddle,
      idx,
      vesselState,
      idx === selectedSaddleIndex,
      highlightMaterial,
    ),
  );
}
