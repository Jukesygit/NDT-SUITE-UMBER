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
import type { VesselState } from '../types';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export type DragType = 'nozzle' | 'liftingLug' | 'saddle' | 'texture' | null;

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
  private isDown = false;

  // Lock flags - public so the React layer can toggle them
  nozzlesLocked = false;
  saddlesLocked = false;
  texturesLocked = false;
  lugsLocked = false;

  // External mesh references (updated by the rebuild cycle)
  nozzleMeshes: THREE.Object3D[] = [];
  lugMeshes: THREE.Object3D[] = [];
  saddleMeshes: THREE.Mesh[] = [];
  textureMeshes: THREE.Mesh[] = [];
  vesselGroup: THREE.Group | null = null;

  // Vessel state reference (for position calculations)
  private vesselState: VesselState;
  private callbacks: InteractionCallbacks;

  // Bound handlers stored for proper cleanup
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: () => void;

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

    // ----- Priority 1: Texture meshes ----- //
    if (!this.texturesLocked && this.textureMeshes.length > 0) {
      const textureHits = this.raycaster.intersectObjects(this.textureMeshes, false);
      if (textureHits.length > 0) {
        const hit = textureHits[0].object as THREE.Mesh;
        const textureIdx = hit.userData.textureIdx as number | undefined;
        if (textureIdx !== undefined) {
          this.startDrag('texture', -1, -1, textureIdx);
          this.callbacks.onTextureSelected(textureIdx);
          return;
        }
      }
    }

    // ----- Priority 2: Nozzle meshes (groups - use recursive intersect) ----- //
    if (!this.nozzlesLocked && this.nozzleMeshes.length > 0) {
      const nozzleHits = this.raycaster.intersectObjects(this.nozzleMeshes, true);
      if (nozzleHits.length > 0) {
        // Walk up the hierarchy to find the root nozzle group that has the index
        let obj: THREE.Object3D | null = nozzleHits[0].object;
        let nozzleIdx: number | undefined;
        while (obj) {
          nozzleIdx = obj.userData.nozzleIdx as number | undefined;
          if (nozzleIdx !== undefined) break;
          obj = obj.parent;
        }
        if (nozzleIdx !== undefined) {
          this.startDrag('nozzle', nozzleIdx, -1, -1);
          this.callbacks.onNozzleSelected(nozzleIdx);
          return;
        }
      }
    }

    // ----- Priority 3: Lifting lug meshes (groups - recursive) ----- //
    if (!this.lugsLocked && this.lugMeshes.length > 0) {
      const lugHits = this.raycaster.intersectObjects(this.lugMeshes, true);
      if (lugHits.length > 0) {
        let obj: THREE.Object3D | null = lugHits[0].object;
        let lugIdx: number | undefined;
        while (obj) {
          lugIdx = obj.userData.lugIdx as number | undefined;
          if (lugIdx !== undefined) break;
          obj = obj.parent;
        }
        if (lugIdx !== undefined) {
          this.startDrag('liftingLug', -1, -1, -1, lugIdx);
          this.callbacks.onLugSelected(lugIdx);
          return;
        }
      }
    }

    // ----- Priority 4: Saddle meshes ----- //
    if (!this.saddlesLocked && this.saddleMeshes.length > 0) {
      const saddleHits = this.raycaster.intersectObjects(this.saddleMeshes, false);
      if (saddleHits.length > 0) {
        const hit = saddleHits[0].object as THREE.Mesh;
        const saddleIdx = hit.userData.saddleIdx as number | undefined;
        if (saddleIdx !== undefined) {
          this.startDrag('saddle', -1, saddleIdx, -1);
          this.callbacks.onSaddleSelected(saddleIdx);
          return;
        }
      }
    }

    // ----- Miss: deselect everything ----- //
    this.selectedNozzleIdx = -1;
    this.selectedSaddleIdx = -1;
    this.selectedTextureIdx = -1;
    this.selectedLugIdx = -1;
    this.dragType = null;
    this.callbacks.onDeselect();
  }

  // ---------------------------------------------------------------------------
  // Pointer Move
  // ---------------------------------------------------------------------------

  private onPointerMove(event: PointerEvent): void {
    if (!this.isDown || !this.isDragging || this.dragType === null) return;

    // Update NDC from pointer position (use canvas rect for consistency)
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const state = this.vesselState;

    if (this.dragType === 'nozzle' || this.dragType === 'texture' || this.dragType === 'liftingLug') {
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

  private onPointerUp(): void {
    if (!this.isDown) return;

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
    type: 'nozzle' | 'liftingLug' | 'saddle' | 'texture',
    nozzleIdx: number,
    saddleIdx: number,
    textureIdx: number,
    lugIdx: number = -1,
  ): void {
    this.isDown = true;
    this.isDragging = true;
    this.dragType = type;
    this.selectedNozzleIdx = nozzleIdx;
    this.selectedSaddleIdx = saddleIdx;
    this.selectedTextureIdx = textureIdx;
    this.selectedLugIdx = lugIdx;

    // Disable orbit controls during drag so panning doesn't interfere
    this.controls.enabled = false;
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
