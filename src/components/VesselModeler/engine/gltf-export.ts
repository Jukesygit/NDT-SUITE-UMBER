// =============================================================================
// Vessel Modeler - glTF/GLB Export
// =============================================================================
// Exports the vessel model as a single .glb file with all geometry, textures,
// scan heatmaps, annotation shapes, ruler lines, leader lines, and baked text
// label sprites. CSS2DObject labels (HTML overlays) are replaced with
// THREE.Sprite equivalents for export compatibility.
// =============================================================================

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { VesselState } from '../types';
import { createAnnotationLabelSprite, createNozzleLabelSprite, createRulerLabelSprite, createNameplateSprites, createCardinalDirectionSprites } from './text-sprite';

// ---------------------------------------------------------------------------
// userData types to exclude from export
// ---------------------------------------------------------------------------

const EXCLUDE_TYPES = new Set([
  'annotation-fill',
  'texture-border',
  'scanComposite-border',
  'coverageRect',
  'scanGizmo',
  'scanGizmoArrowCirc',
  'scanGizmoArrowLong',
  'annotation-label',
  'ruler-label',
  'inspection-image-label',
]);

// ---------------------------------------------------------------------------
// Scene Filtering
// ---------------------------------------------------------------------------

/**
 * Returns true if the object should be removed from the export clone.
 */
function shouldExclude(obj: THREE.Object3D): boolean {
  // CSS2D labels (HTML overlays) cannot export
  if (obj instanceof CSS2DObject) return true;

  // Three.js helpers
  if (obj instanceof THREE.GridHelper) return true;
  if (obj instanceof THREE.AxesHelper) return true;

  const ud = obj.userData;
  const type = ud?.type as string | undefined;

  // Excluded userData types
  if (type && EXCLUDE_TYPES.has(type)) return true;

  // Invisible hit meshes (opacity === 0)
  if (obj instanceof THREE.Mesh) {
    const mat = obj.material as THREE.MeshBasicMaterial;
    if (mat && mat.opacity === 0 && mat.transparent) return true;
  }

  return false;
}

/**
 * Recursively remove excluded objects from a cloned scene graph.
 * Works bottom-up so parent removal doesn't skip children.
 */
function filterScene(root: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];

  root.traverse((obj) => {
    if (obj === root) return;
    if (shouldExclude(obj)) {
      toRemove.push(obj);
    }
  });

  for (const obj of toRemove) {
    obj.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// Export Pipeline
// ---------------------------------------------------------------------------

/**
 * Temporarily strip large / non-serialisable userData fields before
 * `Object3D.clone(true)` (which internally does `JSON.parse(JSON.stringify(userData))`).
 * Returns a restore function that puts the original userData back.
 */
function stripHeavyUserData(root: THREE.Object3D): () => void {
  const saved: { obj: THREE.Object3D; original: Record<string, unknown> }[] = [];

  root.traverse((obj) => {
    const ud = obj.userData;
    if (!ud) return;
    // scanComposite meshes store the full measurement array in userData.data
    if (ud.type === 'scanComposite' && ud.data) {
      saved.push({ obj, original: { ...ud } });
      // Keep only lightweight fields needed for export identification
      const { data, stats, xAxis, yAxis, ...lightweight } = ud;
      obj.userData = lightweight;
    }
  });

  return () => {
    for (const entry of saved) {
      entry.obj.userData = entry.original;
    }
  };
}

/**
 * Export the vessel model as a binary .glb file and trigger a download.
 *
 * Pipeline:
 * 1. Deep-clone the vessel group (never mutate the live scene)
 * 2. Strip CSS2D labels, helpers, selection highlights, hit meshes, gizmos
 * 3. Bake annotation + ruler labels as Mesh planes (canvas textures)
 * 4. Run GLTFExporter in binary mode
 * 5. Create Blob and trigger browser download
 */
export async function exportVesselGLB(
  vesselGroup: THREE.Group,
  vesselState: VesselState,
): Promise<void> {
  // 1. Deep-clone to avoid mutating the live scene
  //    Strip heavy userData first to prevent JSON.stringify overflow during clone
  const restore = stripHeavyUserData(vesselGroup);
  let clone: THREE.Group;
  try {
    clone = vesselGroup.clone(true);
  } finally {
    restore();
  }

  // 2. Filter out non-exportable objects
  filterScene(clone);

  // 3. Add text label meshes for annotations
  for (const ann of vesselState.annotations) {
    if (!ann.showLabel) continue;
    if (ann.visible === false) continue;

    const sprite = await createAnnotationLabelSprite(ann, vesselState);
    clone.add(sprite);
  }

  // 4. Add text label meshes for rulers
  for (const ruler of vesselState.rulers) {
    if (!ruler.showLabel) continue;

    const sprite = createRulerLabelSprite(ruler, vesselState);
    clone.add(sprite);
  }

  // 5. Add nozzle name labels at the flange end
  if (vesselState.visuals.showNozzleLabels) {
    const nozzleGroups = new Map<number, THREE.Group>();
    clone.traverse((child) => {
      if (child.userData?.type === 'nozzle' && child.userData?.nozzleIdx !== undefined) {
        nozzleGroups.set(child.userData.nozzleIdx as number, child as THREE.Group);
      }
    });
    for (const [idx, nozzleGroup] of nozzleGroups) {
      const nozzle = vesselState.nozzles[idx];
      if (!nozzle?.name) continue;
      clone.add(createNozzleLabelSprite(nozzle, nozzleGroup, vesselState));
    }
  }

  // 6. Add nameplates if project info is provided (one on each side)
  const nameplates = createNameplateSprites(vesselState);
  if (nameplates) {
    clone.add(nameplates);
  }

  // 5b. Add cardinal direction labels if enabled
  if (vesselState.visuals.showCardinalDirections) {
    clone.add(createCardinalDirectionSprites(vesselState));
  }

  // 6. Export as GLB
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(clone, {
    binary: true,
  });

  // 6. Trigger download
  const blob = new Blob(
    [glb as ArrayBuffer],
    { type: 'application/octet-stream' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  const parts: string[] = [];
  if (vesselState.location) parts.push(sanitize(vesselState.location));
  if (vesselState.vesselName) parts.push(sanitize(vesselState.vesselName));
  if (vesselState.inspectionDate) parts.push(vesselState.inspectionDate);
  if (parts.length === 0) parts.push('vessel_model');
  a.download = `${parts.join('_')}.glb`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // 7. Dispose cloned resources
  clone.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mat = obj.material as THREE.Material;
      if (mat) mat.dispose();
      if (obj.geometry) obj.geometry.dispose();
    }
  });
}
