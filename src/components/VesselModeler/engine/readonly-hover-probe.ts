// ---------------------------------------------------------------------------
// Read-only hover probe — the viewport's ONLY new pointer behaviour.
//
// Orbit comes free from SceneManager's OrbitControls; this adds a hover raycast
// and nothing else (no drag, no draw, no selection), which is why the read-only
// viewport does not touch `interaction-manager.ts` at all — that monolith is
// edit-coupled.
//
// Throttled to one raycast per animation frame: a pointermove burst collapses
// into a single probe on the next frame, so hovering never outpaces rendering.
// Hit resolution (composed-visibility filtering + entity/label lookup) lives in
// the pure `readonly-hover` module.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { VesselState } from '../types';
import { describeHover, type ReadOnlyHoverInfo } from './readonly-hover';

export interface HoverProbeOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  /** Current vessel group; null while no scene is built. */
  getRoot: () => THREE.Object3D | null;
  /** Model the hit is labelled against. */
  getState: () => VesselState;
  onHover: (hit: ReadOnlyHoverInfo | null) => void;
}

/**
 * Attach the hover probe. Returns a disposer that removes both listeners and
 * cancels any frame still in flight — call it from the mount effect's cleanup.
 */
export function attachHoverProbe({
  canvas,
  camera,
  getRoot,
  getState,
  onHover,
}: HoverProbeOptions): () => void {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pending: { x: number; y: number } | null = null;
  let frame: number | null = null;
  let lastWasNull = true;

  const probe = () => {
    frame = null;
    const point = pending;
    pending = null;
    const root = getRoot();
    if (!point || !root) return;

    const rect = canvas.getBoundingClientRect();
    ndc.x = ((point.x - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((point.y - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    // THREE's raycaster does NOT skip invisible objects, so every hit is
    // validated by walking composed Object3D.visible up to the vessel group —
    // which is exactly where the entity ∧ layer ∧ body result already lives.
    // Hits come back depth-sorted, so the first that resolves is the nearest.
    let hit: ReadOnlyHoverInfo | null = null;
    for (const intersection of raycaster.intersectObject(root, true)) {
      hit = describeHover(getState(), intersection.object, root, [
        intersection.point.x,
        intersection.point.y,
        intersection.point.z,
      ]);
      if (hit) break;
    }

    if (hit === null && lastWasNull) return; // never spam repeated misses
    lastWasNull = hit === null;
    onHover(hit);
  };

  const onPointerMove = (event: PointerEvent) => {
    pending = { x: event.clientX, y: event.clientY };
    if (frame === null) frame = requestAnimationFrame(probe);
  };

  const onPointerLeave = () => {
    pending = null;
    if (lastWasNull) return;
    lastWasNull = true;
    onHover(null);
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);

  return () => {
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    if (frame !== null) cancelAnimationFrame(frame);
  };
}
