import { useCallback, useEffect, type Dispatch, type MutableRefObject } from 'react';
import type { VesselState, AnnotationShapeConfig } from '../types';
import type { ThreeViewportHandle } from '../ThreeViewport';
import {
  uploadAnnotationImage,
  deleteAnnotationImage,
} from '../../../services/annotation-attachment-service';
import { recomputeAllAnnotationStats } from '../engine/annotation-stats';
import { historyFor, type UpdateVessel, type VesselAction } from '../engine/vessel-reducer';

interface UseAnnotationActionsParams {
  updateVessel: UpdateVessel;
  dispatch: Dispatch<VesselAction>;
  vesselState: VesselState;
  organizationId: string;
  vesselModelId: string;
  viewportRef: MutableRefObject<ThreeViewportHandle | null>;
  /** ui.inspectingAnnotationId — attachment handlers target the inspected annotation. */
  inspectingAnnotationId: number | null;
  nextAnnotationIdRef: MutableRefObject<number>;
}

/**
 * Annotation entity CRUD plus attachment/scan-image handlers and the stats
 * recompute effect. Bodies extracted verbatim from VesselModeler.tsx (D1). The
 * attachment handlers close over the inspected-annotation id, org/model ids and
 * the viewport ref, all threaded in explicitly.
 */
export function useAnnotationActions({
  updateVessel,
  dispatch,
  vesselState,
  organizationId,
  vesselModelId,
  viewportRef,
  inspectingAnnotationId,
  nextAnnotationIdRef,
}: UseAnnotationActionsParams) {
  // --- Annotation handlers ---
  const addAnnotation = useCallback(
    (annotation: AnnotationShapeConfig) => {
      updateVessel((prev) => ({ ...prev, annotations: [...prev.annotations, annotation] }), {
        label: 'Add annotation',
        at: Date.now(),
      });
    },
    [updateVessel]
  );

  const updateAnnotation = useCallback(
    (id: number, updates: Partial<AnnotationShapeConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          annotations: prev.annotations.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        }),
        historyFor('annotation', id, updates)
      );
    },
    [updateVessel]
  );

  const removeAnnotation = useCallback(
    async (id: number) => {
      // Clean up any Supabase Storage attachments before removing the annotation
      const ann = vesselState.annotations.find((a) => a.id === id);
      if (ann?.attachments?.length) {
        for (const att of ann.attachments) {
          await deleteAnnotationImage(att.storagePath).catch(() => {});
        }
      }
      updateVessel(
        (prev) => ({
          ...prev,
          annotations: prev.annotations.filter((a) => a.id !== id),
        }),
        { label: 'Delete annotation', at: Date.now() }
      );
      dispatch({ type: 'SELECT_ANNOTATION', id: -1 });
    },
    [updateVessel, vesselState, dispatch]
  );

  // --- Annotation attachment handlers ---
  const captureViewport = useCallback(async () => {
    const renderer = viewportRef.current?.getRenderer();
    const canvas = renderer?.domElement;
    if (!canvas || inspectingAnnotationId == null) return;

    // Force a render so the canvas has current content
    const scene = viewportRef.current?.getScene();
    const camera = viewportRef.current?.getCamera();
    if (scene && camera) renderer!.render(scene, camera);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;

    const { storagePath, id } = await uploadAnnotationImage(
      organizationId,
      vesselModelId,
      inspectingAnnotationId,
      blob,
      'viewport-capture'
    );
    const attachment = {
      id,
      type: 'viewport-capture' as const,
      storagePath,
      capturedAt: new Date().toISOString(),
    };
    const ann = vesselState.annotations.find((a) => a.id === inspectingAnnotationId);
    updateAnnotation(inspectingAnnotationId, {
      attachments: [...(ann?.attachments ?? []), attachment],
    });
  }, [inspectingAnnotationId, vesselState, organizationId, vesselModelId, updateAnnotation, viewportRef]);

  const uploadImage = useCallback(
    async (file: File) => {
      if (inspectingAnnotationId == null) return;
      const { storagePath, id } = await uploadAnnotationImage(
        organizationId,
        vesselModelId,
        inspectingAnnotationId,
        file,
        'upload'
      );
      const attachment = {
        id,
        type: 'upload' as const,
        storagePath,
        capturedAt: new Date().toISOString(),
      };
      const ann = vesselState.annotations.find((a) => a.id === inspectingAnnotationId);
      updateAnnotation(inspectingAnnotationId, {
        attachments: [...(ann?.attachments ?? []), attachment],
      });
    },
    [inspectingAnnotationId, vesselState, organizationId, vesselModelId, updateAnnotation]
  );

  const deleteAttachment = useCallback(
    async (attachmentId: string) => {
      if (inspectingAnnotationId == null) return;
      const ann = vesselState.annotations.find((a) => a.id === inspectingAnnotationId);
      const attachment = ann?.attachments?.find((a) => a.id === attachmentId);
      if (attachment) await deleteAnnotationImage(attachment.storagePath);
      updateAnnotation(inspectingAnnotationId, {
        attachments: (ann?.attachments ?? []).filter((a) => a.id !== attachmentId),
      });
    },
    [inspectingAnnotationId, vesselState, updateAnnotation]
  );

  /** Save companion B/D/A-scan data-URL images as scan-capture attachments */
  const saveScanImages = useCallback(
    async (images: { cscan?: string; bscan?: string; dscan?: string; ascan?: string }) => {
      if (inspectingAnnotationId == null) return;
      const ann = vesselState.annotations.find((a) => a.id === inspectingAnnotationId);
      if (!ann) return;

      // Remove previous scan-capture attachments (replace with new set)
      const oldScans = (ann.attachments ?? []).filter((a) => a.type === 'scan-capture');
      for (const old of oldScans) {
        await deleteAnnotationImage(old.storagePath).catch(() => {});
      }

      const keptAttachments = (ann.attachments ?? []).filter((a) => a.type !== 'scan-capture');
      const newAttachments = [...keptAttachments];

      for (const [scanType, dataUrl] of Object.entries(images) as [string, string | undefined][]) {
        if (!dataUrl) continue;
        // Convert data URL to Blob without fetch() to avoid CSP connect-src restrictions
        const [header, b64] = dataUrl.split(',');
        const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        const { storagePath, id } = await uploadAnnotationImage(
          organizationId,
          vesselModelId,
          inspectingAnnotationId,
          blob,
          'scan-capture'
        );
        newAttachments.push({
          id,
          type: 'scan-capture' as const,
          storagePath,
          capturedAt: new Date().toISOString(),
          scanType: scanType as 'cscan' | 'bscan' | 'dscan' | 'ascan',
        });
      }

      updateAnnotation(inspectingAnnotationId, { attachments: newAttachments });
    },
    [inspectingAnnotationId, vesselState, organizationId, vesselModelId, updateAnnotation]
  );

  /** Clear all scan-capture attachments from the current annotation */
  const clearScanImages = useCallback(async () => {
    if (inspectingAnnotationId == null) return;
    const ann = vesselState.annotations.find((a) => a.id === inspectingAnnotationId);
    if (!ann) return;

    const scanAttachments = (ann.attachments ?? []).filter((a) => a.type === 'scan-capture');
    for (const att of scanAttachments) {
      await deleteAnnotationImage(att.storagePath).catch(() => {});
    }

    updateAnnotation(inspectingAnnotationId, {
      attachments: (ann.attachments ?? []).filter((a) => a.type !== 'scan-capture'),
    });
  }, [inspectingAnnotationId, vesselState, updateAnnotation]);

  // --- Annotation stats recomputation ---
  const recomputeAnnotationStats = useCallback(() => {
    const updatedAnnotations = recomputeAllAnnotationStats(vesselState);
    const changed = updatedAnnotations.some((ann, i) => {
      const old = vesselState.annotations[i];
      return ann.thicknessStats !== old.thicknessStats || ann.severityLevel !== old.severityLevel;
    });
    if (changed) {
      updateVessel((prev) => ({ ...prev, annotations: updatedAnnotations }));
    }
  }, [vesselState, updateVessel]);

  // Recompute stats when annotation geometry, composite orientation, or thresholds change.
  // Serialize only geometry-affecting fields to avoid infinite loops (since recompute updates annotations).
  const annotationsJson = JSON.stringify(
    vesselState.annotations.map((a) => ({
      id: a.id,
      pos: a.pos,
      angle: a.angle,
      width: a.width,
      height: a.height,
      type: a.type,
    }))
  );
  const compositesJson = JSON.stringify(
    vesselState.scanComposites.map((c) => ({
      id: c.id,
      orientationConfirmed: c.orientationConfirmed,
      indexStartMm: c.indexStartMm,
      datumAngleDeg: c.datumAngleDeg,
      scanDirection: c.scanDirection,
      indexDirection: c.indexDirection,
    }))
  );
  const thresholdsJson = JSON.stringify(vesselState.thicknessThresholds);

  useEffect(() => {
    recomputeAnnotationStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationsJson, compositesJson, thresholdsJson]);

  const getNextAnnotationId = useCallback(() => {
    return nextAnnotationIdRef.current++;
  }, [nextAnnotationIdRef]);

  const toggleAnnotationVisible = useCallback(
    (id: number) => {
      updateVessel((prev) => ({
        ...prev,
        annotations: prev.annotations.map((a) =>
          a.id === id ? { ...a, visible: a.visible === false ? true : false } : a
        ),
      }));
    },
    [updateVessel]
  );

  const toggleAnnotationLocked = useCallback(
    (id: number) => {
      updateVessel((prev) => ({
        ...prev,
        annotations: prev.annotations.map((a) => (a.id === id ? { ...a, locked: !a.locked } : a)),
      }));
    },
    [updateVessel]
  );

  return {
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    captureViewport,
    uploadImage,
    deleteAttachment,
    saveScanImages,
    clearScanImages,
    recomputeAnnotationStats,
    getNextAnnotationId,
    toggleAnnotationVisible,
    toggleAnnotationLocked,
  };
}
