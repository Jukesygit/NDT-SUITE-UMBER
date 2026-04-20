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
 * Uses the same preset as the shell so welds match the vessel appearance.
 */
export function createWeldMaterial(
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
 * Create a highlight material for the currently selected weld.
 */
export function createWeldHighlightMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x44ff88,
    emissive: 0x22cc66,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.3,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}

/**
 * Create an additive-blended glow material for the weld selection halo.
 * Rendered on a slightly oversized duplicate mesh to simulate light emanation.
 */
export function createWeldGlowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x44ff88,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    depthWrite: false,
  });
}

// ---------------------------------------------------------------------------
// Pipeline Materials
// ---------------------------------------------------------------------------

/**
 * Create a material for pipe segments.
 * Uses the same preset system as nozzles for consistency.
 */
export function createPipelineMaterial(
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
 * Create the green ring material used for pipe connection point indicators.
 */
export function createConnectionPointMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x00ff88,
    emissive: 0x004422,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    roughness: 0.3,
    metalness: 0.2,
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
