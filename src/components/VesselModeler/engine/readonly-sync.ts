// ---------------------------------------------------------------------------
// Read-only viewport in-place sync.
//
// Everything the read-only viewport pushes onto ALREADY-BUILT scene objects, so
// neither a visibility toggle nor a visual-settings change costs a rebuild:
//
//   * `applyLayerVisibility` — the entity ∧ layer ∧ body composition, written
//     into Object3D.visible. Same rule (and the same `layer-visibility` helpers)
//     ThreeViewport's `applyEntityVisibility` uses; the loop is duplicated
//     rather than shared because ThreeViewport's version closes over its own
//     component refs, so lifting it out would not be a pure move.
//   * `applyReadOnlyVisuals` — material + scene-chrome settings.
//
// Visual only: stats, coverage and wall-loss never read `visible`.
// ---------------------------------------------------------------------------

import type * as THREE from 'three';
import type { VesselState, VisualSettings } from '../types';
import { MATERIAL_PRESETS } from '../types';
import type { BuildSceneResult } from './vessel-geometry';
import type { ReadOnlyMaterials } from './readonly-scene';
import {
  isEffectivelyVisible,
  isLayerVisible,
  MAIN_BODY_KEY,
  type LayerVisibility,
} from './layer-visibility';
import type { LayerKey } from '../outliner-tree';

/** Mesh registries produced by the last build, keyed the way the layer pass walks them. */
export interface ReadOnlyRegistries {
  result: BuildSceneResult | null;
  weldMeshes: THREE.Object3D[];
  coverageMeshes: THREE.Object3D[];
  rulerMeshes: THREE.Object3D[];
  pipelineRoot: THREE.Object3D | null;
}

/**
 * Compose entity ∧ layer ∧ body into `Object3D.visible` across every registry.
 * Annotations and inspection images are absent by design — their CSS2D labels
 * are separate objects filtered at build time, so their layer rides the rebuild
 * path (mirrors ThreeViewport's accepted caveat).
 */
export function applyLayerVisibility(
  state: VesselState,
  registries: ReadOnlyRegistries,
  layers: LayerVisibility | undefined
): void {
  const { result: br } = registries;
  const bodyVisible = new Map(state.appendages.map((a) => [a.id, a.visible !== false]));
  // bodyId undefined ⇒ main shell, which is never hidden as a whole.
  const isBodyVisible = (bodyId?: string) =>
    bodyId === undefined ? true : (bodyVisible.get(bodyId) ?? true);

  const applyByUserData = (
    meshes: THREE.Object3D[] | undefined,
    key: string,
    category: LayerKey,
    lookup: (k: unknown) => { visible?: boolean; bodyId?: string } | undefined
  ) => {
    if (!meshes) return;
    for (const m of meshes) {
      const k = m.userData?.[key];
      if (k === undefined) continue;
      const cfg = lookup(k);
      if (cfg) {
        m.visible = isEffectivelyVisible(cfg, category, layers) && isBodyVisible(cfg.bodyId);
      }
    }
  };

  applyByUserData(br?.nozzleMeshes, 'nozzleIdx', 'nozzles', (k) => state.nozzles[k as number]);
  applyByUserData(br?.lugMeshes, 'lugIdx', 'lugs', (k) => state.liftingLugs[k as number]);
  applyByUserData(br?.saddleMeshes, 'saddleIdx', 'saddles', (k) => state.saddles[k as number]);
  applyByUserData(registries.weldMeshes, 'weldIdx', 'welds', (k) => state.welds[k as number]);
  applyByUserData(registries.coverageMeshes, 'coverageRectId', 'coverage', (k) =>
    state.coverageRects.find((c) => c.id === k)
  );
  applyByUserData(registries.rulerMeshes, 'rulerId', 'rulers', (k) =>
    state.rulers.find((r) => r.id === k)
  );
  applyByUserData(br?.textureMeshes, 'textureIdx', 'textures', (k) =>
    state.textures.find((t) => t.id === k)
  );
  applyByUserData(br?.scanCompositeMeshes, 'id', 'scans', (k) =>
    state.scanComposites.find((s) => s.id === k)
  );
  applyByUserData(br?.domeScanMeshes, 'id', 'domeScans', (k) =>
    (state.domeScanComposites ?? []).find((s) => s.id === k)
  );

  // Pipelines have no per-mesh registry; their shared root carries the layer.
  if (registries.pipelineRoot) {
    registries.pipelineRoot.visible = isLayerVisible(layers, MAIN_BODY_KEY, 'pipelines');
  }
  // A body is not a layer category — boot shells carry only the body term.
  for (const group of br?.appendageMeshes ?? []) {
    const bodyId = group.userData?.bodyId as string | undefined;
    if (bodyId !== undefined) group.visible = isBodyVisible(bodyId);
  }
}

/** Scene-manager surface the visual sync writes to (structural typing keeps this
 *  module free of a SceneManager import). */
export interface VisualTarget {
  setBackgroundColor(hex: string): void;
  setGridVisible(visible: boolean): void;
  updateGridColors(bgHex: string): void;
  setAxesVisible(visible: boolean): void;
  setCardinalDirectionsVisible(visible: boolean, rotationDeg?: number): void;
  setEnvironmentMap(enabled: boolean): void;
  setShadowsEnabled(enabled: boolean, intensity?: number): void;
}

/**
 * Push `visuals` onto the shared materials + scene chrome — the same
 * field-for-field mapping ThreeViewport applies in its visuals effect, minus the
 * highlight-only materials the read-only build never shows.
 */
export function applyReadOnlyVisuals(
  visuals: VisualSettings,
  materials: ReadOnlyMaterials,
  target: VisualTarget | null
): void {
  const preset = MATERIAL_PRESETS[visuals.material];
  if (preset) {
    const roughness = visuals.roughness ?? preset.roughness;
    const metalness = visuals.metalness ?? preset.metalness;
    const paint = (m: THREE.MeshStandardMaterial, opacity?: number) => {
      m.color.setHex(preset.color);
      m.emissive.setHex(preset.emissive);
      m.roughness = roughness;
      m.metalness = metalness;
      if (opacity !== undefined) {
        m.opacity = opacity;
        m.transparent = opacity < 1.0;
      }
      m.needsUpdate = true;
    };
    paint(materials.shell, visuals.shellOpacity);
    paint(materials.nozzle, visuals.nozzleOpacity);
    paint(materials.lug);
    paint(materials.weld);
    paint(materials.pipeline);
  }

  if (!target) return;
  const bgColor = visuals.backgroundColor || '#111111';
  target.setBackgroundColor(bgColor);
  target.setGridVisible(visuals.showGrid);
  target.updateGridColors(bgColor);
  target.setAxesVisible(visuals.showAxes);
  target.setCardinalDirectionsVisible(
    visuals.showCardinalDirections,
    visuals.cardinalRotation ?? 0
  );
  target.setEnvironmentMap(visuals.useEnvironmentMap);
  target.setShadowsEnabled(visuals.enableShadows ?? true, visuals.shadowIntensity ?? 0.35);
}
