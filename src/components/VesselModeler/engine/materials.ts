// =============================================================================
// Vessel Modeler - Materials Module
// =============================================================================
// Factory functions for creating Three.js materials used in the vessel scene.
// Each factory returns a NEW material instance for proper lifecycle management
// (creation, update, disposal).
//
// Uses MeshStandardMaterial (PBR) for physically-based roughness/metalness.
// =============================================================================

import * as THREE from 'three';
import { MATERIAL_PRESETS, type MaterialKey } from '../types';

/** Conversion factor: millimeters to Three.js world units */
export const SCALE = 0.001;

// ---------------------------------------------------------------------------
// Shell Material
// ---------------------------------------------------------------------------

/**
 * Create a new shell (vessel body) material.
 * Uses DoubleSide rendering so the interior is visible when the camera
 * is inside the vessel or when opacity is reduced.
 */
export function createShellMaterial(
  preset: MaterialKey = 'cs',
): THREE.MeshStandardMaterial {
  const p = MATERIAL_PRESETS[preset];
  return new THREE.MeshStandardMaterial({
    color: p.color,
    emissive: p.emissive,
    roughness: p.roughness,
    metalness: p.metalness,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1.0,
  });
}

// ---------------------------------------------------------------------------
// Nozzle Material
// ---------------------------------------------------------------------------

/**
 * Create a new nozzle material.
 * Front-side only since nozzles are closed geometry.
 */
export function createNozzleMaterial(
  preset: MaterialKey = 'cs',
): THREE.MeshStandardMaterial {
  const p = MATERIAL_PRESETS[preset];
  return new THREE.MeshStandardMaterial({
    color: p.color,
    emissive: p.emissive,
    roughness: p.roughness,
    metalness: p.metalness,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}

// ---------------------------------------------------------------------------
// Highlight Material (selected nozzle / element)
// ---------------------------------------------------------------------------

/**
 * Create a bright highlight material used for the currently selected nozzle.
 */
export function createHighlightMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffcc00,
    emissive: 0x553300,
    roughness: 0.3,
    metalness: 0.5,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}

// ---------------------------------------------------------------------------
// Saddle Materials
// ---------------------------------------------------------------------------

/**
 * Create a material for saddle supports.
 * @param color - Hex color number (default matches the blue used in saddle config)
 */
export function createSaddleMaterial(
  color: number = 0x2244ff,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: 0x000033,
    roughness: 0.5,
    metalness: 0.4,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}

/**
 * Create a highlight material for the currently selected saddle.
 */
export function createSaddleHighlightMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x44ccff,
    emissive: 0x003355,
    roughness: 0.3,
    metalness: 0.5,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}

// ---------------------------------------------------------------------------
// Lifting Lug Materials
// ---------------------------------------------------------------------------

/**
 * Create a material for lifting lugs.
 * Uses a slightly warmer tone to distinguish from nozzles.
 */
export function createLugMaterial(
  preset: MaterialKey = 'cs',
): THREE.MeshStandardMaterial {
  const p = MATERIAL_PRESETS[preset];
  return new THREE.MeshStandardMaterial({
    color: p.color,
    emissive: p.emissive,
    roughness: p.roughness,
    metalness: p.metalness,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}

/**
 * Create a highlight material for the currently selected lifting lug.
 */
export function createLugHighlightMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xff8844,
    emissive: 0x553311,
    roughness: 0.3,
    metalness: 0.5,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}

// ---------------------------------------------------------------------------
// Weld Materials
// ---------------------------------------------------------------------------

/**
 * Create a material for weld seams.
 * Uses a darker, rougher finish to visually distinguish welds from the shell.
 */
export function createWeldMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x888888,
    emissive: 0x111111,
    roughness: 0.7,
    metalness: 0.5,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}

/**
 * Create a highlight material for the currently selected weld.
 */
export function createWeldHighlightMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x44ff88,
    emissive: 0x115533,
    roughness: 0.3,
    metalness: 0.5,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}

// ---------------------------------------------------------------------------
// Preset Update Utility
// ---------------------------------------------------------------------------

/**
 * Update an existing material to match a different preset, optionally
 * setting a new opacity value. This avoids re-creating materials when
 * only the visual appearance changes (e.g., user switches from Carbon
 * Steel to Stainless Steel).
 */
export function updateMaterialPreset(
  material: THREE.MeshStandardMaterial,
  preset: MaterialKey,
  opacity?: number,
): void {
  const p = MATERIAL_PRESETS[preset];
  material.color.setHex(p.color);
  material.emissive.setHex(p.emissive);
  material.roughness = p.roughness;
  material.metalness = p.metalness;

  if (opacity !== undefined) {
    material.opacity = opacity;
    material.transparent = opacity < 1.0;
  }

  material.needsUpdate = true;
}
