// =============================================================================
// Vessel Modeler - Vessel Geometry Module
// =============================================================================
// Builds the complete 3D vessel scene: shell, ellipsoidal heads, nozzles,
// saddle supports, texture decals, and grid helper.
//
// Ported from the standalone HTML tool's buildScene() and createTexturePlane()
// functions. All geometry dimensions, proportions, and calculations are
// preserved exactly from the original.
// =============================================================================

import * as THREE from 'three';
import { type VesselState, type TextureConfig } from '../types';
import { SCALE } from './materials';
import { createFlangedNozzle } from './nozzle-geometry';
import { createLiftingLug } from './lifting-lug-geometry';

// ---------------------------------------------------------------------------
// Result interface
// ---------------------------------------------------------------------------

export interface BuildSceneResult {
  vesselGroup: THREE.Group;
  nozzleMeshes: THREE.Object3D[];
  lugMeshes: THREE.Object3D[];
  saddleMeshes: THREE.Mesh[];
  textureMeshes: THREE.Mesh[];
}

// ---------------------------------------------------------------------------
// createTexturePlane (internal helper)
// ---------------------------------------------------------------------------

/**
 * Create a curved mesh that wraps a texture image onto the vessel surface
 * as a decal. The mesh follows the curvature of the cylinder and ellipsoidal
 * heads, with a small offset to prevent z-fighting.
 */
function createTexturePlane(
  tex: TextureConfig,
  shellRadius: number,
  state: VesselState,
  threeTexture: THREE.Texture,
  selectedTextureId: number,
): THREE.Mesh | null {
  if (!threeTexture) return null;

  // Get image aspect ratio
  const img = threeTexture.image as HTMLImageElement;
  let aspect = img.width / img.height;

  // Swap aspect ratio for 90deg and 270deg rotations
  const rotation = tex.rotation || 0;
  if (rotation === 90 || rotation === 270) {
    aspect = 1 / aspect;
  }

  // Base size relative to vessel - size in mm
  const RADIUS = shellRadius;
  const TAN_TAN = state.length;
  const HEAD_DEPTH = state.id / (2 * state.headRatio);
  const baseSize = RADIUS * 0.4; // Base size in mm
  const texWidth = baseSize * tex.scaleX * aspect; // Width in mm (along vessel length)
  // Apply curvature compensation: increase circumferential coverage slightly
  // to counteract the visual foreshortening from the cylinder curving away
  const curvatureCompensation = 1.15; // ~15% increase to account for arc vs perceived chord
  const texHeight = baseSize * tex.scaleY * curvatureCompensation; // Height in mm (around circumference)

  // Calculate angular span (in radians) based on texture height
  const circumference = 2 * Math.PI * RADIUS;
  const angularSpan = (texHeight / circumference) * 2 * Math.PI;

  // Resolution of the curved mesh - high segment count for smooth curvature
  const baseSegments = 64;
  const segmentsX = Math.ceil(baseSegments * Math.max(1, tex.scaleX * 1.5)); // Along vessel length
  const segmentsY = Math.ceil(baseSegments * Math.max(1, tex.scaleY * 2)); // Around circumference

  // Create custom geometry
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Center angle in radians
  const centerAngle = (tex.angle * Math.PI) / 180;

  // Small offset to prevent z-fighting
  const surfaceOffset = 2; // mm offset from surface

  // Get flip settings
  const flipH = tex.flipH || false;
  const flipV = tex.flipV || false;

  // Helper function to transform UV coordinates
  function transformUV(u: number, v: number): [number, number] {
    // Apply flips first
    let tu = flipH ? 1 - u : u;
    let tv = flipV ? 1 - v : v;

    // Apply rotation (around center 0.5, 0.5) in UV space
    switch (rotation) {
      case 90:
        [tu, tv] = [1 - tv, tu];
        break;
      case 180:
        [tu, tv] = [1 - tu, 1 - tv];
        break;
      case 270:
        [tu, tv] = [tv, 1 - tu];
        break;
      default: // 0 degrees
        break;
    }

    return [tu, tv];
  }

  const isVertical = state.orientation === 'vertical';

  for (let iy = 0; iy <= segmentsY; iy++) {
    const v = iy / segmentsY;
    // Angle offset from center (-0.5 to 0.5 of angular span)
    const angleOffset = (v - 0.5) * angularSpan;
    const currentAngle = centerAngle + angleOffset;

    for (let ix = 0; ix <= segmentsX; ix++) {
      const u = ix / segmentsX;
      // Position offset from center (-0.5 to 0.5 of width)
      const posOffset = (u - 0.5) * texWidth;
      const currentPos = tex.pos + posOffset;

      // Calculate 3D position on vessel surface
      let x: number, y: number, z: number;
      const pos_global = (currentPos - TAN_TAN / 2) * SCALE;

      if (currentPos < 0) {
        // Bottom/Left ellipsoidal head
        const pos_local = currentPos;
        const ratio = Math.min(0.99, Math.abs(pos_local / HEAD_DEPTH));
        const r_local = RADIUS * Math.sqrt(1 - ratio * ratio);

        if (isVertical) {
          x = (r_local + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = pos_global;
          z = (r_local + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = pos_global;
          y = (r_local + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (r_local + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      } else if (currentPos > TAN_TAN) {
        // Top/Right ellipsoidal head
        const pos_local = currentPos - TAN_TAN;
        const ratio = Math.min(0.99, Math.abs(pos_local / HEAD_DEPTH));
        const r_local = RADIUS * Math.sqrt(1 - ratio * ratio);

        if (isVertical) {
          x = (r_local + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = pos_global;
          z = (r_local + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = pos_global;
          y = (r_local + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (r_local + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      } else {
        // Cylindrical shell
        if (isVertical) {
          x = (RADIUS + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = pos_global;
          z = (RADIUS + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = pos_global;
          y = (RADIUS + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (RADIUS + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      }

      vertices.push(x, y, z);

      // Transform UV coordinates based on rotation and flip
      const [tu, tv] = transformUV(u, 1 - v);
      uvs.push(tu, tv);
    }
  }

  // Create triangle indices
  for (let iy = 0; iy < segmentsY; iy++) {
    for (let ix = 0; ix < segmentsX; ix++) {
      const a = ix + (segmentsX + 1) * iy;
      const b = ix + (segmentsX + 1) * (iy + 1);
      const c = ix + 1 + (segmentsX + 1) * (iy + 1);
      const d = ix + 1 + (segmentsX + 1) * iy;

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Create material with texture
  const material = new THREE.MeshBasicMaterial({
    map: threeTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Add highlight border if selected
  if (tex.id === selectedTextureId) {
    // Create a slightly larger version for the border
    const borderVertices: number[] = [];
    const borderScale = 1.08;

    for (let iy = 0; iy <= segmentsY; iy++) {
      const v = iy / segmentsY;
      const angleOffset = (v - 0.5) * angularSpan * borderScale;
      const currentAngle2 = centerAngle + angleOffset;

      for (let ix = 0; ix <= segmentsX; ix++) {
        const u = ix / segmentsX;
        const posOffset = (u - 0.5) * texWidth * borderScale;
        const currentPos = tex.pos + posOffset;

        let bx: number, by: number, bz: number;
        const pos_global = (currentPos - TAN_TAN / 2) * SCALE;
        const borderOffset = surfaceOffset - 1; // Slightly behind

        if (currentPos < 0) {
          const pos_local = currentPos;
          const ratio = Math.min(0.99, Math.abs(pos_local / HEAD_DEPTH));
          const r_local = RADIUS * Math.sqrt(1 - ratio * ratio);
          if (isVertical) {
            bx = (r_local + borderOffset) * SCALE * Math.cos(currentAngle2);
            by = pos_global;
            bz = (r_local + borderOffset) * SCALE * Math.sin(currentAngle2);
          } else {
            bx = pos_global;
            by = (r_local + borderOffset) * SCALE * Math.sin(currentAngle2);
            bz = (r_local + borderOffset) * SCALE * Math.cos(currentAngle2);
          }
        } else if (currentPos > TAN_TAN) {
          const pos_local = currentPos - TAN_TAN;
          const ratio = Math.min(0.99, Math.abs(pos_local / HEAD_DEPTH));
          const r_local = RADIUS * Math.sqrt(1 - ratio * ratio);
          if (isVertical) {
            bx = (r_local + borderOffset) * SCALE * Math.cos(currentAngle2);
            by = pos_global;
            bz = (r_local + borderOffset) * SCALE * Math.sin(currentAngle2);
          } else {
            bx = pos_global;
            by = (r_local + borderOffset) * SCALE * Math.sin(currentAngle2);
            bz = (r_local + borderOffset) * SCALE * Math.cos(currentAngle2);
          }
        } else {
          if (isVertical) {
            bx = (RADIUS + borderOffset) * SCALE * Math.cos(currentAngle2);
            by = pos_global;
            bz = (RADIUS + borderOffset) * SCALE * Math.sin(currentAngle2);
          } else {
            bx = pos_global;
            by = (RADIUS + borderOffset) * SCALE * Math.sin(currentAngle2);
            bz = (RADIUS + borderOffset) * SCALE * Math.cos(currentAngle2);
          }
        }

        borderVertices.push(bx, by, bz);
      }
    }

    const borderGeom = new THREE.BufferGeometry();
    borderGeom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(borderVertices, 3),
    );
    borderGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    borderGeom.setIndex(indices);

    const borderMat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const border = new THREE.Mesh(borderGeom, borderMat);
    mesh.add(border);
  }

  mesh.userData = { type: 'texture', textureIdx: tex.id };

  return mesh;
}

// ---------------------------------------------------------------------------
// buildVesselScene
// ---------------------------------------------------------------------------

/**
 * Build the complete 3D vessel scene.
 *
 * Creates a `THREE.Group` containing:
 * - Shell cylinder (horizontal along X axis, vertical along Y axis)
 * - Left/right (or bottom/top) ellipsoidal heads
 * - Flanged nozzles positioned on the shell surface
 * - Saddle supports (horizontal vessels only)
 * - Texture decals wrapped onto the shell surface
 * - Grid helper for spatial reference
 *
 * @returns A `BuildSceneResult` with the group and mesh reference arrays
 *          needed for raycasting and selection.
 */
export function buildVesselScene(
  state: VesselState,
  shellMaterial: THREE.MeshPhongMaterial,
  nozzleMaterial: THREE.MeshPhongMaterial,
  nozzleHighlightMaterial: THREE.MeshPhongMaterial,
  lugMaterial: THREE.MeshPhongMaterial,
  lugHighlightMaterial: THREE.MeshPhongMaterial,
  saddleHighlightMaterial: THREE.MeshPhongMaterial,
  textureObjects: Record<number, THREE.Texture>,
  selectedNozzleIndex: number,
  selectedLugIndex: number,
  selectedSaddleIndex: number,
  selectedTextureId: number,
): BuildSceneResult {
  const vesselGroup = new THREE.Group();
  const nozzleMeshes: THREE.Object3D[] = [];
  const lugMeshes: THREE.Object3D[] = [];
  const saddleMeshes: THREE.Mesh[] = [];
  const textureMeshes: THREE.Mesh[] = [];

  // -- Return empty group with grid if no model data yet --------------------
  if (!state.hasModel) {
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    vesselGroup.add(grid);
    return { vesselGroup, nozzleMeshes, lugMeshes, saddleMeshes, textureMeshes };
  }

  // -- Vessel dimensions ----------------------------------------------------
  const RADIUS = state.id / 2;
  const TAN_TAN = state.length;
  const HEAD_DEPTH = state.id / (2 * state.headRatio);
  const isVertical = state.orientation === 'vertical';

  // -- Shell cylinder -------------------------------------------------------
  const shellGeom = new THREE.CylinderGeometry(
    RADIUS * SCALE,
    RADIUS * SCALE,
    TAN_TAN * SCALE,
    64,
    1,
    true,
  );
  const shell = new THREE.Mesh(shellGeom, shellMaterial);
  if (!isVertical) {
    shell.rotation.z = Math.PI / 2; // Horizontal orientation
  }
  shell.userData = { type: 'shell', isShell: true };
  vesselGroup.add(shell);

  // -- Ellipsoidal heads ----------------------------------------------------
  const headGeom = new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);

  const bottomHead = new THREE.Mesh(headGeom, shellMaterial);
  const topHead = new THREE.Mesh(headGeom, shellMaterial);

  if (isVertical) {
    // Vertical: heads at top and bottom (Y axis)
    bottomHead.rotation.x = Math.PI; // Point down
    bottomHead.position.y = -(TAN_TAN / 2) * SCALE;
    bottomHead.scale.set(RADIUS * SCALE, HEAD_DEPTH * SCALE, RADIUS * SCALE);

    topHead.rotation.x = 0; // Point up
    topHead.position.y = (TAN_TAN / 2) * SCALE;
    topHead.scale.set(RADIUS * SCALE, HEAD_DEPTH * SCALE, RADIUS * SCALE);
  } else {
    // Horizontal: heads at left and right (X axis)
    bottomHead.rotation.z = Math.PI / 2;
    bottomHead.position.x = -(TAN_TAN / 2) * SCALE;
    bottomHead.scale.set(RADIUS * SCALE, HEAD_DEPTH * SCALE, RADIUS * SCALE);

    topHead.rotation.z = -Math.PI / 2;
    topHead.position.x = (TAN_TAN / 2) * SCALE;
    topHead.scale.set(RADIUS * SCALE, HEAD_DEPTH * SCALE, RADIUS * SCALE);
  }
  bottomHead.userData = { type: 'shell', isShell: true };
  topHead.userData = { type: 'shell', isShell: true };
  vesselGroup.add(bottomHead);
  vesselGroup.add(topHead);

  // -- Nozzles --------------------------------------------------------------
  state.nozzles.forEach((n, idx) => {
    // Create flanged nozzle group
    const mat = idx === selectedNozzleIndex ? nozzleHighlightMaterial : nozzleMaterial;
    const nozzleGroup = createFlangedNozzle(n, RADIUS, mat);

    // DYNAMIC RADIUS AND NORMAL CALCULATION
    let r_local = RADIUS;
    const normal = new THREE.Vector3();
    const rad = (n.angle * Math.PI) / 180;

    if (isVertical) {
      // VERTICAL VESSEL - position along Y axis
      const y_global = (n.pos - TAN_TAN / 2) * SCALE;

      if (n.pos < 0) {
        // BOTTOM HEAD (Ellipsoid)
        const y_local = n.pos;
        const ratio = Math.min(1, Math.abs(y_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);

        const x_u = r_local * Math.cos(rad);
        const z_u = r_local * Math.sin(rad);

        normal
          .set(
            x_u / (RADIUS * RADIUS),
            y_local / (HEAD_DEPTH * HEAD_DEPTH),
            z_u / (RADIUS * RADIUS),
          )
          .normalize();
      } else if (n.pos > TAN_TAN) {
        // TOP HEAD
        const y_local = n.pos - TAN_TAN;
        const ratio = Math.min(1, Math.abs(y_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);

        const x_u = r_local * Math.cos(rad);
        const z_u = r_local * Math.sin(rad);

        normal
          .set(
            x_u / (RADIUS * RADIUS),
            y_local / (HEAD_DEPTH * HEAD_DEPTH),
            z_u / (RADIUS * RADIUS),
          )
          .normalize();
      } else {
        // CYLINDER SHELL
        r_local = RADIUS;
        normal.set(Math.cos(rad), 0, Math.sin(rad)).normalize();
      }

      // Calculate final 3D position for vertical vessel
      const x = r_local * SCALE * Math.cos(rad);
      const z = r_local * SCALE * Math.sin(rad);
      nozzleGroup.position.set(x, y_global, z);
    } else {
      // HORIZONTAL VESSEL - position along X axis
      const x_global = (n.pos - TAN_TAN / 2) * SCALE;

      if (n.pos < 0) {
        // LEFT HEAD (Ellipsoid)
        const x_local = n.pos;
        const ratio = Math.min(1, Math.abs(x_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);

        const y_u = r_local * Math.sin(rad);
        const z_u = r_local * Math.cos(rad);

        normal
          .set(
            x_local / (HEAD_DEPTH * HEAD_DEPTH),
            y_u / (RADIUS * RADIUS),
            z_u / (RADIUS * RADIUS),
          )
          .normalize();
      } else if (n.pos > TAN_TAN) {
        // RIGHT HEAD
        const x_local = n.pos - TAN_TAN;
        const ratio = Math.min(1, Math.abs(x_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);

        const y_u = r_local * Math.sin(rad);
        const z_u = r_local * Math.cos(rad);

        normal
          .set(
            x_local / (HEAD_DEPTH * HEAD_DEPTH),
            y_u / (RADIUS * RADIUS),
            z_u / (RADIUS * RADIUS),
          )
          .normalize();
      } else {
        // CYLINDER SHELL
        r_local = RADIUS;
        normal.set(0, Math.sin(rad), Math.cos(rad)).normalize();
      }

      // Calculate final 3D position for horizontal vessel
      const y = r_local * SCALE * Math.sin(rad);
      const z = r_local * SCALE * Math.cos(rad);
      nozzleGroup.position.set(x_global, y, z);
    }

    // Orient nozzle to be normal to surface
    // Nozzle is built along +Y axis, rotate to align with surface normal
    const defaultDir = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultDir, normal);
    nozzleGroup.quaternion.copy(quaternion);

    nozzleGroup.userData = { type: 'nozzle', nozzleIdx: idx };
    vesselGroup.add(nozzleGroup);
    nozzleMeshes.push(nozzleGroup);
  });

  // -- Lifting Lugs -----------------------------------------------------------
  state.liftingLugs.forEach((lug, idx) => {
    const mat = idx === selectedLugIndex ? lugHighlightMaterial : lugMaterial;
    const lugGroup = createLiftingLug(lug, mat, RADIUS);

    // Same position/orientation logic as nozzles (pos/angle on shell surface)
    let r_local = RADIUS;
    const normal = new THREE.Vector3();
    const rad = (lug.angle * Math.PI) / 180;

    if (isVertical) {
      const y_global = (lug.pos - TAN_TAN / 2) * SCALE;

      if (lug.pos < 0) {
        const y_local = lug.pos;
        const ratio = Math.min(1, Math.abs(y_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);
        normal
          .set(
            r_local * Math.cos(rad) / (RADIUS * RADIUS),
            y_local / (HEAD_DEPTH * HEAD_DEPTH),
            r_local * Math.sin(rad) / (RADIUS * RADIUS),
          )
          .normalize();
      } else if (lug.pos > TAN_TAN) {
        const y_local = lug.pos - TAN_TAN;
        const ratio = Math.min(1, Math.abs(y_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);
        normal
          .set(
            r_local * Math.cos(rad) / (RADIUS * RADIUS),
            y_local / (HEAD_DEPTH * HEAD_DEPTH),
            r_local * Math.sin(rad) / (RADIUS * RADIUS),
          )
          .normalize();
      } else {
        normal.set(Math.cos(rad), 0, Math.sin(rad)).normalize();
      }

      const x = r_local * SCALE * Math.cos(rad);
      const z = r_local * SCALE * Math.sin(rad);
      lugGroup.position.set(x, y_global, z);
    } else {
      const x_global = (lug.pos - TAN_TAN / 2) * SCALE;

      if (lug.pos < 0) {
        const x_local = lug.pos;
        const ratio = Math.min(1, Math.abs(x_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);
        normal
          .set(
            x_local / (HEAD_DEPTH * HEAD_DEPTH),
            r_local * Math.sin(rad) / (RADIUS * RADIUS),
            r_local * Math.cos(rad) / (RADIUS * RADIUS),
          )
          .normalize();
      } else if (lug.pos > TAN_TAN) {
        const x_local = lug.pos - TAN_TAN;
        const ratio = Math.min(1, Math.abs(x_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);
        normal
          .set(
            x_local / (HEAD_DEPTH * HEAD_DEPTH),
            r_local * Math.sin(rad) / (RADIUS * RADIUS),
            r_local * Math.cos(rad) / (RADIUS * RADIUS),
          )
          .normalize();
      } else {
        normal.set(0, Math.sin(rad), Math.cos(rad)).normalize();
      }

      const y = r_local * SCALE * Math.sin(rad);
      const z = r_local * SCALE * Math.cos(rad);
      lugGroup.position.set(x_global, y, z);
    }

    // Orient lug normal to surface (same as nozzles)
    const defaultDir = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultDir, normal);
    lugGroup.quaternion.copy(quaternion);

    lugGroup.userData = { type: 'liftingLug', lugIdx: idx };
    vesselGroup.add(lugGroup);
    lugMeshes.push(lugGroup);
  });

  // -- Saddles (only for horizontal vessels) --------------------------------
  if (!isVertical) {
    state.saddles.forEach((saddle, idx) => {
      const pos = saddle.pos;
      const color = saddle.color || '#2244ff';
      const x = (pos - TAN_TAN / 2) * SCALE;
      const geom = new THREE.BoxGeometry(
        400 * SCALE,
        RADIUS * SCALE,
        RADIUS * 2.2 * SCALE,
      );
      let mat: THREE.MeshPhongMaterial;
      if (idx === selectedSaddleIndex) {
        mat = saddleHighlightMaterial;
      } else {
        mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color(color),
          shininess: 30,
        });
      }
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, -RADIUS * 1.2 * SCALE, 0);
      mesh.userData = { type: 'saddle', saddleIdx: idx };
      vesselGroup.add(mesh);
      saddleMeshes.push(mesh);
    });
  }

  // -- Textures / Decals ----------------------------------------------------
  state.textures.forEach((tex) => {
    const threeTexture = textureObjects[Number(tex.id)];
    if (!threeTexture) return;

    const mesh = createTexturePlane(tex, RADIUS, state, threeTexture, selectedTextureId);
    if (mesh) {
      vesselGroup.add(mesh);
      textureMeshes.push(mesh);
    }
  });

  // -- Grid helper ----------------------------------------------------------
  const gridSize = isVertical
    ? Math.max(30, (TAN_TAN + RADIUS * 2) * SCALE * 1.2)
    : Math.max(30, TAN_TAN * SCALE * 1.5);
  const grid = new THREE.GridHelper(gridSize, 30, 0x444444, 0x222222);
  grid.position.y = isVertical
    ? -(TAN_TAN / 2 + HEAD_DEPTH + RADIUS * 0.5) * SCALE
    : -RADIUS * 1.5 * SCALE;
  vesselGroup.add(grid);

  return { vesselGroup, nozzleMeshes, lugMeshes, saddleMeshes, textureMeshes };
}
