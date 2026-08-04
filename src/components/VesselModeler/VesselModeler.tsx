import {
  useState,
  useReducer,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  lazy,
  Suspense,
  type ChangeEvent,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Lock,
  Unlock,
  Save,
  Upload,
  RotateCcw,
  PanelLeftClose,
  PanelLeft,
  FileUp,
  Camera,
  AlertTriangle,
  MousePointer,
  PanelBottomClose,
  Box,
  ChevronDown,
  Settings2,
  FolderOpen,
  AlignVerticalDistributeCenter,
  Undo2,
  Redo2,
} from 'lucide-react';
import ThreeViewport from './ThreeViewport';
import ErrorBoundary from '../ErrorBoundary';
import type { ThreeViewportHandle } from './ThreeViewport';
import SidebarPanel, { type ModelMode } from './SidebarPanel';
import StatusBar from './StatusBar';
import {
  type VesselState,
  type NozzleConfig,
  type TextureConfig,
  type AnnotationShapeConfig,
  type CoverageRectConfig,
  type RulerConfig,
  type InspectionImageConfig,
  type MeasurementConfig,
  type VesselCallbacks,
  type DomeScanHoverInfo,
  type ThicknessThresholds,
  type WallLossGroupConfig,
  type CoverageTargets,
  type Pipeline,
  type PipeSegmentType,
  PIPE_SIZES,
} from './types';
import type { ExtractionResult } from './engine/drawing-parser';
import { loadTextureFromData, clearHeatmapCache } from './engine/texture-manager';
import { clearDomeHeatmapCache } from './engine/dome-scan-geometry';
import { serializeVesselState, deserializeVesselState } from './engine/vessel-serialization';
import {
  vesselReducer,
  INITIAL_STATE,
  historyFor,
  type HistoryControl,
} from './engine/vessel-reducer';
import { useNozzleActions } from './hooks/useNozzleActions';
import { useAppendageActions } from './hooks/useAppendageActions';
import { usePipingActions } from './hooks/usePipingActions';
import { useAttachableActions } from './hooks/useAttachableActions';
import { useOverlayActions } from './hooks/useOverlayActions';
import { useAnnotationActions } from './hooks/useAnnotationActions';
import { useScanActions } from './hooks/useScanActions';
import { remapNozzleRefs } from './engine/nozzle-ref-remap';
import { nextNozzleId, backfillNozzleIds } from './engine/nozzle-id';
import { placeExtractedNozzle } from './engine/head-nozzle-placement';
import { useTextureRehydration } from './useTextureRehydration';
import { exportVesselGLB } from './engine/gltf-export';
import {
  computeInspectionCameraTarget,
  animateCamera,
  cancelCameraAnimation,
} from './engine/camera-animation';
import { useScanCompositeList } from '../../hooks/queries/useScanComposites';
import { getScanComposite } from '../../services/scan-composite-service';
import { useLinkScanCompositeToProject } from '../../hooks/mutations/useScanCompositeMutations';
import { getAnnotationImageUrl } from '../../services/annotation-attachment-service';
import { useAuth } from '../../contexts/AuthContext';
import { useVesselModel, useVesselModelByProjectVessel } from '../../hooks/queries/useVesselModels';
import {
  useSaveVesselModel,
  useUpdateVesselModel,
} from '../../hooks/mutations/useVesselModelMutations';
import {
  useProjectList,
  useProjectVessels,
  useProjectImages,
} from '../../hooks/queries/useInspectionProjects';
import { getVesselModelByProjectVessel } from '../../services/vessel-model-service';
import './vessel-modeler.css';
import * as THREE from 'three';

import StatsDropdown from './StatsDropdown';
import UnifiedStatsPanel from './UnifiedStatsPanel';
import SnapControl from './SnapControl';
import InspectionPanel from './sidebar/InspectionPanel';
import StatLeaderOverlay from './StatLeaderOverlay';
import { PipePartPopup } from './sidebar/PipePartPopup';

import {
  generateReport,
  downloadReport,
  type ReportConfig,
  type CompanionScanImageSet,
} from './engine/report-generator';
import {
  captureVesselOverviews,
  captureAnnotationContext,
  captureAnnotationHeatmap,
} from './engine/report-image-capture';
import { downloadScreenshot } from './engine/screenshot-renderer';
import { captureViewportScreenshot } from './engine/viewport-screenshot';

const DrawingImportModal = lazy(() => import('./DrawingImportModal'));
const InspectionImageViewer = lazy(() => import('./InspectionImageViewer'));
const FlattenedViewport = lazy(() => import('./FlattenedView/FlattenedViewport'));

/** Clamp vessel dimensions and nozzle positions to safe ranges to prevent division-by-zero and NaN geometry. */
function validateVesselState(state: VesselState): VesselState {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const id = clamp(state.id, 100, 20000);
  const length = clamp(state.length, 100, 50000);
  const headRatio = clamp(state.headRatio, 1.5, 4.0);
  const HEAD_DEPTH = id / (2 * headRatio);

  return {
    ...state,
    id,
    length,
    headRatio,
    nozzles: state.nozzles.map((n) => ({
      ...n,
      pos: clamp(n.pos, -HEAD_DEPTH, length + HEAD_DEPTH),
      angle: ((n.angle % 360) + 360) % 360,
      proj: clamp(n.proj, 0, 50000),
      size: clamp(n.size, 10, 3000),
    })),
    saddles: state.saddles.map((s) => ({
      ...s,
      pos: clamp(s.pos, 0, length),
    })),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VesselModeler() {
  const [state, dispatch] = useReducer(vesselReducer, INITIAL_STATE);
  const { vessel: vesselState, selection, locks, drawMode: drawModeState, previews, ui } = state;

  // Project context from URL params
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const projectVesselId = searchParams.get('vessel');
  const modelIdParam = searchParams.get('model');

  // Auth context for attachment uploads
  const { user } = useAuth();
  const organizationId = user?.organizationId ?? 'local';
  const vesselModelIdRef = useRef<string | null>(null);
  const vesselModelId = vesselModelIdRef.current ?? `local-${crypto.randomUUID()}`;

  // Fetch specific model by ID, or fall back to latest model for the vessel
  const { data: specificModel, isLoading: specificModelLoading } = useVesselModel(
    modelIdParam ?? undefined
  );
  const { data: latestModel, isLoading: latestModelLoading } = useVesselModelByProjectVessel(
    modelIdParam ? null : projectVesselId
  );
  const linkedModel = specificModel ?? latestModel;
  const linkedModelLoading = specificModelLoading || latestModelLoading;

  // Save-to-project mutations
  const saveModelMutation = useSaveVesselModel();
  const updateModelMutation = useUpdateVesselModel();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Project/vessel picker (used for both save and load)
  const [pickerMode, setPickerMode] = useState<'save' | 'load' | null>(null);
  const [pickerProjectId, setPickerProjectId] = useState<string | null>(null);
  const [pickerVesselId, setPickerVesselId] = useState<string | null>(null);
  const [saveModelType, setSaveModelType] = useState<string>('blank');
  const [saveModelTypeCustom, setSaveModelTypeCustom] = useState<string>('');
  const { data: projectList } = useProjectList();
  const { data: pickerVessels } = useProjectVessels(pickerProjectId ?? undefined);

  // Effective project vessel ID: from URL params or from picker selection
  const effectiveProjectVesselId = projectVesselId ?? pickerVesselId;

  // Project image pool (images uploaded via inspection detail page)
  const { data: projectImages } = useProjectImages(effectiveProjectVesselId ?? undefined);

  // Cloud composites query
  const {
    data: cloudComposites,
    error: cloudCompositesError,
    isLoading: cloudCompositesLoading,
  } = useScanCompositeList();
  const linkCompositeToProject = useLinkScanCompositeToProject();
  if (cloudCompositesError)
    console.error('Failed to fetch cloud composites:', cloudCompositesError);

  // Three.js texture objects (imperative, not React state)
  const textureObjectsRef = useRef<Record<number, THREE.Texture>>({});
  const [, setTextureObjectsVersion] = useState(0);
  const bumpTextureObjectsVersion = useCallback(
    () => setTextureObjectsVersion((v) => v + 1),
    []
  );
  const nextTextureIdRef = useRef(1);

  // ID counter refs
  const nextAnnotationIdRef = useRef(1);
  const nextCoverageRectIdRef = useRef(1);
  const nextRulerIdRef = useRef(1);
  const nextInspectionImageIdRef = useRef(1);

  // Viewport refs
  const viewportRef = useRef<ThreeViewportHandle>(null);
  const flattenedViewportRef = useRef<{ exportImage: () => string | null }>(null);
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const cursorTooltipRef = useRef<HTMLDivElement>(null);

  // Rebuild THREE.Texture objects for texture configs restored by undo/redo
  // (the load path builds them up-front; undo restores only the config).
  useTextureRehydration({
    textures: vesselState.textures,
    viewportRef,
    textureObjectsRef,
    bumpVersion: bumpTextureObjectsVersion,
  });

  // Toolbar popout menus
  const [locksMenuOpen, setLocksMenuOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const locksMenuRef = useRef<HTMLDivElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Model mode: 'vessel' (default) or 'pipe' (free-standing pipes only)
  const [modelMode, setModelMode] = useState<ModelMode>('vessel');

  // Pipe part popup state (shown when clicking a connection point)
  const [pipePartPopup, setPipePartPopup] = useState<{
    pipelineId: string;
    x: number;
    y: number;
  } | null>(null);

  // Inspection panel: which stat row is hovered (highlights min/max point on vessel)
  const [visibleStatLines, setVisibleStatLines] = useState<{ min: boolean; max: boolean }>({
    min: false,
    max: false,
  });

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

  // Close popout menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (locksMenuRef.current && !locksMenuRef.current.contains(e.target as Node)) {
        setLocksMenuOpen(false);
      }
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleStatLine = useCallback((stat: 'min' | 'max') => {
    setVisibleStatLines((prev) => ({ ...prev, [stat]: !prev[stat] }));
  }, []);

  // --- Helper: dispatch vessel update via functional updater ---
  // Domain wrappers pass a derived history key (see historyFor) so continuous
  // edits coalesce; opaque callers omit it and get a discrete undo entry.
  const updateVessel = useCallback(
    (updater: (prev: VesselState) => VesselState, history?: HistoryControl) => {
      dispatch({ type: 'UPDATE_VESSEL_FN', updater, history });
    },
    []
  );

  // --- Model mode handler ---
  const handleSetModelMode = useCallback(
    (mode: ModelMode) => {
      const shape = mode === 'pipe' ? 'pipe' : 'vessel';
      setModelMode(mode);
      // Redundant clicks on the already-active mode must not dispatch — they
      // would record a spurious undo entry for a no-op vessel change.
      if (vesselState.hasModel && (vesselState.vesselShape ?? 'vessel') === shape) return;
      updateVessel((prev) => ({ ...prev, hasModel: true, vesselShape: shape }));
    },
    [updateVessel, vesselState.hasModel, vesselState.vesselShape]
  );

  // Keep the transient mode toggle in lockstep with the document state so
  // undo/redo across a mode switch (or a project load) cannot desync them.
  useEffect(() => {
    if (!vesselState.hasModel) return;
    const shapeMode: ModelMode = vesselState.vesselShape === 'pipe' ? 'pipe' : 'vessel';
    setModelMode((m) => (m === shapeMode ? m : shapeMode));
  }, [vesselState.hasModel, vesselState.vesselShape]);

  // --- Vessel dimension handlers ---
  const updateDimensions = useCallback(
    (updates: Partial<VesselState>) => {
      updateVessel(
        (prev) => ({ ...prev, ...updates, hasModel: true }),
        historyFor('dimensions', '', updates)
      );
    },
    [updateVessel]
  );

  // --- Entity CRUD action hooks (T2-D / D1) ---
  // Each hook owns the verbatim per-entity callbacks that previously lived inline
  // here; they share `updateVessel`/`dispatch` and the id-counter / texture refs,
  // threaded in explicitly (no context). Callback identities are preserved.
  const { addNozzle, updateNozzle, removeNozzle } = useNozzleActions({ updateVessel, dispatch });

  const { addAppendage, updateAppendage, removeAppendage } = useAppendageActions({
    updateVessel,
    dispatch,
  });

  const {
    createDefaultSegment,
    addPipeline,
    addFreePipeline,
    updateFreePipelineOrigin,
    addSegment,
    updateSegment,
    removeSegment,
    removePipeline,
    selectPipeSegment,
  } = usePipingActions({ updateVessel, dispatch, nozzles: vesselState.nozzles });

  const {
    addSaddle,
    updateSaddle,
    updateAllSaddleHeights,
    updateAllSaddleDepths,
    updateAllSaddleWearPlate,
    removeSaddle,
    addLug,
    updateLug,
    removeLug,
    addWeld,
    updateWeld,
    removeWeld,
  } = useAttachableActions({ updateVessel, dispatch });

  const {
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
  } = useOverlayActions({
    updateVessel,
    dispatch,
    textureObjectsRef,
    setTextureObjectsVersion,
    nextTextureIdRef,
    nextCoverageRectIdRef,
    nextRulerIdRef,
    nextInspectionImageIdRef,
    viewingInspectionImageId: ui.viewingInspectionImageId,
  });

  const {
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    captureViewport,
    uploadImage,
    deleteAttachment,
    saveScanImages,
    clearScanImages,
    getNextAnnotationId,
    toggleAnnotationVisible,
    toggleAnnotationLocked,
  } = useAnnotationActions({
    updateVessel,
    dispatch,
    vesselState,
    organizationId,
    vesselModelId,
    viewportRef,
    inspectingAnnotationId: ui.inspectingAnnotationId,
    nextAnnotationIdRef,
  });

  const {
    handleImportComposite,
    handleRemoveScanComposite,
    handleUpdateScanComposite,
    handleSelectDomeScan,
    handleUpdateDomeScan,
    handleRemoveDomeScan,
    handleImportDomeComposite,
  } = useScanActions({
    updateVessel,
    dispatch,
    scanCompositeId: selection.scanCompositeId,
    domeScanId: selection.domeScanId,
    effectiveProjectVesselId,
    linkCompositeToProject,
  });

  const updateMeasurementConfig = useCallback(
    (updates: Partial<MeasurementConfig>) => {
      updateVessel(
        (prev) => ({
          ...prev,
          measurementConfig: { ...prev.measurementConfig, ...updates },
        }),
        historyFor('measurementConfig', '', updates)
      );
    },
    [updateVessel]
  );

  const updateThicknessThresholds = useCallback((thresholds: ThicknessThresholds) => {
    dispatch({
      type: 'UPDATE_THICKNESS_THRESHOLDS',
      thresholds,
      history: historyFor('thicknessThresholds', '', thresholds),
    });
  }, []);

  const handleUpdateWallLossGroups = useCallback(
    (config: WallLossGroupConfig) => {
      updateVessel(
        (prev) => ({ ...prev, wallLossGroups: config }),
        historyFor('wallLossGroups', '', config)
      );
    },
    [updateVessel]
  );

  const handleUpdateCoverageTargets = useCallback(
    (targets: CoverageTargets) => {
      updateVessel(
        (prev) => ({ ...prev, coverageTargets: targets }),
        historyFor('coverageTargets', '', targets)
      );
    },
    [updateVessel]
  );


  // Dome scan hover tooltip state
  const [domeScanHoverInfo, setDomeScanHoverInfo] = useState<DomeScanHoverInfo | null>(null);

  // Active body for a newly-drawn annotation (4B). The rule is deliberately
  // simple and predictable: the active body is the body of whatever entity is
  // currently selected — a selected appendage IS that body; a selected
  // attachable (nozzle / lug / weld / scan / dome scan / annotation / coverage
  // rect) contributes its own `bodyId`. When nothing body-scoped is selected the
  // active body is the main shell (undefined), so the legacy path is unchanged.
  const activeBodyId = useMemo<string | undefined>(() => {
    const s = selection;
    if (s.appendageIndex >= 0) return vesselState.appendages[s.appendageIndex]?.id;
    if (s.nozzleIndex >= 0) return vesselState.nozzles[s.nozzleIndex]?.bodyId;
    if (s.lugIndex >= 0) return vesselState.liftingLugs[s.lugIndex]?.bodyId;
    if (s.weldIndex >= 0) return vesselState.welds[s.weldIndex]?.bodyId;
    if (s.scanCompositeId)
      return vesselState.scanComposites.find((c) => c.id === s.scanCompositeId)?.bodyId;
    if (s.domeScanId)
      return vesselState.domeScanComposites.find((d) => d.id === s.domeScanId)?.bodyId;
    if (s.annotationId >= 0)
      return vesselState.annotations.find((a) => a.id === s.annotationId)?.bodyId;
    if (s.coverageRectId >= 0)
      return vesselState.coverageRects.find((r) => r.id === s.coverageRectId)?.bodyId;
    return undefined;
  }, [selection, vesselState]);

  // --- Interaction callbacks (from Three.js viewport) ---
  const vesselCallbacks: VesselCallbacks = {
    onNozzleSelected: (idx) => dispatch({ type: 'SELECT_NOZZLE', index: idx }),
    onAppendageSelected: (idx) => dispatch({ type: 'SELECT_APPENDAGE', index: idx }),
    onAppendageMoved: (idx, mountPos, mountAngle) => {
      updateAppendage(idx, {
        mountPos: Math.round(mountPos),
        mountAngle: Math.round(mountAngle),
      });
    },
    onSaddleSelected: (idx) => dispatch({ type: 'SELECT_SADDLE', index: idx }),
    onTextureSelected: (id) => dispatch({ type: 'SELECT_TEXTURE', id }),
    onLugSelected: (idx) => dispatch({ type: 'SELECT_LUG', index: idx }),
    onAnnotationSelected: (id) => dispatch({ type: 'SELECT_ANNOTATION', id }),
    onAnnotationMoved: (id, pos, angle) => {
      updateAnnotation(id, { pos: Math.round(pos), angle: Math.round(angle) });
    },
    onAnnotationLabelOffsetChanged: (id, offset) => {
      updateAnnotation(id, { labelOffset: offset });
    },
    // The active body (bodyId) is decided by the interaction layer from the
    // current selection — active body = the selected entity's body, main shell
    // (undefined) when nothing body-scoped is selected. See `activeDrawBodyId`.
    // A draw-created annotation is a plain add (no history key), so undo treats
    // it exactly like every other new annotation.
    onAnnotationCreated: (type, pos, angle, width, height, bodyId) => {
      const id = getNextAnnotationId();
      const isRestriction = type === 'restriction';
      const prefix = isRestriction ? 'R' : 'A';
      const count = vesselState.annotations.filter((a) => a.type === type).length + 1;
      addAnnotation({
        id,
        name: `${prefix}${count}`,
        type,
        pos: Math.round(pos),
        angle: Math.round(angle),
        width: Math.round(width),
        height: Math.round(height),
        color: isRestriction ? '#facc15' : '#ff3333',
        lineWidth: 2,
        showLabel: true,
        bodyId,
      });
      dispatch({ type: 'SELECT_ANNOTATION', id });
      dispatch({ type: 'SET_PREVIEW_ANNOTATION', preview: null });
      dispatch({ type: 'SET_DRAW_MODE_ANNOTATION', mode: null });
    },
    onAnnotationPreview: (type, pos, angle, width, height, bodyId) => {
      dispatch({
        type: 'SET_PREVIEW_ANNOTATION',
        preview: {
          id: -1,
          name: 'Preview',
          type,
          pos: Math.round(pos),
          angle: Math.round(angle),
          width: Math.round(width),
          height: Math.round(height),
          color: type === 'restriction' ? '#facc15' : '#ff3333',
          lineWidth: 2,
          showLabel: false,
          bodyId,
        },
      });
    },
    onRulerCreated: (startPos, startAngle, endPos, endAngle) => {
      const id = getNextRulerId();
      const num = vesselState.rulers.length + 1;
      addRuler({
        id,
        name: `R${num}`,
        startPos: Math.round(startPos),
        startAngle: Math.round(startAngle),
        endPos: Math.round(endPos),
        endAngle: Math.round(endAngle),
        color: '#ffaa00',
        showLabel: true,
      });
      dispatch({ type: 'SET_PREVIEW_RULER', preview: null });
      dispatch({ type: 'SET_DRAW_MODE_RULER', active: false });
    },
    onRulerPreview: (startPos, startAngle, endPos, endAngle) => {
      dispatch({
        type: 'SET_PREVIEW_RULER',
        preview: {
          id: -1,
          name: 'Preview',
          startPos: Math.round(startPos),
          startAngle: Math.round(startAngle),
          endPos: Math.round(endPos),
          endAngle: Math.round(endAngle),
          color: '#ffaa00',
          showLabel: true,
        },
      });
    },
    onCoverageRectCreated: (pos, angle, width, height) => {
      const id = getNextCoverageRectId();
      const num = vesselState.coverageRects.length + 1;
      addCoverageRect({
        id,
        name: `C${num}`,
        pos: Math.round(pos),
        angle: Math.round(angle),
        width: Math.round(width),
        height: Math.round(height),
        color: '#00cc66',
        lineWidth: 2,
        filled: true,
        fillOpacity: 0.2,
      });
      dispatch({ type: 'SELECT_COVERAGE_RECT', id });
      dispatch({ type: 'SET_PREVIEW_COVERAGE_RECT', preview: null });
      dispatch({ type: 'SET_DRAW_MODE_COVERAGE', active: false });
    },
    onCoverageRectPreview: (pos, angle, width, height) => {
      dispatch({
        type: 'SET_PREVIEW_COVERAGE_RECT',
        preview: {
          id: -1,
          name: 'Preview',
          pos: Math.round(pos),
          angle: Math.round(angle),
          width: Math.round(width),
          height: Math.round(height),
          color: '#00cc66',
          lineWidth: 2,
          filled: false,
          fillOpacity: 0.2,
        },
      });
    },
    onCoverageRectSelected: (id) => dispatch({ type: 'SELECT_COVERAGE_RECT', id }),
    onCoverageRectMoved: (id, pos, angle) => {
      updateCoverageRect(id, { pos: Math.round(pos), angle: Math.round(angle) });
    },
    onInspectionImageSelected: (id) => dispatch({ type: 'SELECT_INSPECTION_IMAGE', id }),
    onInspectionImageMoved: (id, pos, angle) => {
      updateInspectionImage(id, { pos: Math.round(pos), angle: Math.round(angle) });
    },
    onInspectionImageLabelOffsetChanged: (id, offset) => {
      updateInspectionImage(id, { labelOffset: offset });
    },
    onWeldSelected: (idx) => dispatch({ type: 'SELECT_WELD', index: idx }),
    onWeldMoved: (idx, pos, angle) => {
      const weld = vesselState.welds[idx];
      if (weld?.type === 'circumferential') {
        updateWeld(idx, { pos: Math.round(pos) });
      } else {
        const delta = Math.round(pos) - weld.pos;
        updateWeld(idx, {
          pos: Math.round(pos),
          endPos: (weld.endPos ?? vesselState.length) + delta,
          angle: Math.round(angle),
        });
      }
    },
    onScanCompositeHover: (id, thickness, rawScanMm, rawIndexMm, screenX, screenY) => {
      const sc = vesselState.scanComposites.find((c) => c.id === id);
      let displayScan: number;
      let displayIndex: number;
      if (sc?.useGlobalOrigin) {
        // Convert scan-space coords to vessel-space, then subtract global origin
        const globalOrigin = vesselState.coordinateOrigin ?? { indexMm: 0, scanMm: 0 };
        const indexDir = sc.indexDirection === 'forward' ? 1 : -1;
        const vesselIndex = sc.indexStartMm + (rawIndexMm - (sc.yAxis[0] ?? 0)) * indexDir;
        displayIndex = vesselIndex - globalOrigin.indexMm;
        displayScan = rawScanMm - globalOrigin.scanMm;
      } else {
        // Per-scan: relative to this scan's own axis start
        displayScan = rawScanMm - (sc?.xAxis[0] ?? 0);
        displayIndex = rawIndexMm - (sc?.yAxis[0] ?? 0);
      }
      dispatch({
        type: 'SET_HOVER_DATA',
        data: thickness !== null ? { thickness, scanMm: displayScan, indexMm: displayIndex } : null,
      });
      // Update cursor-follow tooltip position via ref (avoids re-render lag)
      if (cursorTooltipRef.current) {
        if (thickness !== null) {
          cursorTooltipRef.current.style.left = `${screenX + 16}px`;
          cursorTooltipRef.current.style.top = `${screenY - 12}px`;
        }
      }
    },
    onDomeScanHover: (info) => {
      setDomeScanHoverInfo(info);
    },
    onScanGizmoDatumMoved: (compositeId, angleDeg, posMm) => {
      handleUpdateScanComposite(compositeId, {
        datumAngleDeg: angleDeg,
        indexStartMm: Math.round(posMm),
      });
    },
    onScanGizmoDirectionToggle: (compositeId, field) => {
      const sc = vesselState.scanComposites.find((c) => c.id === compositeId);
      if (!sc) return;
      if (field === 'scanDirection') {
        handleUpdateScanComposite(compositeId, {
          scanDirection: sc.scanDirection === 'cw' ? 'ccw' : 'cw',
        });
      } else {
        handleUpdateScanComposite(compositeId, {
          indexDirection: sc.indexDirection === 'forward' ? 'reverse' : 'forward',
        });
      }
    },
    onDomeGizmoDatumMoved: (compositeId, phiDeg, thetaDeg) => {
      handleUpdateDomeScan(compositeId, { centerPhi: phiDeg, centerTheta: thetaDeg });
    },
    onDomeGizmoDirectionToggle: (compositeId, field) => {
      const ds = vesselState.domeScanComposites?.find((d) => d.id === compositeId);
      if (!ds) return;
      if (field === 'scanDirection') {
        handleUpdateDomeScan(compositeId, {
          scanDirection: ds.scanDirection === 'cw' ? 'ccw' : 'cw',
        });
      } else {
        handleUpdateDomeScan(compositeId, {
          indexDirection: ds.indexDirection === 'outward' ? 'inward' : 'outward',
        });
      }
    },
    onDomeGizmoClicked: (compositeId) => {
      dispatch({ type: 'SELECT_DOME_SCAN', id: compositeId });
    },
    onPipeSegmentSelected: (pipelineId, segmentIndex) => {
      dispatch({ type: 'SELECT_PIPE_SEGMENT', pipelineId, segmentIndex });
    },
    onPipeConnectionPointClicked: (pipelineId) => {
      // Show the pipe part popup — handled via state
      setPipePartPopup((prev) => (prev ? null : { pipelineId, x: 0, y: 0 }));
    },
    onDeselect: () => dispatch({ type: 'DESELECT_ALL' }),
    onNozzleMoved: (idx, pos, angle) => {
      updateNozzle(idx, { pos: Math.round(pos), angle: Math.round(angle) });
    },
    onSaddleMoved: (idx, pos) => {
      updateSaddle(idx, { pos: Math.round(pos) });
    },
    onTextureMoved: (id, pos, angle) => {
      updateTexture(id, { pos: Math.round(pos), angle: Math.round(angle) });
    },
    onLugMoved: (idx, pos, angle) => {
      updateLug(idx, { pos: Math.round(pos), angle: Math.round(angle) });
    },
    onDragEnd: () => {
      // Gesture boundary: end the coalescing group so the next drag of the same
      // object is a separate undo step. Per-move state is already committed.
      dispatch({ type: 'HISTORY_BREAK' });
    },
    onAnnotationTableMoved: (position) => {
      dispatch({
        type: 'UPDATE_VESSEL_FN',
        updater: (v) => ({ ...v, annotationTablePosition: position }),
        history: { key: 'annotationTable:move', at: Date.now() },
      });
    },
    onAnnotationTableResized: (size) => {
      dispatch({
        type: 'UPDATE_VESSEL_FN',
        updater: (v) => ({ ...v, annotationTableSize: size }),
        history: { key: 'annotationTable:resize', at: Date.now() },
      });
    },
  };

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
          const overviews = await captureVesselOverviews({
            renderer,
            scene,
            camera,
            controls,
            vesselState,
            vesselGroup: sceneManager.getVesselGroup() ?? undefined,
          });
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

  // --- Drawing import apply handler ---
  const handleDrawingApply = useCallback(
    (result: ExtractionResult) => {
      // Resolve each extracted nozzle to engine placement: head-mounted nozzles
      // (dished-end manways) become axial dome-end nozzles; shell nozzles pass
      // through unchanged. Vessel scalars come from the same result.
      const placementVessel = {
        id: result.id,
        length: result.length,
        headRatio: result.headRatio,
      };
      // The drawing replaces nozzles wholesale — mint fresh stable ids for them
      // so pipelines can be re-anchored to the new nozzles by id via remapNozzleRefs.
      const newNozzles = backfillNozzleIds(
        result.nozzles.map((n) => ({
          name: n.name,
          ...placeExtractedNozzle(n, placementVessel),
        })) as NozzleConfig[]
      );

      // The drawing replaces nozzles wholesale, so re-anchor existing pipelines
      // by nozzle name (their old nozzleId is about to go stale).
      // Pipelines whose anchor is gone are dropped — but never silently.
      const { pipelines: remappedPipelines, removed } = remapNozzleRefs(
        vesselState.nozzles,
        newNozzles,
        vesselState.pipelines
      );
      if (removed.length > 0) {
        const removedNames = removed.map((r) => r.oldNozzleName || '(unnamed)').join(', ');
        const proceed = window.confirm(
          `Applying this drawing will remove ${removed.length} pipeline(s) whose anchor ` +
            `nozzle is no longer present in the drawing: ${removedNames}.\n\nApply anyway?`
        );
        if (!proceed) return;
      }

      updateVessel((prev) =>
        validateVesselState({
          ...prev,
          id: result.id,
          length: result.length,
          headRatio: result.headRatio,
          orientation: result.orientation,
          nozzles: newNozzles,
          saddles: result.saddles.map((s) => ({
            pos: s.pos,
            color: s.color || '#2244ff',
          })),
          pipelines: remappedPipelines,
          hasModel: true,
        })
      );
      dispatch({ type: 'DESELECT_ALL' });
    },
    [updateVessel, vesselState.nozzles, vesselState.pipelines]
  );

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

    const saved = ui.savedCameraState;
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
  }, [ui.savedCameraState]);

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
      if (ui.inspectingAnnotationId !== null && ui.inspectingAnnotationId !== id) {
        cycleInspection(id);
      } else if (ui.inspectingAnnotationId === null) {
        enterInspectionMode(id);
      }
    },
    [ui.inspectingAnnotationId, enterInspectionMode, cycleInspection, vesselState.annotations]
  );

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

    // 1. Capture vessel overview images
    const vesselOverviews = await captureVesselOverviews(captureCtx);

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

  // --- Keyboard: Escape cancels draw/inspection; Ctrl/Cmd+Z / +Y undo-redo ---
  // Note: VesselModeler does not render <ScreenshotMode> (that component owns its
  // own key handler when mounted elsewhere), so there is no screenshot-mode
  // visibility state here to guard against — only the text-field guard applies.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (ui.inspectingAnnotationId !== null) {
          exitInspectionMode();
        } else if (drawModeState.annotation || drawModeState.coverage || drawModeState.ruler) {
          dispatch({ type: 'CANCEL_ALL_DRAW_MODES' });
        }
        return;
      }

      // Undo/redo — let native text-editing undo win inside form fields.
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' });
      } else if (e.ctrlKey && key === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawModeState, ui.inspectingAnnotationId, exitInspectionMode]);

  // --- Nozzle library drag-and-drop onto 3D canvas ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes('application/x-nozzle-pipe') ||
      e.dataTransfer.types.includes('application/x-lifting-lug') ||
      e.dataTransfer.types.includes('application/x-weld') ||
      e.dataTransfer.types.includes('application/x-pipe-part')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const SCALE = 0.001; // Matches vessel-geometry scale

  const handleNozzleDrop = useCallback(
    (e: React.DragEvent) => {
      const data = e.dataTransfer.getData('application/x-nozzle-pipe');
      if (!data) return;
      e.preventDefault();

      const pipe = JSON.parse(data);
      const cam = viewportRef.current?.getCamera();
      const rendererEl = viewportRef.current?.getRenderer()?.domElement;
      const sceneManager = viewportRef.current?.getSceneManager();
      if (!cam || !rendererEl || !sceneManager) return;

      const vesselGroup = sceneManager.getVesselGroup();
      if (!vesselGroup) return;

      // Raycast from drop position
      const rect = rendererEl.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cam);

      // Find shell meshes to intersect
      const shells: THREE.Object3D[] = [];
      vesselGroup.traverse((child: THREE.Object3D) => {
        if (child.userData.isShell) shells.push(child);
      });
      const intersects = raycaster.intersectObjects(shells);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        const isVertical = vesselState.orientation === 'vertical';

        // Calculate position from intersection point
        let newPos = isVertical
          ? point.y / SCALE + vesselState.length / 2
          : point.x / SCALE + vesselState.length / 2;
        const headDepth = vesselState.id / (2 * vesselState.headRatio);
        newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

        // Calculate angle from intersection
        const rad = isVertical ? Math.atan2(point.z, point.x) : Math.atan2(point.y, point.z);
        let deg = (rad * 180) / Math.PI;
        if (deg < 0) deg += 360;

        // Find a unique name
        const namePrefix = pipe.style === 'plain-pipe' ? 'P' : 'N';
        let nozzleNum = vesselState.nozzles.length + 1;
        let name = namePrefix + nozzleNum;
        while (vesselState.nozzles.some((n) => n.name === name)) {
          nozzleNum++;
          name = namePrefix + nozzleNum;
        }

        const defaultProj = vesselState.id / 2 + 200;

        addNozzle({
          name,
          pos: Math.round(newPos),
          proj: defaultProj,
          angle: Math.round(deg),
          size: pipe.id,
          flangeOD: pipe.flangeOD,
          flangeThk: pipe.flangeThk,
          pipeOD: pipe.od,
          ...(pipe.style ? { style: pipe.style } : {}),
        });
      } else {
        // Dropped on canvas but missed the vessel - add at center
        const namePrefix = pipe.style === 'plain-pipe' ? 'P' : 'N';
        let nozzleNum = vesselState.nozzles.length + 1;
        let name = namePrefix + nozzleNum;
        while (vesselState.nozzles.some((n) => n.name === name)) {
          nozzleNum++;
          name = namePrefix + nozzleNum;
        }
        addNozzle({
          name,
          pos: vesselState.length / 2,
          proj: pipe.od * 2,
          angle: 90,
          size: pipe.id,
          flangeOD: pipe.flangeOD,
          flangeThk: pipe.flangeThk,
          pipeOD: pipe.od,
          ...(pipe.style ? { style: pipe.style } : {}),
        });
      }
    },
    [vesselState, addNozzle]
  );

  // --- Lifting lug drag-and-drop onto 3D canvas ---
  const handleLugDrop = useCallback(
    (e: React.DragEvent) => {
      const data = e.dataTransfer.getData('application/x-lifting-lug');
      if (!data) return;
      e.preventDefault();

      const lugData = JSON.parse(data);
      const cam = viewportRef.current?.getCamera();
      const rendererEl = viewportRef.current?.getRenderer()?.domElement;
      const sceneManager = viewportRef.current?.getSceneManager();
      if (!cam || !rendererEl || !sceneManager) return;

      const vesselGroup = sceneManager.getVesselGroup();
      if (!vesselGroup) return;

      const rect = rendererEl.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cam);

      const shells: THREE.Object3D[] = [];
      vesselGroup.traverse((child: THREE.Object3D) => {
        if (child.userData.isShell) shells.push(child);
      });
      const intersects = raycaster.intersectObjects(shells);

      let newPos: number;
      let deg: number;

      if (intersects.length > 0) {
        const point = intersects[0].point;
        const isVertical = vesselState.orientation === 'vertical';
        newPos = isVertical
          ? point.y / SCALE + vesselState.length / 2
          : point.x / SCALE + vesselState.length / 2;
        const headDepth = vesselState.id / (2 * vesselState.headRatio);
        newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

        const rad = isVertical ? Math.atan2(point.z, point.x) : Math.atan2(point.y, point.z);
        deg = (rad * 180) / Math.PI;
        if (deg < 0) deg += 360;
      } else {
        newPos = vesselState.length / 2;
        deg = 90;
      }

      let lugNum = vesselState.liftingLugs.length + 1;
      let name = 'L' + lugNum;
      while (vesselState.liftingLugs.some((l) => l.name === name)) {
        lugNum++;
        name = 'L' + lugNum;
      }

      addLug({
        name,
        pos: Math.round(newPos),
        angle: Math.round(deg),
        style: lugData.style || 'padEye',
        swl: lugData.label,
      });
    },
    [vesselState, addLug]
  );

  // --- Weld drag-and-drop onto 3D canvas ---
  const handleWeldDrop = useCallback(
    (e: React.DragEvent) => {
      const data = e.dataTransfer.getData('application/x-weld');
      if (!data) return;
      e.preventDefault();

      const { type: wType } = JSON.parse(data) as { type: 'circumferential' | 'longitudinal' };
      const cam = viewportRef.current?.getCamera();
      const rendererEl = viewportRef.current?.getRenderer()?.domElement;
      const sceneManager = viewportRef.current?.getSceneManager();
      if (!cam || !rendererEl || !sceneManager) return;

      const vesselGroup = sceneManager.getVesselGroup();
      if (!vesselGroup) return;

      const rect = rendererEl.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cam);

      const shells: THREE.Object3D[] = [];
      vesselGroup.traverse((child: THREE.Object3D) => {
        if (child.userData.isShell) shells.push(child);
      });
      const intersects = raycaster.intersectObjects(shells);

      let newPos: number;
      let deg: number;

      if (intersects.length > 0) {
        const point = intersects[0].point;
        const isVertical = vesselState.orientation === 'vertical';
        newPos = isVertical
          ? point.y / SCALE + vesselState.length / 2
          : point.x / SCALE + vesselState.length / 2;
        const headDepth = vesselState.id / (2 * vesselState.headRatio);
        newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

        const rad = isVertical ? Math.atan2(point.z, point.x) : Math.atan2(point.y, point.z);
        deg = (rad * 180) / Math.PI;
        if (deg < 0) deg += 360;
      } else {
        newPos = vesselState.length / 2;
        deg = 90;
      }

      let weldNum = vesselState.welds.length + 1;
      let name = 'W' + weldNum;
      while (vesselState.welds.some((w) => w.name === name)) {
        weldNum++;
        name = 'W' + weldNum;
      }

      if (wType === 'circumferential') {
        addWeld({
          name,
          type: 'circumferential',
          pos: Math.round(newPos),
          color: '#888888',
        });
      } else {
        const halfLen = vesselState.length * 0.25;
        addWeld({
          name,
          type: 'longitudinal',
          pos: Math.round(newPos - halfLen),
          endPos: Math.round(newPos + halfLen),
          angle: Math.round(deg),
          color: '#888888',
        });
      }
    },
    [vesselState, addWeld]
  );

  // --- Pipe part drag-and-drop ---
  const handlePipePartDrop = useCallback(
    (e: React.DragEvent) => {
      const data = e.dataTransfer.getData('application/x-pipe-part');
      if (!data) return;
      e.preventDefault();

      const { type: segmentType } = JSON.parse(data) as { type: PipeSegmentType };

      // Raycast the shell — same pattern as nozzle drop
      const cam = viewportRef.current?.getCamera();
      const rendererEl = viewportRef.current?.getRenderer()?.domElement;
      const sceneManager = viewportRef.current?.getSceneManager();
      if (!cam || !rendererEl || !sceneManager) return;

      const vesselGroup = sceneManager.getVesselGroup();
      if (!vesselGroup) return;

      const rect = rendererEl.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cam);

      const shells: THREE.Object3D[] = [];
      vesselGroup.traverse((child: THREE.Object3D) => {
        if (child.userData.isShell) shells.push(child);
      });
      const intersects = raycaster.intersectObjects(shells);

      // Compute pos/angle from hit point (mirrors nozzle drop logic)
      const isVertical = vesselState.orientation === 'vertical';
      const headDepth = vesselState.id / (2 * vesselState.headRatio);
      let newPos: number;
      let deg: number;

      if (intersects.length > 0) {
        const point = intersects[0].point;
        newPos = isVertical
          ? point.y / SCALE + vesselState.length / 2
          : point.x / SCALE + vesselState.length / 2;
        newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

        const rad = isVertical ? Math.atan2(point.z, point.x) : Math.atan2(point.y, point.z);
        deg = (rad * 180) / Math.PI;
        if (deg < 0) deg += 360;
      } else {
        // Missed the vessel — place at center top
        newPos = vesselState.length / 2;
        deg = 90;
      }

      // Default pipe size for the stub nozzle
      const defaultPipeSize = PIPE_SIZES[2]; // 4" NPS
      const defaultProj = vesselState.id / 2 + 150;

      // Find unique nozzle name
      let nozzleNum = vesselState.nozzles.length + 1;
      let name = 'P' + nozzleNum;
      while (vesselState.nozzles.some((n) => n.name === name)) {
        nozzleNum++;
        name = 'P' + nozzleNum;
      }

      // Create plain-pipe nozzle + pipeline with first segment in one atomic update.
      // Mint the nozzle id up front so the pipeline can anchor to it by id.
      const nozzleId = nextNozzleId(vesselState.nozzles);
      const nozzle: NozzleConfig = {
        id: nozzleId,
        name,
        pos: Math.round(newPos),
        proj: defaultProj,
        angle: Math.round(deg),
        size: defaultPipeSize.id,
        pipeOD: defaultPipeSize.od,
        style: 'plain-pipe',
      };

      const newPipeline: Pipeline = {
        id: crypto.randomUUID(),
        nozzleId,
        pipeDiameter: defaultPipeSize.od,
        segments: [createDefaultSegment(segmentType, defaultPipeSize.od)],
      };

      updateVessel((prev) => ({
        ...prev,
        nozzles: [...prev.nozzles, nozzle],
        pipelines: [...prev.pipelines, newPipeline],
        hasModel: true,
      }));
    },
    [vesselState, updateVessel, createDefaultSegment]
  );

  // --- Combined drop handler ---
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('application/x-nozzle-pipe')) {
        handleNozzleDrop(e);
      } else if (e.dataTransfer.types.includes('application/x-lifting-lug')) {
        handleLugDrop(e);
      } else if (e.dataTransfer.types.includes('application/x-weld')) {
        handleWeldDrop(e);
      } else if (e.dataTransfer.types.includes('application/x-pipe-part')) {
        handlePipePartDrop(e);
      }
    },
    [handleNozzleDrop, handleLugDrop, handleWeldDrop, handlePipePartDrop]
  );

  // --- Hint text ---
  const getHintText = () => {
    if (drawModeState.ruler) {
      return 'Drawing Ruler - Click on vessel to set start point, drag to end point | Press Esc to cancel';
    }
    if (drawModeState.coverage) {
      return 'Drawing Coverage Rectangle - Click on vessel to start, drag to size | Press Esc to cancel';
    }
    if (drawModeState.annotation) {
      return `Drawing ${drawModeState.annotation === 'restriction' ? 'Restriction' : 'Scan'} Annotation - Click on vessel to start, drag to size | Press Esc to cancel`;
    }
    const locked = [];
    if (locks.nozzles) locked.push('Nozzles');
    if (locks.lugs) locked.push('Lugs');
    if (locks.saddles) locked.push('Saddles');
    if (locks.textures) locked.push('Textures');
    if (locks.welds) locked.push('Welds');

    if (locked.length > 0)
      return `${locked.join(', ')} Locked | Other components can be repositioned`;
    return null;
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: '#111111' }}>
      {/* Project context banner */}
      {projectId && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 text-xs border-b shrink-0"
          style={{
            background: 'rgba(59,130,246,0.08)',
            borderColor: 'rgba(59,130,246,0.2)',
            color: '#60a5fa',
          }}
        >
          <FolderOpen size={13} />
          <span>Working in project context</span>
          <span style={{ color: 'rgba(96,165,250,0.5)' }}>|</span>
          <a
            href={
              projectVesselId
                ? `/projects/${projectId}/vessels/${projectVesselId}`
                : `/projects/${projectId}`
            }
            style={{ color: '#60a5fa', textDecoration: 'underline' }}
          >
            Back to Inspection
          </a>
        </div>
      )}
      {/* Loading overlay when fetching linked model */}
      {linkedModelLoading && effectiveProjectVesselId && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.7)' }}
        >
          <div style={{ color: '#60a5fa', fontSize: '0.9rem' }}>Loading model from project...</div>
        </div>
      )}
      {/* Main content area */}
      <div
        ref={viewportContainerRef}
        className={`flex-1 relative overflow-hidden ${drawModeState.annotation || drawModeState.coverage || drawModeState.ruler ? 'vm-draw-mode-active' : ''}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {ui.viewMode === '3d' ? (
          <>
            {/* Three.js viewport (z-0) */}
            <ErrorBoundary
              fallback={
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                  <div className="text-center p-8 max-w-md">
                    <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">3D Viewport Error</h3>
                    <p className="text-gray-400 text-sm mb-4">
                      The 3D renderer encountered an error. This can happen due to GPU driver issues
                      or corrupted geometry.
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Reload Page
                    </button>
                  </div>
                </div>
              }
            >
              <ThreeViewport
                ref={viewportRef}
                vesselState={vesselState}
                selectedNozzleIndex={selection.nozzleIndex}
                selectedLugIndex={selection.lugIndex}
                selectedSaddleIndex={selection.saddleIndex}
                selectedTextureId={selection.textureId}
                selectedAnnotationId={selection.annotationId}
                textureObjects={textureObjectsRef.current}
                callbacks={vesselCallbacks}
                nozzlesLocked={locks.nozzles}
                saddlesLocked={locks.saddles}
                texturesLocked={locks.textures}
                lugsLocked={locks.lugs}
                weldsLocked={locks.welds}
                pipelinesLocked={locks.pipelines}
                angleSnapEnabled={ui.snapEnabled}
                angleSnapDeg={ui.snapDeg}
                selectedWeldIndex={selection.weldIndex}
                selectedInspectionImageId={selection.inspectionImageId}
                onInspectionImageThumbnailClick={(id) =>
                  dispatch({ type: 'SET_VIEWING_INSPECTION_IMAGE', id })
                }
                drawMode={drawModeState.annotation}
                activeDrawBodyId={activeBodyId}
                coverageDrawMode={drawModeState.coverage}
                previewAnnotation={previews.annotation}
                previewCoverageRect={previews.coverageRect}
                rulerDrawMode={drawModeState.ruler}
                previewRuler={previews.ruler}
                selectedScanCompositeId={selection.scanCompositeId}
                selectedDomeScanId={selection.domeScanId}
                selectedPipelineId={selection.pipelineId}
                selectedPipeSegmentIdx={selection.pipeSegmentIdx}
                inspectingAnnotationId={ui.inspectingAnnotationId}
              />
            </ErrorBoundary>
          </>
        ) : (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center bg-white text-gray-500 text-sm">
                Loading flattened view...
              </div>
            }
          >
            <FlattenedViewport
              ref={flattenedViewportRef}
              vesselState={vesselState}
              selectedWeldIndex={selection.weldIndex}
              selectedNozzleIndex={selection.nozzleIndex}
              selectedSaddleIndex={selection.saddleIndex}
              selectedLugIndex={selection.lugIndex}
            />
          </Suspense>
        )}

        {/* Pipe part popup — shown when clicking a connection point */}
        {pipePartPopup && (
          <PipePartPopup
            pipelineId={pipePartPopup.pipelineId}
            onSelect={(plId, type) => addSegment(plId, type)}
            onClose={() => setPipePartPopup(null)}
          />
        )}

        {/* Scan composite hover tooltip — cursor-following mode */}
        {ui.scanTooltipFollow && ui.hoverData && ui.hoverData.thickness !== null && (
          <div
            ref={cursorTooltipRef}
            className="pointer-events-none"
            style={{ position: 'fixed', zIndex: 9999 }}
          >
            <div className="vm-scan-tooltip">
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">Thickness</span>
                <span className="vm-scan-tooltip-number primary">
                  {ui.hoverData.thickness.toFixed(2)}
                  <span className="vm-scan-tooltip-unit">mm</span>
                </span>
              </div>
              <div className="vm-scan-tooltip-divider" />
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">Scan</span>
                <span className="vm-scan-tooltip-number">
                  {ui.hoverData.scanMm.toFixed(1)}
                  <span className="vm-scan-tooltip-unit">mm</span>
                </span>
              </div>
              <div className="vm-scan-tooltip-divider" />
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">Index</span>
                <span className="vm-scan-tooltip-number">
                  {ui.hoverData.indexMm.toFixed(1)}
                  <span className="vm-scan-tooltip-unit">mm</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Dome scan hover tooltip — cursor-following mode */}
        {ui.scanTooltipFollow && domeScanHoverInfo && (
          <div
            className="pointer-events-none"
            style={{
              position: 'fixed',
              left: domeScanHoverInfo.screenX + 12,
              top: domeScanHoverInfo.screenY - 40,
              zIndex: 9999,
            }}
          >
            <div className="vm-scan-tooltip">
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">Thickness</span>
                <span className="vm-scan-tooltip-number primary">
                  {domeScanHoverInfo.thickness?.toFixed(1) ?? '—'}
                  <span className="vm-scan-tooltip-unit">mm</span>
                </span>
              </div>
              <div className="vm-scan-tooltip-divider" />
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">{'φ'}</span>
                <span className="vm-scan-tooltip-number">
                  {domeScanHoverInfo.phiDeg.toFixed(1)}
                  <span className="vm-scan-tooltip-unit">{'°'}</span>
                </span>
              </div>
              <div className="vm-scan-tooltip-divider" />
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">{'θ'}</span>
                <span className="vm-scan-tooltip-number">
                  {domeScanHoverInfo.thetaDeg.toFixed(1)}
                  <span className="vm-scan-tooltip-unit">{'°'}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar (z-20) */}
        <div className={`vm-sidebar ${ui.sidebarOpen ? '' : 'collapsed'}`}>
          <SidebarPanel
            vesselState={vesselState}
            modelMode={modelMode}
            onSetModelMode={handleSetModelMode}
            selectedNozzleIndex={selection.nozzleIndex}
            selectedSaddleIndex={selection.saddleIndex}
            selectedTextureId={selection.textureId}
            onUpdateDimensions={updateDimensions}
            onAddNozzle={addNozzle}
            onUpdateNozzle={updateNozzle}
            onRemoveNozzle={removeNozzle}
            onSelectNozzle={(index) => dispatch({ type: 'SELECT_NOZZLE', index })}
            selectedAppendageIndex={selection.appendageIndex}
            onAddAppendage={addAppendage}
            onUpdateAppendage={updateAppendage}
            onRemoveAppendage={removeAppendage}
            onSelectAppendage={(index) => dispatch({ type: 'SELECT_APPENDAGE', index })}
            selectedLugIndex={selection.lugIndex}
            onAddLug={addLug}
            onUpdateLug={updateLug}
            onRemoveLug={removeLug}
            onSelectLug={(index) => dispatch({ type: 'SELECT_LUG', index })}
            onAddSaddle={addSaddle}
            onUpdateSaddle={updateSaddle}
            onUpdateAllSaddleHeights={updateAllSaddleHeights}
            onUpdateAllSaddleDepths={updateAllSaddleDepths}
            onUpdateAllSaddleWearPlate={updateAllSaddleWearPlate}
            onRemoveSaddle={removeSaddle}
            onSelectSaddle={(index) => dispatch({ type: 'SELECT_SADDLE', index })}
            selectedWeldIndex={selection.weldIndex}
            onAddWeld={addWeld}
            onUpdateWeld={updateWeld}
            onRemoveWeld={removeWeld}
            onSelectWeld={(index) => dispatch({ type: 'SELECT_WELD', index })}
            onAddTexture={addTexture}
            onUpdateTexture={updateTexture}
            onRemoveTexture={removeTexture}
            onSelectTexture={(id) => dispatch({ type: 'SELECT_TEXTURE', id })}
            getNextTextureId={getNextTextureId}
            renderer={viewportRef.current?.getRenderer() ?? null}
            selectedAnnotationId={selection.annotationId}
            drawMode={drawModeState.annotation}
            onSetDrawMode={(mode) => dispatch({ type: 'SET_DRAW_MODE_ANNOTATION', mode })}
            onAddAnnotation={addAnnotation}
            onUpdateAnnotation={updateAnnotation}
            onRemoveAnnotation={removeAnnotation}
            onSelectAnnotation={handleSidebarAnnotationSelect}
            onUpdateMeasurementConfig={updateMeasurementConfig}
            getNextAnnotationId={getNextAnnotationId}
            coverageDrawMode={drawModeState.coverage}
            onSetCoverageDrawMode={(active) => dispatch({ type: 'SET_DRAW_MODE_COVERAGE', active })}
            onAddCoverageRect={addCoverageRect}
            onUpdateCoverageRect={updateCoverageRect}
            onRemoveCoverageRect={removeCoverageRect}
            onSelectCoverageRect={(id) => dispatch({ type: 'SELECT_COVERAGE_RECT', id })}
            selectedCoverageRectId={selection.coverageRectId}
            getNextCoverageRectId={getNextCoverageRectId}
            rulerDrawMode={drawModeState.ruler}
            onSetRulerDrawMode={(active) => dispatch({ type: 'SET_DRAW_MODE_RULER', active })}
            onRemoveRuler={removeRuler}
            onUpdateRuler={updateRuler}
            selectedRulerId={selection.rulerId}
            onSelectRuler={(id) => dispatch({ type: 'SELECT_RULER', id })}
            selectedInspectionImageId={selection.inspectionImageId}
            onAddInspectionImage={addInspectionImage}
            onUpdateInspectionImage={updateInspectionImage}
            onRemoveInspectionImage={removeInspectionImage}
            onSelectInspectionImage={(id) => dispatch({ type: 'SELECT_INSPECTION_IMAGE', id })}
            onToggleInspectionImageVisible={toggleInspectionImageVisible}
            onToggleInspectionImageLocked={toggleInspectionImageLocked}
            onToggleAnnotationVisible={toggleAnnotationVisible}
            onToggleAnnotationLocked={toggleAnnotationLocked}
            onViewInspectionImage={(id) => dispatch({ type: 'SET_VIEWING_INSPECTION_IMAGE', id })}
            getNextInspectionImageId={getNextInspectionImageId}
            selectedScanCompositeId={selection.scanCompositeId}
            onSelectScanComposite={(id) => dispatch({ type: 'SELECT_SCAN_COMPOSITE', id })}
            onImportComposite={handleImportComposite}
            onUpdateScanComposite={handleUpdateScanComposite}
            onRemoveScanComposite={handleRemoveScanComposite}
            cloudComposites={cloudComposites}
            cloudCompositesLoading={cloudCompositesLoading}
            cloudCompositesError={cloudCompositesError as Error | null}
            selectedDomeScanId={selection.domeScanId}
            onSelectDomeScan={handleSelectDomeScan}
            onImportDomeComposite={handleImportDomeComposite}
            onUpdateDomeScan={handleUpdateDomeScan}
            onRemoveDomeScan={handleRemoveDomeScan}
            cloudDomeComposites={cloudComposites}
            cloudDomeCompositesLoading={cloudCompositesLoading}
            cloudDomeCompositesError={cloudCompositesError as Error | null}
            onUpdateThicknessThresholds={updateThicknessThresholds}
            onUpdateWallLossGroups={handleUpdateWallLossGroups}
            selectedPipelineId={selection.pipelineId}
            selectedSegmentIdx={selection.pipeSegmentIdx}
            onAddPipeline={addPipeline}
            onAddFreePipeline={addFreePipeline}
            onUpdateFreePipelineOrigin={updateFreePipelineOrigin}
            onAddSegment={addSegment}
            onUpdateSegment={updateSegment}
            onRemoveSegment={removeSegment}
            onRemovePipeline={removePipeline}
            onSelectPipeSegment={selectPipeSegment}
            onGenerateReport={handleGenerateReport}
            projectImages={projectImages}
          />
        </div>

        {/* Toggle sidebar button */}
        <button
          className={`vm-toggle-sidebar ${ui.sidebarOpen ? '' : 'sidebar-collapsed'}`}
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          title={ui.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {ui.sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>

        {/* Locks popout menu */}
        <div
          className="vm-popout-menu"
          ref={locksMenuRef}
          style={{ left: ui.sidebarOpen ? 400 : 60 }}
        >
          <button
            className={`vm-popout-trigger ${locksMenuOpen ? 'open' : ''}`}
            onClick={() => {
              setLocksMenuOpen(!locksMenuOpen);
              setActionsMenuOpen(false);
            }}
          >
            <Lock size={14} />
            Locks
            <ChevronDown
              size={12}
              className={`vm-popout-chevron ${locksMenuOpen ? 'rotated' : ''}`}
            />
          </button>
          {locksMenuOpen && (
            <div className="vm-popout-panel">
              <button
                className={`vm-lock-btn ${locks.nozzles ? 'locked' : ''}`}
                onClick={() => dispatch({ type: 'TOGGLE_LOCK', key: 'nozzles' })}
                title={locks.nozzles ? 'Unlock nozzles' : 'Lock nozzles'}
              >
                {locks.nozzles ? <Lock size={12} /> : <Unlock size={12} />}
                Nozzles
              </button>
              <button
                className={`vm-lock-btn ${locks.saddles ? 'locked' : ''}`}
                onClick={() => dispatch({ type: 'TOGGLE_LOCK', key: 'saddles' })}
                title={locks.saddles ? 'Unlock saddles' : 'Lock saddles'}
              >
                {locks.saddles ? <Lock size={12} /> : <Unlock size={12} />}
                Saddles
              </button>
              <button
                className={`vm-lock-btn ${locks.textures ? 'locked' : ''}`}
                onClick={() => dispatch({ type: 'TOGGLE_LOCK', key: 'textures' })}
                title={locks.textures ? 'Unlock textures' : 'Lock textures'}
              >
                {locks.textures ? <Lock size={12} /> : <Unlock size={12} />}
                Textures
              </button>
              <button
                className={`vm-lock-btn ${locks.lugs ? 'locked' : ''}`}
                onClick={() => dispatch({ type: 'TOGGLE_LOCK', key: 'lugs' })}
                title={locks.lugs ? 'Unlock lifting lugs' : 'Lock lifting lugs'}
              >
                {locks.lugs ? <Lock size={12} /> : <Unlock size={12} />}
                Lifting Lugs
              </button>
              <button
                className={`vm-lock-btn ${locks.welds ? 'locked' : ''}`}
                onClick={() => dispatch({ type: 'TOGGLE_LOCK', key: 'welds' })}
                title={locks.welds ? 'Unlock welds' : 'Lock welds'}
              >
                {locks.welds ? <Lock size={12} /> : <Unlock size={12} />}
                Welds
              </button>
            </div>
          )}
        </div>

        {/* Actions popout menu */}
        <div
          className="vm-popout-menu vm-popout-menu-right"
          ref={actionsMenuRef}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {/* Undo / redo */}
          <button
            className="vm-popout-trigger"
            onClick={() => dispatch({ type: 'UNDO' })}
            disabled={state.history.past.length === 0}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={14} />
          </button>
          <button
            className="vm-popout-trigger"
            onClick={() => dispatch({ type: 'REDO' })}
            disabled={state.history.future.length === 0}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={14} />
          </button>
          {/* 3D/2D toggle */}
          <div className="vm-toolbar-segmented">
            {(['3d', 'flattened'] as const).map((mode) => (
              <button
                key={mode}
                className={`vm-toolbar-segmented__btn ${ui.viewMode === mode ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode })}
              >
                {mode === '3d' ? '3D' : '2D'}
              </button>
            ))}
          </div>
          {/* Tidy labels toggle */}
          <button
            className={`vm-popout-trigger ${ui.labelsTidied ? 'vm-popout-trigger--active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_LABELS_TIDIED' })}
            title={
              ui.labelsTidied
                ? 'Switch all labels to flyout mode'
                : 'Switch all labels to table mode'
            }
          >
            <AlignVerticalDistributeCenter size={14} />
            Tidy
          </button>
          <StatsDropdown
            showCoverage={ui.showStatsCoverage}
            showWallLoss={ui.showStatsWallLoss}
            showScanCoverage={ui.showStatsScanCoverage}
            hasCoverageData={vesselState.coverageRects.length > 0}
            hasWallLossData={!!vesselState.wallLossGroups?.enabled}
            onToggleCoverage={() => dispatch({ type: 'TOGGLE_STATS_COVERAGE' })}
            onToggleWallLoss={() => dispatch({ type: 'TOGGLE_STATS_WALL_LOSS' })}
            onToggleScanCoverage={() => dispatch({ type: 'TOGGLE_STATS_SCAN_COVERAGE' })}
          />
          <SnapControl
            enabled={ui.snapEnabled}
            snapDeg={ui.snapDeg}
            onToggle={() => dispatch({ type: 'TOGGLE_SNAP' })}
            onChangeDeg={(deg) => dispatch({ type: 'SET_SNAP_DEG', deg })}
          />
          <button
            className={`vm-popout-trigger ${ui.scanTooltipFollow ? 'vm-popout-trigger--active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_SCAN_TOOLTIP_FOLLOW' })}
            title={
              ui.scanTooltipFollow
                ? 'Switch to fixed readout'
                : 'Switch to cursor-following tooltip'
            }
          >
            {ui.scanTooltipFollow ? <MousePointer size={14} /> : <PanelBottomClose size={14} />}
            {ui.scanTooltipFollow ? 'Cursor' : 'Fixed'}
          </button>
          <button
            className={`vm-popout-trigger ${actionsMenuOpen ? 'open' : ''}`}
            onClick={() => {
              setActionsMenuOpen(!actionsMenuOpen);
              setLocksMenuOpen(false);
            }}
          >
            <Settings2 size={14} />
            Actions
            <ChevronDown
              size={12}
              className={`vm-popout-chevron ${actionsMenuOpen ? 'rotated' : ''}`}
            />
          </button>
          {actionsMenuOpen && (
            <div className="vm-popout-panel">
              <button
                className="vm-popout-item"
                onClick={() => {
                  dispatch({ type: 'SET_SHOW_DRAWING_IMPORT', show: true });
                  setActionsMenuOpen(false);
                }}
              >
                <FileUp size={14} /> Import GA
              </button>
              <button
                className="vm-popout-item"
                onClick={async () => {
                  setActionsMenuOpen(false);
                  const renderer = viewportRef.current?.getRenderer();
                  const scene = viewportRef.current?.getScene();
                  const camera = viewportRef.current?.getCamera();
                  if (!renderer || !scene || !camera) return;

                  const dataUrl = await captureViewportScreenshot(renderer, scene, camera, 4);
                  if (dataUrl) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    downloadScreenshot(dataUrl, `vessel-screenshot-${timestamp}.png`);
                  }
                }}
              >
                <Camera size={14} /> Screenshot (4×)
              </button>
              <button
                className="vm-popout-item"
                onClick={() => {
                  viewportRef.current?.resetCamera();
                  setActionsMenuOpen(false);
                }}
              >
                <RotateCcw size={14} /> Reset Camera
              </button>
              <div className="vm-popout-divider" />
              <button
                className="vm-popout-item"
                onClick={() => {
                  saveToProject();
                  setActionsMenuOpen(false);
                }}
                disabled={saveStatus === 'saving' || !vesselModelIdRef.current}
                title={
                  !vesselModelIdRef.current ? 'No existing model — use Save as New' : undefined
                }
                style={!vesselModelIdRef.current ? { opacity: 0.4 } : undefined}
              >
                <Save size={14} />
                {saveStatus === 'saving'
                  ? 'Updating...'
                  : saveStatus === 'saved'
                    ? 'Updated!'
                    : saveStatus === 'error'
                      ? 'Update Failed'
                      : 'Update Current Model'}
              </button>
              <button
                className="vm-popout-item"
                onClick={() => {
                  // Pre-fill picker with current project context if available
                  if (projectId) setPickerProjectId(projectId);
                  if (projectVesselId) setPickerVesselId(projectVesselId);
                  setPickerMode('save');
                  setActionsMenuOpen(false);
                }}
                disabled={saveStatus === 'saving'}
              >
                <Save size={14} /> Save as New Model
              </button>
              <button
                className="vm-popout-item"
                onClick={() => {
                  setPickerMode('load');
                  setActionsMenuOpen(false);
                }}
              >
                <FolderOpen size={14} /> Load from Project
              </button>
              <div className="vm-popout-divider" />
              <button
                className="vm-popout-item"
                onClick={() => {
                  saveProject();
                  setActionsMenuOpen(false);
                }}
              >
                <Save size={14} /> Export JSON
              </button>
              <label className="vm-popout-item" style={{ cursor: 'pointer' }}>
                <Upload size={14} /> Import JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    loadProject(e);
                    setActionsMenuOpen(false);
                  }}
                  style={{ display: 'none' }}
                />
              </label>
              <div className="vm-popout-divider" />
              <button
                className="vm-popout-item"
                onClick={() => {
                  exportGLB();
                  setActionsMenuOpen(false);
                }}
              >
                <Box size={14} /> 3D Export
              </button>
            </div>
          )}
        </div>

        {/* Unified stats overlay */}
        <UnifiedStatsPanel
          vesselState={vesselState}
          sidebarOpen={ui.sidebarOpen}
          showCoverage={ui.showStatsCoverage}
          showWallLoss={ui.showStatsWallLoss}
          showScanCoverage={ui.showStatsScanCoverage}
          onUpdateCoverageTargets={handleUpdateCoverageTargets}
        />

        {/* Inspection mode overlay (right-side panel + camera lock indicator) */}
        {ui.inspectingAnnotationId !== null &&
          (() => {
            const ann = vesselState.annotations.find((a) => a.id === ui.inspectingAnnotationId);
            if (!ann) return null;
            return (
              <>
                <div className="vm-camera-lock-indicator">
                  <Lock size={14} /> Inspection Mode
                </div>
                <InspectionPanel
                  annotation={ann}
                  vesselState={vesselState}
                  onClose={exitInspectionMode}
                  onCycleToAnnotation={cycleInspection}
                  onToggleStatLine={toggleStatLine}
                  visibleStatLines={visibleStatLines}
                  thicknessThresholds={vesselState.thicknessThresholds}
                  onUpdateThicknessThresholds={updateThicknessThresholds}
                  onCaptureViewport={captureViewport}
                  onUploadImage={uploadImage}
                  onDeleteAttachment={deleteAttachment}
                  getImageUrl={getAnnotationImageUrl}
                  onSaveScanImages={saveScanImages}
                  onClearScanImages={clearScanImages}
                  projectImages={projectImages}
                />
                {ann.thicknessStats && (
                  <>
                    {visibleStatLines.min && (
                      <StatLeaderOverlay
                        hoveredStat="min"
                        annotation={ann}
                        vesselState={vesselState}
                        cameraRef={{ current: viewportRef.current?.getCamera() ?? null }}
                        containerRef={viewportContainerRef}
                      />
                    )}
                    {visibleStatLines.max && (
                      <StatLeaderOverlay
                        hoveredStat="max"
                        annotation={ann}
                        vesselState={vesselState}
                        cameraRef={{ current: viewportRef.current?.getCamera() ?? null }}
                        containerRef={viewportContainerRef}
                      />
                    )}
                  </>
                )}
              </>
            );
          })()}

        {/* Interaction hint / scan hover readout — fixed mode */}
        {!ui.scanTooltipFollow && ui.hoverData && ui.hoverData.thickness !== null ? (
          <div className="vm-hint vm-hint--scan">
            <div className="vm-scan-tooltip">
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">Thickness</span>
                <span className="vm-scan-tooltip-number primary">
                  {ui.hoverData.thickness.toFixed(2)}
                  <span className="vm-scan-tooltip-unit">mm</span>
                </span>
              </div>
              <div className="vm-scan-tooltip-divider" />
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">Scan</span>
                <span className="vm-scan-tooltip-number">
                  {ui.hoverData.scanMm.toFixed(1)}
                  <span className="vm-scan-tooltip-unit">mm</span>
                </span>
              </div>
              <div className="vm-scan-tooltip-divider" />
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">Index</span>
                <span className="vm-scan-tooltip-number">
                  {ui.hoverData.indexMm.toFixed(1)}
                  <span className="vm-scan-tooltip-unit">mm</span>
                </span>
              </div>
            </div>
          </div>
        ) : !ui.scanTooltipFollow && domeScanHoverInfo ? (
          <div className="vm-hint vm-hint--scan">
            <div className="vm-scan-tooltip">
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">Thickness</span>
                <span className="vm-scan-tooltip-number primary">
                  {domeScanHoverInfo.thickness?.toFixed(1) ?? '—'}
                  <span className="vm-scan-tooltip-unit">mm</span>
                </span>
              </div>
              <div className="vm-scan-tooltip-divider" />
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">{'φ'}</span>
                <span className="vm-scan-tooltip-number">
                  {domeScanHoverInfo.phiDeg.toFixed(1)}
                  <span className="vm-scan-tooltip-unit">{'°'}</span>
                </span>
              </div>
              <div className="vm-scan-tooltip-divider" />
              <div className="vm-scan-tooltip-value">
                <span className="vm-scan-tooltip-label">{'θ'}</span>
                <span className="vm-scan-tooltip-number">
                  {domeScanHoverInfo.thetaDeg.toFixed(1)}
                  <span className="vm-scan-tooltip-unit">{'°'}</span>
                </span>
              </div>
            </div>
          </div>
        ) : getHintText() ? (
          <div className="vm-hint">{getHintText()}</div>
        ) : null}

        {/* Loading overlay (placeholder for future use) */}
      </div>

      {/* Status bar */}
      <StatusBar vesselState={vesselState} />

      {/* Drawing Import Modal */}
      {ui.showDrawingImport && (
        <Suspense fallback={null}>
          <DrawingImportModal
            isOpen={ui.showDrawingImport}
            onClose={() => dispatch({ type: 'SET_SHOW_DRAWING_IMPORT', show: false })}
            onApply={handleDrawingApply}
          />
        </Suspense>
      )}

      {/* Inspection Image Viewer Modal */}
      {ui.viewingInspectionImageId >= 0 &&
        (() => {
          const viewImg = vesselState.inspectionImages.find(
            (i) => i.id === ui.viewingInspectionImageId
          );
          if (!viewImg) return null;
          return (
            <Suspense fallback={null}>
              <InspectionImageViewer
                image={viewImg}
                onClose={() => dispatch({ type: 'SET_VIEWING_INSPECTION_IMAGE', id: -1 })}
                onUpdate={updateInspectionImage}
              />
            </Suspense>
          );
        })()}

      {/* Project picker modal (save or load) */}
      {pickerMode && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <div
            style={{
              background: '#1e1e2e',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: 24,
              minWidth: 340,
              maxWidth: 400,
            }}
          >
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginBottom: 16 }}>
              {pickerMode === 'save' ? 'Save as New Model' : 'Load from Project'}
            </div>

            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'rgba(255,255,255,0.6)',
                marginBottom: 6,
              }}
            >
              Project
            </label>
            <select
              value={pickerProjectId ?? ''}
              onChange={(e) => {
                setPickerProjectId(e.target.value || null);
                setPickerVesselId(null);
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                marginBottom: 14,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            >
              <option value="">Select a project...</option>
              {(projectList ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'rgba(255,255,255,0.6)',
                marginBottom: 6,
              }}
            >
              Vessel
            </label>
            <select
              value={pickerVesselId ?? ''}
              onChange={(e) => setPickerVesselId(e.target.value || null)}
              disabled={!pickerProjectId}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                marginBottom: 14,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
                fontSize: '0.85rem',
                opacity: pickerProjectId ? 1 : 0.4,
              }}
            >
              <option value="">Select a vessel...</option>
              {(pickerVessels ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vessel_name}
                </option>
              ))}
            </select>

            {pickerMode === 'save' && (
              <>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'rgba(255,255,255,0.6)',
                    marginBottom: 6,
                  }}
                >
                  Model Type
                </label>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginBottom: saveModelType === 'other' ? 8 : 20,
                  }}
                >
                  {[
                    { value: 'blank', label: 'Blank' },
                    { value: 'coverage', label: 'Coverage' },
                    { value: 'scan_overlayed', label: 'Scan Overlayed' },
                    { value: 'fully_annotated', label: 'Fully Annotated' },
                    { value: 'other', label: 'Other' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        color: saveModelType === opt.value ? '#fff' : 'rgba(255,255,255,0.5)',
                        background:
                          saveModelType === opt.value
                            ? 'rgba(59,130,246,0.25)'
                            : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${saveModelType === opt.value ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      <input
                        type="radio"
                        name="modelType"
                        value={opt.value}
                        checked={saveModelType === opt.value}
                        onChange={() => setSaveModelType(opt.value)}
                        style={{ display: 'none' }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {saveModelType === 'other' && (
                  <input
                    type="text"
                    placeholder="Describe model type..."
                    value={saveModelTypeCustom}
                    onChange={(e) => setSaveModelTypeCustom(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      marginBottom: 20,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                    }}
                  />
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setPickerMode(null);
                  setPickerProjectId(null);
                  setPickerVesselId(null);
                  setSaveModelType('blank');
                  setSaveModelTypeCustom('');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (pickerMode === 'save') saveAsNewToProject();
                  else if (pickerVesselId) loadFromProject(pickerVesselId);
                }}
                disabled={!pickerVesselId || (pickerMode === 'save' && saveStatus === 'saving')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: pickerVesselId ? '#3b82f6' : 'rgba(59,130,246,0.3)',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: pickerVesselId ? 'pointer' : 'not-allowed',
                }}
              >
                {pickerMode === 'save'
                  ? saveStatus === 'saving'
                    ? 'Saving...'
                    : 'Save as New'
                  : 'Load'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
