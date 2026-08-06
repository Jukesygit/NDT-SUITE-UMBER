import { useCallback, type RefObject } from 'react';
import type { VesselState } from '../types';
import type { ThreeViewportHandle } from '../ThreeViewport';
import {
  generateReport,
  downloadReport,
  type ReportConfig,
  type CompanionScanImageSet,
} from '../engine/report-generator';
import {
  captureVesselOverviews,
  captureAnnotationContext,
  captureAnnotationHeatmap,
} from '../engine/report-image-capture';

interface UseReportGenerationParams {
  vesselState: VesselState;
  viewportRef: RefObject<ThreeViewportHandle | null>;
  /** 2D flattened viewport handle — its rendered projection is captured for the report/save assets. */
  flattenedViewportRef: RefObject<{ exportImage: () => string | null } | null>;
}

/**
 * Report generation (T2-D / D4): the PDF report handler plus the shared asset
 * capture used by both the report and the cloud save flows. Bodies extracted
 * verbatim from VesselModeler.tsx.
 *
 * `captureReportAssets` was deliberately retained in the component through D2
 * (it is report-image-capture code) and threaded into useVesselPersistence; its
 * definition now lands here and the same function reference is still threaded
 * into persistence unchanged, so the save-to-project flows keep attaching
 * `reportAssets` exactly as before. Both callbacks keep their original
 * `[vesselState]` dependency array, so their identities churn as they did inline.
 */
export function useReportGeneration({
  vesselState,
  viewportRef,
  flattenedViewportRef,
}: UseReportGenerationParams) {
  /** Capture 3D + 2D images for PDF report generation */
  const captureReportAssets = useCallback(async () => {
    const assets: Record<string, unknown> = {};

    // 1. Capture 3D viewport overviews
    const viewport = viewportRef.current;
    if (viewport) {
      const renderer = viewport.getRenderer();
      const scene = viewport.getScene();
      const camera = viewport.getCamera();
      const controls = viewport.getControls();
      const sceneManager = viewport.getSceneManager();
      if (renderer && scene && camera && controls && sceneManager) {
        try {
          const overviews = await captureVesselOverviews(
            {
              renderer,
              scene,
              camera,
              controls,
              vesselState,
              vesselGroup: sceneManager.getVesselGroup() ?? undefined,
            },
            vesselState.cameraBookmarks
          );
          assets.overviewRenders = overviews;
        } catch (err) {
          console.warn('Failed to capture vessel overviews:', err);
        }
      }
    }

    // 2. Capture 2D flattened projection
    const flatRef = flattenedViewportRef.current;
    if (flatRef) {
      try {
        const flatImage = flatRef.exportImage();
        if (flatImage) assets.flattenedView = flatImage;
      } catch (err) {
        console.warn('Failed to capture flattened view:', err);
      }
    }

    // 3. Capture per-annotation heatmaps
    const annotationHeatmaps: Record<number, string> = {};
    for (const ann of vesselState.annotations) {
      if (!ann.includeInReport && ann.type !== 'scan') continue;
      const heatmap = captureAnnotationHeatmap(ann, vesselState);
      if (heatmap) annotationHeatmaps[ann.id] = heatmap;
    }
    if (Object.keys(annotationHeatmaps).length > 0) {
      assets.annotationHeatmaps = annotationHeatmaps;
    }

    // 4. Capture per-annotation 3D context images
    if (viewport) {
      const renderer = viewport.getRenderer();
      const scene = viewport.getScene();
      const camera = viewport.getCamera();
      const controls = viewport.getControls();
      const sceneManager = viewport.getSceneManager();
      if (renderer && scene && camera && controls && sceneManager) {
        const contextImages: Record<number, string> = {};
        for (const ann of vesselState.annotations) {
          if (!ann.includeInReport && ann.type !== 'scan') continue;
          try {
            const ctx = captureAnnotationContext(
              {
                renderer,
                scene,
                camera,
                controls,
                vesselState,
                vesselGroup: sceneManager.getVesselGroup() ?? undefined,
              },
              ann
            );
            contextImages[ann.id] = ctx;
          } catch (err) {
            console.warn(`Failed to capture context for annotation ${ann.id}:`, err);
          }
        }
        if (Object.keys(contextImages).length > 0) {
          assets.annotationContextImages = contextImages;
        }
      }
    }

    return assets;
  }, [vesselState]);

  // --- Report generation handler ---
  const handleGenerateReport = useCallback(async () => {
    const viewportHandle = viewportRef.current;
    if (!viewportHandle) return;

    const renderer = viewportHandle.getRenderer();
    const scene = viewportHandle.getScene();
    const camera = viewportHandle.getCamera();
    const controls = viewportHandle.getControls();
    if (!renderer || !scene || !camera || !controls) return;

    const vesselGroup = viewportHandle.getSceneManager()?.getVesselGroup() ?? undefined;
    const captureCtx = { renderer, scene, camera, controls, vesselState, vesselGroup };

    // 1. Capture vessel overview images (+ any camera bookmarks)
    const vesselOverviews = await captureVesselOverviews(captureCtx, vesselState.cameraBookmarks);

    // 2. Capture per-annotation context images and heatmaps
    const reportAnnotations = vesselState.annotations.filter(
      (a) => a.includeInReport && a.type === 'scan'
    );
    const annotationContextImages = new Map<number, string>();
    const heatmapImages = new Map<number, string>();
    const companionScanImages = new Map<number, CompanionScanImageSet>();

    for (const ann of reportAnnotations) {
      annotationContextImages.set(ann.id, captureAnnotationContext(captureCtx, ann));
      const heatmap = captureAnnotationHeatmap(ann, vesselState);
      if (heatmap) heatmapImages.set(ann.id, heatmap);
    }

    // 3. Build report config
    const config: ReportConfig = {
      annotationIds: reportAnnotations.map((a) => a.id),
      companionAvailable: false,
      vesselOverviews,
      annotationContextImages,
      companionScanImages,
      heatmapImages,
    };

    // 4. Generate and download
    const blob = await generateReport(vesselState, config);
    downloadReport(blob, vesselState);
  }, [vesselState]);

  return { captureReportAssets, handleGenerateReport };
}
