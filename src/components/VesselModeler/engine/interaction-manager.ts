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

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export type DragType = 'nozzle' | 'liftingLug' | 'saddle' | 'texture' | 'annotation' | 'coverageRect' | 'inspectionImage' | 'weld' | 'scanGizmo' | null;

export interface InteractionCallbacks {
  onNozzleSelected: (index: number) => void;
  onSaddleSelected: (index: number) => void;
  onTextureSelected: (id: number) => void;
  onLugSelected: (index: number) => void;
  onDeselect: () => void;
  onNozzleMoved: (index: number, pos: number, angle: number) => void;
  onSaddleMoved: (index: number, pos: number) => void;
  onTextureMoved: (id: number, pos: number, angle: number) => void;
  onLugMoved: (index: number, pos: number, angle: number) => void;
  onAnnotationSelected: (id: number) => void;
  onAnnotationMoved: (id: number, pos: number, angle: number) => void;
  onAnnotationCreated: (type: AnnotationShapeType, pos: number, angle: number, width: number, height: number) => void;
  onAnnotationPreview: (type: AnnotationShapeType, pos: number, angle: number, width: number, height: number) => void;
  onRulerCreated: (startPos: number, startAngle: number, endPos: number, endAngle: number) => void;
  onRulerPreview: (startPos: number, startAngle: number, endPos: number, endAngle: number) => void;
  onCoverageRectCreated: (pos: number, angle: number, width: number, height: number) => void;
  onCoverageRectPreview: (pos: number, angle: number, width: number, height: number) => void;
  onCoverageRectSelected: (id: number) => void;
  onCoverageRectMoved: (id: number, pos: number, angle: number) => void;
  onInspectionImageSelected: (id: number) => void;
  onInspectionImageMoved: (id: number, pos: number, angle: number) => void;
  onWeldSelected: (index: number) => void;
  onWeldMoved: (index: number, pos: number, angle: number) => void;
  onScanCompositeHover: (id: string, thickness: number | null, scanMm: number, indexMm: number, screenX: number, screenY: number) => void;
  onScanGizmoDatumMoved: (compositeId: string, angleDeg: number, posMm: number) => void;
  onScanGizmoDirectionToggle: (compositeId: string, field: 'scanDirection' | 'indexDirection') => void;
  onDragEnd: () => void;
  onNeedRebuild: () => void;
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

  // Draw mode state
  drawMode: AnnotationShapeType | null = null;
  coverageDrawMode = false;
  rulerDrawMode = false;
  /** @deprecated per-item locked now on CoverageRectConfig */
  private drawStartPos = 0;
  private drawStartAngle = 0;
  private isDrawing = false;
  private isDrawingCoverage = false;
  private isDrawingRuler = false;

  // Lock flags - public so the React layer can toggle them
  nozzlesLocked = false;
  saddlesLocked = false;
  texturesLocked = false;
  lugsLocked = false;
  weldsLocked = false;

  // External mesh references (updated by the rebuild cycle)
  nozzleMeshes: THREE.Object3D[] = [];
  lugMeshes: THREE.Object3D[] = [];
  saddleMeshes: THREE.Object3D[] = [];
  weldMeshes: THREE.Object3D[] = [];
  textureMeshes: THREE.Mesh[] = [];
  scanCompositeMeshes: THREE.Mesh[] = [];
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
    callbacks: InteractionCallbacks,
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
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const state = this.vesselState;
      const isVertical = state.orientation === 'vertical';

      this.drawStartPos = isVertical
        ? (point.y / SCALE) + (state.length / 2)
        : (point.x / SCALE) + (state.length / 2);

      const rad = isVertical
        ? Math.atan2(point.z, point.x)
        : Math.atan2(point.y, point.z);
      this.drawStartAngle = ((rad * 180) / Math.PI + 360) % 360;

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
      }
    }

    // ----- Single-pass raycast against all interactable meshes ----- //
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
    ];

    const hits = allInteractables.length > 0
      ? this.raycaster.intersectObjects(allInteractables, true)
      : [];

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
        const ann = this.vesselState.annotations.find(a => a.id === annId);
        if (!ann?.locked) {
          this.startDrag('annotation', -1, -1, -1, -1, annId);
        }
        this.callbacks.onAnnotationSelected(annId);
        return;
      }

      // --- Coverage Rect (per-item lock) ---
      if (entityData.coverageRectId !== undefined) {
        const covId = entityData.coverageRectId as number;
        const rect = this.vesselState.coverageRects.find(r => r.id === covId);
        if (rect?.locked) {
          this.callbacks.onCoverageRectSelected(covId);
          return;
        }
        this.selectedCoverageRectId = covId;
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
        const img = this.vesselState.inspectionImages.find(i => i.id === imgId);
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
        this.startDrag('nozzle', nozzleIdx, -1, -1);
        this.callbacks.onNozzleSelected(nozzleIdx);
        return;
      }

      // --- Lifting Lug ---
      if (entityData.lugIdx !== undefined) {
        if (this.lugsLocked) continue;
        const lugIdx = entityData.lugIdx as number;
        this.startDrag('liftingLug', -1, -1, -1, lugIdx);
        this.callbacks.onLugSelected(lugIdx);
        return;
      }

      // --- Weld ---
      if (entityData.weldIdx !== undefined) {
        if (this.weldsLocked) continue;
        const weldIdx = entityData.weldIdx as number;
        this.selectedWeldIdx = weldIdx;
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

      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const state = this.vesselState;
      const isVertical = state.orientation === 'vertical';

      const currentPos = isVertical
        ? (point.y / SCALE) + (state.length / 2)
        : (point.x / SCALE) + (state.length / 2);
      const rad = isVertical
        ? Math.atan2(point.z, point.x)
        : Math.atan2(point.y, point.z);
      const currentAngle = ((rad * 180) / Math.PI + 360) % 360;

      const circumference = Math.PI * state.id;
      const axialDelta = Math.abs(currentPos - this.drawStartPos);
      let angleDelta = Math.abs(currentAngle - this.drawStartAngle);
      if (angleDelta > 180) angleDelta = 360 - angleDelta;
      const circumDelta = (angleDelta / 360) * circumference;

      const centerPos = (this.drawStartPos + currentPos) / 2;
      const centerAngle = (this.drawStartAngle + currentAngle) / 2;

      if (this.isDrawingRuler) {
        this.callbacks.onRulerPreview(this.drawStartPos, this.drawStartAngle, currentPos, currentAngle);
      } else if (this.isDrawingCoverage) {
        const width = Math.max(axialDelta, 20);
        const height = Math.max(circumDelta, 20);
        this.callbacks.onCoverageRectPreview(centerPos, centerAngle, width, height);
      } else if (this.drawMode === 'circle') {
        const diameter = Math.max(axialDelta, circumDelta);
        this.callbacks.onAnnotationPreview(this.drawMode, centerPos, centerAngle, diameter, diameter);
      } else {
        this.callbacks.onAnnotationPreview(this.drawMode!, centerPos, centerAngle, axialDelta, circumDelta);
      }
      return;
    }

    if (!this.isDown || !this.isDragging || this.dragType === null) {
      // --- Scan composite hover (only when not dragging) ---
      if (this.scanCompositeMeshes.length > 0) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const hits = this.raycaster.intersectObjects(this.scanCompositeMeshes, false);
        if (hits.length > 0) {
          const hit = hits[0];
          const uv = hit.uv;
          const userData = hit.object.userData;

          if (uv && userData.type === 'scanComposite' && userData.data) {
            // CCW flips uv.x via `v` instead of `1-v`, so invert back for column lookup
            const uvX = userData.scanDirection === 'ccw' ? 1 - uv.x : uv.x;
            const col = Math.min(Math.floor(uvX * userData.width), userData.width - 1);
            const row = userData.indexDirection === 'reverse'
              ? Math.min(Math.floor(uv.y * userData.height), userData.height - 1)
              : Math.min(Math.floor((1 - uv.y) * userData.height), userData.height - 1);
            const thickness = userData.data[row]?.[col] ?? null;

            this.callbacks.onScanCompositeHover(
              userData.id,
              thickness,
              userData.xAxis[col] ?? 0,
              userData.yAxis[row] ?? 0,
              event.clientX,
              event.clientY,
            );
          }
        } else {
          // Clear hover when not over any composite
          this.callbacks.onScanCompositeHover('', null, 0, 0, 0, 0);
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

    if (this.dragType === 'coverageRect') {
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const isVertical = state.orientation === 'vertical';
      const newPos = isVertical
        ? (point.y / SCALE) + (state.length / 2)
        : (point.x / SCALE) + (state.length / 2);
      const rad = isVertical
        ? Math.atan2(point.z, point.x)
        : Math.atan2(point.y, point.z);
      let deg = (rad * 180) / Math.PI;
      if (deg < 0) deg += 360;

      this.callbacks.onCoverageRectMoved(this.selectedCoverageRectId, newPos, deg);
      return;
    }

    if (this.dragType === 'inspectionImage') {
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const isVertical = state.orientation === 'vertical';
      let newPos = isVertical
        ? (point.y / SCALE) + (state.length / 2)
        : (point.x / SCALE) + (state.length / 2);
      const headDepth = state.id / (2 * state.headRatio);
      newPos = Math.max(-headDepth, Math.min(state.length + headDepth, newPos));
      const rad = isVertical
        ? Math.atan2(point.z, point.x)
        : Math.atan2(point.y, point.z);
      let deg = (rad * 180) / Math.PI;
      if (deg < 0) deg += 360;

      this.callbacks.onInspectionImageMoved(this.selectedInspectionImageId, newPos, deg);
      return;
    }

    if (this.dragType === 'weld') {
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const isVertical = state.orientation === 'vertical';
      let newPos = isVertical
        ? (point.y / SCALE) + (state.length / 2)
        : (point.x / SCALE) + (state.length / 2);
      const headDepth = state.id / (2 * state.headRatio);
      newPos = Math.max(-headDepth, Math.min(state.length + headDepth, newPos));
      const rad = isVertical
        ? Math.atan2(point.z, point.x)
        : Math.atan2(point.y, point.z);
      let deg = (rad * 180) / Math.PI;
      if (deg < 0) deg += 360;

      this.callbacks.onWeldMoved(this.selectedWeldIdx, newPos, deg);
      return;
    }

    if (this.dragType === 'scanGizmo') {
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const isVertical = state.orientation === 'vertical';
      let newPos = isVertical
        ? (point.y / SCALE) + (state.length / 2)
        : (point.x / SCALE) + (state.length / 2);
      // Clamp to vessel tan-tan range
      newPos = Math.max(0, Math.min(state.length, newPos));

      const rad = isVertical
        ? Math.atan2(point.z, point.x)
        : Math.atan2(point.y, point.z);
      // Convert internal angle (0°=3-o'clock) to user-facing (0°=TDC) by subtracting 90°
      let deg = (rad * 180) / Math.PI - 90;
      deg = ((deg % 360) + 360) % 360;
      deg = Math.round(deg);

      this.callbacks.onScanGizmoDatumMoved(this.selectedGizmoCompositeId, deg, newPos);
      return;
    }

    if (this.dragType === 'nozzle' || this.dragType === 'texture' || this.dragType === 'liftingLug' || this.dragType === 'annotation') {
      // Raycast against the vessel shell to find the surface point
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;

      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;

      // Calculate position in mm along the vessel axis
      const isVertical = state.orientation === 'vertical';
      let newPos = isVertical
        ? (point.y / SCALE) + (state.length / 2)
        : (point.x / SCALE) + (state.length / 2);

      // Clamp to vessel extent (including head depth)
      const headDepth = state.id / (2 * state.headRatio);
      newPos = Math.max(-headDepth, Math.min(state.length + headDepth, newPos));

      // Calculate angle in degrees around the circumference
      const rad = isVertical
        ? Math.atan2(point.z, point.x)
        : Math.atan2(point.y, point.z);
      let deg = (rad * 180) / Math.PI;
      if (deg < 0) deg += 360;

      if (this.dragType === 'nozzle') {
        this.callbacks.onNozzleMoved(this.selectedNozzleIdx, newPos, deg);
      } else if (this.dragType === 'liftingLug') {
        this.callbacks.onLugMoved(this.selectedLugIdx, newPos, deg);
      } else if (this.dragType === 'annotation') {
        this.callbacks.onAnnotationMoved(this.selectedAnnotationIdx, newPos, deg);
      } else {
        this.callbacks.onTextureMoved(this.selectedTextureIdx, newPos, deg);
      }
    } else if (this.dragType === 'saddle') {
      // Intersect a horizontal plane at the saddle Y level
      const RADIUS = state.id / 2;
      const saddleY = -RADIUS * 1.2 * SCALE;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -saddleY);
      const intersection = new THREE.Vector3();

      if (this.raycaster.ray.intersectPlane(plane, intersection)) {
        let newPos = (intersection.x / SCALE) + (state.length / 2);
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

      const shellMeshes = this.getShellMeshes();
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length > 0) {
        const point = hits[0].point;
        const state = this.vesselState;
        const isVertical = state.orientation === 'vertical';

        const endPos = isVertical
          ? (point.y / SCALE) + (state.length / 2)
          : (point.x / SCALE) + (state.length / 2);
        const rad = isVertical
          ? Math.atan2(point.z, point.x)
          : Math.atan2(point.y, point.z);
        const endAngle = ((rad * 180) / Math.PI + 360) % 360;

        const circumference = Math.PI * state.id;
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
          this.callbacks.onCoverageRectCreated(centerPos, centerAngle, width, height);
        } else if (this.drawMode === 'circle') {
          const diameter = Math.max(axialDelta, circumDelta, minSize);
          this.callbacks.onAnnotationCreated(this.drawMode, centerPos, centerAngle, diameter, diameter);
        } else {
          const width = Math.max(axialDelta, minSize);
          const height = Math.max(circumDelta, minSize);
          this.callbacks.onAnnotationCreated(this.drawMode!, centerPos, centerAngle, width, height);
        }
      }
      return;
    }

    this.isDown = false;

    if (this.isDragging) {
      this.isDragging = false;
      this.dragType = null;

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
    annotationIdx: number = -1,
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
   * Walk up from a hit object to find gizmo userData (scanGizmo, scanGizmoArrowCirc, scanGizmoArrowLong).
   */
  private findGizmoData(obj: THREE.Object3D): Record<string, unknown> | null {
    let current: THREE.Object3D | null = obj;
    while (current) {
      const ud = current.userData;
      if (
        ud.type === 'scanGizmo' ||
        ud.type === 'scanGizmoArrowCirc' ||
        ud.type === 'scanGizmoArrowLong'
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
}
