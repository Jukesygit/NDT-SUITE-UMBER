import { useState, useCallback, type Dispatch, type RefObject } from 'react';
import * as THREE from 'three';
import type { VesselState } from '../types';
import type { ThreeViewportHandle } from '../ThreeViewport';
import type { VesselAction } from '../engine/vessel-reducer';
import {
  computeInspectionCameraTarget,
  animateCamera,
  cancelCameraAnimation,
} from '../engine/camera-animation';

interface UseInspectionModeParams {
  vesselState: VesselState;
  dispatch: Dispatch<VesselAction>;
  viewportRef: RefObject<ThreeViewportHandle | null>;
  /** ui.inspectingAnnotationId — drives the enter/cycle branch in the sidebar click. */
  inspectingAnnotationId: number | null;
  /** ui.savedCameraState — restored on exit; passing it in keeps the exit dep array verbatim. */
  uiSavedCameraState: {
    position: [number, number, number];
    target: [number, number, number];
  } | null;
}

/**
 * Inspection-mode navigation (T2-D / D4): enter/exit/cycle the enhanced
 * annotation camera view + the sidebar annotation click that routes into them.
 * Bodies extracted verbatim from VesselModeler.tsx — same camera save/animate
 * choreography (500ms tweens, controls.enabled toggling, cancelCameraAnimation
 * on exit) and the same ENTER/EXIT/CYCLE_INSPECTION dispatches.
 *
 * The `visibleStatLines` overlay state moves here too (it is only ever driven by
 * these handlers and read by the inspection JSX); it is returned along with
 * `toggleStatLine` so the InspectionPanel / StatLeaderOverlay wiring is unchanged.
 * Each callback keeps its original `useCallback` dependency array — the two
 * ui-derived values are threaded in by identical name so the arrays hold the
 * same values and callback identities churn exactly as before.
 */
export function useInspectionMode({
  vesselState,
  dispatch,
  viewportRef,
  inspectingAnnotationId,
  uiSavedCameraState,
}: UseInspectionModeParams) {
  // Inspection panel: which stat row is hovered (highlights min/max point on vessel)
  const [visibleStatLines, setVisibleStatLines] = useState<{ min: boolean; max: boolean }>({
    min: false,
    max: false,
  });

  const toggleStatLine = useCallback((stat: 'min' | 'max') => {
    setVisibleStatLines((prev) => ({ ...prev, [stat]: !prev[stat] }));
  }, []);

  // --- Inspection mode handlers ---
  const enterInspectionMode = useCallback(
    (annotationId: number) => {
      const camera = viewportRef.current?.getCamera();
      const controls = viewportRef.current?.getControls();
      if (!camera || !controls) return;

      const ann = vesselState.annotations.find((a) => a.id === annotationId);
      if (!ann) return;

      // Save current camera state before animating
      const savedCameraState: {
        position: [number, number, number];
        target: [number, number, number];
      } = {
        position: camera.position.toArray() as [number, number, number],
        target: (controls.target as THREE.Vector3).toArray() as [number, number, number],
      };

      const { position: targetPos, target: targetLookAt } = computeInspectionCameraTarget(
        ann,
        vesselState,
        camera
      );

      setVisibleStatLines({ min: false, max: false });
      animateCamera(camera, controls, targetPos, targetLookAt, 500, () => {
        controls.enabled = false;
        setVisibleStatLines({ min: true, max: true });
      });

      dispatch({ type: 'ENTER_INSPECTION_MODE', annotationId, cameraState: savedCameraState });
    },
    [vesselState]
  );

  const exitInspectionMode = useCallback(() => {
    const camera = viewportRef.current?.getCamera();
    const controls = viewportRef.current?.getControls();
    if (!camera || !controls) return;

    const saved = uiSavedCameraState;
    if (!saved) {
      dispatch({ type: 'EXIT_INSPECTION_MODE' });
      return;
    }

    // Re-enable controls before animating back
    controls.enabled = true;
    cancelCameraAnimation();

    const targetPos = new THREE.Vector3(...saved.position);
    const targetLookAt = new THREE.Vector3(...saved.target);

    animateCamera(camera, controls, targetPos, targetLookAt, 500);
    dispatch({ type: 'EXIT_INSPECTION_MODE' });
  }, [uiSavedCameraState]);

  const cycleInspection = useCallback(
    (annotationId: number) => {
      const camera = viewportRef.current?.getCamera();
      const controls = viewportRef.current?.getControls();
      if (!camera || !controls) return;

      const ann = vesselState.annotations.find((a) => a.id === annotationId);
      if (!ann) return;

      const { position: targetPos, target: targetLookAt } = computeInspectionCameraTarget(
        ann,
        vesselState,
        camera
      );

      // Temporarily re-enable controls for the animation
      controls.enabled = true;
      setVisibleStatLines({ min: false, max: false });
      animateCamera(camera, controls, targetPos, targetLookAt, 500, () => {
        controls.enabled = false;
        setVisibleStatLines({ min: true, max: true });
      });

      dispatch({ type: 'CYCLE_INSPECTION', annotationId });
    },
    [vesselState]
  );

  // Sidebar annotation click: enter/cycle inspection mode (scan annotations only)
  const handleSidebarAnnotationSelect = useCallback(
    (id: number) => {
      const ann = vesselState.annotations.find((a) => a.id === id);
      // Restriction annotations don't have an enhanced inspection view
      if (ann?.type === 'restriction') {
        dispatch({ type: 'SELECT_ANNOTATION', id });
        return;
      }
      if (inspectingAnnotationId !== null && inspectingAnnotationId !== id) {
        cycleInspection(id);
      } else if (inspectingAnnotationId === null) {
        enterInspectionMode(id);
      }
    },
    [inspectingAnnotationId, enterInspectionMode, cycleInspection, vesselState.annotations]
  );

  return {
    visibleStatLines,
    toggleStatLine,
    enterInspectionMode,
    exitInspectionMode,
    cycleInspection,
    handleSidebarAnnotationSelect,
  };
}
