// ---------------------------------------------------------------------------
// ReadOnlyViewport — presentation-only 3D vessel view.
//
// The viewer half of ThreeViewport with every edit affordance removed: orbit
// (free, from SceneManager's OrbitControls) plus a hover raycast, and nothing
// else — no InteractionManager, no drag, no draw, no gizmos, no selection. Its
// two planned consumers are the projects-area Coverage tab (live state) and the
// loginless client page (snapshot bundle), so the import graph is deliberately
// free of VesselModeler.tsx, auth, supabase and the sidebar
// (`docs/plans/2026-08-17-client-sharing-design.md` §"Viewer dependency").
//
// Rebuild discipline (orbit-stutter scar, 2026-08-06): the scene rebuilds only
// when the SETTLED structural hash moves, and `rebuild` is always reached through
// a ref — never dep-listed — so no callback identity churn can rebuild geometry
// per pointer-move. Building from the settled snapshot also makes geometry and
// the baked heatmap footprint cutouts agree by construction, so no trailing
// footprint rebuild is needed (ThreeViewport builds live and settles only the
// cutout, because it must track a dragged mesh under the cursor).
//
// Lifecycle only: assembly lives in `engine/readonly-scene.ts`, visibility and
// visual writes in `engine/readonly-sync.ts` (entity ∧ layer ∧ body composed into
// Object3D.visible, never by filtering state), hover in `engine/readonly-hover`
// + `engine/readonly-hover-probe.ts`.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { VesselState } from './types';
import { SceneManager } from './engine/scene-manager';
import { structuralHash } from './engine/structural-hash';
import { useSettledValue } from '../../hooks/useSettledValue';
import { updateCameraAnimation, animateCamera } from './engine/camera-animation';
import { canonicalPose, type CameraPose } from './engine/canonical-views';
import {
  buildReadOnlyScene,
  buildReadOnlyPipelines,
  createReadOnlyMaterials,
  type ReadOnlyMaterials,
} from './engine/readonly-scene';
import {
  applyLayerVisibility,
  applyReadOnlyVisuals,
  type ReadOnlyRegistries,
} from './engine/readonly-sync';
import { attachHoverProbe } from './engine/readonly-hover-probe';
import type { LayerVisibility } from './engine/layer-visibility';

import type { ReadOnlyHoverInfo } from './engine/readonly-hover';

export type { ReadOnlyHoverInfo };

/** Trailing debounce before a state change is allowed to rebuild geometry. */
const SETTLE_MS = 250;

/** Stable identity for the "no layers" default so effect deps never churn. */
const EMPTY_LAYERS: LayerVisibility = {};

const emptyRegistries = (): ReadOnlyRegistries => ({
  result: null,
  weldMeshes: [],
  coverageMeshes: [],
  rulerMeshes: [],
  pipelineRoot: null,
});

export interface ReadOnlyViewportProps {
  vesselState: VesselState;
  /** Same texture map ThreeViewport takes; an identity change forces a rebuild. */
  textureObjects: Record<number, THREE.Texture>;
  /** Layer overlay (`${bodyKey}/${categoryKey}`); an ABSENT key means visible. */
  layers?: LayerVisibility;
  /** Opening pose (canonical view or stored bookmark); later changes animate.
   *  Omitted ⇒ the vessel is framed isometrically. */
  initialPose?: CameraPose;
  /** Fires per animation frame over a visible entity, once with null on leave. */
  onHover?: (hit: ReadOnlyHoverInfo | null) => void;
}

export default function ReadOnlyViewport({
  vesselState,
  textureObjects,
  layers = EMPTY_LAYERS,
  initialPose,
  onHover,
}: ReadOnlyViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SceneManager | null>(null);
  const materialsRef = useRef<ReadOnlyMaterials | null>(null);

  // The settled snapshot drives BOTH the rebuild gate and the build itself.
  const settledState = useSettledValue(vesselState, SETTLE_MS);
  const stateRef = useRef(settledState);
  stateRef.current = settledState;

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const textureObjectsRef = useRef(textureObjects);
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const initialPoseRef = useRef(initialPose);
  initialPoseRef.current = initialPose;

  const structuralRef = useRef('');
  const registriesRef = useRef<ReadOnlyRegistries>(emptyRegistries());

  /** Recompose entity ∧ layer ∧ body in place. Dep-free: reads only refs. */
  const applyVisibility = useCallback(() => {
    applyLayerVisibility(stateRef.current, registriesRef.current, layersRef.current);
  }, []);

  // =========================================================================
  // rebuild — full disposal + recreation. Dep-free: everything through refs.
  // =========================================================================
  const rebuild = useCallback(() => {
    const manager = managerRef.current;
    const materials = materialsRef.current;
    if (!manager || !materials) return;

    const state = stateRef.current;
    const scene = manager.getScene();

    const oldGroup = manager.getVesselGroup();
    if (oldGroup) {
      manager.disposeObject(oldGroup);
      scene.remove(oldGroup);
    }

    const built = buildReadOnlyScene(
      state,
      materials,
      textureObjectsRef.current,
      layersRef.current
    );
    scene.add(built.result.vesselGroup);
    manager.setVesselGroup(built.result.vesselGroup);

    // Pipelines resolve nozzle world matrices, so they build after parenting.
    const pipelineRoot = buildReadOnlyPipelines(state, built.result, materials);
    manager.setPipelineGroup(pipelineRoot);

    registriesRef.current = { ...built, pipelineRoot };

    // The builders applied only per-entity `visible`; compose the layer + body
    // terms onto the meshes that were just recreated.
    applyVisibility();
  }, [applyVisibility]);

  const rebuildRef = useRef(rebuild);
  rebuildRef.current = rebuild;

  // =========================================================================
  // Mount: scene manager, materials, first build, opening pose, hover probe
  // =========================================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const manager = new SceneManager(container);
    manager.init();
    managerRef.current = manager;
    manager.onBeforeRender = (cam, ctrl) => updateCameraAnimation(cam, ctrl);

    const materials = createReadOnlyMaterials(stateRef.current.visuals.material);
    materialsRef.current = materials;

    manager.onContextRestored = () => {
      structuralRef.current = '';
      rebuildRef.current();
    };

    structuralRef.current = structuralHash(stateRef.current);
    rebuildRef.current();
    applyReadOnlyVisuals(stateRef.current.visuals, materials, manager);

    // Opening pose: the caller's, else an isometric fit of what was just built.
    const group = manager.getVesselGroup();
    const bounds = new THREE.Box3().setFromObject(group ?? manager.getScene());
    const pose =
      initialPoseRef.current ??
      (bounds.isEmpty()
        ? null
        : canonicalPose('iso', stateRef.current, {
            center: bounds.getCenter(new THREE.Vector3()),
            radius: bounds.getBoundingSphere(new THREE.Sphere()).radius,
          }));
    if (pose) {
      manager.getCamera().position.copy(pose.position);
      manager.getControls().target.copy(pose.target);
      manager.getControls().update();
    } else {
      manager.resetCamera();
    }

    const detachHover = attachHoverProbe({
      canvas: manager.getRenderer().domElement,
      camera: manager.getCamera(),
      getRoot: () => managerRef.current?.getVesselGroup() ?? null,
      getState: () => stateRef.current,
      onHover: (hit) => onHoverRef.current?.(hit),
    });

    return () => {
      detachHover();
      Object.values(materials).forEach((m) => m.dispose());
      materialsRef.current = null;
      registriesRef.current = emptyRegistries();
      manager.dispose();
      managerRef.current = null;
    };
  }, []); // Mount once

  // =========================================================================
  // Structural rebuild — settled hash or texture identity only
  // =========================================================================
  useEffect(() => {
    const hash = structuralHash(settledState);
    const texturesChanged = textureObjects !== textureObjectsRef.current;
    if (hash === structuralRef.current && !texturesChanged) return;
    structuralRef.current = hash;
    textureObjectsRef.current = textureObjects;
    rebuildRef.current();
  }, [settledState, textureObjects]);

  // In-place visibility fast-path: per-entity flags and layer toggles never
  // rebuild geometry. Annotations/images are absent by design — their CSS2D
  // labels are filtered at build time, so their layer rides the effect below.
  useEffect(() => {
    applyVisibility();
  }, [
    settledState.nozzles,
    settledState.liftingLugs,
    settledState.saddles,
    settledState.welds,
    settledState.coverageRects,
    settledState.rulers,
    settledState.textures,
    settledState.scanComposites,
    settledState.domeScanComposites,
    settledState.pipelines,
    settledState.appendages,
    layers,
    applyVisibility,
  ]);

  // Annotation / image layers ride the rebuild path, so a change to just those
  // keys forces one rebuild — guarded on a signature of exactly those keys so
  // every other layer toggle stays on the in-place fast-path.
  const bakedLabelLayerSigRef = useRef<string | null>(null);
  useEffect(() => {
    const sig = Object.keys(layers)
      .filter((k) => k.endsWith('/annotations') || k.endsWith('/images'))
      .sort()
      .map((k) => `${k}=${layers[k] !== false}`)
      .join('|');
    if (bakedLabelLayerSigRef.current === null) {
      bakedLabelLayerSigRef.current = sig;
      return;
    }
    if (sig === bakedLabelLayerSigRef.current) return;
    bakedLabelLayerSigRef.current = sig;
    rebuildRef.current();
  }, [layers]);

  // Animate to a new pose when the caller changes it (bookmark / canonical view).
  const appliedPoseRef = useRef(initialPose);
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !initialPose || initialPose === appliedPoseRef.current) return;
    appliedPoseRef.current = initialPose;
    animateCamera(
      manager.getCamera(),
      manager.getControls(),
      initialPose.position,
      initialPose.target,
      400
    );
  }, [initialPose]);

  // Materials + scene chrome follow the model's visual settings.
  useEffect(() => {
    if (materialsRef.current) {
      applyReadOnlyVisuals(settledState.visuals, materialsRef.current, managerRef.current);
    }
  }, [settledState.visuals]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        background: `linear-gradient(to bottom, ${settledState.visuals.backgroundColor || '#111111'}, #000000)`,
      }}
    />
  );
}
