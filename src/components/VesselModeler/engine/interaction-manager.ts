// =============================================================================
// Vessel Modeler - Interaction Manager
// =============================================================================
// Manages all raycaster-based drag interactions on the 3D canvas. Ported from
// the original standalone setupInteraction() function.
//
// Interaction flow:
//   1. pointerdown  - raycast against textures > nozzles > saddles (priority
//                     order); if hit and not locked, start drag + select item;
//                     if miss, deselect all.
//   2. pointermove  - if dragging, raycast against shell meshes to compute new
//                     position (mm) and angle (degrees) for the dragged item.
//   3. pointerup    - stop drag, re-enable orbit controls, fire final callback.
//
// Position calculations convert Three.js world coordinates back to engineering
// millimeters using the shared SCALE constant (0.001 = 1 mm -> 0.001 world).
// =============================================================================

import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { VesselState, AnnotationShapeType } from '../types';
import { SCALE } from './materials';
import { resolveBodyFrame, type SurfaceFrame } from './body-frame';
import { resolveCrossingHit, SEAM_HYSTERESIS_WORLD } from './body-crossing';
import { domePhiThetaFromPoint } from './dome-scan-geometry';
import { buildMeridianProfile, arcFromAxial, axialFromArc, displayRadiusAtArc } from './dome-arc';
import { normAngle, vesselToDatumAngle } from './vessel-coords';

/**
 * Resolve the appendage body id a raycast hit belongs to. Main-shell meshes
 * carry no `bodyId` tag (returns undefined); appendage shells (and their group)
 * carry `userData.bodyId`. Used to scope appendage-mounted drags to their body.
 */
function hitBodyId(object: THREE.Object3D): string | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    const id = current.userData?.bodyId;
    if (id !== undefined) return id as string;
    current = current.parent;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export type DragType =
  | 'nozzle'
  | 'liftingLug'
  | 'saddle'
  | 'texture'
  | 'annotation'
  | 'coverageRect'
  | 'inspectionImage'
  | 'weld'
  | 'scanGizmo'
  | 'domeGizmo'
  | 'pipeSegment'
  | null;

export interface InteractionCallbacks {
  onNozzleSelected: (index: number) => void;
  onSaddleSelected: (index: number) => void;
  onTextureSelected: (id: number) => void;
  onLugSelected: (index: number) => void;
  onDeselect: () => void;
  // Surface-mounted attachables carry the resolved body under the cursor as a
  // trailing `bodyId` (undefined = main shell) so a cross-body drag can live-
  // reassign the mount in the same coalesced gesture (R2).
  onNozzleMoved: (index: number, pos: number, angle: number, bodyId?: string) => void;
  onSaddleMoved: (index: number, pos: number) => void;
  onTextureMoved: (id: number, pos: number, angle: number) => void;
  onLugMoved: (index: number, pos: number, angle: number, bodyId?: string) => void;
  onAnnotationSelected: (id: number) => void;
  onAnnotationMoved: (id: number, pos: number, angle: number, bodyId?: string) => void;
  onAnnotationCreated: (
    type: AnnotationShapeType,
    pos: number,
    angle: number,
    width: number,
    height: number,
    bodyId?: string
  ) => void;
  onAnnotationPreview: (
    type: AnnotationShapeType,
    pos: number,
    angle: number,
    width: number,
    height: number,
    bodyId?: string
  ) => void;
  onRulerCreated: (startPos: number, startAngle: number, endPos: number, endAngle: number) => void;
  onRulerPreview: (startPos: number, startAngle: number, endPos: number, endAngle: number) => void;
  onCoverageRectCreated: (
    pos: number,
    angle: number,
    width: number,
    height: number,
    bodyId?: string
  ) => void;
  onCoverageRectPreview: (
    pos: number,
    angle: number,
    width: number,
    height: number,
    bodyId?: string
  ) => void;
  onCoverageRectSelected: (id: number) => void;
  onCoverageRectMoved: (id: number, pos: number, angle: number, bodyId?: string) => void;
  onInspectionImageSelected: (id: number) => void;
  onInspectionImageMoved: (id: number, pos: number, angle: number) => void;
  onWeldSelected: (index: number) => void;
  onWeldMoved: (index: number, pos: number, angle: number, bodyId?: string) => void;
  onScanCompositeHover: (
    id: string,
    thickness: number | null,
    scanMm: number,
    indexMm: number,
    screenX: number,
    screenY: number
  ) => void;
  onDomeScanHover: (
    info: {
      scanId: string;
      thickness: number | null;
      phiDeg: number;
      thetaDeg: number;
      row: number;
      col: number;
      screenX: number;
      screenY: number;
    } | null
  ) => void;
  onScanGizmoDatumMoved: (
    compositeId: string,
    angleDeg: number,
    posMm: number,
    bodyId?: string
  ) => void;
  onScanGizmoDirectionToggle: (
    compositeId: string,
    field: 'scanDirection' | 'indexDirection'
  ) => void;
  onDomeGizmoDatumMoved: (compositeId: string, phiDeg: number, thetaDeg: number) => void;
  onDomeGizmoDirectionToggle: (
    compositeId: string,
    field: 'scanDirection' | 'indexDirection'
  ) => void;
  onDomeGizmoClicked: (compositeId: string) => void;
  onPipeSegmentSelected: (pipelineId: string, segmentIndex: number) => void;
  onPipeConnectionPointClicked: (pipelineId: string) => void;
  onDragEnd: () => void;
  onNeedRebuild: () => void;
}

// ---------------------------------------------------------------------------
// Angle Snapping
// ---------------------------------------------------------------------------

/**
 * Snap a circumferential angle (degrees) to the nearest multiple of `increment`.
 *
 * Returns the angle unchanged when `increment` is not positive. The result is
 * normalised to the [0, 360) range, so a snap that rounds up to 360° wraps back
 * to 0°. Callers should only pass increments that divide 360 evenly (e.g. 5, 10,
 * 15, 30, 45, 90) to avoid an uneven step across the 0°/360° seam.
 */
export function snapAngleToIncrement(deg: number, increment: number): number {
  if (!(increment > 0)) return deg;
  const snapped = Math.round(deg / increment) * increment;
  return ((snapped % 360) + 360) % 360;
}

// ---------------------------------------------------------------------------
// InteractionManager
// ---------------------------------------------------------------------------

export class InteractionManager {
  // Core Three.js references
  private canvas: HTMLCanvasElement;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Drag state
  private isDragging = false;
  private dragType: DragType = null;
  private selectedNozzleIdx = -1;
  private selectedSaddleIdx = -1;
  private selectedTextureIdx = -1;
  private selectedLugIdx = -1;
  private selectedAnnotationIdx = -1;
  private selectedCoverageRectId = -1;
  private selectedInspectionImageId = -1;
  private selectedWeldIdx = -1;
  private selectedGizmoCompositeId = '';
  private isDown = false;

  /**
   * Body the ACTIVE surface drag is currently on (undefined = main shell). Seeded
   * at drag-start from the dragged item's `bodyId` and updated whenever a
   * cross-body drag switches bodies. It is the incumbent for the seam-hysteresis
   * decision (`resolveCrossingHit`) and is kept off React state so a burst of
   * pointer moves can't flap the mount while a re-render is still in flight.
   */
  private dragBodyId: string | undefined = undefined;

  /**
   * Per-move cache of the all-body surface mesh lists, keyed on the current
   * `vesselGroup` identity. `getAllSurfaceMeshes` is called on every pointermove
   * of a cross-body drag and otherwise re-traverses the entire vessel graph each
   * time. Caching keyed on the group means a full-graph walk happens at most once
   * per group: a scene rebuild swaps in a new group and invalidates the cache
   * automatically, so this NEVER returns meshes from a stale (disposed) group and
   * raycasts always hit live geometry. Both include/exclude-closure variants are
   * built in the single traverse.
   */
  private surfaceMeshCache: {
    group: THREE.Group;
    withClosures: THREE.Object3D[];
    withoutClosures: THREE.Object3D[];
  } | null = null;

  // Draw mode state
  drawMode: AnnotationShapeType | null = null;
  coverageDrawMode = false;
  rulerDrawMode = false;
  /**
   * @deprecated Superseded by cursor-first draw targeting (R2): a new item now
   * mounts on the body surface under the cursor (`resolveDrawTarget`), not on a
   * selection-derived active body. The React layer still assigns this field, but
   * no code reads it. Retained to avoid churning the ThreeViewport prop wiring;
   * safe to remove end-to-end in a follow-up.
   */
  activeDrawBodyId: string | undefined = undefined;
  /** @deprecated per-item locked now on CoverageRectConfig */
  private drawStartPos = 0;
  private drawStartAngle = 0;
  /** Body resolved at draw-start; held for the whole gesture (move/up). */
  private drawBodyId: string | undefined = undefined;
  private isDrawing = false;
  private isDrawingCoverage = false;
  private isDrawingRuler = false;

  // Lock flags - public so the React layer can toggle them
  nozzlesLocked = false;
  saddlesLocked = false;
  pipelinesLocked = false;
  texturesLocked = false;
  lugsLocked = false;
  weldsLocked = false;

  // Angle-snap config - public so the React layer can toggle them. When enabled,
  // dragged nozzles and lifting lugs snap their circumferential angle to the
  // nearest `angleSnapDeg` increment. Other attachments are never snapped.
  angleSnapEnabled = false;
  angleSnapDeg = 5;

  // External mesh references (updated by the rebuild cycle)
  nozzleMeshes: THREE.Object3D[] = [];
  lugMeshes: THREE.Object3D[] = [];
  saddleMeshes: THREE.Object3D[] = [];
  weldMeshes: THREE.Object3D[] = [];
  textureMeshes: THREE.Mesh[] = [];
  scanCompositeMeshes: THREE.Mesh[] = [];
  domeScanMeshes: THREE.Mesh[] = [];
  gizmoMeshes: THREE.Object3D[] = [];
  annotationMeshes: THREE.Object3D[] = [];
  coverageMeshes: THREE.Object3D[] = [];
  inspectionImageDotMeshes: THREE.Object3D[] = [];
  vesselGroup: THREE.Group | null = null;

  // Vessel state reference (for position calculations)
  private vesselState: VesselState;
  private callbacks: InteractionCallbacks;

  // Bound handlers stored for proper cleanup
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(
    canvas: HTMLCanvasElement,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    vesselState: VesselState,
    callbacks: InteractionCallbacks
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.controls = controls;
    this.vesselState = vesselState;
    this.callbacks = callbacks;

    // Pre-bind handlers so references are stable for add/removeEventListener
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Attach native event listeners.
   *   - pointerdown  -> canvas  (only fires when the pointer is over the 3D view)
   *   - pointermove  -> window  (tracks movement even when pointer leaves canvas)
   *   - pointerup    -> window  (always fires, even if released outside canvas)
   */
  init(): void {
    this.canvas.addEventListener('pointerdown', this.boundPointerDown);
    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);
  }

  /**
   * Remove all event listeners. Safe to call multiple times.
   */
  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
  }

  // ---------------------------------------------------------------------------
  // State Updates (called when React state changes)
  // ---------------------------------------------------------------------------

  /**
   * Update the vessel state reference used for position calculations.
   * Call this whenever the React-side VesselState changes.
   */
  updateVesselState(state: VesselState): void {
    this.vesselState = state;
  }

  /**
   * Update the callback references.
   * Call this on every render so closures stay fresh.
   */
  updateCallbacks(callbacks: InteractionCallbacks): void {
    this.callbacks = callbacks;
  }

  // ---------------------------------------------------------------------------
  // Pointer Down
  // ---------------------------------------------------------------------------

  private onPointerDown(event: PointerEvent): void {
    // Compute normalised device coordinates from the canvas-relative pointer pos
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // ----- Draw mode: start drawing annotation, coverage rect, or ruler ----- //
    if (this.drawMode || this.coverageDrawMode || this.rulerDrawMode) {
      // Cursor-first (R2): the new item mounts on whatever body surface is under
      // the cursor — main shell OR a boot — instead of a selection-derived active
      // body. Rulers carry no body, so a ruler draw is forced to the main shell.
      const kind = this.drawMode ? 'annotation' : this.coverageDrawMode ? 'coverage' : 'ruler';
      const target = this.resolveDrawTarget(kind);
      if (!target) return;

      // Single frame inverse: world point -> (pos mm, angle deg).
      const start = target.frame.toLocal(target.hit.point);
      this.drawStartPos = start.pos;
      this.drawStartAngle = start.angle;
      this.drawBodyId = target.bodyId;

      this.isDrawing = !!this.drawMode;
      this.isDrawingCoverage = this.coverageDrawMode;
      this.isDrawingRuler = this.rulerDrawMode;
      this.isDown = true;
      this.controls.enabled = false;
      return;
    }

    // ----- Gizmo: highest priority (check before other interactables) ----- //
    if (this.gizmoMeshes.length > 0) {
      const gizmoHits = this.raycaster.intersectObjects(this.gizmoMeshes, true);
      for (const hit of gizmoHits) {
        const ud = this.findGizmoData(hit.object);
        if (!ud) continue;

        if (ud.type === 'scanGizmo') {
          // Origin sphere: start drag
          this.selectedGizmoCompositeId = ud.compositeId as string;
          this.dragBodyId = this.vesselState.scanComposites.find(
            (c) => c.id === ud.compositeId
          )?.bodyId;
          this.isDown = true;
          this.isDragging = true;
          this.dragType = 'scanGizmo';
          this.controls.enabled = false;
          return;
        }

        if (ud.type === 'scanGizmoArrowCirc') {
          // Click on circumferential arrow: toggle scan direction
          this.callbacks.onScanGizmoDirectionToggle(ud.compositeId as string, 'scanDirection');
          return;
        }

        if (ud.type === 'scanGizmoArrowLong') {
          // Click on longitudinal arrow: toggle index direction
          this.callbacks.onScanGizmoDirectionToggle(ud.compositeId as string, 'indexDirection');
          return;
        }

        // --- Dome gizmo ---
        if (ud.type === 'domeGizmo') {
          this.selectedGizmoCompositeId = ud.compositeId as string;
          this.isDown = true;
          this.isDragging = true;
          this.dragType = 'domeGizmo';
          this.controls.enabled = false;
          this.callbacks.onDomeGizmoClicked(ud.compositeId as string);
          return;
        }

        if (ud.type === 'domeGizmoArrowCirc') {
          this.callbacks.onDomeGizmoDirectionToggle(ud.compositeId as string, 'scanDirection');
          return;
        }

        if (ud.type === 'domeGizmoArrowLong') {
          this.callbacks.onDomeGizmoDirectionToggle(ud.compositeId as string, 'indexDirection');
          return;
        }
      }
    }

    // ----- Connection points: highest priority after gizmos ----- //
    // Check for connection point rings before normal selection to prevent deselect-on-miss
    if (this.vesselGroup) {
      const cpMeshes: THREE.Object3D[] = [];
      this.vesselGroup.traverse((child) => {
        if (child.userData?.isConnectionPoint) {
          cpMeshes.push(child);
        }
      });
      if (cpMeshes.length > 0) {
        const cpHits = this.raycaster.intersectObjects(cpMeshes, false);
        if (cpHits.length > 0) {
          const pipelineId = cpHits[0].object.userData?.pipelineId ?? '';
          this.callbacks.onPipeConnectionPointClicked(pipelineId);
          return; // consume event — no deselect, no drag
        }
      }
    }

    // ----- Single-pass raycast against all interactable meshes ----- //
    // Also include pipe segment meshes from the pipeline group
    const pipeSegmentMeshes: THREE.Object3D[] = [];
    if (this.vesselGroup) {
      this.vesselGroup.traverse((child) => {
        if (child.userData?.type === 'pipeSegment') {
          pipeSegmentMeshes.push(child);
        }
      });
    }

    const allInteractables: THREE.Object3D[] = [
      ...this.textureMeshes,
      ...this.annotationMeshes,
      ...this.coverageMeshes,
      ...this.inspectionImageDotMeshes,
      ...this.nozzleMeshes,
      ...this.lugMeshes,
      ...this.weldMeshes,
      ...this.saddleMeshes,
      ...this.scanCompositeMeshes,
      ...pipeSegmentMeshes,
    ];

    const hits =
      allInteractables.length > 0 ? this.raycaster.intersectObjects(allInteractables, true) : [];

    for (const hit of hits) {
      const entityData = this.findEntityData(hit.object);
      if (!entityData) continue;

      // --- Texture ---
      if (entityData.textureIdx !== undefined) {
        if (this.texturesLocked) continue;
        const textureIdx = entityData.textureIdx as number;
        this.startDrag('texture', -1, -1, textureIdx);
        this.callbacks.onTextureSelected(textureIdx);
        return;
      }

      // --- Annotation (per-item lock) ---
      if (entityData.annotationId !== undefined) {
        const annId = entityData.annotationId as number;
        const ann = this.vesselState.annotations.find((a) => a.id === annId);
        if (!ann?.locked) {
          this.dragBodyId = ann?.bodyId;
          this.startDrag('annotation', -1, -1, -1, -1, annId);
        }
        this.callbacks.onAnnotationSelected(annId);
        return;
      }

      // --- Coverage Rect (per-item lock) ---
      if (entityData.coverageRectId !== undefined) {
        const covId = entityData.coverageRectId as number;
        const rect = this.vesselState.coverageRects.find((r) => r.id === covId);
        if (rect?.locked) {
          this.callbacks.onCoverageRectSelected(covId);
          return;
        }
        this.selectedCoverageRectId = covId;
        this.dragBodyId = rect?.bodyId;
        this.isDown = true;
        this.isDragging = true;
        this.dragType = 'coverageRect';
        this.controls.enabled = false;
        this.callbacks.onCoverageRectSelected(covId);
        return;
      }

      // --- Inspection Image (per-item lock) ---
      if (entityData.inspectionImageId !== undefined) {
        const imgId = entityData.inspectionImageId as number;
        const img = this.vesselState.inspectionImages.find((i) => i.id === imgId);
        if (!img?.locked) {
          this.selectedInspectionImageId = imgId;
          this.isDown = true;
          this.isDragging = true;
          this.dragType = 'inspectionImage';
          this.controls.enabled = false;
        }
        this.callbacks.onInspectionImageSelected(imgId);
        return;
      }

      // --- Nozzle ---
      if (entityData.nozzleIdx !== undefined) {
        if (this.nozzlesLocked) continue;
        const nozzleIdx = entityData.nozzleIdx as number;
        this.dragBodyId = this.vesselState.nozzles[nozzleIdx]?.bodyId;
        this.startDrag('nozzle', nozzleIdx, -1, -1);
        this.callbacks.onNozzleSelected(nozzleIdx);
        return;
      }

      // --- Lifting Lug ---
      if (entityData.lugIdx !== undefined) {
        if (this.lugsLocked) continue;
        const lugIdx = entityData.lugIdx as number;
        this.dragBodyId = this.vesselState.liftingLugs[lugIdx]?.bodyId;
        this.startDrag('liftingLug', -1, -1, -1, lugIdx);
        this.callbacks.onLugSelected(lugIdx);
        return;
      }

      // --- Weld ---
      if (entityData.weldIdx !== undefined) {
        if (this.weldsLocked) continue;
        const weldIdx = entityData.weldIdx as number;
        this.selectedWeldIdx = weldIdx;
        this.dragBodyId = this.vesselState.welds[weldIdx]?.bodyId;
        this.isDown = true;
        this.isDragging = true;
        this.dragType = 'weld';
        this.controls.enabled = false;
        this.callbacks.onWeldSelected(weldIdx);
        return;
      }

      // --- Saddle ---
      if (entityData.saddleIdx !== undefined) {
        if (this.saddlesLocked) continue;
        const saddleIdx = entityData.saddleIdx as number;
        this.startDrag('saddle', -1, saddleIdx, -1);
        this.callbacks.onSaddleSelected(saddleIdx);
        return;
      }

      // --- Scan Composite (click-through, no selection action) ---
      if (entityData.type === 'scanComposite') {
        continue;
      }

      // --- Pipe Segment ---
      if (entityData.type === 'pipeSegment' && entityData.segmentId) {
        if (this.pipelinesLocked) continue;
        const segmentId = entityData.segmentId as string;
        // Find pipeline and segment index from segmentId
        for (const pl of this.vesselState.pipelines) {
          const segIdx = pl.segments.findIndex((s) => s.id === segmentId);
          if (segIdx >= 0) {
            this.callbacks.onPipeSegmentSelected(pl.id, segIdx);
            return;
          }
        }
        continue;
      }
    }

    // ----- Miss: deselect everything ----- //
    this.selectedNozzleIdx = -1;
    this.selectedSaddleIdx = -1;
    this.selectedTextureIdx = -1;
    this.selectedLugIdx = -1;
    this.selectedAnnotationIdx = -1;
    this.selectedCoverageRectId = -1;
    this.selectedInspectionImageId = -1;
    this.selectedWeldIdx = -1;
    this.dragType = null;
    this.callbacks.onDeselect();
  }

  // ---------------------------------------------------------------------------
  // Pointer Move
  // ---------------------------------------------------------------------------

  private onPointerMove(event: PointerEvent): void {
    // --- Draw mode preview (annotation, coverage, or ruler) ---
    if ((this.isDrawing || this.isDrawingCoverage || this.isDrawingRuler) && this.isDown) {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Held body (from draw-start): main shell for coverage/ruler and unscoped
      // annotation draws (byte-identical); the active appendage otherwise.
      const { frame, meshes } = this.drawSurface(this.drawBodyId);
      if (meshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(meshes, true);
      const hit =
        this.drawBodyId === undefined ? hits[0] : hits.find((h) => hitBodyId(h.object) === this.drawBodyId);
      if (!hit) return;

      const point = hit.point;

      // Single frame inverse: world point -> (pos mm, angle deg).
      const { pos: currentPos, angle: currentAngle } = frame.toLocal(point);

      // Circumference of the body being drawn on (main radius reduces to state.id).
      const circumference = Math.PI * 2 * frame.radius;
      const axialDelta = Math.abs(currentPos - this.drawStartPos);
      let angleDelta = Math.abs(currentAngle - this.drawStartAngle);
      if (angleDelta > 180) angleDelta = 360 - angleDelta;
      const circumDelta = (angleDelta / 360) * circumference;

      const centerPos = (this.drawStartPos + currentPos) / 2;
      const centerAngle = (this.drawStartAngle + currentAngle) / 2;

      if (this.isDrawingRuler) {
        this.callbacks.onRulerPreview(
          this.drawStartPos,
          this.drawStartAngle,
          currentPos,
          currentAngle
        );
      } else if (this.isDrawingCoverage) {
        const width = Math.max(axialDelta, 20);
        const height = Math.max(circumDelta, 20);
        this.callbacks.onCoverageRectPreview(centerPos, centerAngle, width, height, this.drawBodyId);
      } else {
        // Annotations size in meridian-arc space so the preview matches the
        // committed footprint on dome ends (see onPointerUp create path). On an
        // appendage the footprint uses the body's own R/D/L via the frame.
        const fp = this.annotationFootprint(
          this.drawStartPos,
          this.drawStartAngle,
          currentPos,
          currentAngle,
          this.drawBodyId === undefined
            ? undefined
            : { R: frame.radius, D: frame.headDepth, L: frame.axialLength }
        );
        this.callbacks.onAnnotationPreview(
          this.drawMode!,
          fp.centerPos,
          fp.centerAngle,
          fp.width,
          fp.height,
          this.drawBodyId
        );
      }
      return;
    }

    if (!this.isDown || !this.isDragging || this.dragType === null) {
      // --- Scan composite + dome scan hover (only when not dragging) ---
      if (this.scanCompositeMeshes.length > 0 || this.domeScanMeshes.length > 0) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check dome scans first (they sit on top of shell scans)
        if (this.domeScanMeshes.length > 0) {
          const domeHits = this.raycaster.intersectObjects(this.domeScanMeshes, false);
          if (domeHits.length > 0) {
            const hit = domeHits[0];
            const uv = hit.uv;
            const ud = hit.object.userData;
            if (uv && ud.type === 'domeScan' && ud.data) {
              const col = Math.min(Math.floor(uv.x * ud.width), ud.width - 1);
              const row = Math.min(Math.floor((1 - uv.y) * ud.height), ud.height - 1);
              const thickness = ud.data[row]?.[col] ?? null;
              this.callbacks.onDomeScanHover({
                scanId: ud.id,
                thickness,
                phiDeg: ud.centerPhi,
                thetaDeg: ud.centerTheta,
                row,
                col,
                screenX: event.clientX,
                screenY: event.clientY,
              });
              this.callbacks.onScanCompositeHover('', null, 0, 0, 0, 0);
              return;
            }
          } else {
            this.callbacks.onDomeScanHover(null);
          }
        }

        // Check shell scan composites
        if (this.scanCompositeMeshes.length > 0) {
          const hits = this.raycaster.intersectObjects(this.scanCompositeMeshes, false);
          if (hits.length > 0) {
            const hit = hits[0];
            const uv = hit.uv;
            const userData = hit.object.userData;

            if (uv && userData.type === 'scanComposite' && userData.data) {
              const col = Math.min(Math.floor(uv.x * userData.width), userData.width - 1);
              const row = Math.min(Math.floor((1 - uv.y) * userData.height), userData.height - 1);
              const thickness = userData.data[row]?.[col] ?? null;

              this.callbacks.onScanCompositeHover(
                userData.id,
                thickness,
                userData.xAxis[col] ?? 0,
                userData.yAxis[row] ?? 0,
                event.clientX,
                event.clientY
              );
            }
          } else {
            // Clear hover when not over any composite
            this.callbacks.onScanCompositeHover('', null, 0, 0, 0, 0);
          }
        }
      }
      return;
    }

    // Update NDC from pointer position (use canvas rect for consistency)
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const state = this.vesselState;
    // Single frame inverse used by every shell drag handler below.
    const frame = resolveBodyFrame(state);

    if (this.dragType === 'coverageRect') {
      // Cross-body (R2): raycast every body surface, nearest wins with seam
      // hysteresis, live-reassign bodyId. On a boot the rect is a pure cylinder
      // rect (plain clamp); on the main shell it uses the dome-stable drape.
      const res = this.resolveSurfaceDrag(this.getAllSurfaceMeshes(false));
      if (!res) return;
      const rect = state.coverageRects.find((r) => r.id === this.selectedCoverageRectId);

      if (res.bodyId !== undefined) {
        const clampedPos = Math.max(0, Math.min(res.frame.axialLength, res.pos));
        this.callbacks.onCoverageRectMoved(
          this.selectedCoverageRectId,
          clampedPos,
          res.angle,
          res.bodyId
        );
        return;
      }

      // Main-shell rect: dome-stable drag (holds/flips the angle near the pole).
      // After a crossing the stored (pos, angle) live in the old frame, so the
      // fresh local coord seeds the drape reference (crossings sit on cylinders,
      // where the reference is ignored anyway).
      const refPos = res.crossed ? res.pos : (rect?.pos ?? res.pos);
      const refAngle = res.crossed ? res.angle : (rect?.angle ?? res.angle);
      const drag = this.resolveDrapeDrag(
        res.pos,
        res.angle,
        this.radialAxisDistanceMm(res.point, state),
        refPos,
        refAngle,
        state
      );
      this.callbacks.onCoverageRectMoved(
        this.selectedCoverageRectId,
        drag.pos,
        drag.angle,
        res.bodyId
      );
      return;
    }

    if (this.dragType === 'inspectionImage') {
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const { pos, angle: deg } = frame.toLocal(point);
      const headDepth = state.id / (2 * state.headRatio);
      const newPos = Math.max(-headDepth, Math.min(state.length + headDepth, pos));

      this.callbacks.onInspectionImageMoved(this.selectedInspectionImageId, newPos, deg);
      return;
    }

    if (this.dragType === 'weld') {
      // Cross-body (R2): nearest body surface wins with seam hysteresis. Main
      // allows head overhang; a boot clamps to its cylinder span [0, L].
      const res = this.resolveSurfaceDrag(this.getAllSurfaceMeshes(false));
      if (!res) return;
      const newPos =
        res.bodyId === undefined
          ? this.clampMainAxial(res.pos, state)
          : Math.max(0, Math.min(res.frame.axialLength, res.pos));
      this.callbacks.onWeldMoved(this.selectedWeldIdx, newPos, res.angle, res.bodyId);
      return;
    }

    if (this.dragType === 'scanGizmo') {
      // Cross-body (R2): the scan datum follows the cursor across bodies. The
      // datum (angle, pos) is a plain surface coordinate that converts cleanly
      // through frames; the thickness grid renders relative to it, so a shell scan
      // composite is NOT head-specific and may cross (dome scans, which ARE head-
      // specific, stay on the domeGizmo path below and never cross). Both frames
      // clamp pos to [0, axialLength].
      const res = this.resolveSurfaceDrag(this.getAllSurfaceMeshes(false));
      if (!res) return;
      const newPos = Math.max(0, Math.min(res.frame.axialLength, res.pos));

      // Convert internal angle (0°=3-o'clock) to user-facing (0°=TDC): the
      // vessel→datum `- 90` and normalize live in vessel-coords (single source).
      const deg = Math.round(normAngle(vesselToDatumAngle(res.angle)));

      this.callbacks.onScanGizmoDatumMoved(this.selectedGizmoCompositeId, deg, newPos, res.bodyId);
      return;
    }

    if (this.dragType === 'domeGizmo') {
      const ds = state.domeScanComposites?.find((d) => d.id === this.selectedGizmoCompositeId);
      if (!ds) return;

      // Appendage end-closure gizmo: scope the drag to that body's surface
      // (cylinder + closure) and invert through the body frame — mirroring the
      // scan-gizmo / nozzle appendage drags. A closure hit gives pos in the dome
      // region; phi = acos(sx / D) with sx the axial distance past the tangent
      // line, theta = the appendage datum angle.
      if (ds.bodyId !== undefined) {
        const frame = resolveBodyFrame(state, ds.bodyId);
        const D = frame.headDepth;
        if (D <= 0) return;
        const bodyMeshes = this.getBodySurfaceMeshes(ds.bodyId);
        if (bodyMeshes.length === 0) return;
        const hits = this.raycaster.intersectObjects(bodyMeshes, true);
        const hit = hits.find((h) => hitBodyId(h.object) === ds.bodyId);
        if (!hit) return;
        const local = frame.toLocal(hit.point);
        const sx = Math.max(0, Math.min(D, local.pos - frame.axialLength));
        const phiDeg = Math.max(
          1,
          Math.min(89, Math.round((Math.acos(Math.min(1, sx / D)) * 180) / Math.PI))
        );
        const thetaDeg = normAngle(Math.round(local.angle));
        this.callbacks.onDomeGizmoDatumMoved(this.selectedGizmoCompositeId, phiDeg, thetaDeg);
        return;
      }

      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const isVertical = state.orientation === 'vertical';
      const RADIUS = state.id / 2;
      const HEAD_DEPTH = RADIUS / (state.headRatio || 2);
      const headSign = ds.head === 'right' ? 1 : -1;
      const tangentLineWorld = (ds.head === 'right' ? state.length / 2 : -state.length / 2) * SCALE;

      const result = domePhiThetaFromPoint(
        point,
        RADIUS,
        HEAD_DEPTH,
        tangentLineWorld,
        headSign,
        isVertical
      );
      if (!result) return;

      const phiDeg = Math.max(1, Math.min(89, Math.round(result.phiDeg)));
      const thetaDeg = ((Math.round(result.thetaDeg) % 360) + 360) % 360;

      this.callbacks.onDomeGizmoDatumMoved(this.selectedGizmoCompositeId, phiDeg, thetaDeg);
      return;
    }

    if (this.dragType === 'nozzle') {
      // Cross-body (R2): raycast every body surface, nearest wins with seam
      // hysteresis, live-reassign bodyId. Main allows head overhang; a boot clamps
      // to its cylinder span [0, L]. Angle snaps when snapping is enabled.
      const res = this.resolveSurfaceDrag(this.getAllSurfaceMeshes(false));
      if (!res) return;
      const newPos =
        res.bodyId === undefined
          ? this.clampMainAxial(res.pos, state)
          : Math.max(0, Math.min(res.frame.axialLength, res.pos));
      this.callbacks.onNozzleMoved(
        this.selectedNozzleIdx,
        newPos,
        this.snapAngle(res.angle),
        res.bodyId
      );
      return;
    }

    if (this.dragType === 'liftingLug') {
      // Cross-body, same clamp/snap treatment as nozzles.
      const res = this.resolveSurfaceDrag(this.getAllSurfaceMeshes(false));
      if (!res) return;
      const newPos =
        res.bodyId === undefined
          ? this.clampMainAxial(res.pos, state)
          : Math.max(0, Math.min(res.frame.axialLength, res.pos));
      this.callbacks.onLugMoved(this.selectedLugIdx, newPos, this.snapAngle(res.angle), res.bodyId);
      return;
    }

    if (this.dragType === 'annotation') {
      // Cross-body incl. boot end closures (so an annotation can be dragged onto /
      // through a boot's dished end). The dome-stable drape uses the winning body's
      // dims; a boot has no left head, so minPos is 0.
      const res = this.resolveSurfaceDrag(this.getAllSurfaceMeshes(true));
      if (!res) return;
      const ann = state.annotations.find((a) => a.id === this.selectedAnnotationIdx);
      // After a crossing the stored (pos, angle) live in the OLD frame; seed the
      // drape reference with the fresh local coord (crossings sit on cylinders,
      // where the reference is ignored anyway).
      const refPos = res.crossed ? res.pos : (ann?.pos ?? res.pos);
      const refAngle = res.crossed ? res.angle : (ann?.angle ?? res.angle);
      const dims =
        res.bodyId === undefined
          ? undefined
          : {
              R: res.frame.radius,
              L: res.frame.axialLength,
              headDepth: res.frame.headDepth,
              minPos: 0,
            };
      const rHit =
        res.bodyId === undefined
          ? this.radialAxisDistanceMm(res.point, state)
          : this.radialAxisDistanceFromFrame(res.point, res.frame);
      const drag = this.resolveDrapeDrag(res.pos, res.angle, rHit, refPos, refAngle, state, dims);
      this.callbacks.onAnnotationMoved(this.selectedAnnotationIdx, drag.pos, drag.angle, res.bodyId);
      return;
    }

    if (this.dragType === 'texture') {
      // Textures (image overlays) carry no body — main-shell only, legacy path
      // (first hit against all shells, main-frame inverse), byte-identical.
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;
      const { pos, angle: deg } = frame.toLocal(hits[0].point);
      const newPos = this.clampMainAxial(pos, state);
      this.callbacks.onTextureMoved(this.selectedTextureIdx, newPos, deg);
      return;
    }

    if (this.dragType === 'saddle') {
      // Intersect a horizontal plane at the saddle Y level
      const RADIUS = state.id / 2;
      const saddleY = -RADIUS * 1.2 * SCALE;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -saddleY);
      const intersection = new THREE.Vector3();

      if (this.raycaster.ray.intersectPlane(plane, intersection)) {
        let newPos = intersection.x / SCALE + state.length / 2;
        newPos = Math.max(0, Math.min(state.length, newPos));

        this.callbacks.onSaddleMoved(this.selectedSaddleIdx, newPos);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pointer Up
  // ---------------------------------------------------------------------------

  private onPointerUp(event: PointerEvent): void {
    if (!this.isDown) return;

    // --- Draw mode: finalize shape (annotation, coverage, or ruler) ---
    if (this.isDrawing || this.isDrawingCoverage || this.isDrawingRuler) {
      const wasCoverage = this.isDrawingCoverage;
      const wasRuler = this.isDrawingRuler;
      this.isDown = false;
      this.isDrawing = false;
      this.isDrawingCoverage = false;
      this.isDrawingRuler = false;
      this.controls.enabled = true;

      // Raycast final position
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Held body (from draw-start): main shell for coverage/ruler and unscoped
      // annotation draws (byte-identical); the active appendage otherwise.
      const { frame, meshes } = this.drawSurface(this.drawBodyId);
      const hits = this.raycaster.intersectObjects(meshes, true);
      const hit =
        this.drawBodyId === undefined ? hits[0] : hits.find((h) => hitBodyId(h.object) === this.drawBodyId);
      if (hit) {
        const point = hit.point;

        // Single frame inverse: world point -> (pos mm, angle deg).
        const { pos: endPos, angle: endAngle } = frame.toLocal(point);

        // Circumference of the body being drawn on (main radius reduces to state.id).
        const circumference = Math.PI * 2 * frame.radius;
        const axialDelta = Math.abs(endPos - this.drawStartPos);
        let angleDelta = Math.abs(endAngle - this.drawStartAngle);
        if (angleDelta > 180) angleDelta = 360 - angleDelta;
        const circumDelta = (angleDelta / 360) * circumference;

        const centerPos = (this.drawStartPos + endPos) / 2;
        const centerAngle = (this.drawStartAngle + endAngle) / 2;

        const minSize = 20;
        if (wasRuler) {
          this.callbacks.onRulerCreated(this.drawStartPos, this.drawStartAngle, endPos, endAngle);
        } else if (wasCoverage) {
          const width = Math.max(axialDelta, minSize);
          const height = Math.max(circumDelta, minSize);
          this.callbacks.onCoverageRectCreated(
            centerPos,
            centerAngle,
            width,
            height,
            this.drawBodyId
          );
        } else {
          // Annotations size in meridian-arc space: width = true surface arc
          // across shell + dome; height = circumferential mm at the local dome
          // radius; centre = arc-midpoint mapped back to axial. Reduces to the
          // legacy axial/equatorial math on the cylinder. minSize floor kept.
          // On an appendage the footprint uses the body's own R/D/L via the frame.
          const fp = this.annotationFootprint(
            this.drawStartPos,
            this.drawStartAngle,
            endPos,
            endAngle,
            this.drawBodyId === undefined
              ? undefined
              : { R: frame.radius, D: frame.headDepth, L: frame.axialLength }
          );
          const width = Math.max(fp.width, minSize);
          const height = Math.max(fp.height, minSize);
          this.callbacks.onAnnotationCreated(
            this.drawMode!,
            fp.centerPos,
            fp.centerAngle,
            width,
            height,
            this.drawBodyId
          );
        }
      }
      return;
    }

    this.isDown = false;

    if (this.isDragging) {
      this.isDragging = false;
      this.dragType = null;
      this.dragBodyId = undefined;

      // Re-enable orbit controls now that the drag is finished
      this.controls.enabled = true;

      this.callbacks.onDragEnd();
    }
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Begin a drag operation: record which item is being dragged, disable orbit
   * controls so they don't fight the drag, and set state flags.
   */
  private startDrag(
    type: 'nozzle' | 'liftingLug' | 'saddle' | 'texture' | 'annotation',
    nozzleIdx: number,
    saddleIdx: number,
    textureIdx: number,
    lugIdx: number = -1,
    annotationIdx: number = -1
  ): void {
    this.isDown = true;
    this.isDragging = true;
    this.dragType = type;
    this.selectedNozzleIdx = nozzleIdx;
    this.selectedSaddleIdx = saddleIdx;
    this.selectedTextureIdx = textureIdx;
    this.selectedLugIdx = lugIdx;
    this.selectedAnnotationIdx = annotationIdx;

    // Disable orbit controls during drag so panning doesn't interfere
    this.controls.enabled = false;
  }

  /**
   * Apply angle snapping when enabled. Used for nozzle and lifting-lug drags so
   * a part can be dropped on a clean angular stop (e.g. 90° instead of 91°).
   */
  private snapAngle(deg: number): number {
    return this.angleSnapEnabled ? snapAngleToIncrement(deg, this.angleSnapDeg) : deg;
  }

  /** Distance (mm) of a world point from the vessel axis. */
  private radialAxisDistanceMm(point: THREE.Vector3, state: VesselState): number {
    // Horizontal: axis = X, radial = sqrt(y^2 + z^2). Vertical: axis = Y.
    const sq =
      state.orientation === 'vertical'
        ? point.x * point.x + point.z * point.z
        : point.y * point.y + point.z * point.z;
    return Math.sqrt(sq) / SCALE;
  }

  /**
   * Distance (mm) of a world point from a body's axis, derived from the frame's
   * public API only (centreline origin + outward axial unit). Used so the
   * appendage annotation drag can tell "near the closure pole" (r → 0) with the
   * SAME hysteresis the main shell uses, but relative to the appendage axis.
   */
  private radialAxisDistanceFromFrame(point: THREE.Vector3, frame: SurfaceFrame): number {
    const R = frame.radius;
    const centerBase = frame.surfacePoint(0, 0, -R);
    const axisN = frame.surfacePoint(1, 0, -R).sub(centerBase).normalize();
    const rel = point.clone().sub(centerBase);
    const axial = rel.dot(axisN);
    return rel.addScaledVector(axisN, -axial).length() / SCALE;
  }

  /**
   * Stable centre for an annotation/coverage rect dragged onto or across a dome
   * end (design Addendum 2). The raycast angle is unreliable near the vessel
   * axis, so this keeps an angle reference (the item's stored angle):
   *
   *  - Pure shell (neither hit nor stored centre on a head): the exact legacy
   *    path — clamp pos, adopt the hit angle.
   *  - Same side of the pole (|wrap(theta_h - theta_ref)| <= 90):
   *      r_hit >= 0.2 R -> track the hit (pos_h, theta_h);
   *      r_hit <  0.2 R -> adopt pos_h but HOLD theta_ref (no spin at the centre).
   *  - Opposite side (cursor emerged past the pole): adopt (pos_h, theta_ref+180)
   *    — the drape at (apex-delta, theta) tends to (apex-delta, theta+180) as
   *    delta -> 0, so the crossing is visually continuous.
   *
   * Pos always keeps the existing [-headDepth, L+headDepth] clamp; no snapping.
   */
  private resolveDrapeDrag(
    posH: number,
    thetaH: number,
    rHit: number,
    storedPos: number,
    storedAngle: number,
    state: VesselState,
    dims?: { R: number; L: number; headDepth: number; minPos: number }
  ): { pos: number; angle: number } {
    // dims override lets an appendage annotation reuse this hysteresis with the
    // body's radius / cylinder length / closure depth and a junction floor
    // (minPos 0 — an appendage has no left head). Absent = main shell, byte-identical.
    const L = dims?.L ?? state.length;
    const R = dims?.R ?? state.id / 2;
    const headDepth = dims?.headDepth ?? state.id / (2 * state.headRatio);
    const minPos = dims?.minPos ?? -headDepth;
    const clampedPos = Math.max(minPos, Math.min(L + headDepth, posH));

    // A body with a junction floor (minPos >= 0) has no left head, so only the far
    // closure (pos > L) counts as "on a head".
    const lowHead = minPos < 0;
    const onHead =
      (lowHead && (posH < 0 || storedPos < 0)) || posH > L || storedPos > L;
    if (!onHead) {
      return { pos: clampedPos, angle: thetaH };
    }

    let diff = Math.abs(thetaH - storedAngle) % 360;
    if (diff > 180) diff = 360 - diff;

    let angle: number;
    if (diff <= 90) {
      angle = rHit >= 0.2 * R ? thetaH : storedAngle;
    } else {
      angle = (((storedAngle + 180) % 360) + 360) % 360;
    }
    return { pos: clampedPos, angle };
  }

  /**
   * Meridian arc-space footprint for an annotation drawn between two shell
   * points. `width` = extent along the meridian arc (true surface mm, continuous
   * across shell and dome); `height` = circumferential mm honoured at the local
   * dome radius; `centerPos` = the arc-midpoint mapped back to axial mm. On the
   * cylinder every term reduces exactly to the legacy axial-delta /
   * equatorial-circumference values. The minSize floor is applied by the caller
   * (create path only) so the preview stays unfloored, matching prior behaviour.
   */
  private annotationFootprint(
    startPos: number,
    startAngle: number,
    endPos: number,
    endAngle: number,
    dims?: { R: number; D: number; L: number }
  ): { width: number; height: number; centerPos: number; centerAngle: number } {
    // dims override lets an appendage annotation size against the body's own
    // radius / closure depth / cylinder length (via the frame). Absent = main
    // shell, byte-identical to the legacy path.
    const state = this.vesselState;
    const R = dims?.R ?? state.id / 2;
    const D = dims?.D ?? state.id / (2 * state.headRatio);
    const L = dims?.L ?? state.length;
    const profile = buildMeridianProfile(R, D);

    const sStart = arcFromAxial(profile, L, startPos);
    const sEnd = arcFromAxial(profile, L, endPos);
    const centerS = (sStart + sEnd) / 2;

    let angleDelta = Math.abs(endAngle - startAngle);
    if (angleDelta > 180) angleDelta = 360 - angleDelta;
    const angleDeltaRad = (angleDelta * Math.PI) / 180;

    return {
      width: Math.abs(sEnd - sStart),
      height: angleDeltaRad * displayRadiusAtArc(profile, L, centerS),
      centerPos: axialFromArc(profile, L, centerS),
      centerAngle: (startAngle + endAngle) / 2,
    };
  }

  /**
   * Walk up from a hit object to find gizmo userData (scanGizmo, scanGizmoArrowCirc, scanGizmoArrowLong).
   */
  private findGizmoData(obj: THREE.Object3D): Record<string, unknown> | null {
    let current: THREE.Object3D | null = obj;
    while (current) {
      const ud = current.userData;
      if (
        ud.type === 'scanGizmo' ||
        ud.type === 'scanGizmoArrowCirc' ||
        ud.type === 'scanGizmoArrowLong' ||
        ud.type === 'domeGizmo' ||
        ud.type === 'domeGizmoArrowCirc' ||
        ud.type === 'domeGizmoArrowLong'
      ) {
        return ud as Record<string, unknown>;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Walk up the parent chain from a hit object to find the nearest ancestor
   * (or self) that carries entity identification in its userData. Returns the
   * userData object, or null if nothing relevant is found.
   */
  private findEntityData(obj: THREE.Object3D): Record<string, unknown> | null {
    let current: THREE.Object3D | null = obj;
    while (current) {
      const ud = current.userData;
      if (
        ud.textureIdx !== undefined ||
        ud.annotationId !== undefined ||
        ud.coverageRectId !== undefined ||
        ud.inspectionImageId !== undefined ||
        ud.nozzleIdx !== undefined ||
        ud.lugIdx !== undefined ||
        ud.weldIdx !== undefined ||
        ud.saddleIdx !== undefined ||
        ud.type === 'scanComposite'
      ) {
        return ud as Record<string, unknown>;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Collect the shell (vessel body) meshes from the vessel group for raycasting.
   * Shell meshes are identified by the `isShell` flag on their userData, which is
   * set during the vessel rebuild step.
   */
  private getShellMeshes(): THREE.Object3D[] {
    if (!this.vesselGroup) return [];

    const shells: THREE.Object3D[] = [];
    this.vesselGroup.traverse((child) => {
      if (child.userData.isShell) {
        shells.push(child);
      }
    });
    return shells;
  }

  /**
   * Surface meshes belonging to one appendage body — its cylinder shell AND its
   * end closure. Unlike getShellMeshes (isShell only), this includes the closure
   * cap so a dome-scan gizmo can be dragged across the dished end. Used by the
   * appendage dome-gizmo drag to raycast the closure the scan sits on.
   */
  private getBodySurfaceMeshes(bodyId: string): THREE.Object3D[] {
    if (!this.vesselGroup) return [];

    const out: THREE.Object3D[] = [];
    this.vesselGroup.traverse((child) => {
      const ud = child.userData;
      if (ud?.bodyId === bodyId && (ud.part === 'shell' || ud.part === 'closure')) {
        out.push(child);
      }
    });
    return out;
  }

  /**
   * Every body surface eligible for a cross-body drag: the main shell + heads and
   * every boot cylinder (all flagged `isShell`), plus boot end closures when
   * `includeClosures` is set (annotations can drape onto a boot's dished end). One
   * raycast set so the nearest hit across ALL bodies can win (R2).
   */
  private getAllSurfaceMeshes(includeClosures: boolean): THREE.Object3D[] {
    const group = this.vesselGroup;
    if (!group) return [];

    // Reuse the traverse result while the group is unchanged (invalidated for
    // free when a rebuild swaps in a new group — see surfaceMeshCache).
    const cache = this.surfaceMeshCache;
    if (cache && cache.group === group) {
      return includeClosures ? cache.withClosures : cache.withoutClosures;
    }

    const withoutClosures: THREE.Object3D[] = [];
    const withClosures: THREE.Object3D[] = [];
    group.traverse((child) => {
      const ud = child.userData;
      if (ud.isShell) {
        withoutClosures.push(child);
        withClosures.push(child);
      } else if (ud.bodyId !== undefined && ud.part === 'closure') {
        withClosures.push(child);
      }
    });
    this.surfaceMeshCache = { group, withClosures, withoutClosures };
    return includeClosures ? withClosures : withoutClosures;
  }

  /** Clamp an axial pos to the main shell extent, including both head overhangs. */
  private clampMainAxial(pos: number, state: VesselState): number {
    const headDepth = state.id / (2 * state.headRatio);
    return Math.max(-headDepth, Math.min(state.length + headDepth, pos));
  }

  /**
   * Cross-body drag resolution shared by every surface-mounted attachable (R2).
   * Raycast the supplied all-body surface set, choose the winning body via the
   * seam hysteresis (`resolveCrossingHit`, incumbent = `this.dragBodyId`), and
   * return the winning body's frame + the local (pos, angle) under the cursor.
   * Updates `this.dragBodyId` to the winner so the next move's hysteresis uses it,
   * and reports whether this move crossed bodies. Returns null on a miss.
   */
  private resolveSurfaceDrag(meshes: THREE.Object3D[]): {
    bodyId: string | undefined;
    frame: SurfaceFrame;
    pos: number;
    angle: number;
    point: THREE.Vector3;
    crossed: boolean;
  } | null {
    if (meshes.length === 0) return null;
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return null;
    const bodyHits = hits.map((h) => ({
      bodyId: hitBodyId(h.object),
      distance: h.distance,
      hit: h,
    }));
    const winner = resolveCrossingHit(bodyHits, this.dragBodyId, {
      marginWorld: SEAM_HYSTERESIS_WORLD,
    });
    if (!winner) return null;
    const crossed = winner.bodyId !== this.dragBodyId;
    this.dragBodyId = winner.bodyId;
    const frame = resolveBodyFrame(this.vesselState, winner.bodyId);
    const local = frame.toLocal(winner.hit.point);
    return {
      bodyId: winner.bodyId,
      frame,
      pos: local.pos,
      angle: local.angle,
      point: winner.hit.point,
      crossed,
    };
  }

  /**
   * Body + frame under the cursor for a new DRAW gesture (R2 cursor-first). The
   * item mounts on whatever body surface is under the cursor. Annotations may
   * start on a boot end closure (includeClosures); coverage rects use the cylinder
   * shells only; rulers carry no body, so a ruler draw is forced to the nearest
   * main-shell hit. Returns null on a miss.
   */
  private resolveDrawTarget(kind: 'annotation' | 'coverage' | 'ruler'): {
    bodyId: string | undefined;
    frame: SurfaceFrame;
    hit: THREE.Intersection;
  } | null {
    if (kind === 'ruler') {
      const meshes = this.getShellMeshes();
      const hits = meshes.length ? this.raycaster.intersectObjects(meshes, true) : [];
      const hit = hits.find((h) => hitBodyId(h.object) === undefined);
      return hit ? { bodyId: undefined, frame: resolveBodyFrame(this.vesselState), hit } : null;
    }
    const meshes = this.getAllSurfaceMeshes(kind === 'annotation');
    const hits = meshes.length ? this.raycaster.intersectObjects(meshes, true) : [];
    if (hits.length === 0) return null;
    const bodyId = hitBodyId(hits[0].object);
    return { bodyId, frame: resolveBodyFrame(this.vesselState, bodyId), hit: hits[0] };
  }

  /**
   * Draw frame + raycast targets for a body. undefined = main shell (frame + all
   * shell meshes, byte-identical); a body id = its frame + its surface meshes
   * (cylinder + closure) so an annotation can be drawn on the appendage end too.
   */
  private drawSurface(bodyId: string | undefined): {
    frame: SurfaceFrame;
    meshes: THREE.Object3D[];
  } {
    const state = this.vesselState;
    return bodyId === undefined
      ? { frame: resolveBodyFrame(state), meshes: this.getShellMeshes() }
      : { frame: resolveBodyFrame(state, bodyId), meshes: this.getBodySurfaceMeshes(bodyId) };
  }
}
