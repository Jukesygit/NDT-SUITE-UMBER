import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import type {
  VesselState,
  TextureConfig,
  AnnotationShapeConfig,
  CoverageRectConfig,
  RulerConfig,
  InspectionImageConfig,
} from '../types';
import type { ThreeViewportHandle } from '../ThreeViewport';
import type { VesselAction } from '../engine/vessel-reducer';
import type { AuthUser } from '../../../contexts/AuthContext';
import type { VesselModelRecord } from '../../../services/vessel-model-service';
import { loadTextureFromData, clearHeatmapCache } from '../engine/texture-manager';
import { clearDomeHeatmapCache } from '../engine/dome-scan-geometry';
import { serializeVesselState, deserializeVesselState } from '../engine/vessel-serialization';
import { exportVesselGLB } from '../engine/gltf-export';
import { getScanComposite } from '../../../services/scan-composite-service';
import { getVesselModelByProjectVessel } from '../../../services/vessel-model-service';

interface UseVesselPersistenceParams {
  vesselState: VesselState;
  dispatch: Dispatch<VesselAction>;
  /** Auth user — save-to-project requires an authenticated user + organizationId. */
  user: AuthUser | null;
  /** URL-param vessel id; combined with the picker selection into effectiveProjectVesselId. */
  projectVesselId: string | null;
  /** Linked cloud model (from the vessel-model queries) that the bootstrap effect auto-loads. */
  linkedModel: VesselModelRecord | null | undefined;
  /** Clamp helper kept in the component (also used by the drawing-apply path). */
  validateVesselState: (state: VesselState) => VesselState;
  /**
   * Report-image capture — report-coupled and retained in the component for D4's
   * useReportGeneration; threaded in so the save-to-project flows keep attaching
   * reportAssets exactly as before.
   */
  captureReportAssets: () => Promise<Record<string, unknown>>;
  viewportRef: RefObject<ThreeViewportHandle | null>;
  /** Imperative THREE.Texture store, keyed by texture id (lives outside the reducer). */
  textureObjectsRef: MutableRefObject<Record<number, THREE.Texture>>;
  setTextureObjectsVersion: Dispatch<SetStateAction<number>>;
  nextTextureIdRef: MutableRefObject<number>;
  nextAnnotationIdRef: MutableRefObject<number>;
  nextCoverageRectIdRef: MutableRefObject<number>;
  nextRulerIdRef: MutableRefObject<number>;
  nextInspectionImageIdRef: MutableRefObject<number>;
  saveModelMutation: {
    mutateAsync: (vars: {
      name: string;
      organizationId: string;
      userId: string;
      config: Record<string, unknown>;
      projectVesselId: string;
    }) => Promise<string>;
  };
  updateModelMutation: {
    mutateAsync: (vars: {
      id: string;
      config: Record<string, unknown>;
      name?: string;
    }) => Promise<unknown>;
  };
}

/**
 * Vessel persistence — local JSON export/import, cloud save/update/save-as-new,
 * the project picker state, GLB export, and the linked-model bootstrap. Bodies
 * extracted verbatim from VesselModeler.tsx (T2-D / D2). The serialize/deserialize
 * call sites move here and stay the only ones (engine/vessel-serialization.ts is
 * the sole serializer). The 4 cloud-rehydration dispatches keep their
 * `history: { skip: true, at: 0 }` tag so re-fetched scan/dome data is never an
 * undo step; `SET_VESSEL` on load still clears history via the reducer.
 *
 * `vesselModelIdRef` and `linkedModelLoadedRef` are created here; the former is
 * returned so the component can still derive `vesselModelId` and gate the toolbar
 * Save button. The monotonic id-counter refs and the imperative THREE.Texture
 * store are threaded in so the load path keeps writing the same refs the entity
 * hooks read.
 */
export function useVesselPersistence({
  vesselState,
  dispatch,
  user,
  projectVesselId,
  linkedModel,
  validateVesselState,
  captureReportAssets,
  viewportRef,
  textureObjectsRef,
  setTextureObjectsVersion,
  nextTextureIdRef,
  nextAnnotationIdRef,
  nextCoverageRectIdRef,
  nextRulerIdRef,
  nextInspectionImageIdRef,
  saveModelMutation,
  updateModelMutation,
}: UseVesselPersistenceParams) {
  const vesselModelIdRef = useRef<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Project/vessel picker (used for both save and load)
  const [pickerMode, setPickerMode] = useState<'save' | 'load' | null>(null);
  const [pickerProjectId, setPickerProjectId] = useState<string | null>(null);
  const [pickerVesselId, setPickerVesselId] = useState<string | null>(null);
  const [saveModelType, setSaveModelType] = useState<string>('blank');
  const [saveModelTypeCustom, setSaveModelTypeCustom] = useState<string>('');

  // Effective project vessel ID: from URL params or from picker selection
  const effectiveProjectVesselId = projectVesselId ?? pickerVesselId;

  // Shared helper: deserialize a model config into modeler state
  const applyModelConfig = useCallback(async (config: Record<string, unknown>, modelId: string) => {
    const projectData = config as any;
    if (!projectData.vessel || !projectData.version) return;

    // Dispose existing textures
    for (const key of Object.keys(textureObjectsRef.current)) {
      textureObjectsRef.current[Number(key)].dispose();
    }
    textureObjectsRef.current = {};

    // Reconstruct Three.js textures
    const renderer = viewportRef.current?.getRenderer();
    const loadedTextures: TextureConfig[] = [];
    const savedTextures = projectData.textures || [];

    if (renderer && savedTextures.length > 0) {
      for (const texData of savedTextures) {
        if (!texData.imageData) continue;
        try {
          const result = await loadTextureFromData(texData.imageData, renderer);
          textureObjectsRef.current[Number(texData.id)] = result.texture;
          loadedTextures.push({
            id: texData.id,
            name: texData.name || 'Untitled',
            imageData: texData.imageData,
            pos: texData.pos ?? 0,
            angle: texData.angle ?? 90,
            scaleX: texData.scaleX ?? 1.0,
            scaleY: texData.scaleY ?? 1.0,
            rotation: texData.rotation || 0,
            flipH: texData.flipH || false,
            flipV: texData.flipV || false,
            aspectRatio: result.aspectRatio,
            visible: texData.visible,
          });
        } catch {
          // Skip textures that fail to load
        }
      }
    }

    // Single field-spec deserializer (engine/vessel-serialization.ts). Textures
    // are reconstructed above (async/renderer-bound) and passed in; everything
    // else — including the cloud-only labelsTidied / annotationTable* restore and
    // the bare-fallback coordinateOrigin — is reproduced by the 'cloud' path.
    const newState = deserializeVesselState(projectData, {
      path: 'cloud',
      textures: loadedTextures,
    });

    clearHeatmapCache();

    const maxId = loadedTextures.reduce(
      (max: number, t: TextureConfig) => Math.max(max, Number(t.id) || 0),
      0
    );
    nextTextureIdRef.current = maxId + 1;
    const maxAnnId = newState.annotations.reduce(
      (max: number, a: AnnotationShapeConfig) => Math.max(max, a.id || 0),
      0
    );
    nextAnnotationIdRef.current = maxAnnId + 1;
    const maxCovId = newState.coverageRects.reduce(
      (max: number, r: CoverageRectConfig) => Math.max(max, r.id || 0),
      0
    );
    nextCoverageRectIdRef.current = maxCovId + 1;
    const maxRulerId = newState.rulers.reduce(
      (max: number, r: RulerConfig) => Math.max(max, r.id || 0),
      0
    );
    nextRulerIdRef.current = maxRulerId + 1;
    const maxImgId = newState.inspectionImages.reduce(
      (max: number, i: InspectionImageConfig) => Math.max(max, i.id || 0),
      0
    );
    nextInspectionImageIdRef.current = maxImgId + 1;

    vesselModelIdRef.current = modelId;
    const validatedState = validateVesselState(newState);
    dispatch({ type: 'SET_VESSEL', vessel: validatedState });
    setTextureObjectsVersion((v) => v + 1);

    // Re-fetch thickness data from cloud for composites saved without inline data
    const compositesNeedingData = validatedState.scanComposites.filter(
      (sc) => sc.cloudId && (!sc.data || sc.data.length === 0)
    );
    for (const sc of compositesNeedingData) {
      getScanComposite(sc.cloudId!)
        .then((cloud) => {
          clearHeatmapCache(sc.id);
          dispatch({
            type: 'UPDATE_VESSEL_FN',
            // System rehydration after load, not a user edit — never an undo step.
            history: { skip: true, at: 0 },
            updater: (prev) => ({
              ...prev,
              scanComposites: prev.scanComposites.map((existing) =>
                existing.id === sc.id
                  ? {
                      ...existing,
                      data: cloud.thickness_data,
                      xAxis: cloud.x_axis,
                      yAxis: cloud.y_axis,
                      stats: cloud.stats || existing.stats,
                    }
                  : existing
              ),
            }),
          });
        })
        .catch((err) => {
          console.error(`Failed to fetch scan composite ${sc.cloudId}:`, err);
        });
    }

    // Re-fetch dome scan thickness data from cloud. Dome scans are stored in the
    // same scan_composites table (by cloudId) and have their data stripped on save,
    // exactly like flat composites — so they need the same re-hydration on load.
    const domeCompositesNeedingData = validatedState.domeScanComposites.filter(
      (ds) => ds.cloudId && (!ds.data || ds.data.length === 0)
    );
    for (const ds of domeCompositesNeedingData) {
      getScanComposite(ds.cloudId!)
        .then((cloud) => {
          clearDomeHeatmapCache(ds.id);
          dispatch({
            type: 'UPDATE_VESSEL_FN',
            // System rehydration after load, not a user edit — never an undo step.
            history: { skip: true, at: 0 },
            updater: (prev) => ({
              ...prev,
              domeScanComposites: prev.domeScanComposites.map((existing) =>
                existing.id === ds.id
                  ? {
                      ...existing,
                      data: cloud.thickness_data,
                      xAxis: cloud.x_axis,
                      yAxis: cloud.y_axis,
                      stats: cloud.stats || existing.stats,
                    }
                  : existing
              ),
            }),
          });
        })
        .catch((err) => {
          console.error(`Failed to fetch dome scan composite ${ds.cloudId}:`, err);
        });
    }

    // Restore modelType from saved config
    if (projectData.modelType) {
      const knownTypes = ['blank', 'coverage', 'scan_overlayed', 'fully_annotated'];
      if (knownTypes.includes(projectData.modelType)) {
        setSaveModelType(projectData.modelType);
        setSaveModelTypeCustom('');
      } else {
        setSaveModelType('other');
        setSaveModelTypeCustom(projectData.modelType);
      }
    }
  }, []);

  // Auto-load linked model from database when opened from project context
  const linkedModelLoadedRef = useRef(false);
  useEffect(() => {
    if (!linkedModel?.config || linkedModelLoadedRef.current) return;
    linkedModelLoadedRef.current = true;
    applyModelConfig(linkedModel.config, linkedModel.id);
  }, [linkedModel, applyModelConfig]);

  // Load a model from a project vessel (via picker)
  const loadFromProject = useCallback(
    async (vesselId: string) => {
      const model = await getVesselModelByProjectVessel(vesselId);
      if (!model) {
        alert('No model found for this vessel.');
        return;
      }
      await applyModelConfig(model.config, model.id);
      setPickerMode(null);
      setPickerProjectId(null);
      setPickerVesselId(null);
    },
    [applyModelConfig]
  );

  // --- Save/Load ---
  const saveProject = useCallback(() => {
    // Single field-spec serializer (engine/vessel-serialization.ts). The local
    // path now includes domeScanComposites (previously omitted — dome overlays
    // were lost on local save/reload) and keeps the local-only coordinateOrigin
    // / originSourceScanId persistence.
    const projectData = serializeVesselState(vesselState, { path: 'local' });

    const defaultName = vesselState.vesselName
      ? `${vesselState.vesselName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}`
      : `vessel_project_${new Date().toISOString().slice(0, 10)}`;
    const filename = prompt('Enter filename:', defaultName);
    if (!filename) return;

    // Replace NaN/Infinity with null to avoid JSON.stringify issues
    const json = JSON.stringify(
      projectData,
      (_key, value) => (typeof value === 'number' && !Number.isFinite(value) ? null : value),
      2
    );
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    // Delay cleanup so the download can start
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }, [vesselState]);

  // Build the serialized config from current vessel state
  const buildSaveConfig = useCallback(() => {
    const effectiveModelType =
      saveModelType === 'other' ? saveModelTypeCustom || 'other' : saveModelType;
    // Single field-spec serializer (engine/vessel-serialization.ts). The cloud
    // path carries modelType + derived dome sectionType and omits the local-only
    // coordinateOrigin / originSourceScanId, matching the prior hand-written list.
    const config = serializeVesselState(vesselState, {
      path: 'cloud',
      modelType: effectiveModelType,
    });

    // Sanitize NaN/Infinity
    return JSON.parse(
      JSON.stringify(config, (_key, value) =>
        typeof value === 'number' && !Number.isFinite(value) ? null : value
      )
    );
  }, [vesselState, saveModelType, saveModelTypeCustom]);

  // Save (update existing model)
  const saveToProject = useCallback(async () => {
    if (!effectiveProjectVesselId) {
      setPickerMode('save');
      return;
    }
    if (!user) return;
    if (!vesselModelIdRef.current) {
      // No existing model — fall through to save-as-new flow
      setPickerMode('save');
      return;
    }

    setSaveStatus('saving');
    try {
      const sanitized = buildSaveConfig();
      // Capture report images
      const reportAssets = await captureReportAssets();
      sanitized.reportAssets = reportAssets;

      const modelName = vesselState.vesselName || 'Untitled Vessel';

      await updateModelMutation.mutateAsync({
        id: vesselModelIdRef.current,
        config: sanitized,
        name: modelName,
      });

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      console.error('Save to project failed:', err);
      alert(`Save failed: ${err?.message || 'Unknown error'}`);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [
    effectiveProjectVesselId,
    user,
    vesselState.vesselName,
    buildSaveConfig,
    captureReportAssets,
    updateModelMutation,
    saveModelType,
    saveModelTypeCustom,
  ]);

  // Save as new model (always creates a new record)
  const saveAsNewToProject = useCallback(async () => {
    const targetVesselId = pickerVesselId || effectiveProjectVesselId;
    if (!targetVesselId) {
      setPickerMode('save');
      return;
    }
    if (!user) {
      alert('Not authenticated');
      return;
    }
    if (!user.organizationId) {
      alert('No organization set on your profile');
      return;
    }

    setSaveStatus('saving');
    try {
      const sanitized = buildSaveConfig();
      // Capture report images
      const reportAssets = await captureReportAssets();
      sanitized.reportAssets = reportAssets;

      const modelName = vesselState.vesselName || 'Untitled Vessel';

      const newId = await saveModelMutation.mutateAsync({
        name: modelName,
        organizationId: user.organizationId,
        userId: user.id,
        config: sanitized,
        projectVesselId: targetVesselId,
      });
      vesselModelIdRef.current = newId;

      setSaveStatus('saved');
      setPickerMode(null);
      setPickerProjectId(null);
      setPickerVesselId(null);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      console.error('Save as new failed:', err);
      alert(`Save failed: ${err?.message || JSON.stringify(err)}`);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [
    pickerVesselId,
    effectiveProjectVesselId,
    user,
    vesselState.vesselName,
    buildSaveConfig,
    captureReportAssets,
    saveModelMutation,
  ]);

  const exportGLB = useCallback(async () => {
    const hasProjectInfo =
      vesselState.vesselName || vesselState.location || vesselState.inspectionDate;
    if (!hasProjectInfo) {
      const proceed = window.confirm(
        'No project info has been added. The exported file will use a generic name.\n\n' +
          'You can add a vessel name, location, and inspection date in the Project Info section of the sidebar.\n\n' +
          'Export anyway?'
      );
      if (!proceed) return;
    }

    const sceneManager = viewportRef.current?.getSceneManager();
    const vesselGroup = sceneManager?.getVesselGroup();
    if (!vesselGroup) return;

    try {
      await exportVesselGLB(vesselGroup, vesselState);
    } catch (err) {
      console.error('GLB export failed:', err);
    }
  }, [vesselState]);

  const loadProject = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const projectData = JSON.parse(e.target?.result as string);
        if (!projectData.vessel || !projectData.version) {
          throw new Error('Invalid project file format');
        }

        // Dispose existing textures before loading new ones
        for (const key of Object.keys(textureObjectsRef.current)) {
          textureObjectsRef.current[Number(key)].dispose();
        }
        textureObjectsRef.current = {};

        // Reconstruct Three.js textures from saved base64 imageData
        const renderer = viewportRef.current?.getRenderer();
        const loadedTextures: TextureConfig[] = [];
        const savedTextures = projectData.textures || [];

        if (renderer && savedTextures.length > 0) {
          for (const texData of savedTextures) {
            if (!texData.imageData) continue;
            try {
              const result = await loadTextureFromData(texData.imageData, renderer);
              textureObjectsRef.current[Number(texData.id)] = result.texture;
              loadedTextures.push({
                id: texData.id,
                name: texData.name || 'Untitled',
                imageData: texData.imageData,
                pos: texData.pos ?? 0,
                angle: texData.angle ?? 90,
                scaleX: texData.scaleX ?? texData.scale ?? 1.0,
                scaleY: texData.scaleY ?? texData.scale ?? 1.0,
                rotation: texData.rotation || 0,
                flipH: texData.flipH || false,
                flipV: texData.flipV || false,
                aspectRatio: result.aspectRatio,
                visible: texData.visible,
              });
            } catch {
              // Skip textures that fail to load
            }
          }
        }

        // Single field-spec deserializer (engine/vessel-serialization.ts). The
        // 'local' path restores useGlobalOrigin + the seeded coordinateOrigin and
        // (matching the historical local mapper) does NOT restore labelsTidied /
        // annotationTable*. domeScanComposites hydrate via normalizeDomeScanComposite.
        const newState = deserializeVesselState(projectData, {
          path: 'local',
          textures: loadedTextures,
        });

        // Clear heatmap cache to avoid stale scan composite textures
        clearHeatmapCache();

        // Update next texture ID to avoid conflicts
        const maxId = loadedTextures.reduce(
          (max: number, t: TextureConfig) => Math.max(max, Number(t.id) || 0),
          0
        );
        nextTextureIdRef.current = maxId + 1;

        // Update next annotation ID to avoid conflicts
        const maxAnnId = newState.annotations.reduce(
          (max: number, a: AnnotationShapeConfig) => Math.max(max, a.id || 0),
          0
        );
        nextAnnotationIdRef.current = maxAnnId + 1;

        // Update next coverage rect ID to avoid conflicts
        const maxCovId = newState.coverageRects.reduce(
          (max: number, r: CoverageRectConfig) => Math.max(max, r.id || 0),
          0
        );
        nextCoverageRectIdRef.current = maxCovId + 1;

        // Update next ruler ID to avoid conflicts
        const maxRulerId = newState.rulers.reduce(
          (max: number, r: RulerConfig) => Math.max(max, r.id || 0),
          0
        );
        nextRulerIdRef.current = maxRulerId + 1;

        // Update next inspection image ID to avoid conflicts
        const maxImgId = newState.inspectionImages.reduce(
          (max: number, i: InspectionImageConfig) => Math.max(max, i.id || 0),
          0
        );
        nextInspectionImageIdRef.current = maxImgId + 1;

        const validatedState = validateVesselState(newState);
        dispatch({ type: 'SET_VESSEL', vessel: validatedState });
        setTextureObjectsVersion((v) => v + 1);
        dispatch({ type: 'DESELECT_ALL' });

        // Re-fetch thickness data from cloud for composites saved without inline data
        const compositesNeedingData = validatedState.scanComposites.filter(
          (sc) => sc.cloudId && (!sc.data || sc.data.length === 0)
        );
        for (const sc of compositesNeedingData) {
          getScanComposite(sc.cloudId!)
            .then((cloud) => {
              clearHeatmapCache(sc.id);
              dispatch({
                type: 'UPDATE_VESSEL_FN',
                // System rehydration after load, not a user edit — never an undo step.
                history: { skip: true, at: 0 },
                updater: (prev) => ({
                  ...prev,
                  scanComposites: prev.scanComposites.map((existing) =>
                    existing.id === sc.id
                      ? {
                          ...existing,
                          data: cloud.thickness_data,
                          xAxis: cloud.x_axis,
                          yAxis: cloud.y_axis,
                          stats: cloud.stats || existing.stats,
                        }
                      : existing
                  ),
                }),
              });
            })
            .catch((err) => {
              console.error(`Failed to fetch scan composite ${sc.cloudId}:`, err);
            });
        }

        // Re-fetch dome scan thickness data from cloud (same scan_composites
        // table by cloudId; data stripped on save like flat composites).
        const domeCompositesNeedingData = validatedState.domeScanComposites.filter(
          (ds) => ds.cloudId && (!ds.data || ds.data.length === 0)
        );
        for (const ds of domeCompositesNeedingData) {
          getScanComposite(ds.cloudId!)
            .then((cloud) => {
              clearDomeHeatmapCache(ds.id);
              dispatch({
                type: 'UPDATE_VESSEL_FN',
                // System rehydration after load, not a user edit — never an undo step.
                history: { skip: true, at: 0 },
                updater: (prev) => ({
                  ...prev,
                  domeScanComposites: prev.domeScanComposites.map((existing) =>
                    existing.id === ds.id
                      ? {
                          ...existing,
                          data: cloud.thickness_data,
                          xAxis: cloud.x_axis,
                          yAxis: cloud.y_axis,
                          stats: cloud.stats || existing.stats,
                        }
                      : existing
                  ),
                }),
              });
            })
            .catch((err) => {
              console.error(`Failed to fetch dome scan composite ${ds.cloudId}:`, err);
            });
        }
      } catch (error: any) {
        alert('Error loading project: ' + error.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, []);

  return {
    // Picker + save state (and their setters consumed by the toolbar/picker JSX)
    saveStatus,
    pickerMode,
    setPickerMode,
    pickerProjectId,
    setPickerProjectId,
    pickerVesselId,
    setPickerVesselId,
    saveModelType,
    setSaveModelType,
    saveModelTypeCustom,
    setSaveModelTypeCustom,
    // Derived + ref exposed for vesselModelId derivation and the toolbar Save gate
    effectiveProjectVesselId,
    vesselModelIdRef,
    // Callbacks
    saveProject,
    buildSaveConfig,
    saveToProject,
    saveAsNewToProject,
    exportGLB,
    loadProject,
    loadFromProject,
    applyModelConfig,
  };
}
