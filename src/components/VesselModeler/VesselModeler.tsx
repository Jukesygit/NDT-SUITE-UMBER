import {
  useState,
  useReducer,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  lazy,
  Suspense,
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
  Layers,
  Eye,
  EyeOff,
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
  type MeasurementConfig,
  type DomeScanHoverInfo,
  type ThicknessThresholds,
  type WallLossGroupConfig,
  type CoverageTargets,
  type CameraBookmark,
} from './types';
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
import { useVesselPersistence } from './hooks/useVesselPersistence';
import { useViewportCallbacks } from './hooks/useViewportCallbacks';
import { useViewportDnD } from './hooks/useViewportDnD';
import { useInspectionMode } from './hooks/useInspectionMode';
import { useReportGeneration } from './hooks/useReportGeneration';
import { useDrawingApply } from './hooks/useDrawingApply';
import { useTextureRehydration } from './useTextureRehydration';
import { useScanCompositeList } from '../../hooks/queries/useScanComposites';
import { useLinkScanCompositeToProject } from '../../hooks/mutations/useScanCompositeMutations';
import { resolveAnnotationAttachmentUrl } from '../../services/annotation-attachment-service';
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
import './vessel-modeler.css';
import * as THREE from 'three';

import StatsDropdown from './StatsDropdown';
import HistoryDropdown from './HistoryDropdown';
import BookmarksDropdown from './BookmarksDropdown';
import ClipPlanesControl from './ClipPlanesControl';
import ViewCube from './ViewCube';
import OutlinerPanel from './OutlinerPanel';
import CommandPalette from './CommandPalette';
import type { LayerKey, OutlinerToggleRef } from './outliner-tree';
import {
  categoryLayerPatch,
  isCategoryVisibleAnywhere,
  isLayerVisible,
  layerKey,
  MAIN_BODY_KEY,
} from './engine/layer-visibility';
import { buildPaletteItems, type PaletteAction } from './engine/palette-registry';
import { frameEntityPose, type FrameEntityRef } from './engine/frame-entity';
import { canonicalPose, type CanonicalViewId } from './engine/canonical-views';
import { computeVesselBounds } from './engine/report-image-capture';
import UnifiedStatsPanel from './UnifiedStatsPanel';
import SnapControl from './SnapControl';
import InspectionPanel from './sidebar/InspectionPanel';
import StatLeaderOverlay from './StatLeaderOverlay';
import { PipePartPopup } from './sidebar/PipePartPopup';
import { animateCamera } from './engine/camera-animation';
import { nextBookmarkId } from './engine/canonical-views';

import { downloadScreenshot } from './engine/screenshot-renderer';
import { captureViewportScreenshot } from './engine/viewport-screenshot';
import { hasReliefGrid } from './engine/composite-relief-adapter';

const DrawingImportModal = lazy(() => import('./DrawingImportModal'));
const InspectionImageViewer = lazy(() => import('./InspectionImageViewer'));
const FlattenedViewport = lazy(() => import('./FlattenedView/FlattenedViewport'));
const ReliefViewportPane = lazy(() => import('./ReliefViewportPane'));

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

  // Fetch specific model by ID, or fall back to latest model for the vessel
  const { data: specificModel, isLoading: specificModelLoading } = useVesselModel(
    modelIdParam ?? undefined
  );
  const { data: latestModel, isLoading: latestModelLoading } = useVesselModelByProjectVessel(
    modelIdParam ? null : projectVesselId
  );
  const linkedModel = specificModel ?? latestModel;
  const linkedModelLoading = specificModelLoading || latestModelLoading;

  // Save-to-project mutations (threaded into useVesselPersistence)
  const saveModelMutation = useSaveVesselModel();
  const updateModelMutation = useUpdateVesselModel();
  const { data: projectList } = useProjectList();

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
  const bumpTextureObjectsVersion = useCallback(() => setTextureObjectsVersion((v) => v + 1), []);
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

  // --- Report generation (T2-D / D4) ---
  // handleGenerateReport + the shared captureReportAssets now live in
  // useReportGeneration. captureReportAssets must be defined before
  // useVesselPersistence (which threads it in) so the hook is called here; the
  // save flows keep attaching reportAssets exactly as before.
  const { captureReportAssets, handleGenerateReport } = useReportGeneration({
    vesselState,
    viewportRef,
    flattenedViewportRef,
  });

  // --- Persistence (T2-D / D2): local/cloud save + load, project picker, GLB
  // export, and the linked-model bootstrap. captureReportAssets is threaded in
  // (report-coupled, owned by useReportGeneration); the save flows keep attaching
  // reportAssets exactly as before. vesselModelIdRef lives in the hook and is
  // returned so the component can still derive vesselModelId and gate the toolbar
  // Save button.
  const {
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
    effectiveProjectVesselId,
    vesselModelIdRef,
    saveProject,
    saveToProject,
    saveAsNewToProject,
    exportGLB,
    loadProject,
    loadFromProject,
  } = useVesselPersistence({
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
  });

  // Effective model id used for annotation attachment paths (regenerated per
  // render until a cloud model is loaded/saved — preserves prior behavior).
  const vesselModelId = vesselModelIdRef.current ?? `local-${crypto.randomUUID()}`;

  // Picker-dependent project queries (depend on the hook-owned picker/effective ids)
  const { data: pickerVessels } = useProjectVessels(pickerProjectId ?? undefined);
  const { data: projectImages } = useProjectImages(effectiveProjectVesselId ?? undefined);

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

  // --- Helper: dispatch vessel update via functional updater ---
  // Domain wrappers pass a derived history key (see historyFor) so continuous
  // edits coalesce; opaque callers omit it and get a discrete undo entry.
  const updateVessel = useCallback(
    (updater: (prev: VesselState) => VesselState, history?: HistoryControl) => {
      dispatch({ type: 'UPDATE_VESSEL_FN', updater, history });
    },
    []
  );

  // --- Camera bookmarks (C12) — config one-off handlers, inline by design.
  // Camera state itself is never serialized; only the bookmark poses are, in the
  // vessel slice, so add/rename/delete are undoable with discrete history labels.
  const handleSaveBookmark = useCallback(() => {
    const camera = viewportRef.current?.getCamera();
    const controls = viewportRef.current?.getControls();
    if (!camera || !controls) return;
    const position = camera.position.toArray() as [number, number, number];
    const target = (controls.target as THREE.Vector3).toArray() as [number, number, number];
    updateVessel(
      (prev) => {
        const existing = prev.cameraBookmarks ?? [];
        const bookmark: CameraBookmark = {
          id: nextBookmarkId(existing),
          name: `View ${existing.length + 1}`,
          position,
          target,
        };
        return { ...prev, cameraBookmarks: [...existing, bookmark] };
      },
      { at: Date.now(), label: 'Add bookmark' }
    );
  }, [updateVessel]);

  const handleRecallBookmark = useCallback((bookmark: CameraBookmark) => {
    const camera = viewportRef.current?.getCamera();
    const controls = viewportRef.current?.getControls();
    if (!camera || !controls) return;
    animateCamera(
      camera,
      controls,
      new THREE.Vector3(...bookmark.position),
      new THREE.Vector3(...bookmark.target),
      400
    );
  }, []);

  const handleRenameBookmark = useCallback(
    (id: string, name: string) => {
      updateVessel(
        (prev) => ({
          ...prev,
          cameraBookmarks: (prev.cameraBookmarks ?? []).map((b) =>
            b.id === id ? { ...b, name } : b
          ),
        }),
        { at: Date.now(), label: 'Rename bookmark' }
      );
    },
    [updateVessel]
  );

  const handleDeleteBookmark = useCallback(
    (id: string) => {
      updateVessel(
        (prev) => ({
          ...prev,
          cameraBookmarks: (prev.cameraBookmarks ?? []).filter((b) => b.id !== id),
        }),
        { at: Date.now(), label: 'Delete bookmark' }
      );
    },
    [updateVessel]
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
  const { addNozzle, updateNozzle, removeNozzle, toggleNozzleVisible } = useNozzleActions({
    updateVessel,
    dispatch,
    nozzles: vesselState.nozzles,
  });

  const { addAppendage, updateAppendage, removeAppendage, toggleAppendageVisible } =
    useAppendageActions({
      updateVessel,
      dispatch,
      appendages: vesselState.appendages,
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
    togglePipelineVisible,
  } = usePipingActions({
    updateVessel,
    dispatch,
    nozzles: vesselState.nozzles,
    pipelines: vesselState.pipelines,
  });

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
    toggleSaddleVisible,
    toggleLugVisible,
    toggleWeldVisible,
  } = useAttachableActions({
    updateVessel,
    dispatch,
    saddles: vesselState.saddles,
    liftingLugs: vesselState.liftingLugs,
    welds: vesselState.welds,
  });

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
    toggleTextureVisible,
    toggleCoverageRectVisible,
    toggleRulerVisible,
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
    textures: vesselState.textures,
    coverageRects: vesselState.coverageRects,
    rulers: vesselState.rulers,
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
    toggleScanCompositeVisible,
    toggleDomeScanVisible,
  } = useScanActions({
    updateVessel,
    dispatch,
    scanCompositeId: selection.scanCompositeId,
    domeScanId: selection.domeScanId,
    scanComposites: vesselState.scanComposites,
    domeScanComposites: vesselState.domeScanComposites,
    effectiveProjectVesselId,
    linkCompositeToProject,
  });

  // Outliner Eye toggles route here — one descriptor → its owning D1 toggle
  // callback. Visual only; stats/coverage/wall-loss never read `visible`.
  const handleOutlinerToggleVisible = useCallback(
    (ref: OutlinerToggleRef) => {
      switch (ref.kind) {
        case 'nozzle':
          toggleNozzleVisible(ref.index);
          break;
        case 'weld':
          toggleWeldVisible(ref.index);
          break;
        case 'lug':
          toggleLugVisible(ref.index);
          break;
        case 'saddle':
          toggleSaddleVisible(ref.index);
          break;
        case 'appendage':
          toggleAppendageVisible(ref.index);
          break;
        case 'texture':
          toggleTextureVisible(ref.id);
          break;
        case 'ruler':
          toggleRulerVisible(ref.id);
          break;
        case 'coverageRect':
          toggleCoverageRectVisible(ref.id);
          break;
        case 'inspectionImage':
          toggleInspectionImageVisible(ref.id);
          break;
        case 'annotation':
          toggleAnnotationVisible(ref.id);
          break;
        case 'scanComposite':
          toggleScanCompositeVisible(ref.id);
          break;
        case 'domeScan':
          toggleDomeScanVisible(ref.id);
          break;
        case 'pipeline':
          togglePipelineVisible(ref.id);
          break;
      }
    },
    [
      toggleNozzleVisible,
      toggleWeldVisible,
      toggleLugVisible,
      toggleSaddleVisible,
      toggleAppendageVisible,
      toggleTextureVisible,
      toggleRulerVisible,
      toggleCoverageRectVisible,
      toggleInspectionImageVisible,
      toggleAnnotationVisible,
      toggleScanCompositeVisible,
      toggleDomeScanVisible,
      togglePipelineVisible,
    ]
  );

  // --- Layers (transient `ui.layers`; ABSENT key ⇒ visible) ------------------
  // Every body that can own a layer: the main shell plus each boot.
  const layerBodyKeys = useMemo(
    () => [MAIN_BODY_KEY, ...vesselState.appendages.map((a) => a.id)],
    [vesselState.appendages]
  );

  /** Panel eye: flip exactly one body's slice of one category. */
  const handleToggleLayer = useCallback(
    (bodyKey: string, categoryKey: LayerKey) => {
      dispatch({
        type: 'SET_LAYERS',
        layers: {
          [layerKey(bodyKey, categoryKey)]: !isLayerVisible(ui.layers, bodyKey, categoryKey),
        },
      });
    },
    [ui.layers]
  );

  /** Master toggle: any body still showing → hide everywhere, else show everywhere. */
  const toggleCategoryLayerEverywhere = useCallback(
    (categoryKey: LayerKey) => {
      const anyVisible = isCategoryVisibleAnywhere(ui.layers, layerBodyKeys, categoryKey);
      dispatch({
        type: 'SET_LAYERS',
        layers: categoryLayerPatch(layerBodyKeys, categoryKey, !anyVisible),
      });
    },
    [ui.layers, layerBodyKeys]
  );

  const coverageLayerVisible = isCategoryVisibleAnywhere(ui.layers, layerBodyKeys, 'coverage');

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

  // Coverage targets are undoable VESSEL state (never transient ui). The optional
  // featureKey/field make the coalesce key per-feature-per-field
  // (`coverageTargets:<featureKey>:<field>`), so typing into the Shell's Scoped
  // box collapses into ONE undo entry without swallowing an edit to another
  // feature. Callers that replace the whole map wholesale keep the legacy key.
  const handleUpdateCoverageTargets = useCallback(
    (targets: CoverageTargets | undefined, featureKey?: string, field?: string) => {
      updateVessel(
        (prev) => ({ ...prev, coverageTargets: targets }),
        featureKey
          ? {
              key: `coverageTargets:${featureKey}:${field ?? ''}`,
              at: Date.now(),
              label: `Edit coverage target ${featureKey}`,
            }
          : historyFor('coverageTargets', '', targets ?? {})
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

  // --- Topo (relief) viewport: resolve the ACTIVE composite (R4) ---
  // The selected composite if it carries a thickness grid, else the first
  // confirmed composite with a grid, else any composite with a grid. Selecting a
  // different composite in the sidebar switches the rendered surface live (the
  // pane is keyed on the composite id). Null ⇒ nothing to show ⇒ Topo disabled.
  const activeTopoComposite = useMemo(() => {
    const composites = vesselState.scanComposites;
    const selected = composites.find((c) => c.id === selection.scanCompositeId);
    if (selected && hasReliefGrid(selected)) return selected;
    const withGrid = composites.filter(hasReliefGrid);
    return withGrid.find((c) => c.orientationConfirmed) ?? withGrid[0] ?? null;
  }, [vesselState.scanComposites, selection.scanCompositeId]);
  const topoEnabled = activeTopoComposite != null;

  // --- Command palette (C14) ---
  // Registry rebuilt only when the document or Topo availability changes (not on
  // hover/orbit re-renders). Consumed solely by CommandPalette (no scene effect).
  const paletteItems = useMemo(
    () => buildPaletteItems(vesselState, { topoEnabled }),
    [vesselState, topoEnabled]
  );

  // A canonical-view / entity-frame flight that must wait for the 3D viewport to
  // (re)mount when the palette was invoked from 2D/Topo. Held off React state.
  const pendingFlightRef = useRef<{ view: CanonicalViewId } | { frame: FrameEntityRef } | null>(
    null
  );

  const flyToPose = useCallback(
    (pose: { position: THREE.Vector3; target: THREE.Vector3 } | null) => {
      if (!pose) return;
      const camera = viewportRef.current?.getCamera();
      const controls = viewportRef.current?.getControls();
      if (!camera || !controls) return;
      animateCamera(camera, controls, pose.position, pose.target, 400);
    },
    []
  );

  // Canonical-view pose using the SAME bounds source ViewCube uses.
  const resolveViewPose = useCallback(
    (view: CanonicalViewId) => {
      const handle = viewportRef.current;
      const camera = handle?.getCamera();
      if (!handle || !camera) return null;
      const boundsTarget = handle.getSceneManager()?.getVesselGroup() ?? handle.getScene();
      if (!boundsTarget) return null;
      return canonicalPose(view, vesselState, computeVesselBounds(boundsTarget));
    },
    [vesselState]
  );

  const resolveFramePose = useCallback(
    (frame: FrameEntityRef) => {
      const camera = viewportRef.current?.getCamera();
      if (!camera) return null;
      return frameEntityPose(frame, vesselState, camera);
    },
    [vesselState]
  );

  // Run a deferred flight once the viewport is back in 3D and mounted.
  useEffect(() => {
    if (ui.viewMode !== '3d') return;
    const pending = pendingFlightRef.current;
    if (!pending) return;
    const raf = requestAnimationFrame(() => {
      pendingFlightRef.current = null;
      flyToPose(
        'view' in pending ? resolveViewPose(pending.view) : resolveFramePose(pending.frame)
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [ui.viewMode, resolveViewPose, resolveFramePose, flyToPose]);

  // Execute one palette descriptor: dispatch the state change and, where a camera
  // move is implied, fly there (deferring past a 2D/Topo→3D switch if needed).
  const handlePaletteAction = useCallback(
    (action: PaletteAction) => {
      dispatch({ type: 'SET_PALETTE_OPEN', open: false });

      if ('select' in action) {
        dispatch(action.select);
        if (action.frame) {
          if (ui.viewMode !== '3d') {
            pendingFlightRef.current = { frame: action.frame };
            dispatch({ type: 'SET_VIEW_MODE', mode: '3d' });
          } else {
            flyToPose(resolveFramePose(action.frame));
          }
        }
        return;
      }
      if ('view' in action) {
        if (ui.viewMode !== '3d') {
          pendingFlightRef.current = { view: action.view };
          dispatch({ type: 'SET_VIEW_MODE', mode: '3d' });
        } else {
          flyToPose(resolveViewPose(action.view));
        }
        return;
      }
      if ('bookmark' in action) {
        const bm = (vesselState.cameraBookmarks ?? []).find((b) => b.id === action.bookmark);
        if (!bm) return;
        if (ui.viewMode !== '3d') {
          dispatch({ type: 'SET_VIEW_MODE', mode: '3d' });
          requestAnimationFrame(() => requestAnimationFrame(() => handleRecallBookmark(bm)));
        } else {
          handleRecallBookmark(bm);
        }
        return;
      }
      if ('toggle' in action) {
        switch (action.toggle) {
          case 'snap':
            dispatch({ type: 'TOGGLE_SNAP' });
            break;
          case 'tidy':
            dispatch({ type: 'TOGGLE_LABELS_TIDIED' });
            break;
          case 'outliner':
            dispatch({ type: 'TOGGLE_OUTLINER' });
            break;
          case 'statsCoverage':
            dispatch({ type: 'TOGGLE_STATS_COVERAGE' });
            break;
          case 'statsWallLoss':
            dispatch({ type: 'TOGGLE_STATS_WALL_LOSS' });
            break;
          default:
            // `layer:<category>` — the palette has no body context, so it flips
            // the category across every body (the panel is the per-body surface).
            toggleCategoryLayerEverywhere(action.toggle.slice('layer:'.length) as LayerKey);
            break;
        }
        return;
      }
      if ('viewMode' in action) {
        dispatch({ type: 'SET_VIEW_MODE', mode: action.viewMode });
        return;
      }
      if ('undo' in action) {
        dispatch({ type: 'UNDO' });
        return;
      }
      if ('redo' in action) {
        dispatch({ type: 'REDO' });
      }
    },
    [
      ui.viewMode,
      vesselState,
      flyToPose,
      resolveFramePose,
      resolveViewPose,
      handleRecallBookmark,
      toggleCategoryLayerEverywhere,
    ]
  );

  // --- Interaction callbacks (from Three.js viewport) — T2-D / D3 ---
  // Assembly moved verbatim into useViewportCallbacks; it composes the D1 entity
  // callbacks + dispatch/setters threaded below. The hook returns a FRESH object
  // per render (no memo) exactly as the inline literal did, so ThreeViewport's
  // `callbacks` prop identity churns identically — re-render cadence is unchanged.
  const vesselCallbacks = useViewportCallbacks({
    vesselState,
    dispatch,
    updateAppendage,
    addAnnotation,
    updateAnnotation,
    getNextAnnotationId,
    addRuler,
    getNextRulerId,
    addCoverageRect,
    updateCoverageRect,
    getNextCoverageRectId,
    updateInspectionImage,
    updateWeld,
    updateNozzle,
    updateSaddle,
    updateLug,
    updateTexture,
    handleUpdateScanComposite,
    handleUpdateDomeScan,
    cursorTooltipRef,
    setDomeScanHoverInfo,
    setPipePartPopup,
  });

  // --- Drawing import apply handler (T2-D / D4) ---
  // Body moved verbatim into useDrawingApply; validateVesselState is threaded in
  // (it stays in the component for the persistence load path). Dep array and the
  // window.confirm pipeline-drop guard are preserved.
  const { handleDrawingApply } = useDrawingApply({
    updateVessel,
    dispatch,
    vesselState,
    validateVesselState,
  });

  // --- Inspection mode navigation (T2-D / D4) ---
  // enter/exit/cycle + the sidebar annotation click and the min/max stat-line
  // overlay state all live in useInspectionMode. The two ui-derived values are
  // threaded in by identical name so the moved callbacks keep their exact
  // dependency arrays and camera choreography verbatim. enterInspectionMode is
  // consumed only inside the hook (by the sidebar click) so it is not returned.
  const {
    visibleStatLines,
    toggleStatLine,
    exitInspectionMode,
    cycleInspection,
    handleSidebarAnnotationSelect,
  } = useInspectionMode({
    vesselState,
    dispatch,
    viewportRef,
    inspectingAnnotationId: ui.inspectingAnnotationId,
    uiSavedCameraState: ui.savedCameraState,
  });

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
      // Coverage-layer master — same any-visible → hide-all behaviour as the
      // toolbar button. Plain Shift (no Ctrl/Cmd) so it can't shadow a browser
      // binding; nothing else in the modeler claims C.
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && key === 'c') {
        e.preventDefault();
        toggleCategoryLayerEverywhere('coverage');
        return;
      }
      // Command palette (Ctrl/Cmd+K, Ctrl/Cmd+P alias). preventDefault so the
      // browser's own K/P bindings (e.g. print) don't steal it.
      if ((e.ctrlKey || e.metaKey) && (key === 'k' || key === 'p')) {
        e.preventDefault();
        dispatch({ type: 'SET_PALETTE_OPEN', open: true });
        return;
      }
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
  }, [drawModeState, ui.inspectingAnnotationId, exitInspectionMode, toggleCategoryLayerEverywhere]);

  // --- Viewport drag-and-drop (T2-D / D3) ---
  // Nozzle-library / lug / weld / pipe-part drops moved verbatim into
  // useViewportDnD; handlers keep their original useCallback dep arrays so
  // identities churn identically. createDefaultSegment (usePipingActions) and
  // viewportRef are threaded in for the pipe-part atomic add + raycasts.
  const { handleDragOver, handleDrop } = useViewportDnD({
    vesselState,
    addNozzle,
    addLug,
    addWeld,
    updateVessel,
    createDefaultSegment,
    viewportRef,
  });

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
                clipConfig={ui.clip}
                layers={ui.layers}
              />
            </ErrorBoundary>
            {/* View cube — orientation indicator + canonical-view launcher (3D only) */}
            <ViewCube viewportRef={viewportRef} vesselState={vesselState} />
            {/* Layers panel (C13b outliner) — left-edge tree, 3D only, toolbar-toggled */}
            {ui.outlinerOpen && (
              <OutlinerPanel
                vesselState={vesselState}
                selection={selection}
                layers={ui.layers}
                sidebarOpen={ui.sidebarOpen}
                onClose={() => dispatch({ type: 'TOGGLE_OUTLINER' })}
                onSelect={(action) => dispatch(action)}
                onToggleVisible={handleOutlinerToggleVisible}
                onToggleLayer={handleToggleLayer}
              />
            )}
          </>
        ) : ui.viewMode === 'flattened' ? (
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
        ) : (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400 text-sm">
                Loading Topo view...
              </div>
            }
          >
            {activeTopoComposite ? (
              <ReliefViewportPane key={activeTopoComposite.id} composite={activeTopoComposite} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400 text-sm">
                No scan composite to show
              </div>
            )}
          </Suspense>
        )}

        {/* Command palette (C14) — available in every view mode (Ctrl/Cmd+K) */}
        {ui.paletteOpen && (
          <CommandPalette
            items={paletteItems}
            onExecute={handlePaletteAction}
            onClose={() => dispatch({ type: 'SET_PALETTE_OPEN', open: false })}
          />
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
            onUpdateCoverageTargets={handleUpdateCoverageTargets}
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
          {/* Undo / redo — titles name the next change on each stack */}
          <button
            className="vm-popout-trigger"
            onClick={() => dispatch({ type: 'UNDO' })}
            disabled={state.history.past.length === 0}
            title={
              state.history.past.length
                ? `Undo: ${state.history.past[state.history.past.length - 1].label}`
                : 'Undo (Ctrl+Z)'
            }
          >
            <Undo2 size={14} />
          </button>
          <button
            className="vm-popout-trigger"
            onClick={() => dispatch({ type: 'REDO' })}
            disabled={state.history.future.length === 0}
            title={
              state.history.future.length
                ? `Redo: ${state.history.future[state.history.future.length - 1].label}`
                : 'Redo (Ctrl+Y)'
            }
          >
            <Redo2 size={14} />
          </button>
          <HistoryDropdown
            past={state.history.past}
            future={state.history.future}
            onUndoTo={(index) => dispatch({ type: 'UNDO_TO', index })}
            onRedoTo={(index) => dispatch({ type: 'REDO_TO', index })}
          />
          <BookmarksDropdown
            bookmarks={vesselState.cameraBookmarks ?? []}
            onSave={handleSaveBookmark}
            onRecall={handleRecallBookmark}
            onRename={handleRenameBookmark}
            onDelete={handleDeleteBookmark}
          />
          {/* Section clip planes (C15) — transient ui.clip, never serialized */}
          <ClipPlanesControl
            clip={ui.clip}
            lengthMm={vesselState.length}
            diameterMm={vesselState.id}
            headDepthMm={
              vesselState.headRatio > 0 ? vesselState.id / (2 * vesselState.headRatio) : 0
            }
            onChange={(clip) => dispatch({ type: 'SET_CLIP', clip })}
          />
          {/* 3D / 2D / Topo toggle */}
          <div className="vm-toolbar-segmented">
            {(['3d', 'flattened', 'topo'] as const).map((mode) => {
              const label = mode === '3d' ? '3D' : mode === 'flattened' ? '2D' : 'Topo';
              const disabled = mode === 'topo' && !topoEnabled;
              return (
                <button
                  key={mode}
                  className={`vm-toolbar-segmented__btn ${ui.viewMode === mode ? 'active' : ''}`}
                  onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode })}
                  disabled={disabled}
                  title={
                    disabled
                      ? 'No confirmed scan composite with a thickness grid to show'
                      : mode === 'topo'
                        ? 'Topo — 3D relief surface of the active scan composite'
                        : undefined
                  }
                >
                  {label}
                </button>
              );
            })}
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
          {/* Layers panel toggle (C13b outliner, repurposed) */}
          <button
            className={`vm-popout-trigger ${ui.outlinerOpen ? 'vm-popout-trigger--active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_OUTLINER' })}
            title="Layers"
          >
            <Layers size={14} />
            Layers
          </button>
          {/* Coverage-layer master (Shift+C). "layer", never bare "coverage" —
              coverage is also a draw mode. */}
          <button
            className={`vm-popout-trigger ${coverageLayerVisible ? 'vm-popout-trigger--active' : ''}`}
            onClick={() => toggleCategoryLayerEverywhere('coverage')}
            title={
              coverageLayerVisible
                ? 'Hide coverage layer on all bodies (Shift+C)'
                : 'Show coverage layer on all bodies (Shift+C)'
            }
          >
            {coverageLayerVisible ? <Eye size={14} /> : <EyeOff size={14} />}
            Coverage
          </button>
          <StatsDropdown
            showCoverage={ui.showStatsCoverage}
            showWallLoss={ui.showStatsWallLoss}
            hasWallLossData={!!vesselState.wallLossGroups?.enabled}
            onToggleCoverage={() => dispatch({ type: 'TOGGLE_STATS_COVERAGE' })}
            onToggleWallLoss={() => dispatch({ type: 'TOGGLE_STATS_WALL_LOSS' })}
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
                  getImageUrl={resolveAnnotationAttachmentUrl}
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
