import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import * as THREE from 'three';
import type {
  TextureConfig,
  CoverageRectConfig,
  RulerConfig,
  InspectionImageConfig,
} from '../types';
import { historyFor, type UpdateVessel, type VesselAction } from '../engine/vessel-reducer';

interface UseOverlayActionsParams {
  updateVessel: UpdateVessel;
  dispatch: Dispatch<VesselAction>;
  /** Imperative THREE.Texture store, keyed by texture id (lives outside the reducer). */
  textureObjectsRef: MutableRefObject<Record<number, THREE.Texture>>;
  setTextureObjectsVersion: Dispatch<SetStateAction<number>>;
  nextTextureIdRef: MutableRefObject<number>;
  nextCoverageRectIdRef: MutableRefObject<number>;
  nextRulerIdRef: MutableRefObject<number>;
  nextInspectionImageIdRef: MutableRefObject<number>;
  /** Current ui.viewingInspectionImageId — removeInspectionImage clears the viewer if it matches. */
  viewingInspectionImageId: number;
}

/**
 * Overlay entity CRUD — textures, coverage rects, rulers and inspection images.
 * Bodies extracted verbatim from VesselModeler.tsx (D1). The monotonic id-counter
 * refs and the imperative THREE.Texture store are threaded in explicitly so the
 * load path (applyModelConfig / loadProject) keeps writing the same refs.
 */
export function useOverlayActions({
  updateVessel,
  dispatch,
  textureObjectsRef,
  setTextureObjectsVersion,
  nextTextureIdRef,
  nextCoverageRectIdRef,
  nextRulerIdRef,
  nextInspectionImageIdRef,
  viewingInspectionImageId,
}: UseOverlayActionsParams) {
  // --- Texture handlers ---
  const addTexture = useCallback(
    (texture: TextureConfig, threeTexture: THREE.Texture) => {
      textureObjectsRef.current[Number(texture.id)] = threeTexture;
      setTextureObjectsVersion((v) => v + 1);
      updateVessel((prev) => ({ ...prev, textures: [...prev.textures, texture] }), {
        label: 'Add texture',
        at: Date.now(),
      });
    },
    [updateVessel, textureObjectsRef, setTextureObjectsVersion]
  );

  const updateTexture = useCallback(
    (id: number, updates: Partial<TextureConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          textures: prev.textures.map((t) => (Number(t.id) === id ? { ...t, ...updates } : t)),
        }),
        historyFor('texture', id, updates)
      );
    },
    [updateVessel]
  );

  const removeTexture = useCallback(
    (id: number) => {
      const tex = textureObjectsRef.current[id];
      if (tex) {
        tex.dispose();
        delete textureObjectsRef.current[id];
        setTextureObjectsVersion((v) => v + 1);
      }
      updateVessel(
        (prev) => ({
          ...prev,
          textures: prev.textures.filter((t) => Number(t.id) !== id),
        }),
        { label: 'Delete texture', at: Date.now() }
      );
      dispatch({ type: 'SELECT_TEXTURE', id: -1 });
    },
    [updateVessel, dispatch, textureObjectsRef, setTextureObjectsVersion]
  );

  const getNextTextureId = useCallback(() => {
    return nextTextureIdRef.current++;
  }, [nextTextureIdRef]);

  // --- Coverage rect handlers ---
  const addCoverageRect = useCallback(
    (rect: CoverageRectConfig) => {
      updateVessel((prev) => ({ ...prev, coverageRects: [...prev.coverageRects, rect] }), {
        label: 'Add coverage rect',
        at: Date.now(),
      });
    },
    [updateVessel]
  );

  const updateCoverageRect = useCallback(
    (id: number, updates: Partial<CoverageRectConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          coverageRects: prev.coverageRects.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }),
        historyFor('coverageRect', id, updates)
      );
    },
    [updateVessel]
  );

  const removeCoverageRect = useCallback(
    (id: number) => {
      updateVessel(
        (prev) => ({
          ...prev,
          coverageRects: prev.coverageRects.filter((r) => r.id !== id),
        }),
        { label: 'Delete coverage rect', at: Date.now() }
      );
      dispatch({ type: 'SELECT_COVERAGE_RECT', id: -1 });
    },
    [updateVessel, dispatch]
  );

  const getNextCoverageRectId = useCallback(() => {
    return nextCoverageRectIdRef.current++;
  }, [nextCoverageRectIdRef]);

  // --- Ruler handlers ---
  const addRuler = useCallback(
    (ruler: RulerConfig) => {
      updateVessel((prev) => ({ ...prev, rulers: [...prev.rulers, ruler] }), {
        label: 'Add ruler',
        at: Date.now(),
      });
    },
    [updateVessel]
  );

  const removeRuler = useCallback(
    (id: number) => {
      updateVessel((prev) => ({ ...prev, rulers: prev.rulers.filter((r) => r.id !== id) }), {
        label: 'Delete ruler',
        at: Date.now(),
      });
      // Only deselect if this ruler was selected
      dispatch({ type: 'SELECT_RULER', id: -1 });
    },
    [updateVessel, dispatch]
  );

  const updateRuler = useCallback(
    (id: number, updates: Partial<RulerConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          rulers: prev.rulers.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }),
        historyFor('ruler', id, updates)
      );
    },
    [updateVessel]
  );

  const getNextRulerId = useCallback(() => {
    return nextRulerIdRef.current++;
  }, [nextRulerIdRef]);

  // --- Inspection image handlers ---
  const addInspectionImage = useCallback(
    (img: InspectionImageConfig) => {
      updateVessel((prev) => ({ ...prev, inspectionImages: [...prev.inspectionImages, img] }), {
        label: 'Add inspection image',
        at: Date.now(),
      });
    },
    [updateVessel]
  );

  const updateInspectionImage = useCallback(
    (id: number, updates: Partial<InspectionImageConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          inspectionImages: prev.inspectionImages.map((i) =>
            i.id === id ? { ...i, ...updates } : i
          ),
        }),
        historyFor('inspectionImage', id, updates)
      );
    },
    [updateVessel]
  );

  const removeInspectionImage = useCallback(
    (id: number) => {
      updateVessel(
        (prev) => ({
          ...prev,
          inspectionImages: prev.inspectionImages.filter((i) => i.id !== id),
        }),
        { label: 'Delete inspection image', at: Date.now() }
      );
      dispatch({ type: 'SELECT_INSPECTION_IMAGE', id: -1 });
      if (viewingInspectionImageId === id)
        dispatch({ type: 'SET_VIEWING_INSPECTION_IMAGE', id: -1 });
    },
    [updateVessel, dispatch, viewingInspectionImageId]
  );

  const toggleInspectionImageVisible = useCallback(
    (id: number) => {
      updateVessel((prev) => ({
        ...prev,
        inspectionImages: prev.inspectionImages.map((i) =>
          i.id === id ? { ...i, visible: i.visible === false ? true : false } : i
        ),
      }));
    },
    [updateVessel]
  );

  const toggleInspectionImageLocked = useCallback(
    (id: number) => {
      updateVessel((prev) => ({
        ...prev,
        inspectionImages: prev.inspectionImages.map((i) =>
          i.id === id ? { ...i, locked: !i.locked } : i
        ),
      }));
    },
    [updateVessel]
  );

  const getNextInspectionImageId = useCallback(() => {
    return nextInspectionImageIdRef.current++;
  }, [nextInspectionImageIdRef]);

  return {
    addTexture,
    updateTexture,
    removeTexture,
    getNextTextureId,
    addCoverageRect,
    updateCoverageRect,
    removeCoverageRect,
    getNextCoverageRectId,
    addRuler,
    removeRuler,
    updateRuler,
    getNextRulerId,
    addInspectionImage,
    updateInspectionImage,
    removeInspectionImage,
    toggleInspectionImageVisible,
    toggleInspectionImageLocked,
    getNextInspectionImageId,
  };
}
