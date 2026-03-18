// =============================================================================
// Vessel Modeler - Inspection Image Geometry
// =============================================================================
// Creates leader lines and shell-contact dot markers for inspection images
// attached to the vessel surface. Each image gets:
//   1. A small sphere at the shell contact point
//   2. A line projecting radially outward to where the CSS2D thumbnail sits
// =============================================================================

import * as THREE from 'three';
import type { InspectionImageConfig, VesselState } from '../types';
import { shellPoint } from './annotation-geometry';
import { SCALE } from './materials';

/** Default leader line length in mm */
const DEFAULT_LEADER_LENGTH_MM = 2000;

/** Dot marker radius in world units (larger for easier clicking) */
const DOT_RADIUS = 0.08;

// Shared geometry + materials (created once, reused)
let dotGeometry: THREE.SphereGeometry | null = null;
let dotMaterial: THREE.MeshBasicMaterial | null = null;
let dotMaterialSelected: THREE.MeshBasicMaterial | null = null;

function getDotGeometry(): THREE.SphereGeometry {
  if (!dotGeometry) dotGeometry = new THREE.SphereGeometry(DOT_RADIUS, 12, 8);
  return dotGeometry;
}

function getDotMaterial(): THREE.MeshBasicMaterial {
  if (!dotMaterial) dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  return dotMaterial;
}

function getDotMaterialSelected(): THREE.MeshBasicMaterial {
  if (!dotMaterialSelected) dotMaterialSelected = new THREE.MeshBasicMaterial({ color: 0x00ccff });
  return dotMaterialSelected;
}

/**
 * Compute the radial outward direction at a given shell surface point.
 * Returns a unit vector pointing away from the vessel axis.
 */
function getRadialDirection(
  _posMm: number,
  angleRad: number,
  vesselState: VesselState,
): THREE.Vector3 {
  const isVertical = vesselState.orientation === 'vertical';

  if (isVertical) {
    return new THREE.Vector3(
      Math.cos(angleRad),
      0,
      Math.sin(angleRad),
    ).normalize();
  } else {
    return new THREE.Vector3(
      0,
      Math.sin(angleRad),
      Math.cos(angleRad),
    ).normalize();
  }
}

/**
 * Compute the 3D position at the outer end of the leader line
 * (where the thumbnail CSS2D label will be placed).
 */
export function getLeaderEndPosition(
  config: InspectionImageConfig,
  vesselState: VesselState,
): THREE.Vector3 {
  const surfaceOffset = 2; // mm above shell
  const angleRad = (config.angle * Math.PI) / 180;
  const shellPos = shellPoint(config.pos, angleRad, vesselState, surfaceOffset);

  // Free-form offset takes priority over radial leader length
  if (config.labelOffset) {
    return new THREE.Vector3(
      shellPos.x + config.labelOffset[0],
      shellPos.y + config.labelOffset[1],
      shellPos.z + config.labelOffset[2],
    );
  }

  const radial = getRadialDirection(config.pos, angleRad, vesselState);
  const leaderLengthMm = config.leaderLength ?? DEFAULT_LEADER_LENGTH_MM;
  const leaderOffset = leaderLengthMm * SCALE;
  return shellPos.clone().add(radial.multiplyScalar(leaderOffset));
}

/**
 * Create a THREE.Group containing the dot marker and leader line for a
 * single inspection image.
 */
export function createInspectionImageMarker(
  config: InspectionImageConfig,
  vesselState: VesselState,
  isSelected: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { inspectionImageId: config.id };

  const surfaceOffset = 2; // mm above shell
  const angleRad = (config.angle * Math.PI) / 180;

  // 1. Shell contact point
  const shellPos = shellPoint(config.pos, angleRad, vesselState, surfaceOffset);

  // 2. Dot marker at shell contact
  const dot = new THREE.Mesh(
    getDotGeometry(),
    isSelected ? getDotMaterialSelected() : getDotMaterial(),
  );
  dot.position.copy(shellPos);
  dot.userData = { inspectionImageId: config.id, isDot: true };
  group.add(dot);

  // 3. Leader line from shell to thumbnail position (uses labelOffset if set)
  const leaderEnd = getLeaderEndPosition(config, vesselState);

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([shellPos, leaderEnd]);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: isSelected ? 0x00ccff : 0xffffff,
    transparent: true,
    opacity: 0.6,
  });
  const line = new THREE.Line(lineGeometry, lineMaterial);
  group.add(line);

  return group;
}

/**
 * Create all inspection image markers for the current vessel state.
 * Returns the group and an array of dot meshes for raycasting.
 */
export function createAllInspectionImageMarkers(
  vesselState: VesselState,
  selectedImageId: number,
): { group: THREE.Group; dotMeshes: THREE.Object3D[] } {
  const group = new THREE.Group();
  const dotMeshes: THREE.Object3D[] = [];

  for (const img of vesselState.inspectionImages) {
    if (img.visible === false) continue;
    const marker = createInspectionImageMarker(img, vesselState, img.id === selectedImageId);
    group.add(marker);

    // Collect dot meshes for interaction raycasting
    marker.traverse((child) => {
      if (child.userData.isDot) {
        dotMeshes.push(child);
      }
    });
  }

  return { group, dotMeshes };
}
