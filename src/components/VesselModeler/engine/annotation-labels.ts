// =============================================================================
// Vessel Modeler - Annotation Labels (CSS2DObject + Leader Lines)
// =============================================================================
// Creates persistent HTML labels connected via leader lines to annotation
// positions on the vessel surface. Labels are freely draggable - the leader
// line follows the label wherever it is positioned.
// =============================================================================

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AnnotationShapeConfig, MeasurementConfig, RulerConfig, VesselState } from '../types';
import { computeRulerDistance, shellPoint } from './annotation-geometry';
import { SCALE } from './materials';

/** Default annotation leader line length in mm */
const DEFAULT_LEADER_LENGTH_MM = 2000;

/** Dot marker radius in world units */
const DOT_RADIUS = 0.03;

// Shared geometry + materials
let dotGeometry: THREE.SphereGeometry | null = null;
let dotMaterial: THREE.MeshBasicMaterial | null = null;

function getDotGeometry(): THREE.SphereGeometry {
  if (!dotGeometry) dotGeometry = new THREE.SphereGeometry(DOT_RADIUS, 12, 8);
  return dotGeometry;
}

function getDotMaterial(): THREE.MeshBasicMaterial {
  if (!dotMaterial) dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  return dotMaterial;
}

// ---------------------------------------------------------------------------
// Label Drag Context
// ---------------------------------------------------------------------------

export interface LabelDragContext {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  getVesselState: () => VesselState;
  getVesselGroup: () => THREE.Group | null;
  onAnnotationSelected: (id: number) => void;
  onAnnotationMoved: (id: number, pos: number, angle: number) => void;
  onAnnotationLabelOffsetChanged: (id: number, offset: [number, number, number]) => void;
  onInspectionImageLabelOffsetChanged?: (id: number, offset: [number, number, number]) => void;
  onDragEnd: () => void;
}

// ---------------------------------------------------------------------------
// 3D Position Helpers
// ---------------------------------------------------------------------------

function getRadialDirection(angleRad: number, vesselState: VesselState): THREE.Vector3 {
  const isVertical = vesselState.orientation === 'vertical';
  if (isVertical) {
    return new THREE.Vector3(Math.cos(angleRad), 0, Math.sin(angleRad)).normalize();
  }
  return new THREE.Vector3(0, Math.sin(angleRad), Math.cos(angleRad)).normalize();
}

/** Get the shell contact point for an annotation. */
export function getAnnotationShellPoint(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
): THREE.Vector3 {
  const angleRad = (config.angle * Math.PI) / 180;
  return shellPoint(config.pos, angleRad, vesselState, 2);
}

/**
 * Compute the label end position. Uses labelOffset if set (free-form),
 * otherwise falls back to radial direction * leaderLength.
 */
export function getAnnotationLeaderEndPosition(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
): THREE.Vector3 {
  const shell = getAnnotationShellPoint(config, vesselState);

  if (config.labelOffset) {
    return new THREE.Vector3(
      shell.x + config.labelOffset[0],
      shell.y + config.labelOffset[1],
      shell.z + config.labelOffset[2],
    );
  }

  const angleRad = (config.angle * Math.PI) / 180;
  const radial = getRadialDirection(angleRad, vesselState);
  const leaderLengthMm = config.leaderLength ?? DEFAULT_LEADER_LENGTH_MM;
  return shell.clone().add(radial.multiplyScalar(leaderLengthMm * SCALE));
}

// ---------------------------------------------------------------------------
// Annotation Leader Line Geometry (dot + line)
// ---------------------------------------------------------------------------

export function createAnnotationLeaderLine(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
  isSelected: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { annotationLeaderId: config.id };

  const shellPos = getAnnotationShellPoint(config, vesselState);
  const leaderEnd = getAnnotationLeaderEndPosition(config, vesselState);

  // Dot at shell contact
  const dot = new THREE.Mesh(getDotGeometry(), getDotMaterial());
  dot.position.copy(shellPos);
  dot.userData = { annotationId: config.id, isDot: true };
  group.add(dot);

  // Leader line from shell to label position
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([shellPos, leaderEnd]);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: isSelected ? 0x00ccff : 0xffffff,
    transparent: true,
    opacity: 0.5,
  });
  group.add(new THREE.Line(lineGeometry, lineMaterial));

  return group;
}

// ---------------------------------------------------------------------------
// Public Factory - Annotation Label
// ---------------------------------------------------------------------------

export function createAnnotationLabel(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
  _measurementConfig: MeasurementConfig,
  isSelected: boolean,
  dragContext?: LabelDragContext,
): CSS2DObject {
  // Line 2: Scan (circumferential mm) and Index (axial mm from tangent line)
  const scanMm = Math.round((config.angle / 360) * Math.PI * vesselState.id);
  const indexMm = Math.round(config.pos);

  // Line 3: Area in m²
  const areaSqM = (config.width * config.height) / 1_000_000;

  const el = document.createElement('div');
  el.className = `vm-annotation-label${isSelected ? ' selected' : ''}`;
  if (config.severityLevel) {
    el.dataset.severity = config.severityLevel;
  }

  if (config.type === 'restriction') {
    // Restriction labels: name, notes, position, optional image
    const notesHtml = config.restrictionNotes
      ? `<div class="vm-annotation-label-notes">${config.restrictionNotes}</div>`
      : '';
    const imageHtml = config.restrictionImage
      ? `<img class="vm-annotation-label-img" src="${config.restrictionImage}" />`
      : '';
    el.innerHTML = `
      <div class="vm-annotation-label-name">\u26A0 ${config.name}</div>
      ${notesHtml}
      <div class="vm-annotation-label-pos">Scan: ${scanMm}mm \u00a0 Index: ${indexMm}mm</div>
      ${imageHtml}
    `.trim();
  } else {
    el.innerHTML = `
      <div class="vm-annotation-label-name">${config.name}</div>
      <div class="vm-annotation-label-pos">Scan: ${scanMm}mm \u00a0 Index: ${indexMm}mm</div>
      <div class="vm-annotation-label-area">${areaSqM.toFixed(2)} m\u00b2</div>
    `.trim();
  }

  if (dragContext) {
    attachFreeFormDrag(el, config.id, 'annotation', dragContext);
  }

  const label = new CSS2DObject(el);
  const position = getAnnotationLeaderEndPosition(config, vesselState);
  label.position.copy(position);
  label.userData = { type: 'annotation-label', annotationId: config.id };

  return label;
}

// ---------------------------------------------------------------------------
// Free-Form Label Drag (shared logic for annotations + inspection images)
// ---------------------------------------------------------------------------

/**
 * Attach free-form drag to a CSS2D label element. On drag, the label
 * follows the mouse in a camera-facing plane, and the offset from the
 * shell contact point is emitted via callback.
 */
export function attachFreeFormDrag(
  el: HTMLElement,
  itemId: number,
  itemType: 'annotation' | 'inspectionImage',
  ctx: LabelDragContext,
): void {
  let isDragging = false;
  let pendingOffset: [number, number, number] | null = null;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const intersection = new THREE.Vector3();

  const onPointerDown = (e: PointerEvent) => {
    e.stopPropagation();

    // Check if item is locked - prevent drag if so
    const currentState = ctx.getVesselState();
    if (itemType === 'annotation') {
      const ann = currentState.annotations.find(a => a.id === itemId);
      if (ann?.locked) return;
    } else {
      const img = currentState.inspectionImages.find(i => i.id === itemId);
      if (img?.locked) return;
    }

    isDragging = true;
    pendingOffset = null;
    el.style.cursor = 'grabbing';
    ctx.controls.enabled = false;

    if (itemType === 'annotation') {
      ctx.onAnnotationSelected(itemId);
    }

    // Create a drag plane at the current label position, facing the camera
    const state = currentState;
    let currentLabelPos: THREE.Vector3;

    if (itemType === 'annotation') {
      const ann = state.annotations.find(a => a.id === itemId);
      if (!ann) return;
      currentLabelPos = getAnnotationLeaderEndPosition(ann, state);
    } else {
      // Import inspection image geometry lazily
      const img = state.inspectionImages.find(i => i.id === itemId);
      if (!img) return;
      currentLabelPos = getInspectionImageLabelPos(img, state);
    }

    const cameraDir = ctx.camera.getWorldDirection(new THREE.Vector3());
    dragPlane.setFromNormalAndCoplanarPoint(cameraDir, currentLabelPos);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;

    const rect = ctx.canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, ctx.camera);

    if (!raycaster.ray.intersectPlane(dragPlane, intersection)) return;

    // Compute offset from shell contact
    const state = ctx.getVesselState();
    let shellPos: THREE.Vector3;

    if (itemType === 'annotation') {
      const ann = state.annotations.find(a => a.id === itemId);
      if (!ann) return;
      shellPos = getAnnotationShellPoint(ann, state);
    } else {
      const img = state.inspectionImages.find(i => i.id === itemId);
      if (!img) return;
      const angleRad = (img.angle * Math.PI) / 180;
      shellPos = shellPoint(img.pos, angleRad, state, 2);
    }

    const offset: [number, number, number] = [
      intersection.x - shellPos.x,
      intersection.y - shellPos.y,
      intersection.z - shellPos.z,
    ];
    pendingOffset = offset;

    // Imperatively update the CSS2D label position and leader line in the scene
    // instead of triggering a full React state update + scene rebuild per frame
    const vesselGroup = ctx.getVesselGroup();
    if (vesselGroup) {
      const newLabelPos = new THREE.Vector3(
        shellPos.x + offset[0],
        shellPos.y + offset[1],
        shellPos.z + offset[2],
      );

      // Find and update the CSS2DObject label position
      vesselGroup.traverse((obj) => {
        if (obj instanceof CSS2DObject) {
          const ud = obj.userData;
          if (itemType === 'annotation' && ud.annotationId === itemId && ud.type === 'annotation-label') {
            obj.position.copy(newLabelPos);
          } else if (itemType === 'inspectionImage' && ud.inspectionImageId === itemId && ud.type === 'inspection-image-label') {
            obj.position.copy(newLabelPos);
          }
        }
      });

      // Find and update the leader line endpoint
      vesselGroup.traverse((obj) => {
        if (obj.userData?.annotationLeaderId === itemId && itemType === 'annotation') {
          obj.traverse((child) => {
            if (child instanceof THREE.Line) {
              const positions = child.geometry.attributes.position;
              if (positions && positions.count === 2) {
                positions.setXYZ(1, newLabelPos.x, newLabelPos.y, newLabelPos.z);
                positions.needsUpdate = true;
              }
            }
          });
        }
      });
    }
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    el.style.cursor = '';
    ctx.controls.enabled = true;

    // Commit the final offset to React state (single state update, not per-frame)
    if (pendingOffset) {
      if (itemType === 'annotation') {
        ctx.onAnnotationLabelOffsetChanged(itemId, pendingOffset);
      } else {
        ctx.onInspectionImageLabelOffsetChanged?.(itemId, pendingOffset);
      }
    }

    ctx.onDragEnd();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  el.addEventListener('pointerdown', onPointerDown);
}

/**
 * Compute the label position for an inspection image (used by the drag handler).
 * Uses labelOffset if set, otherwise radial * leaderLength.
 */
function getInspectionImageLabelPos(
  config: { pos: number; angle: number; leaderLength?: number; labelOffset?: [number, number, number] },
  vesselState: VesselState,
): THREE.Vector3 {
  const angleRad = (config.angle * Math.PI) / 180;
  const shell = shellPoint(config.pos, angleRad, vesselState, 2);

  if (config.labelOffset) {
    return new THREE.Vector3(
      shell.x + config.labelOffset[0],
      shell.y + config.labelOffset[1],
      shell.z + config.labelOffset[2],
    );
  }

  const radial = getRadialDirection(angleRad, vesselState);
  const leaderLengthMm = config.leaderLength ?? 2000;
  return shell.clone().add(radial.multiplyScalar(leaderLengthMm * SCALE));
}

// ---------------------------------------------------------------------------
// Ruler Label (midpoint tooltip showing distance in mm)
// ---------------------------------------------------------------------------

export function createRulerLabel(
  config: RulerConfig,
  vesselState: VesselState,
): CSS2DObject {
  const distMm = computeRulerDistance(config, vesselState);

  const el = document.createElement('div');
  el.className = 'vm-ruler-label';
  el.textContent = `${Math.round(distMm)} mm`;

  const label = new CSS2DObject(el);

  const midPos = (config.startPos + config.endPos) / 2;
  const midAngle = (config.startAngle + config.endAngle) / 2;
  const surfaceOffset = 5;

  const RADIUS = vesselState.id / 2;
  const TAN_TAN = vesselState.length;
  const HEAD_DEPTH = vesselState.id / (2 * vesselState.headRatio);
  const isVertical = vesselState.orientation === 'vertical';
  const posGlobal = (midPos - TAN_TAN / 2) * SCALE;
  const angleRad = (midAngle * Math.PI) / 180;

  let rLocal: number;
  if (midPos < 0) {
    const ratio = Math.min(0.99, Math.abs(midPos / HEAD_DEPTH));
    rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
  } else if (midPos > TAN_TAN) {
    const ratio = Math.min(0.99, Math.abs((midPos - TAN_TAN) / HEAD_DEPTH));
    rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
  } else {
    rLocal = RADIUS;
  }

  const r = (rLocal + surfaceOffset) * SCALE;

  if (isVertical) {
    label.position.set(r * Math.cos(angleRad), posGlobal, r * Math.sin(angleRad));
  } else {
    label.position.set(posGlobal, r * Math.sin(angleRad), r * Math.cos(angleRad));
  }

  label.userData = { type: 'ruler-label', rulerId: config.id };
  return label;
}
