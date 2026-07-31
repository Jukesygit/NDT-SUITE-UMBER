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
import { resolveBodyFrame } from './body-frame';
import { domePhiThetaFromPoint } from './dome-scan-geometry';
import { buildMeridianProfile, arcFromAxial, axialFromArc, displayRadiusAtArc } from './dome-arc';

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
  onNozzleMoved: (index: number, pos: number, angle: number) => void;
  onSaddleMoved: (index: number, pos: number) => void;
  onTextureMoved: (id: number, pos: number, angle: number) => void;
  onLugMoved: (index: number, pos: number, angle: number) => void;
  onAnnotationSelected: (id: number) => void;
  onAnnotationMoved: (id: number, pos: number, angle: number) => void;
  onAnnotationCreated: (
    type: AnnotationShapeType,
    pos: number,
    angle: number,
    width: number,
    height: number
  ) => void;
  onAnnotationPreview: (
    type: AnnotationShapeType,
    pos: number,
    angle: number,
    width: number,
    height: number
  ) => void;
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
  onScanGizmoDatumMoved: (compositeId: string, angleDeg: number, posMm: number) => void;
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
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const state = this.vesselState;

      // Single frame inverse: world point -> (pos mm, angle deg).
      const start = resolveBodyFrame(state).toLocal(point);
      this.drawStartPos = start.pos;
      this.drawStartAngle = start.angle;

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

      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const state = this.vesselState;

      // Single frame inverse: world point -> (pos mm, angle deg).
      const { pos: currentPos, angle: currentAngle } = resolveBodyFrame(state).toLocal(point);

      const circumference = Math.PI * state.id;
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
        this.callbacks.onCoverageRectPreview(centerPos, centerAngle, width, height);
      } else {
        // Annotations size in meridian-arc space so the preview matches the
        // committed footprint on dome ends (see onPointerUp create path).
        const fp = this.annotationFootprint(
          this.drawStartPos,
          this.drawStartAngle,
          currentPos,
          currentAngle
        );
        this.callbacks.onAnnotationPreview(
          this.drawMode!,
          fp.centerPos,
          fp.centerAngle,
          fp.width,
          fp.height
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
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const rect = state.coverageRects.find((r) => r.id === this.selectedCoverageRectId);
      const rectBodyId = rect?.bodyId;
      if (rectBodyId !== undefined) {
        // Appendage-mounted rect: scope to that body's surface and invert through
        // its frame (pure cylinder, no dome drape). Clamp to the cylinder span.
        const bodyHit = hits.find((h) => hitBodyId(h.object) === rectBodyId);
        if (!bodyHit) return;
        const bodyFrame = resolveBodyFrame(state, rectBodyId);
        const local = bodyFrame.toLocal(bodyHit.point);
        const clampedPos = Math.max(0, Math.min(bodyFrame.axialLength, local.pos));
        this.callbacks.onCoverageRectMoved(this.selectedCoverageRectId, clampedPos, local.angle);
        return;
      }

      // Main-shell rect: only accept a main-shell hit so it can't snap onto an
      // appendage. Coverage rects render through the same drape geometry, so the
      // drag uses the shared dome-stable resolver (holds/flips the angle near the
      // pole). With no appendages present the first hit is the only hit — legacy.
      const mainHit = hits.find((h) => hitBodyId(h.object) === undefined);
      if (!mainHit) return;
      const point = mainHit.point;
      const { pos: posH, angle: thetaH } = frame.toLocal(point);
      const drag = this.resolveDrapeDrag(
        posH,
        thetaH,
        this.radialAxisDistanceMm(point, state),
        rect?.pos ?? posH,
        rect?.angle ?? thetaH,
        state
      );
      this.callbacks.onCoverageRectMoved(this.selectedCoverageRectId, drag.pos, drag.angle);
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
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const weldBodyId = state.welds[this.selectedWeldIdx]?.bodyId;
      if (weldBodyId !== undefined) {
        // Appendage-mounted weld: scope to that body's surface, invert through its
        // frame, clamp to the cylinder span (mirrors the nozzle-drag scoping).
        const bodyHit = hits.find((h) => hitBodyId(h.object) === weldBodyId);
        if (!bodyHit) return;
        const bodyFrame = resolveBodyFrame(state, weldBodyId);
        const local = bodyFrame.toLocal(bodyHit.point);
        const clampedPos = Math.max(0, Math.min(bodyFrame.axialLength, local.pos));
        this.callbacks.onWeldMoved(this.selectedWeldIdx, clampedPos, local.angle);
        return;
      }

      // Main-shell weld: only accept a main-shell hit (no bodyId tag). With no
      // appendages present the first hit is the only hit — identical to legacy.
      const mainHit = hits.find((h) => hitBodyId(h.object) === undefined);
      if (!mainHit) return;
      const { pos, angle: deg } = frame.toLocal(mainHit.point);
      const headDepth = state.id / (2 * state.headRatio);
      const newPos = Math.max(-headDepth, Math.min(state.length + headDepth, pos));

      this.callbacks.onWeldMoved(this.selectedWeldIdx, newPos, deg);
      return;
    }

    if (this.dragType === 'scanGizmo') {
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      // A scan composite can live on an appendage body: scope the datum drag to
      // that body's surface and invert through the body frame (mirroring the
      // nozzle-drag scoping). Main-shell composites stay on the main frame; with
      // no appendages present the first hit is the only hit, identical to legacy.
      const gizmoComposite = state.scanComposites.find(
        (c) => c.id === this.selectedGizmoCompositeId
      );
      const gizmoBodyId = gizmoComposite?.bodyId;
      const gizmoFrame = gizmoBodyId !== undefined ? resolveBodyFrame(state, gizmoBodyId) : frame;
      const hit = hits.find((h) => hitBodyId(h.object) === gizmoBodyId);
      if (!hit) return;

      const local = gizmoFrame.toLocal(hit.point);
      // Clamp to the body's axial span (tan-tan for main, cylinder length for appendage).
      const newPos = Math.max(0, Math.min(gizmoFrame.axialLength, local.pos));

      // Convert internal angle (0°=3-o'clock) to user-facing (0°=TDC) by subtracting 90°
      let deg = local.angle - 90;
      deg = ((deg % 360) + 360) % 360;
      deg = Math.round(deg);

      this.callbacks.onScanGizmoDatumMoved(this.selectedGizmoCompositeId, deg, newPos);
      return;
    }

    if (this.dragType === 'domeGizmo') {
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      const point = hits[0].point;
      const isVertical = state.orientation === 'vertical';
      const RADIUS = state.id / 2;
      const HEAD_DEPTH = RADIUS / (state.headRatio || 2);

      const ds = state.domeScanComposites?.find((d) => d.id === this.selectedGizmoCompositeId);
      if (!ds) return;
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

    if (
      this.dragType === 'nozzle' ||
      this.dragType === 'texture' ||
      this.dragType === 'liftingLug' ||
      this.dragType === 'annotation'
    ) {
      // Raycast against the vessel shell to find the surface point
      const shellMeshes = this.getShellMeshes();
      if (shellMeshes.length === 0) return;

      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length === 0) return;

      // A nozzle can mount on an appendage body: scope its drag to that body's
      // surface and convert through the body frame. Main-shell nozzles (and every
      // texture / lug / annotation drag) stay on the exact legacy main-shell path.
      if (this.dragType === 'nozzle') {
        const nozzleBodyId = state.nozzles[this.selectedNozzleIdx]?.bodyId;
        if (nozzleBodyId !== undefined) {
          const bodyHit = hits.find((h) => hitBodyId(h.object) === nozzleBodyId);
          if (!bodyHit) return;
          const bodyFrame = resolveBodyFrame(state, nozzleBodyId);
          const local = bodyFrame.toLocal(bodyHit.point);
          const clampedPos = Math.max(0, Math.min(bodyFrame.axialLength, local.pos));
          this.callbacks.onNozzleMoved(
            this.selectedNozzleIdx,
            clampedPos,
            this.snapAngle(local.angle)
          );
          return;
        }
        // Main-shell nozzle: only accept a main-shell hit (no bodyId tag), so the
        // nozzle can't snap onto an appendage surface. With no appendages present
        // this is the first hit, identical to the legacy path.
        const mainHit = hits.find((h) => hitBodyId(h.object) === undefined);
        if (!mainHit) return;
        const { pos, angle: deg } = frame.toLocal(mainHit.point);
        const headDepth = state.id / (2 * state.headRatio);
        const newPos = Math.max(-headDepth, Math.min(state.length + headDepth, pos));
        // Nozzles snap to the chosen angular increment when snapping is enabled.
        this.callbacks.onNozzleMoved(this.selectedNozzleIdx, newPos, this.snapAngle(deg));
        return;
      }

      // A lifting lug can mount on an appendage body: scope its drag to that body's
      // surface exactly like the nozzle path. The angle-snap treatment (shared with
      // nozzles) extends to appendage-mounted lugs.
      if (this.dragType === 'liftingLug') {
        const lugBodyId = state.liftingLugs[this.selectedLugIdx]?.bodyId;
        if (lugBodyId !== undefined) {
          const bodyHit = hits.find((h) => hitBodyId(h.object) === lugBodyId);
          if (!bodyHit) return;
          const bodyFrame = resolveBodyFrame(state, lugBodyId);
          const local = bodyFrame.toLocal(bodyHit.point);
          const clampedPos = Math.max(0, Math.min(bodyFrame.axialLength, local.pos));
          this.callbacks.onLugMoved(this.selectedLugIdx, clampedPos, this.snapAngle(local.angle));
          return;
        }
        const mainHit = hits.find((h) => hitBodyId(h.object) === undefined);
        if (!mainHit) return;
        const { pos, angle: deg } = frame.toLocal(mainHit.point);
        const headDepth = state.id / (2 * state.headRatio);
        const newPos = Math.max(-headDepth, Math.min(state.length + headDepth, pos));
        this.callbacks.onLugMoved(this.selectedLugIdx, newPos, this.snapAngle(deg));
        return;
      }

      const point = hits[0].point;

      // Position (mm) and angle (deg) via the single frame inverse.
      const { pos, angle: deg } = frame.toLocal(point);

      // Clamp to vessel extent (including head depth)
      const headDepth = state.id / (2 * state.headRatio);
      const newPos = Math.max(-headDepth, Math.min(state.length + headDepth, pos));

      if (this.dragType === 'annotation') {
        // Dome-stable drag: hold/flip the angle reference near the pole so a rect
        // can be dragged onto and through the dome centre without spinning.
        const ann = state.annotations.find((a) => a.id === this.selectedAnnotationIdx);
        const drag = this.resolveDrapeDrag(
          pos,
          deg,
          this.radialAxisDistanceMm(point, state),
          ann?.pos ?? pos,
          ann?.angle ?? deg,
          state
        );
        this.callbacks.onAnnotationMoved(this.selectedAnnotationIdx, drag.pos, drag.angle);
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

      const shellMeshes = this.getShellMeshes();
      const hits = this.raycaster.intersectObjects(shellMeshes, true);
      if (hits.length > 0) {
        const point = hits[0].point;
        const state = this.vesselState;

        // Single frame inverse: world point -> (pos mm, angle deg).
        const { pos: endPos, angle: endAngle } = resolveBodyFrame(state).toLocal(point);

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
        } else {
          // Annotations size in meridian-arc space: width = true surface arc
          // across shell + dome; height = circumferential mm at the local dome
          // radius; centre = arc-midpoint mapped back to axial. Reduces to the
          // legacy axial/equatorial math on the cylinder. minSize floor kept.
          const fp = this.annotationFootprint(
            this.drawStartPos,
            this.drawStartAngle,
            endPos,
            endAngle
          );
          const width = Math.max(fp.width, minSize);
          const height = Math.max(fp.height, minSize);
          this.callbacks.onAnnotationCreated(
            this.drawMode!,
            fp.centerPos,
            fp.centerAngle,
            width,
            height
          );
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
    state: VesselState
  ): { pos: number; angle: number } {
    const L = state.length;
    const R = state.id / 2;
    const headDepth = state.id / (2 * state.headRatio);
    const clampedPos = Math.max(-headDepth, Math.min(L + headDepth, posH));

    const onHead = posH < 0 || posH > L || storedPos < 0 || storedPos > L;
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
    endAngle: number
  ): { width: number; height: number; centerPos: number; centerAngle: number } {
    const state = this.vesselState;
    const R = state.id / 2;
    const D = state.id / (2 * state.headRatio);
    const L = state.length;
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
}
