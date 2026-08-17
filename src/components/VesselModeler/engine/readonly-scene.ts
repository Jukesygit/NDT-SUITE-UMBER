// ---------------------------------------------------------------------------
// Read-only scene assembly.
//
// The presentation half of ThreeViewport's `rebuildScene`, with every edit
// affordance dropped: no selection highlights, no gizmos, no drag contexts, no
// interaction manager. `buildVesselScene` still produces the shell / nozzles /
// lugs / saddles / boots / textures / scan + dome heatmaps; this module adds the
// overlay entities ThreeViewport assembles inline (welds, coverage rects,
// annotations, rulers, inspection images) and, in a second call, the pipelines.
//
// Deliberate omissions vs ThreeViewport (the read-only viewer is a presentation
// surface, not the modeller): CSS2D weld labels, which need ThreeViewport's
// per-frame camera-facing re-positioner (weld GEOMETRY still renders); the
// annotation summary table, an interactive drag/resize-persisting overlay; and
// scan/dome orientation gizmos, which are never built anyway since they only
// appear for a SELECTED unconfirmed composite and read-only passes no selection.
//
// Everything here writes only per-entity `visible`; the layer ∧ body terms are
// composed on afterwards by `readonly-sync.ts`.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { VesselState } from '../types';
import { buildVesselScene, type BuildSceneResult } from './vessel-geometry';
import {
  createShellMaterial,
  createNozzleMaterial,
  createHighlightMaterial,
  createSaddleHighlightMaterial,
  createLugMaterial,
  createLugHighlightMaterial,
  createWeldMaterial,
  createPipelineMaterial,
  createConnectionPointMaterial,
} from './materials';
import {
  createAnnotationShape,
  createRectOutline,
  createRectFill,
  createRulerLine,
} from './annotation-geometry';
import { createAppendageRectOutline, createAppendageRectFill } from './appendage-rect-geometry';
import {
  createAnnotationLabel,
  createAnnotationLeaderLine,
  createRulerLabel,
  getAnnotationShellPoint,
} from './annotation-labels';
import { createAllInspectionImageLabels } from './inspection-image-labels';
import { createAllInspectionImageMarkers } from './inspection-image-geometry';
import { createWeldGeometry } from './weld-geometry';
import { buildPipelineGroup, computeNozzleTipY } from './pipeline-geometry';
import {
  isEffectivelyVisible,
  isLayerVisible,
  MAIN_BODY_KEY,
  type LayerVisibility,
} from './layer-visibility';

/** Materials the read-only build needs. Owned (and disposed) by the viewport.
 *  The three highlight materials are never visibly used (nothing is selectable)
 *  but `buildVesselScene` takes them as required parameters. */
export interface ReadOnlyMaterials {
  shell: THREE.MeshStandardMaterial;
  nozzle: THREE.MeshStandardMaterial;
  nozzleHighlight: THREE.MeshStandardMaterial;
  lug: THREE.MeshStandardMaterial;
  lugHighlight: THREE.MeshStandardMaterial;
  saddleHighlight: THREE.MeshStandardMaterial;
  weld: THREE.MeshStandardMaterial;
  pipeline: THREE.MeshStandardMaterial;
  connectionPoint: THREE.MeshStandardMaterial;
}

/** Mesh registries the viewport's visibility pass writes through. */
export interface ReadOnlySceneResult {
  result: BuildSceneResult;
  weldMeshes: THREE.Object3D[];
  coverageMeshes: THREE.Object3D[];
  rulerMeshes: THREE.Object3D[];
}

/** Material bundle for a read-only build. The caller owns and disposes them. */
export function createReadOnlyMaterials(
  materialKey: VesselState['visuals']['material']
): ReadOnlyMaterials {
  return {
    shell: createShellMaterial(materialKey),
    nozzle: createNozzleMaterial(materialKey),
    nozzleHighlight: createHighlightMaterial(),
    lug: createLugMaterial(materialKey),
    lugHighlight: createLugHighlightMaterial(),
    saddleHighlight: createSaddleHighlightMaterial(),
    weld: createWeldMaterial(materialKey),
    pipeline: createPipelineMaterial(materialKey),
    connectionPoint: createConnectionPointMaterial(),
  };
}

/** Surface offset (mm) coverage rects sit at — same value ThreeViewport uses. */
const COVERAGE_SURFACE_OFFSET = 4;

/**
 * Build the full read-only vessel group. The caller adds `result.vesselGroup` to
 * the scene and only then calls {@link buildReadOnlyPipelines} — pipelines
 * resolve nozzle world matrices, so the group must be parented first (same
 * ordering as ThreeViewport).
 */
export function buildReadOnlyScene(
  state: VesselState,
  materials: ReadOnlyMaterials,
  textureObjects: Record<number, THREE.Texture>,
  layers: LayerVisibility | undefined
): ReadOnlySceneResult {
  // Annotations and inspection images are FILTERED at build time (their CSS2D
  // labels have no in-place registry), so their layers ride the rebuild path.
  const imagesLayerVisible = isLayerVisible(layers, MAIN_BODY_KEY, 'images');
  const bodyVisible = (bodyId?: string) =>
    bodyId === undefined || state.appendages.find((a) => a.id === bodyId)?.visible !== false;
  const annotationVisible = (ann: { visible?: boolean; bodyId?: string }) =>
    isEffectivelyVisible(ann, 'annotations', layers) && bodyVisible(ann.bodyId);

  const result = buildVesselScene(
    state,
    materials.shell,
    materials.nozzle,
    materials.nozzleHighlight,
    materials.lug,
    materials.lugHighlight,
    materials.saddleHighlight,
    textureObjects,
    -1, // no nozzle selection
    -1, // no lug selection
    -1, // no saddle selection
    -1, // no texture selection
    '', // no scan composite selection (also suppresses its gizmo)
    '' // no dome scan selection (also suppresses its gizmo)
  );

  // -- Welds (geometry only; labels are a modeller affordance, see header) ----
  const weldMeshes: THREE.Object3D[] = [];
  state.welds.forEach((weld, idx) => {
    const weldGroup = createWeldGeometry(weld, state, materials.weld);
    weldGroup.userData = { type: 'weld', weldIdx: idx };
    weldGroup.traverse((child) => {
      child.userData = { ...child.userData, type: 'weld', weldIdx: idx };
    });
    weldGroup.visible = weld.visible !== false;
    result.vesselGroup.add(weldGroup);
    weldMeshes.push(weldGroup);
  });

  // -- Coverage rects (outline + optional fill; no invisible hit mesh) --------
  const coverageMeshes: THREE.Object3D[] = [];
  state.coverageRects.forEach((rect) => {
    const shapeConfig = {
      id: rect.id,
      name: rect.name,
      type: 'scan' as const,
      pos: rect.pos,
      angle: rect.angle,
      width: rect.width,
      height: rect.height,
      color: rect.color,
      lineWidth: rect.lineWidth,
      showLabel: false,
    };
    const onAppendage = rect.bodyId !== undefined;
    const outline = onAppendage
      ? createAppendageRectOutline(rect, state, COVERAGE_SURFACE_OFFSET)
      : createRectOutline(shapeConfig, state, COVERAGE_SURFACE_OFFSET);
    outline.userData = { type: 'coverageRect', coverageRectId: rect.id };

    const covGroup = new THREE.Group();
    covGroup.add(outline);
    if (rect.filled) {
      const fill = onAppendage
        ? createAppendageRectFill(rect, state, COVERAGE_SURFACE_OFFSET)
        : createRectFill(shapeConfig, state, COVERAGE_SURFACE_OFFSET);
      (fill.material as THREE.MeshBasicMaterial).opacity = rect.fillOpacity;
      fill.userData = { type: 'coverageRect', coverageRectId: rect.id };
      covGroup.add(fill);
    }
    covGroup.userData = { type: 'coverageRect', coverageRectId: rect.id };
    covGroup.visible = rect.visible !== false;
    result.vesselGroup.add(covGroup);
    coverageMeshes.push(covGroup);
  });

  // -- Annotations: surface shape + its label (pill or leader + card) ---------
  state.annotations.forEach((ann) => {
    if (!annotationVisible(ann)) return;
    result.vesselGroup.add(createAnnotationShape(ann, state, false));

    if ((ann.labelMode ?? 'flyout') === 'table') {
      // Table mode: small pill on the surface. Without the (interactive) summary
      // table this is the only thing naming the annotation, so it is kept.
      const shellPos = getAnnotationShellPoint(ann, state);
      const el = document.createElement('div');
      el.className = 'vm-annotation-pill';
      el.dataset.annType = ann.type;
      if (ann.severityLevel) el.dataset.severity = ann.severityLevel;
      el.textContent = ann.name;
      const label = new CSS2DObject(el);
      const angleRad = (ann.angle * Math.PI) / 180;
      const outward =
        state.orientation === 'vertical'
          ? new THREE.Vector3(Math.cos(angleRad), 0, Math.sin(angleRad)).normalize()
          : new THREE.Vector3(0, Math.sin(angleRad), Math.cos(angleRad)).normalize();
      const nudge = 0.05;
      label.position.set(
        shellPos.x + nudge * outward.x,
        shellPos.y + nudge * outward.y,
        shellPos.z + nudge * outward.z
      );
      label.userData = {
        type: 'annotation-pill',
        annotationId: ann.id,
        outward: outward.toArray(),
      };
      result.vesselGroup.add(label);
    } else if (ann.showLabel) {
      result.vesselGroup.add(createAnnotationLeaderLine(ann, state, false));
      // No drag context: the label is a read-only card.
      result.vesselGroup.add(createAnnotationLabel(ann, state, state.measurementConfig, false));
    }
  });

  // -- Rulers ----------------------------------------------------------------
  const rulerMeshes: THREE.Object3D[] = [];
  state.rulers.forEach((ruler) => {
    const rulerGroup = createRulerLine(ruler, state);
    result.vesselGroup.add(rulerGroup);
    rulerMeshes.push(rulerGroup);
    if (ruler.showLabel) result.vesselGroup.add(createRulerLabel(ruler, state));
  });

  // -- Inspection images (markers + thumbnails; no click/drag handlers) -------
  if (state.inspectionImages.length > 0 && imagesLayerVisible) {
    result.vesselGroup.add(createAllInspectionImageMarkers(state, -1).group);
    createAllInspectionImageLabels(state, -1).forEach((label) => result.vesselGroup.add(label));
  }

  addNozzleLabels(state, result);

  return { result, weldMeshes, coverageMeshes, rulerMeshes };
}

/**
 * Pipelines, built after the vessel group is parented so nozzle world matrices
 * resolve. Returns the shared root (the `pipelines` layer is one write on it) or
 * null when the model has none.
 */
export function buildReadOnlyPipelines(
  state: VesselState,
  result: BuildSceneResult,
  materials: ReadOnlyMaterials
): THREE.Group | null {
  if (state.pipelines.length === 0) return null;

  const pipelineParent = new THREE.Group();
  pipelineParent.userData = { type: 'pipelineRoot' };

  for (const pl of state.pipelines) {
    if (pl.nozzleId) {
      // Stable nozzle id → live array index the nozzle mesh groups are keyed by.
      const nozzleIdx = state.nozzles.findIndex((n) => n.id === pl.nozzleId);
      const nozzle = nozzleIdx >= 0 ? state.nozzles[nozzleIdx] : undefined;
      if (!nozzle) continue;

      let nozzleGroup: THREE.Group | null = null;
      result.vesselGroup.traverse((child) => {
        if (child.userData?.type === 'nozzle' && child.userData?.nozzleIdx === nozzleIdx) {
          nozzleGroup = child as THREE.Group;
        }
      });
      if (!nozzleGroup) continue;

      pipelineParent.add(
        buildPipelineGroup(
          pl,
          nozzleGroup,
          nozzle,
          state.id / 2,
          materials.pipeline,
          materials.connectionPoint
        )
      );
    } else {
      pipelineParent.add(
        buildPipelineGroup(pl, null, null, 0, materials.pipeline, materials.connectionPoint)
      );
    }
  }

  return pipelineParent;
}

/** Nozzle name labels are static (anchored at the flange tip), so they are cheap
 *  to reproduce here — unlike weld labels, which need a per-frame positioner. */
function addNozzleLabels(state: VesselState, result: BuildSceneResult): void {
  if (!state.visuals.showNozzleLabels) return;
  const shellRadius = state.id / 2;
  result.nozzleMeshes.forEach((nozzleGroup, idx) => {
    const nozzle = state.nozzles[idx];
    if (!nozzle?.name) return;
    const el = document.createElement('div');
    el.className = 'vm-nozzle-label';
    el.textContent = nozzle.name;
    const label = new CSS2DObject(el);
    nozzleGroup.updateMatrixWorld(true);
    const tipY = computeNozzleTipY(nozzle, shellRadius);
    label.position.copy(new THREE.Vector3(0, tipY, 0).applyMatrix4(nozzleGroup.matrixWorld));
    label.userData = { type: 'nozzle-label', nozzleIdx: idx };
    result.vesselGroup.add(label);
  });
}
