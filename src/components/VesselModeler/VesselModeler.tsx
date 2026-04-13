import { useState, useReducer, useRef, useCallback, useEffect, lazy, Suspense, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, Unlock, Save, Upload, RotateCcw, PanelLeftClose, PanelLeft, FileUp, Camera, AlertTriangle, MousePointer, PanelBottomClose, Box, ChevronDown, Settings2, FolderOpen } from 'lucide-react';
import ThreeViewport from './ThreeViewport';
import ErrorBoundary from '../ErrorBoundary';
import type { ThreeViewportHandle } from './ThreeViewport';
import SidebarPanel from './SidebarPanel';
import StatusBar from './StatusBar';
import {
    DEFAULT_VESSEL_STATE,
    type VesselState,
    type NozzleConfig,
    type SaddleConfig,
    type TextureConfig,
    type LiftingLugConfig,
    type AnnotationShapeConfig,
    type AnnotationShapeType,
    type CoverageRectConfig,
    type RulerConfig,
    type InspectionImageConfig,
    type MeasurementConfig,
    type VesselCallbacks,
    type WeldConfig,
    type ScanCompositeConfig,
    type ThicknessThresholds,
    type Pipeline,
    type PipeSegment,
    type PipeSegmentType,
    findClosestPipeSize,
    PIPE_SIZES,
} from './types';
import type { ExtractionResult } from './engine/drawing-parser';
import { loadTextureFromData, clearHeatmapCache } from './engine/texture-manager';
import { exportVesselGLB } from './engine/gltf-export';
import { recomputeAllAnnotationStats } from './engine/annotation-stats';
import { computeInspectionCameraTarget, animateCamera, cancelCameraAnimation } from './engine/camera-animation';
import { useScanCompositeList } from '../../hooks/queries/useScanComposites';
import { getScanComposite } from '../../services/scan-composite-service';
import { uploadAnnotationImage, deleteAnnotationImage, getAnnotationImageUrl } from '../../services/annotation-attachment-service';
import { useAuth } from '../../contexts/AuthContext';
import './vessel-modeler.css';
import * as THREE from 'three';

import CoveragePanel from './CoveragePanel';
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

const DrawingImportModal = lazy(() => import('./DrawingImportModal'));
const ScreenshotMode = lazy(() => import('./ScreenshotMode'));
const InspectionImageViewer = lazy(() => import('./InspectionImageViewer'));
const FlattenedViewport = lazy(() => import('./FlattenedView/FlattenedViewport'));

/** Guess the NDE source filename from a composite/CSV name.
 *  Strips common suffixes like _extracted, _cscan, .csv and adds *.nde wildcard pattern. */
function guessNdeFilename(name: string): string | undefined {
    if (!name) return undefined;
    // Remove file extension and common suffixes
    const cleaned = name.replace(/\.(csv|txt)$/i, '').replace(/[_-](extracted|cscan|export)$/i, '');
    // Replace underscores with spaces for NDE filename matching
    return cleaned.replace(/_/g, ' ').trim() || undefined;
}

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
        nozzles: state.nozzles.map(n => ({
            ...n,
            pos: clamp(n.pos, -HEAD_DEPTH, length + HEAD_DEPTH),
            angle: ((n.angle % 360) + 360) % 360,
        })),
    };
}

// ---------------------------------------------------------------------------
// Consolidated state & reducer
// ---------------------------------------------------------------------------

interface SelectionState {
    nozzleIndex: number;
    saddleIndex: number;
    textureId: number;
    lugIndex: number;
    annotationId: number;
    rulerId: number;
    weldIndex: number;
    coverageRectId: number;
    inspectionImageId: number;
    scanCompositeId: string;
    pipelineId: string;
    pipeSegmentIdx: number;
}

interface LocksState {
    nozzles: boolean;
    saddles: boolean;
    textures: boolean;
    lugs: boolean;
    welds: boolean;
    pipelines: boolean;
}

interface DrawModeState {
    annotation: AnnotationShapeType | null;
    coverage: boolean;
    ruler: boolean;
}

interface PreviewsState {
    annotation: AnnotationShapeConfig | null;
    coverageRect: CoverageRectConfig | null;
    ruler: RulerConfig | null;
}

interface UIState {
    sidebarOpen: boolean;
    showDrawingImport: boolean;
    showScreenshotMode: boolean;
    viewingInspectionImageId: number;
    viewMode: '3d' | 'flattened';
    hoverData: { thickness: number | null; scanMm: number; indexMm: number } | null;
    scanTooltipFollow: boolean;
    /** ID of annotation being inspected (null = not in inspection mode) */
    inspectingAnnotationId: number | null;
    /** Camera state saved before entering inspection mode */
    savedCameraState: {
        position: [number, number, number];
        target: [number, number, number];
    } | null;
}

interface VesselModelerState {
    vessel: VesselState;
    selection: SelectionState;
    locks: LocksState;
    drawMode: DrawModeState;
    previews: PreviewsState;
    ui: UIState;
}

const DESELECTED: SelectionState = {
    nozzleIndex: -1,
    saddleIndex: -1,
    textureId: -1,
    lugIndex: -1,
    annotationId: -1,
    rulerId: -1,
    weldIndex: -1,
    coverageRectId: -1,
    inspectionImageId: -1,
    scanCompositeId: '',
    pipelineId: '',
    pipeSegmentIdx: -1,
};

const INITIAL_STATE: VesselModelerState = {
    vessel: { ...DEFAULT_VESSEL_STATE },
    selection: { ...DESELECTED },
    locks: { nozzles: false, saddles: false, textures: false, lugs: false, welds: false, pipelines: false },
    drawMode: { annotation: null, coverage: false, ruler: false },
    previews: { annotation: null, coverageRect: null, ruler: null },
    ui: {
        sidebarOpen: true,
        showDrawingImport: false,
        showScreenshotMode: false,
        viewingInspectionImageId: -1,
        hoverData: null,
        scanTooltipFollow: false,
        inspectingAnnotationId: null,
        savedCameraState: null,
        viewMode: '3d',
    },
};

type VesselAction =
    | { type: 'SET_VESSEL'; vessel: VesselState }
    | { type: 'UPDATE_VESSEL_FN'; updater: (prev: VesselState) => VesselState }
    | { type: 'SELECT_NOZZLE'; index: number }
    | { type: 'SELECT_SADDLE'; index: number }
    | { type: 'SELECT_TEXTURE'; id: number }
    | { type: 'SELECT_LUG'; index: number }
    | { type: 'SELECT_ANNOTATION'; id: number }
    | { type: 'SELECT_RULER'; id: number }
    | { type: 'SELECT_WELD'; index: number }
    | { type: 'SELECT_COVERAGE_RECT'; id: number }
    | { type: 'SELECT_INSPECTION_IMAGE'; id: number }
    | { type: 'SELECT_SCAN_COMPOSITE'; id: string }
    | { type: 'SELECT_PIPE_SEGMENT'; pipelineId: string; segmentIndex: number }
    | { type: 'DESELECT_ALL' }
    | { type: 'TOGGLE_LOCK'; key: keyof LocksState }
    | { type: 'SET_DRAW_MODE_ANNOTATION'; mode: AnnotationShapeType | null }
    | { type: 'SET_DRAW_MODE_COVERAGE'; active: boolean }
    | { type: 'SET_DRAW_MODE_RULER'; active: boolean }
    | { type: 'SET_PREVIEW_ANNOTATION'; preview: AnnotationShapeConfig | null }
    | { type: 'SET_PREVIEW_COVERAGE_RECT'; preview: CoverageRectConfig | null }
    | { type: 'SET_PREVIEW_RULER'; preview: RulerConfig | null }
    | { type: 'SET_SIDEBAR_OPEN'; open: boolean }
    | { type: 'TOGGLE_SIDEBAR' }
    | { type: 'SET_SHOW_DRAWING_IMPORT'; show: boolean }
    | { type: 'SET_SHOW_SCREENSHOT_MODE'; show: boolean }
    | { type: 'SET_VIEWING_INSPECTION_IMAGE'; id: number }
    | { type: 'SET_HOVER_DATA'; data: UIState['hoverData'] }
    | { type: 'TOGGLE_SCAN_TOOLTIP_FOLLOW' }
    | { type: 'CANCEL_ALL_DRAW_MODES' }
    | { type: 'UPDATE_THICKNESS_THRESHOLDS'; thresholds: VesselState['thicknessThresholds'] }
    | { type: 'ENTER_INSPECTION_MODE'; annotationId: number; cameraState: { position: [number, number, number]; target: [number, number, number] } }
    | { type: 'CYCLE_INSPECTION'; annotationId: number }
    | { type: 'EXIT_INSPECTION_MODE' }
    | { type: 'SET_VIEW_MODE'; mode: '3d' | 'flattened' };

function vesselReducer(state: VesselModelerState, action: VesselAction): VesselModelerState {
    switch (action.type) {
        case 'SET_VESSEL':
            return { ...state, vessel: action.vessel };
        case 'UPDATE_VESSEL_FN':
            return { ...state, vessel: action.updater(state.vessel) };
        case 'SELECT_NOZZLE':
            return { ...state, selection: { ...DESELECTED, nozzleIndex: action.index } };
        case 'SELECT_SADDLE':
            return { ...state, selection: { ...DESELECTED, saddleIndex: action.index } };
        case 'SELECT_TEXTURE':
            return { ...state, selection: { ...DESELECTED, textureId: action.id } };
        case 'SELECT_LUG':
            return { ...state, selection: { ...DESELECTED, lugIndex: action.index } };
        case 'SELECT_ANNOTATION':
            return { ...state, selection: { ...DESELECTED, annotationId: action.id } };
        case 'SELECT_RULER':
            return { ...state, selection: { ...DESELECTED, rulerId: action.id } };
        case 'SELECT_WELD':
            return { ...state, selection: { ...DESELECTED, weldIndex: action.index } };
        case 'SELECT_COVERAGE_RECT':
            return { ...state, selection: { ...DESELECTED, coverageRectId: action.id } };
        case 'SELECT_INSPECTION_IMAGE':
            return { ...state, selection: { ...DESELECTED, inspectionImageId: action.id } };
        case 'SELECT_SCAN_COMPOSITE':
            return { ...state, selection: { ...state.selection, scanCompositeId: action.id } };
        case 'SELECT_PIPE_SEGMENT':
            return { ...state, selection: { ...DESELECTED, pipelineId: action.pipelineId, pipeSegmentIdx: action.segmentIndex } };
        case 'DESELECT_ALL':
            return { ...state, selection: { ...DESELECTED } };
        case 'TOGGLE_LOCK':
            return { ...state, locks: { ...state.locks, [action.key]: !state.locks[action.key] } };
        case 'SET_DRAW_MODE_ANNOTATION':
            return {
                ...state,
                drawMode: {
                    annotation: action.mode,
                    coverage: action.mode ? false : state.drawMode.coverage,
                    ruler: action.mode ? false : state.drawMode.ruler,
                },
            };
        case 'SET_DRAW_MODE_COVERAGE':
            return {
                ...state,
                drawMode: {
                    annotation: action.active ? null : state.drawMode.annotation,
                    coverage: action.active,
                    ruler: action.active ? false : state.drawMode.ruler,
                },
            };
        case 'SET_DRAW_MODE_RULER':
            return {
                ...state,
                drawMode: {
                    annotation: action.active ? null : state.drawMode.annotation,
                    coverage: action.active ? false : state.drawMode.coverage,
                    ruler: action.active,
                },
            };
        case 'SET_PREVIEW_ANNOTATION':
            return { ...state, previews: { ...state.previews, annotation: action.preview } };
        case 'SET_PREVIEW_COVERAGE_RECT':
            return { ...state, previews: { ...state.previews, coverageRect: action.preview } };
        case 'SET_PREVIEW_RULER':
            return { ...state, previews: { ...state.previews, ruler: action.preview } };
        case 'SET_SIDEBAR_OPEN':
            return { ...state, ui: { ...state.ui, sidebarOpen: action.open } };
        case 'TOGGLE_SIDEBAR':
            return { ...state, ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen } };
        case 'SET_SHOW_DRAWING_IMPORT':
            return { ...state, ui: { ...state.ui, showDrawingImport: action.show } };
        case 'SET_SHOW_SCREENSHOT_MODE':
            return { ...state, ui: { ...state.ui, showScreenshotMode: action.show } };
        case 'SET_VIEWING_INSPECTION_IMAGE':
            return { ...state, ui: { ...state.ui, viewingInspectionImageId: action.id } };
        case 'SET_HOVER_DATA':
            return { ...state, ui: { ...state.ui, hoverData: action.data } };
        case 'TOGGLE_SCAN_TOOLTIP_FOLLOW':
            return { ...state, ui: { ...state.ui, scanTooltipFollow: !state.ui.scanTooltipFollow } };
        case 'CANCEL_ALL_DRAW_MODES':
            return {
                ...state,
                drawMode: { annotation: null, coverage: false, ruler: false },
                previews: { annotation: null, coverageRect: null, ruler: null },
            };
        case 'UPDATE_THICKNESS_THRESHOLDS':
            return {
                ...state,
                vessel: { ...state.vessel, thicknessThresholds: action.thresholds },
            };
        case 'ENTER_INSPECTION_MODE':
            return {
                ...state,
                selection: { ...state.selection, annotationId: action.annotationId },
                ui: {
                    ...state.ui,
                    inspectingAnnotationId: action.annotationId,
                    savedCameraState: action.cameraState,
                },
            };
        case 'CYCLE_INSPECTION':
            return {
                ...state,
                selection: { ...state.selection, annotationId: action.annotationId },
                ui: { ...state.ui, inspectingAnnotationId: action.annotationId },
            };
        case 'EXIT_INSPECTION_MODE':
            return {
                ...state,
                ui: {
                    ...state.ui,
                    inspectingAnnotationId: null,
                    savedCameraState: null,
                },
            };
        case 'SET_VIEW_MODE':
            return { ...state, ui: { ...state.ui, viewMode: action.mode } };
        default:
            return state;
    }
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

    // Auth context for attachment uploads
    const { user } = useAuth();
    const organizationId = user?.organizationId ?? 'local';
    const vesselModelIdRef = useRef(crypto.randomUUID());
    const vesselModelId = vesselModelIdRef.current;

    // Cloud composites query
    const { data: cloudComposites, error: cloudCompositesError, isLoading: cloudCompositesLoading } = useScanCompositeList();
    if (cloudCompositesError) console.error('Failed to fetch cloud composites:', cloudCompositesError);

    // Three.js texture objects (imperative, not React state)
    const textureObjectsRef = useRef<Record<number, THREE.Texture>>({});
    const [, setTextureObjectsVersion] = useState(0);
    const nextTextureIdRef = useRef(1);

    // ID counter refs
    const nextAnnotationIdRef = useRef(1);
    const nextCoverageRectIdRef = useRef(1);
    const nextRulerIdRef = useRef(1);
    const nextInspectionImageIdRef = useRef(1);

    // Viewport ref
    const viewportRef = useRef<ThreeViewportHandle>(null);
    const viewportContainerRef = useRef<HTMLDivElement>(null);
    const cursorTooltipRef = useRef<HTMLDivElement>(null);

    // Toolbar popout menus
    const [locksMenuOpen, setLocksMenuOpen] = useState(false);
    const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
    const locksMenuRef = useRef<HTMLDivElement>(null);
    const actionsMenuRef = useRef<HTMLDivElement>(null);

    // Pipe part popup state (shown when clicking a connection point)
    const [pipePartPopup, setPipePartPopup] = useState<{ pipelineId: string; x: number; y: number } | null>(null);

    // Inspection panel: which stat row is hovered (highlights min/max point on vessel)
    const [visibleStatLines, setVisibleStatLines] = useState<{ min: boolean; max: boolean }>({ min: false, max: false });

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
        setVisibleStatLines(prev => ({ ...prev, [stat]: !prev[stat] }));
    }, []);

    // --- Helper: dispatch vessel update via functional updater ---
    const updateVessel = useCallback((updater: (prev: VesselState) => VesselState) => {
        dispatch({ type: 'UPDATE_VESSEL_FN', updater });
    }, []);

    // --- Vessel dimension handlers ---
    const updateDimensions = useCallback((updates: Partial<VesselState>) => {
        updateVessel(prev => ({ ...prev, ...updates, hasModel: true }));
    }, [updateVessel]);

    // --- Nozzle handlers ---
    const addNozzle = useCallback((nozzle: NozzleConfig) => {
        updateVessel(prev => ({ ...prev, nozzles: [...prev.nozzles, nozzle], hasModel: true }));
    }, [updateVessel]);

    const updateNozzle = useCallback((index: number, updates: Partial<NozzleConfig>) => {
        updateVessel(prev => ({ ...prev, nozzles: prev.nozzles.map((n, i) => i === index ? { ...n, ...updates } : n) }));
    }, [updateVessel]);

    const removeNozzle = useCallback((index: number) => {
        // Atomic cascade: remove nozzle + associated pipelines + decrement higher indices
        updateVessel(prev => ({
            ...prev,
            nozzles: prev.nozzles.filter((_, i) => i !== index),
            pipelines: prev.pipelines
                .filter(p => p.nozzleIndex !== index)
                .map(p => p.nozzleIndex > index
                    ? { ...p, nozzleIndex: p.nozzleIndex - 1 }
                    : p
                ),
        }));
        dispatch({ type: 'SELECT_NOZZLE', index: -1 });
    }, [updateVessel]);

    // --- Pipeline handlers ---
    const createDefaultSegment = useCallback((type: PipeSegmentType, pipeDiameter: number): PipeSegment => {
        const base: PipeSegment = { id: crypto.randomUUID(), type, rotation: 0 };
        switch (type) {
            case 'straight': return { ...base, length: pipeDiameter * 3 };
            case 'elbow': return { ...base, angle: 90, bendRadius: pipeDiameter * 1.5 };
            case 'reducer': return { ...base, length: pipeDiameter * 2, endDiameter: pipeDiameter * 0.75 };
            case 'flange': return { ...base, length: 25 };
            case 'cap': return { ...base, style: 'flat' };
            default: return { ...base, length: pipeDiameter * 3 };
        }
    }, []);

    const addPipeline = useCallback((nozzleIndex: number, segmentType: PipeSegmentType) => {
        const nozzle = vesselState.nozzles[nozzleIndex];
        if (!nozzle) return;
        const pipe = findClosestPipeSize(nozzle.size);
        const diameter = pipe.od;
        const newPipeline: Pipeline = {
            id: crypto.randomUUID(),
            nozzleIndex,
            pipeDiameter: diameter,
            segments: [createDefaultSegment(segmentType, diameter)],
        };
        updateVessel(prev => ({ ...prev, pipelines: [...prev.pipelines, newPipeline] }));
    }, [vesselState.nozzles, updateVessel, createDefaultSegment]);

    const addSegment = useCallback((pipelineId: string, segmentType: PipeSegmentType) => {
        updateVessel(prev => ({
            ...prev,
            pipelines: prev.pipelines.map(p => {
                if (p.id !== pipelineId) return p;
                // Compute effective diameter (may have changed via reducer segments)
                let currentDiameter = p.pipeDiameter;
                for (const seg of p.segments) {
                    if (seg.type === 'reducer' && seg.endDiameter) {
                        currentDiameter = seg.endDiameter;
                    }
                }
                return { ...p, segments: [...p.segments, createDefaultSegment(segmentType, currentDiameter)] };
            }),
        }));
    }, [updateVessel, createDefaultSegment]);

    const updateSegment = useCallback((pipelineId: string, segmentId: string, updates: Partial<PipeSegment>) => {
        updateVessel(prev => ({
            ...prev,
            pipelines: prev.pipelines.map(p =>
                p.id === pipelineId
                    ? { ...p, segments: p.segments.map(s => s.id === segmentId ? { ...s, ...updates } : s) }
                    : p
            ),
        }));
    }, [updateVessel]);

    const removeSegment = useCallback((pipelineId: string, segmentIndex: number) => {
        updateVessel(prev => {
            const updated = prev.pipelines.map(p => {
                if (p.id !== pipelineId) return p;
                return { ...p, segments: p.segments.slice(0, segmentIndex) };
            }).filter(p => p.segments.length > 0);
            return { ...prev, pipelines: updated };
        });
        dispatch({ type: 'SELECT_PIPE_SEGMENT', pipelineId: '', segmentIndex: -1 });
    }, [updateVessel]);

    const removePipeline = useCallback((pipelineId: string) => {
        updateVessel(prev => ({
            ...prev,
            pipelines: prev.pipelines.filter(p => p.id !== pipelineId),
        }));
        dispatch({ type: 'SELECT_PIPE_SEGMENT', pipelineId: '', segmentIndex: -1 });
    }, [updateVessel]);

    const selectPipeSegment = useCallback((pipelineId: string, segmentIndex: number) => {
        dispatch({ type: 'SELECT_PIPE_SEGMENT', pipelineId, segmentIndex });
    }, []);

    // --- Saddle handlers ---
    const addSaddle = useCallback((saddle: SaddleConfig) => {
        updateVessel(prev => ({ ...prev, saddles: [...prev.saddles, saddle] }));
    }, [updateVessel]);

    const updateSaddle = useCallback((index: number, updates: Partial<SaddleConfig>) => {
        updateVessel(prev => ({ ...prev, saddles: prev.saddles.map((s, i) => i === index ? { ...s, ...updates } : s) }));
    }, [updateVessel]);

    const updateAllSaddleHeights = useCallback((height: number) => {
        updateVessel(prev => ({ ...prev, saddles: prev.saddles.map(s => ({ ...s, height })) }));
    }, [updateVessel]);

    const removeSaddle = useCallback((index: number) => {
        updateVessel(prev => ({ ...prev, saddles: prev.saddles.filter((_, i) => i !== index) }));
        dispatch({ type: 'SELECT_SADDLE', index: -1 });
    }, [updateVessel]);

    // --- Lifting lug handlers ---
    const addLug = useCallback((lug: LiftingLugConfig) => {
        updateVessel(prev => ({ ...prev, liftingLugs: [...prev.liftingLugs, lug], hasModel: true }));
    }, [updateVessel]);

    const updateLug = useCallback((index: number, updates: Partial<LiftingLugConfig>) => {
        updateVessel(prev => ({ ...prev, liftingLugs: prev.liftingLugs.map((l, i) => i === index ? { ...l, ...updates } : l) }));
    }, [updateVessel]);

    const removeLug = useCallback((index: number) => {
        updateVessel(prev => ({ ...prev, liftingLugs: prev.liftingLugs.filter((_, i) => i !== index) }));
        dispatch({ type: 'SELECT_LUG', index: -1 });
    }, [updateVessel]);

    // --- Weld handlers ---
    const addWeld = useCallback((weld: WeldConfig) => {
        updateVessel(prev => ({ ...prev, welds: [...prev.welds, weld], hasModel: true }));
    }, [updateVessel]);

    const updateWeld = useCallback((index: number, updates: Partial<WeldConfig>) => {
        updateVessel(prev => ({ ...prev, welds: prev.welds.map((w, i) => i === index ? { ...w, ...updates } : w) }));
    }, [updateVessel]);

    const removeWeld = useCallback((index: number) => {
        updateVessel(prev => ({ ...prev, welds: prev.welds.filter((_, i) => i !== index) }));
        dispatch({ type: 'SELECT_WELD', index: -1 });
    }, [updateVessel]);

    // --- Texture handlers ---
    const addTexture = useCallback((texture: TextureConfig, threeTexture: THREE.Texture) => {
        textureObjectsRef.current[Number(texture.id)] = threeTexture;
        setTextureObjectsVersion(v => v + 1);
        updateVessel(prev => ({ ...prev, textures: [...prev.textures, texture] }));
    }, [updateVessel]);

    const updateTexture = useCallback((id: number, updates: Partial<TextureConfig>) => {
        updateVessel(prev => ({ ...prev, textures: prev.textures.map(t => Number(t.id) === id ? { ...t, ...updates } : t) }));
    }, [updateVessel]);

    const removeTexture = useCallback((id: number) => {
        const tex = textureObjectsRef.current[id];
        if (tex) {
            tex.dispose();
            delete textureObjectsRef.current[id];
            setTextureObjectsVersion(v => v + 1);
        }
        updateVessel(prev => ({ ...prev, textures: prev.textures.filter(t => Number(t.id) !== id) }));
        dispatch({ type: 'SELECT_TEXTURE', id: -1 });
    }, [updateVessel]);

    const getNextTextureId = useCallback(() => {
        return nextTextureIdRef.current++;
    }, []);

    // --- Annotation handlers ---
    const addAnnotation = useCallback((annotation: AnnotationShapeConfig) => {
        updateVessel(prev => ({ ...prev, annotations: [...prev.annotations, annotation] }));
    }, [updateVessel]);

    const updateAnnotation = useCallback((id: number, updates: Partial<AnnotationShapeConfig>) => {
        updateVessel(prev => ({ ...prev, annotations: prev.annotations.map(a => a.id === id ? { ...a, ...updates } : a) }));
    }, [updateVessel]);

    const removeAnnotation = useCallback((id: number) => {
        updateVessel(prev => ({ ...prev, annotations: prev.annotations.filter(a => a.id !== id) }));
        dispatch({ type: 'SELECT_ANNOTATION', id: -1 });
    }, [updateVessel]);

    // --- Annotation attachment handlers ---
    const captureViewport = useCallback(async () => {
        const renderer = viewportRef.current?.getRenderer();
        const canvas = renderer?.domElement;
        if (!canvas || ui.inspectingAnnotationId == null) return;

        // Force a render so the canvas has current content
        const scene = viewportRef.current?.getScene();
        const camera = viewportRef.current?.getCamera();
        if (scene && camera) renderer!.render(scene, camera);

        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) return;

        const { storagePath, id } = await uploadAnnotationImage(
            organizationId, vesselModelId, ui.inspectingAnnotationId, blob, 'viewport-capture',
        );
        const attachment = { id, type: 'viewport-capture' as const, storagePath, capturedAt: new Date().toISOString() };
        const ann = vesselState.annotations.find(a => a.id === ui.inspectingAnnotationId);
        updateAnnotation(ui.inspectingAnnotationId, {
            attachments: [...(ann?.attachments ?? []), attachment],
        });
    }, [ui.inspectingAnnotationId, vesselState, organizationId, vesselModelId, updateAnnotation]);

    const uploadImage = useCallback(async (file: File) => {
        if (ui.inspectingAnnotationId == null) return;
        const { storagePath, id } = await uploadAnnotationImage(
            organizationId, vesselModelId, ui.inspectingAnnotationId, file, 'upload',
        );
        const attachment = { id, type: 'upload' as const, storagePath, capturedAt: new Date().toISOString() };
        const ann = vesselState.annotations.find(a => a.id === ui.inspectingAnnotationId);
        updateAnnotation(ui.inspectingAnnotationId, {
            attachments: [...(ann?.attachments ?? []), attachment],
        });
    }, [ui.inspectingAnnotationId, vesselState, organizationId, vesselModelId, updateAnnotation]);

    const deleteAttachment = useCallback(async (attachmentId: string) => {
        if (ui.inspectingAnnotationId == null) return;
        const ann = vesselState.annotations.find(a => a.id === ui.inspectingAnnotationId);
        const attachment = ann?.attachments?.find(a => a.id === attachmentId);
        if (attachment) await deleteAnnotationImage(attachment.storagePath);
        updateAnnotation(ui.inspectingAnnotationId, {
            attachments: (ann?.attachments ?? []).filter(a => a.id !== attachmentId),
        });
    }, [ui.inspectingAnnotationId, vesselState, updateAnnotation]);

    /** Save companion B/D/A-scan data-URL images as scan-capture attachments */
    const saveScanImages = useCallback(async (images: { cscan?: string; bscan?: string; dscan?: string; ascan?: string }) => {
        if (ui.inspectingAnnotationId == null) return;
        const ann = vesselState.annotations.find(a => a.id === ui.inspectingAnnotationId);
        if (!ann) return;

        // Remove previous scan-capture attachments (replace with new set)
        const oldScans = (ann.attachments ?? []).filter(a => a.type === 'scan-capture');
        for (const old of oldScans) {
            await deleteAnnotationImage(old.storagePath).catch(() => {});
        }

        const keptAttachments = (ann.attachments ?? []).filter(a => a.type !== 'scan-capture');
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
                organizationId, vesselModelId, ui.inspectingAnnotationId, blob, 'scan-capture',
            );
            newAttachments.push({
                id,
                type: 'scan-capture' as const,
                storagePath,
                capturedAt: new Date().toISOString(),
                scanType: scanType as 'cscan' | 'bscan' | 'dscan' | 'ascan',
            });
        }

        updateAnnotation(ui.inspectingAnnotationId, { attachments: newAttachments });
    }, [ui.inspectingAnnotationId, vesselState, organizationId, vesselModelId, updateAnnotation]);

    /** Clear all scan-capture attachments from the current annotation */
    const clearScanImages = useCallback(async () => {
        if (ui.inspectingAnnotationId == null) return;
        const ann = vesselState.annotations.find(a => a.id === ui.inspectingAnnotationId);
        if (!ann) return;

        const scanAttachments = (ann.attachments ?? []).filter(a => a.type === 'scan-capture');
        for (const att of scanAttachments) {
            await deleteAnnotationImage(att.storagePath).catch(() => {});
        }

        updateAnnotation(ui.inspectingAnnotationId, {
            attachments: (ann.attachments ?? []).filter(a => a.type !== 'scan-capture'),
        });
    }, [ui.inspectingAnnotationId, vesselState, updateAnnotation]);

    // --- Annotation stats recomputation ---
    const recomputeAnnotationStats = useCallback(() => {
        const updatedAnnotations = recomputeAllAnnotationStats(vesselState);
        const changed = updatedAnnotations.some((ann, i) => {
            const old = vesselState.annotations[i];
            return ann.thicknessStats !== old.thicknessStats || ann.severityLevel !== old.severityLevel;
        });
        if (changed) {
            updateVessel(prev => ({ ...prev, annotations: updatedAnnotations }));
        }
    }, [vesselState, updateVessel]);

    // Recompute stats when annotation geometry, composite orientation, or thresholds change.
    // Serialize only geometry-affecting fields to avoid infinite loops (since recompute updates annotations).
    const annotationsJson = JSON.stringify(vesselState.annotations.map(a => ({ id: a.id, pos: a.pos, angle: a.angle, width: a.width, height: a.height, type: a.type })));
    const compositesJson = JSON.stringify(vesselState.scanComposites.map(c => ({ id: c.id, orientationConfirmed: c.orientationConfirmed, indexStartMm: c.indexStartMm, datumAngleDeg: c.datumAngleDeg, scanDirection: c.scanDirection, indexDirection: c.indexDirection })));
    const thresholdsJson = JSON.stringify(vesselState.thicknessThresholds);

    useEffect(() => {
        recomputeAnnotationStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [annotationsJson, compositesJson, thresholdsJson]);

    const updateMeasurementConfig = useCallback((updates: Partial<MeasurementConfig>) => {
        updateVessel(prev => ({ ...prev, measurementConfig: { ...prev.measurementConfig, ...updates } }));
    }, [updateVessel]);

    const updateThicknessThresholds = useCallback((thresholds: ThicknessThresholds) => {
        dispatch({ type: 'UPDATE_THICKNESS_THRESHOLDS', thresholds });
    }, []);

    const getNextAnnotationId = useCallback(() => {
        return nextAnnotationIdRef.current++;
    }, []);

    // --- Coverage rect handlers ---
    const addCoverageRect = useCallback((rect: CoverageRectConfig) => {
        updateVessel(prev => ({ ...prev, coverageRects: [...prev.coverageRects, rect] }));
    }, [updateVessel]);

    const updateCoverageRect = useCallback((id: number, updates: Partial<CoverageRectConfig>) => {
        updateVessel(prev => ({ ...prev, coverageRects: prev.coverageRects.map(r => r.id === id ? { ...r, ...updates } : r) }));
    }, [updateVessel]);

    const removeCoverageRect = useCallback((id: number) => {
        updateVessel(prev => ({ ...prev, coverageRects: prev.coverageRects.filter(r => r.id !== id) }));
        dispatch({ type: 'SELECT_COVERAGE_RECT', id: -1 });
    }, [updateVessel]);

    const getNextCoverageRectId = useCallback(() => {
        return nextCoverageRectIdRef.current++;
    }, []);

    // --- Ruler handlers ---
    const addRuler = useCallback((ruler: RulerConfig) => {
        updateVessel(prev => ({ ...prev, rulers: [...prev.rulers, ruler] }));
    }, [updateVessel]);

    const removeRuler = useCallback((id: number) => {
        updateVessel(prev => ({ ...prev, rulers: prev.rulers.filter(r => r.id !== id) }));
        // Only deselect if this ruler was selected
        dispatch({ type: 'SELECT_RULER', id: -1 });
    }, [updateVessel]);

    const updateRuler = useCallback((id: number, updates: Partial<RulerConfig>) => {
        updateVessel(prev => ({ ...prev, rulers: prev.rulers.map(r => r.id === id ? { ...r, ...updates } : r) }));
    }, [updateVessel]);

    const getNextRulerId = useCallback(() => {
        return nextRulerIdRef.current++;
    }, []);

    // --- Inspection image handlers ---
    const addInspectionImage = useCallback((img: InspectionImageConfig) => {
        updateVessel(prev => ({ ...prev, inspectionImages: [...prev.inspectionImages, img] }));
    }, [updateVessel]);

    const updateInspectionImage = useCallback((id: number, updates: Partial<InspectionImageConfig>) => {
        updateVessel(prev => ({ ...prev, inspectionImages: prev.inspectionImages.map(i => i.id === id ? { ...i, ...updates } : i) }));
    }, [updateVessel]);

    const removeInspectionImage = useCallback((id: number) => {
        updateVessel(prev => ({ ...prev, inspectionImages: prev.inspectionImages.filter(i => i.id !== id) }));
        dispatch({ type: 'SELECT_INSPECTION_IMAGE', id: -1 });
        if (ui.viewingInspectionImageId === id) dispatch({ type: 'SET_VIEWING_INSPECTION_IMAGE', id: -1 });
    }, [updateVessel, ui.viewingInspectionImageId]);

    const toggleInspectionImageVisible = useCallback((id: number) => {
        updateVessel(prev => ({
            ...prev,
            inspectionImages: prev.inspectionImages.map(i =>
                i.id === id ? { ...i, visible: i.visible === false ? true : false } : i,
            ),
        }));
    }, [updateVessel]);

    const toggleInspectionImageLocked = useCallback((id: number) => {
        updateVessel(prev => ({
            ...prev,
            inspectionImages: prev.inspectionImages.map(i =>
                i.id === id ? { ...i, locked: !i.locked } : i,
            ),
        }));
    }, [updateVessel]);

    const toggleAnnotationVisible = useCallback((id: number) => {
        updateVessel(prev => ({
            ...prev,
            annotations: prev.annotations.map(a =>
                a.id === id ? { ...a, visible: a.visible === false ? true : false } : a,
            ),
        }));
    }, [updateVessel]);

    const toggleAnnotationLocked = useCallback((id: number) => {
        updateVessel(prev => ({
            ...prev,
            annotations: prev.annotations.map(a =>
                a.id === id ? { ...a, locked: !a.locked } : a,
            ),
        }));
    }, [updateVessel]);

    const getNextInspectionImageId = useCallback(() => {
        return nextInspectionImageIdRef.current++;
    }, []);

    // --- Scan composite handlers ---
    const handleImportComposite = useCallback(async (
        compositeId: string,
        placement: { scanDirection: 'cw' | 'ccw'; indexDirection: 'forward' | 'reverse' },
    ) => {
        try {
            const composite = await getScanComposite(compositeId);
            const newConfig: ScanCompositeConfig = {
                id: `sc_${Date.now()}`,
                name: composite.name,
                cloudId: composite.id,
                data: composite.thickness_data,
                xAxis: composite.x_axis,
                yAxis: composite.y_axis,
                stats: composite.stats || { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
                indexStartMm: composite.y_axis?.[0] ?? 0,
                datumAngleDeg: 0,
                scanDirection: placement.scanDirection,
                indexDirection: placement.indexDirection,
                orientationConfirmed: false,
                colorScale: 'Jet',
                rangeMin: null,
                rangeMax: null,
                opacity: 1,
                sourceNdeFile: guessNdeFilename(composite.name),
                sourceFiles: composite.source_files ?? undefined,
            };
            updateVessel(prev => ({ ...prev, scanComposites: [...prev.scanComposites, newConfig] }));
        } catch (err) {
            console.error('Failed to import composite:', err);
        }
    }, [updateVessel]);

    const handleRemoveScanComposite = useCallback((id: string) => {
        clearHeatmapCache(id);
        updateVessel(prev => ({ ...prev, scanComposites: prev.scanComposites.filter(sc => sc.id !== id) }));
        if (selection.scanCompositeId === id) dispatch({ type: 'SELECT_SCAN_COMPOSITE', id: '' });
    }, [updateVessel, selection.scanCompositeId]);

    const handleUpdateScanComposite = useCallback((id: string, updates: Partial<ScanCompositeConfig>) => {
        updateVessel(prev => ({
            ...prev,
            scanComposites: prev.scanComposites.map(sc => sc.id === id ? { ...sc, ...updates } : sc),
        }));
    }, [updateVessel]);

    // --- Interaction callbacks (from Three.js viewport) ---
    const vesselCallbacks: VesselCallbacks = {
        onNozzleSelected: (idx) => dispatch({ type: 'SELECT_NOZZLE', index: idx }),
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
        onAnnotationCreated: (type, pos, angle, width, height) => {
            const id = getNextAnnotationId();
            const isRestriction = type === 'restriction';
            const prefix = isRestriction ? 'R' : 'A';
            const count = vesselState.annotations.filter(a => a.type === type).length + 1;
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
            });
            dispatch({ type: 'SELECT_ANNOTATION', id });
            dispatch({ type: 'SET_PREVIEW_ANNOTATION', preview: null });
            dispatch({ type: 'SET_DRAW_MODE_ANNOTATION', mode: null });
        },
        onAnnotationPreview: (type, pos, angle, width, height) => {
            dispatch({ type: 'SET_PREVIEW_ANNOTATION', preview: {
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
            }});
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
            dispatch({ type: 'SET_PREVIEW_RULER', preview: {
                id: -1,
                name: 'Preview',
                startPos: Math.round(startPos),
                startAngle: Math.round(startAngle),
                endPos: Math.round(endPos),
                endAngle: Math.round(endAngle),
                color: '#ffaa00',
                showLabel: true,
            }});
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
            dispatch({ type: 'SET_PREVIEW_COVERAGE_RECT', preview: {
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
            }});
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
                updateWeld(idx, { pos: Math.round(pos), endPos: (weld.endPos ?? vesselState.length) + delta, angle: Math.round(angle) });
            }
        },
        onScanCompositeHover: (_id, thickness, scanMm, indexMm, screenX, screenY) => {
            dispatch({ type: 'SET_HOVER_DATA', data: thickness !== null ? { thickness, scanMm, indexMm } : null });
            // Update cursor-follow tooltip position via ref (avoids re-render lag)
            if (cursorTooltipRef.current) {
                if (thickness !== null) {
                    cursorTooltipRef.current.style.left = `${screenX + 16}px`;
                    cursorTooltipRef.current.style.top = `${screenY - 12}px`;
                }
            }
        },
        onScanGizmoDatumMoved: (compositeId, angleDeg, posMm) => {
            handleUpdateScanComposite(compositeId, { datumAngleDeg: angleDeg, indexStartMm: Math.round(posMm) });
        },
        onScanGizmoDirectionToggle: (compositeId, field) => {
            const sc = vesselState.scanComposites.find(c => c.id === compositeId);
            if (!sc) return;
            if (field === 'scanDirection') {
                handleUpdateScanComposite(compositeId, { scanDirection: sc.scanDirection === 'cw' ? 'ccw' : 'cw' });
            } else {
                handleUpdateScanComposite(compositeId, { indexDirection: sc.indexDirection === 'forward' ? 'reverse' : 'forward' });
            }
        },
        onPipeSegmentSelected: (pipelineId, segmentIndex) => {
            dispatch({ type: 'SELECT_PIPE_SEGMENT', pipelineId, segmentIndex });
        },
        onPipeConnectionPointClicked: (pipelineId) => {
            // Show the pipe part popup — handled via state
            setPipePartPopup(prev => prev ? null : { pipelineId, x: 0, y: 0 });
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
            // No-op, state is already updated per-move
        },
    };

    // --- Save/Load ---
    const saveProject = useCallback(() => {
        const projectData = {
            version: 1,
            timestamp: new Date().toISOString(),
            vessel: {
                id: vesselState.id,
                length: vesselState.length,
                headRatio: vesselState.headRatio,
                orientation: vesselState.orientation,
                vesselName: vesselState.vesselName,
                location: vesselState.location,
                inspectionDate: vesselState.inspectionDate,
            },
            nozzles: vesselState.nozzles.map(n => ({
                name: n.name, pos: n.pos, proj: n.proj,
                angle: n.angle, size: n.size,
                orientationMode: n.orientationMode,
                flangeOD: n.flangeOD, flangeThk: n.flangeThk, pipeOD: n.pipeOD, style: n.style,
            })),
            liftingLugs: vesselState.liftingLugs.map(l => ({
                name: l.name, pos: l.pos, angle: l.angle,
                style: l.style, swl: l.swl,
                width: l.width, height: l.height,
                thickness: l.thickness, holeDiameter: l.holeDiameter,
            })),
            saddles: vesselState.saddles.map(s => ({
                pos: s.pos, color: s.color || '#2244ff',
                height: s.height,
            })),
            welds: vesselState.welds.map(w => ({
                name: w.name, type: w.type, pos: w.pos,
                endPos: w.endPos, angle: w.angle, color: w.color,
            })),
            textures: vesselState.textures.map(t => ({
                id: t.id, name: t.name, imageData: t.imageData,
                pos: t.pos, angle: t.angle,
                scaleX: t.scaleX || 1.0, scaleY: t.scaleY || 1.0,
                rotation: t.rotation || 0,
                flipH: t.flipH || false, flipV: t.flipV || false,
            })),
            annotations: vesselState.annotations.map(a => ({
                id: a.id, name: a.name, type: a.type,
                pos: a.pos, angle: a.angle, width: a.width, height: a.height,
                color: a.color, lineWidth: a.lineWidth, showLabel: a.showLabel,
                leaderLength: a.leaderLength, labelOffset: a.labelOffset, visible: a.visible, locked: a.locked,
                restrictionNotes: a.restrictionNotes, restrictionImage: a.restrictionImage,
                restrictionImageName: a.restrictionImageName, includeInReport: a.includeInReport,
                attachments: a.attachments,
            })),
            rulers: vesselState.rulers.map(r => ({
                id: r.id, name: r.name,
                startPos: r.startPos, startAngle: r.startAngle,
                endPos: r.endPos, endAngle: r.endAngle,
                color: r.color, showLabel: r.showLabel,
            })),
            coverageRects: vesselState.coverageRects.map(r => ({
                id: r.id, name: r.name,
                pos: r.pos, angle: r.angle, width: r.width, height: r.height,
                color: r.color, lineWidth: r.lineWidth,
                filled: r.filled, fillOpacity: r.fillOpacity, locked: r.locked,
            })),
            inspectionImages: vesselState.inspectionImages.map(i => ({
                id: i.id, name: i.name, imageData: i.imageData,
                pos: i.pos, angle: i.angle,
                description: i.description, date: i.date,
                inspector: i.inspector, method: i.method, result: i.result,
                leaderLength: i.leaderLength, labelOffset: i.labelOffset, visible: i.visible, locked: i.locked,
            })),
            scanComposites: vesselState.scanComposites.map(sc => ({
                id: sc.id,
                name: sc.name,
                cloudId: sc.cloudId,
                xAxis: sc.xAxis,
                yAxis: sc.yAxis,
                stats: sc.stats,
                indexStartMm: sc.indexStartMm,
                datumAngleDeg: sc.datumAngleDeg,
                scanDirection: sc.scanDirection,
                indexDirection: sc.indexDirection,
                orientationConfirmed: sc.orientationConfirmed,
                colorScale: sc.colorScale,
                rangeMin: sc.rangeMin,
                rangeMax: sc.rangeMax,
                opacity: sc.opacity,
                sourceNdeFile: sc.sourceNdeFile,
                sourceFiles: sc.sourceFiles,
            })),
            pipelines: vesselState.pipelines,
            referenceDrawings: vesselState.referenceDrawings ?? [],
            measurementConfig: { ...vesselState.measurementConfig },
            visuals: { ...vesselState.visuals },
        };

        const defaultName = vesselState.vesselName
            ? `${vesselState.vesselName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}`
            : `vessel_project_${new Date().toISOString().slice(0, 10)}`;
        const filename = prompt('Enter filename:', defaultName);
        if (!filename) return;

        // Replace NaN/Infinity with null to avoid JSON.stringify issues
        const json = JSON.stringify(projectData, (_key, value) =>
            typeof value === 'number' && !Number.isFinite(value) ? null : value
        , 2);
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

    const exportGLB = useCallback(async () => {
        const hasProjectInfo = vesselState.vesselName || vesselState.location || vesselState.inspectionDate;
        if (!hasProjectInfo) {
            const proceed = window.confirm(
                'No project info has been added. The exported file will use a generic name.\n\n'
                + 'You can add a vessel name, location, and inspection date in the Project Info section of the sidebar.\n\n'
                + 'Export anyway?',
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

                const newState: VesselState = {
                    id: projectData.vessel.id || 3000,
                    length: projectData.vessel.length || 8000,
                    headRatio: projectData.vessel.headRatio || 2.0,
                    orientation: projectData.vessel.orientation || 'horizontal',
                    vesselName: projectData.vessel.vesselName || '',
                    location: projectData.vessel.location || '',
                    inspectionDate: projectData.vessel.inspectionDate || '',
                    nozzles: (projectData.nozzles || []).map((n: any) => ({
                        name: n.name || 'N', pos: n.pos ?? 0, proj: n.proj ?? 200,
                        angle: n.angle ?? 90, size: n.size ?? 100,
                        orientationMode: n.orientationMode,
                        flangeOD: n.flangeOD, flangeThk: n.flangeThk, pipeOD: n.pipeOD, style: n.style,
                    })),
                    liftingLugs: (projectData.liftingLugs || []).map((l: any) => ({
                        name: l.name || 'L', pos: l.pos ?? 0, angle: l.angle ?? 90,
                        style: l.style || 'padEye', swl: l.swl || '5t',
                        width: l.width, height: l.height,
                        thickness: l.thickness, holeDiameter: l.holeDiameter,
                    })),
                    saddles: (projectData.saddles || []).map((s: any) =>
                        typeof s === 'number' ? { pos: s, color: '#2244ff' } : { pos: s.pos, color: s.color || '#2244ff', height: s.height }
                    ),
                    welds: (projectData.welds || []).map((w: any) => ({
                        name: w.name || 'W', type: w.type || 'circumferential',
                        pos: w.pos ?? 0, endPos: w.endPos, angle: w.angle,
                        color: w.color || '#888888',
                    })),
                    textures: loadedTextures,
                    annotations: (projectData.annotations || []).map((a: any) => ({
                        id: a.id || 0, name: a.name || 'A', type: a.type === 'restriction' ? 'restriction' : 'scan',
                        pos: a.pos ?? 0, angle: a.angle ?? 90,
                        width: a.width ?? 100, height: a.height ?? 100,
                        color: a.color || '#ff3333', lineWidth: a.lineWidth ?? 2,
                        showLabel: a.showLabel !== false,
                        leaderLength: a.leaderLength, labelOffset: a.labelOffset, visible: a.visible, locked: a.locked,
                        restrictionNotes: a.restrictionNotes, restrictionImage: a.restrictionImage,
                        restrictionImageName: a.restrictionImageName, includeInReport: a.includeInReport,
                        attachments: a.attachments ?? [],
                    })),
                    rulers: (projectData.rulers || []).map((r: any) => ({
                        id: r.id || 0, name: r.name || 'R',
                        startPos: r.startPos ?? 0, startAngle: r.startAngle ?? 90,
                        endPos: r.endPos ?? 100, endAngle: r.endAngle ?? 90,
                        color: r.color || '#ffaa00', showLabel: r.showLabel !== false,
                    })),
                    coverageRects: (projectData.coverageRects || []).map((r: any) => ({
                        id: r.id || 0, name: r.name || 'C',
                        pos: r.pos ?? 0, angle: r.angle ?? 90,
                        width: r.width ?? 300, height: r.height ?? 200,
                        color: r.color || '#00cc66', lineWidth: r.lineWidth ?? 2,
                        filled: r.filled ?? true, fillOpacity: r.fillOpacity ?? 0.2, locked: r.locked,
                    })),
                    inspectionImages: (projectData.inspectionImages || []).map((i: any) => ({
                        id: i.id || 0, name: i.name || 'IMG', imageData: i.imageData || '',
                        pos: i.pos ?? 0, angle: i.angle ?? 90,
                        description: i.description, date: i.date,
                        inspector: i.inspector, method: i.method, result: i.result,
                        leaderLength: i.leaderLength, labelOffset: i.labelOffset, visible: i.visible, locked: i.locked,
                    })),
                    scanComposites: (projectData.scanComposites || []).map((sc: any) => ({
                        id: sc.id || `sc_${Date.now()}`,
                        name: sc.name || 'Untitled',
                        cloudId: sc.cloudId,
                        data: sc.data || [],          // may be empty if saved without data (Issue 3.6)
                        xAxis: sc.xAxis || [],
                        yAxis: sc.yAxis || [],
                        stats: sc.stats || { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
                        indexStartMm: sc.indexStartMm ?? 0,
                        datumAngleDeg: sc.datumAngleDeg ?? 0,
                        scanDirection: sc.scanDirection || 'cw',
                        indexDirection: sc.indexDirection || 'forward',
                        orientationConfirmed: sc.orientationConfirmed ?? true,
                        colorScale: sc.colorScale || 'Jet',
                        rangeMin: sc.rangeMin ?? null,
                        rangeMax: sc.rangeMax ?? null,
                        opacity: sc.opacity ?? 1,
                        sourceNdeFile: sc.sourceNdeFile,
                        sourceFiles: sc.sourceFiles,
                    })),
                    pipelines: (projectData.pipelines || []).map((p: any) => ({
                        id: p.id || crypto.randomUUID(),
                        nozzleIndex: p.nozzleIndex ?? 0,
                        pipeDiameter: p.pipeDiameter ?? 100,
                        color: p.color,
                        segments: (p.segments || []).map((s: any) => ({
                            id: s.id || crypto.randomUUID(),
                            type: s.type || 'straight',
                            rotation: s.rotation ?? 0,
                            length: s.length, angle: s.angle, bendRadius: s.bendRadius,
                            endDiameter: s.endDiameter, branchDiameter: s.branchDiameter, style: s.style,
                        })),
                        locked: p.locked, visible: p.visible,
                    })),
                    referenceDrawings: (projectData.referenceDrawings || []).map((d: any) => ({
                        id: d.id || Date.now(), title: d.title || '', imageData: d.imageData || '', fileName: d.fileName || '',
                    })),
                    measurementConfig: {
                        ...DEFAULT_VESSEL_STATE.measurementConfig,
                        ...(projectData.measurementConfig || {}),
                    },
                    hasModel: true,
                    visuals: { ...DEFAULT_VESSEL_STATE.visuals, ...(projectData.visuals || {}) },
                };

                // Clear heatmap cache to avoid stale scan composite textures
                clearHeatmapCache();

                // Update next texture ID to avoid conflicts
                const maxId = loadedTextures.reduce((max: number, t: TextureConfig) => Math.max(max, Number(t.id) || 0), 0);
                nextTextureIdRef.current = maxId + 1;

                // Update next annotation ID to avoid conflicts
                const maxAnnId = newState.annotations.reduce((max: number, a: AnnotationShapeConfig) => Math.max(max, a.id || 0), 0);
                nextAnnotationIdRef.current = maxAnnId + 1;

                // Update next coverage rect ID to avoid conflicts
                const maxCovId = newState.coverageRects.reduce((max: number, r: CoverageRectConfig) => Math.max(max, r.id || 0), 0);
                nextCoverageRectIdRef.current = maxCovId + 1;

                // Update next ruler ID to avoid conflicts
                const maxRulerId = newState.rulers.reduce((max: number, r: RulerConfig) => Math.max(max, r.id || 0), 0);
                nextRulerIdRef.current = maxRulerId + 1;

                // Update next inspection image ID to avoid conflicts
                const maxImgId = newState.inspectionImages.reduce((max: number, i: InspectionImageConfig) => Math.max(max, i.id || 0), 0);
                nextInspectionImageIdRef.current = maxImgId + 1;

                const validatedState = validateVesselState(newState);
                dispatch({ type: 'SET_VESSEL', vessel: validatedState });
                setTextureObjectsVersion(v => v + 1);
                dispatch({ type: 'DESELECT_ALL' });

                // Re-fetch thickness data from cloud for composites saved without inline data
                const compositesNeedingData = validatedState.scanComposites.filter(
                    sc => sc.cloudId && (!sc.data || sc.data.length === 0),
                );
                for (const sc of compositesNeedingData) {
                    getScanComposite(sc.cloudId!).then((cloud) => {
                        clearHeatmapCache(sc.id);
                        dispatch({ type: 'UPDATE_VESSEL_FN', updater: prev => ({
                            ...prev,
                            scanComposites: prev.scanComposites.map(existing =>
                                existing.id === sc.id
                                    ? {
                                        ...existing,
                                        data: cloud.thickness_data,
                                        xAxis: cloud.x_axis,
                                        yAxis: cloud.y_axis,
                                        stats: cloud.stats || existing.stats,
                                    }
                                    : existing,
                            ),
                        })});
                    }).catch((err) => {
                        console.error(`Failed to fetch scan composite ${sc.cloudId}:`, err);
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
    const handleDrawingApply = useCallback((result: ExtractionResult) => {
        updateVessel(prev => validateVesselState({
            ...prev,
            id: result.id,
            length: result.length,
            headRatio: result.headRatio,
            orientation: result.orientation,
            nozzles: result.nozzles.map(n => ({
                name: n.name,
                pos: n.pos,
                proj: n.proj,
                angle: n.angle,
                size: n.size,
            })),
            saddles: result.saddles.map(s => ({
                pos: s.pos,
                color: s.color || '#2244ff',
            })),
            hasModel: true,
        }));
        dispatch({ type: 'DESELECT_ALL' });
    }, [updateVessel]);

    // --- Inspection mode handlers ---
    const enterInspectionMode = useCallback((annotationId: number) => {
        const camera = viewportRef.current?.getCamera();
        const controls = viewportRef.current?.getControls();
        if (!camera || !controls) return;

        const ann = vesselState.annotations.find(a => a.id === annotationId);
        if (!ann) return;

        // Save current camera state before animating
        const savedCameraState: { position: [number, number, number]; target: [number, number, number] } = {
            position: camera.position.toArray() as [number, number, number],
            target: (controls.target as THREE.Vector3).toArray() as [number, number, number],
        };

        const { position: targetPos, target: targetLookAt } = computeInspectionCameraTarget(ann, vesselState, camera);

        setVisibleStatLines({ min: false, max: false });
        animateCamera(camera, controls, targetPos, targetLookAt, 500, () => {
            controls.enabled = false;
            setVisibleStatLines({ min: true, max: true });
        });

        dispatch({ type: 'ENTER_INSPECTION_MODE', annotationId, cameraState: savedCameraState });
    }, [vesselState]);

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

    const cycleInspection = useCallback((annotationId: number) => {
        const camera = viewportRef.current?.getCamera();
        const controls = viewportRef.current?.getControls();
        if (!camera || !controls) return;

        const ann = vesselState.annotations.find(a => a.id === annotationId);
        if (!ann) return;

        const { position: targetPos, target: targetLookAt } = computeInspectionCameraTarget(ann, vesselState, camera);

        // Temporarily re-enable controls for the animation
        controls.enabled = true;
        setVisibleStatLines({ min: false, max: false });
        animateCamera(camera, controls, targetPos, targetLookAt, 500, () => {
            controls.enabled = false;
            setVisibleStatLines({ min: true, max: true });
        });

        dispatch({ type: 'CYCLE_INSPECTION', annotationId });
    }, [vesselState]);

    // Sidebar annotation click: enter/cycle inspection mode (scan annotations only)
    const handleSidebarAnnotationSelect = useCallback((id: number) => {
        const ann = vesselState.annotations.find(a => a.id === id);
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
    }, [ui.inspectingAnnotationId, enterInspectionMode, cycleInspection, vesselState.annotations]);

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
        const reportAnnotations = vesselState.annotations.filter(a => a.includeInReport && a.type === 'scan');
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
            annotationIds: reportAnnotations.map(a => a.id),
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

    // --- Escape key cancels draw mode or exits inspection mode ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (ui.inspectingAnnotationId !== null) {
                    exitInspectionMode();
                } else if (drawModeState.annotation || drawModeState.coverage || drawModeState.ruler) {
                    dispatch({ type: 'CANCEL_ALL_DRAW_MODES' });
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [drawModeState, ui.inspectingAnnotationId, exitInspectionMode]);

    // --- Nozzle library drag-and-drop onto 3D canvas ---
    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-nozzle-pipe') ||
            e.dataTransfer.types.includes('application/x-lifting-lug') ||
            e.dataTransfer.types.includes('application/x-weld') ||
            e.dataTransfer.types.includes('application/x-pipe-part')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    }, []);

    const SCALE = 0.001; // Matches vessel-geometry scale

    const handleNozzleDrop = useCallback((e: React.DragEvent) => {
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
                ? (point.y / SCALE) + (vesselState.length / 2)
                : (point.x / SCALE) + (vesselState.length / 2);
            const headDepth = vesselState.id / (2 * vesselState.headRatio);
            newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

            // Calculate angle from intersection
            const rad = isVertical
                ? Math.atan2(point.z, point.x)
                : Math.atan2(point.y, point.z);
            let deg = (rad * 180) / Math.PI;
            if (deg < 0) deg += 360;

            // Find a unique name
            const namePrefix = pipe.style === 'plain-pipe' ? 'P' : 'N';
            let nozzleNum = vesselState.nozzles.length + 1;
            let name = namePrefix + nozzleNum;
            while (vesselState.nozzles.some(n => n.name === name)) {
                nozzleNum++;
                name = namePrefix + nozzleNum;
            }

            const defaultProj = (vesselState.id / 2) + 200;

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
            while (vesselState.nozzles.some(n => n.name === name)) {
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
    }, [vesselState, addNozzle]);

    // --- Lifting lug drag-and-drop onto 3D canvas ---
    const handleLugDrop = useCallback((e: React.DragEvent) => {
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
                ? (point.y / SCALE) + (vesselState.length / 2)
                : (point.x / SCALE) + (vesselState.length / 2);
            const headDepth = vesselState.id / (2 * vesselState.headRatio);
            newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

            const rad = isVertical
                ? Math.atan2(point.z, point.x)
                : Math.atan2(point.y, point.z);
            deg = (rad * 180) / Math.PI;
            if (deg < 0) deg += 360;
        } else {
            newPos = vesselState.length / 2;
            deg = 90;
        }

        let lugNum = vesselState.liftingLugs.length + 1;
        let name = 'L' + lugNum;
        while (vesselState.liftingLugs.some(l => l.name === name)) {
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
    }, [vesselState, addLug]);

    // --- Weld drag-and-drop onto 3D canvas ---
    const handleWeldDrop = useCallback((e: React.DragEvent) => {
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
                ? (point.y / SCALE) + (vesselState.length / 2)
                : (point.x / SCALE) + (vesselState.length / 2);
            const headDepth = vesselState.id / (2 * vesselState.headRatio);
            newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

            const rad = isVertical
                ? Math.atan2(point.z, point.x)
                : Math.atan2(point.y, point.z);
            deg = (rad * 180) / Math.PI;
            if (deg < 0) deg += 360;
        } else {
            newPos = vesselState.length / 2;
            deg = 90;
        }

        let weldNum = vesselState.welds.length + 1;
        let name = 'W' + weldNum;
        while (vesselState.welds.some(w => w.name === name)) {
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
    }, [vesselState, addWeld]);

    // --- Pipe part drag-and-drop ---
    const handlePipePartDrop = useCallback((e: React.DragEvent) => {
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
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
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
                ? (point.y / SCALE) + (vesselState.length / 2)
                : (point.x / SCALE) + (vesselState.length / 2);
            newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

            const rad = isVertical
                ? Math.atan2(point.z, point.x)
                : Math.atan2(point.y, point.z);
            deg = (rad * 180) / Math.PI;
            if (deg < 0) deg += 360;
        } else {
            // Missed the vessel — place at center top
            newPos = vesselState.length / 2;
            deg = 90;
        }

        // Default pipe size for the stub nozzle
        const defaultPipeSize = PIPE_SIZES[2]; // 4" NPS
        const defaultProj = (vesselState.id / 2) + 150;

        // Find unique nozzle name
        let nozzleNum = vesselState.nozzles.length + 1;
        let name = 'P' + nozzleNum;
        while (vesselState.nozzles.some(n => n.name === name)) {
            nozzleNum++;
            name = 'P' + nozzleNum;
        }

        // Create plain-pipe nozzle + pipeline with first segment in one atomic update
        const nozzle: NozzleConfig = {
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
            nozzleIndex: vesselState.nozzles.length, // will be appended at end
            pipeDiameter: defaultPipeSize.od,
            segments: [createDefaultSegment(segmentType, defaultPipeSize.od)],
        };

        updateVessel(prev => ({
            ...prev,
            nozzles: [...prev.nozzles, nozzle],
            pipelines: [...prev.pipelines, newPipeline],
            hasModel: true,
        }));
    }, [vesselState, updateVessel, createDefaultSegment]);

    // --- Combined drop handler ---
    const handleDrop = useCallback((e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-nozzle-pipe')) {
            handleNozzleDrop(e);
        } else if (e.dataTransfer.types.includes('application/x-lifting-lug')) {
            handleLugDrop(e);
        } else if (e.dataTransfer.types.includes('application/x-weld')) {
            handleWeldDrop(e);
        } else if (e.dataTransfer.types.includes('application/x-pipe-part')) {
            handlePipePartDrop(e);
        }
    }, [handleNozzleDrop, handleLugDrop, handleWeldDrop, handlePipePartDrop]);

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

        if (locked.length > 0) return `${locked.join(', ')} Locked | Other components can be repositioned`;
        return null;
    };

    return (
        <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: '#111111' }}>
            {/* Project context banner */}
            {projectId && (
                <div className="flex items-center gap-2 px-4 py-1.5 text-xs border-b shrink-0"
                    style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                    <FolderOpen size={13} />
                    <span>Working in project context</span>
                    <span style={{ color: 'rgba(96,165,250,0.5)' }}>|</span>
                    <a href={`/projects/${projectId}`} style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                        Back to Project Hub
                    </a>
                </div>
            )}
            {/* View mode toggle */}
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 border-b border-gray-700">
                <button
                    className={`px-3 py-1 text-xs rounded transition-colors ${ui.viewMode === '3d' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: '3d' })}
                >
                    <Box className="w-3.5 h-3.5 inline mr-1" style={{ verticalAlign: '-2px' }} />
                    3D
                </button>
                <button
                    className={`px-3 py-1 text-xs rounded transition-colors ${ui.viewMode === 'flattened' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'flattened' })}
                >
                    Flattened
                </button>
            </div>
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
                <ErrorBoundary fallback={
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                        <div className="text-center p-8 max-w-md">
                            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-white mb-2">3D Viewport Error</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                The 3D renderer encountered an error. This can happen due to GPU driver issues or corrupted geometry.
                            </p>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                                Reload Page
                            </button>
                        </div>
                    </div>
                }>
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
                        selectedWeldIndex={selection.weldIndex}
                        selectedInspectionImageId={selection.inspectionImageId}
                        onInspectionImageThumbnailClick={(id) => dispatch({ type: 'SET_VIEWING_INSPECTION_IMAGE', id })}
                        drawMode={drawModeState.annotation}
                        coverageDrawMode={drawModeState.coverage}
                        previewAnnotation={previews.annotation}
                        previewCoverageRect={previews.coverageRect}
                        rulerDrawMode={drawModeState.ruler}
                        previewRuler={previews.ruler}
                        selectedScanCompositeId={selection.scanCompositeId}
                        selectedPipelineId={selection.pipelineId}
                        selectedPipeSegmentIdx={selection.pipeSegmentIdx}
                        inspectingAnnotationId={ui.inspectingAnnotationId}
                    />
                </ErrorBoundary>
                </>
                ) : (
                    <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center bg-white text-gray-500 text-sm">Loading flattened view...</div>}>
                        <FlattenedViewport vesselState={vesselState} />
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
                                <span className="vm-scan-tooltip-number primary">{ui.hoverData.thickness.toFixed(2)}<span className="vm-scan-tooltip-unit">mm</span></span>
                            </div>
                            <div className="vm-scan-tooltip-divider" />
                            <div className="vm-scan-tooltip-value">
                                <span className="vm-scan-tooltip-label">Scan</span>
                                <span className="vm-scan-tooltip-number">{ui.hoverData.scanMm.toFixed(1)}<span className="vm-scan-tooltip-unit">mm</span></span>
                            </div>
                            <div className="vm-scan-tooltip-divider" />
                            <div className="vm-scan-tooltip-value">
                                <span className="vm-scan-tooltip-label">Index</span>
                                <span className="vm-scan-tooltip-number">{ui.hoverData.indexMm.toFixed(1)}<span className="vm-scan-tooltip-unit">mm</span></span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Sidebar (z-20) */}
                <div className={`vm-sidebar ${ui.sidebarOpen ? '' : 'collapsed'}`}>
                    <SidebarPanel
                        vesselState={vesselState}
                        selectedNozzleIndex={selection.nozzleIndex}
                        selectedSaddleIndex={selection.saddleIndex}
                        selectedTextureId={selection.textureId}
                        onUpdateDimensions={updateDimensions}
                        onAddNozzle={addNozzle}
                        onUpdateNozzle={updateNozzle}
                        onRemoveNozzle={removeNozzle}
                        onSelectNozzle={(index) => dispatch({ type: 'SELECT_NOZZLE', index })}
                        selectedLugIndex={selection.lugIndex}
                        onAddLug={addLug}
                        onUpdateLug={updateLug}
                        onRemoveLug={removeLug}
                        onSelectLug={(index) => dispatch({ type: 'SELECT_LUG', index })}
                        onAddSaddle={addSaddle}
                        onUpdateSaddle={updateSaddle}
                        onUpdateAllSaddleHeights={updateAllSaddleHeights}
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
                        onUpdateThicknessThresholds={updateThicknessThresholds}
                        selectedPipelineId={selection.pipelineId}
                        selectedSegmentIdx={selection.pipeSegmentIdx}
                        onAddPipeline={addPipeline}
                        onAddSegment={addSegment}
                        onUpdateSegment={updateSegment}
                        onRemoveSegment={removeSegment}
                        onRemovePipeline={removePipeline}
                        onSelectPipeSegment={selectPipeSegment}
                        onGenerateReport={handleGenerateReport}
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
                <div className="vm-popout-menu" ref={locksMenuRef} style={{ left: ui.sidebarOpen ? 400 : 60 }}>
                    <button
                        className={`vm-popout-trigger ${locksMenuOpen ? 'open' : ''}`}
                        onClick={() => { setLocksMenuOpen(!locksMenuOpen); setActionsMenuOpen(false); }}
                    >
                        <Lock size={14} />
                        Locks
                        <ChevronDown size={12} className={`vm-popout-chevron ${locksMenuOpen ? 'rotated' : ''}`} />
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
                <div className="vm-popout-menu vm-popout-menu-right" ref={actionsMenuRef}>
                    <button
                        className={`vm-popout-trigger ${actionsMenuOpen ? 'open' : ''}`}
                        onClick={() => { setActionsMenuOpen(!actionsMenuOpen); setLocksMenuOpen(false); }}
                    >
                        <Settings2 size={14} />
                        Actions
                        <ChevronDown size={12} className={`vm-popout-chevron ${actionsMenuOpen ? 'rotated' : ''}`} />
                    </button>
                    {actionsMenuOpen && (
                        <div className="vm-popout-panel">
                            <button className="vm-popout-item" onClick={() => { dispatch({ type: 'SET_SHOW_DRAWING_IMPORT', show: true }); setActionsMenuOpen(false); }}>
                                <FileUp size={14} /> Import GA
                            </button>
                            <button className="vm-popout-item" onClick={() => { dispatch({ type: 'SET_SHOW_SCREENSHOT_MODE', show: true }); setActionsMenuOpen(false); }}>
                                <Camera size={14} /> Screenshot
                            </button>
                            <button className="vm-popout-item" onClick={() => { viewportRef.current?.resetCamera(); setActionsMenuOpen(false); }}>
                                <RotateCcw size={14} /> Reset Camera
                            </button>
                            <div className="vm-popout-divider" />
                            <button className="vm-popout-item" onClick={() => { saveProject(); setActionsMenuOpen(false); }}>
                                <Save size={14} /> Save Project
                            </button>
                            <label className="vm-popout-item" style={{ cursor: 'pointer' }}>
                                <Upload size={14} /> Load Project
                                <input type="file" accept=".json" onChange={(e) => { loadProject(e); setActionsMenuOpen(false); }} style={{ display: 'none' }} />
                            </label>
                            <div className="vm-popout-divider" />
                            <button className="vm-popout-item" onClick={() => { exportGLB(); setActionsMenuOpen(false); }}>
                                <Box size={14} /> 3D Export
                            </button>
                        </div>
                    )}
                </div>

                {/* Coverage overlay */}
                <CoveragePanel vesselState={vesselState} sidebarOpen={ui.sidebarOpen} />

                {/* Inspection mode overlay (right-side panel + camera lock indicator) */}
                {ui.inspectingAnnotationId !== null && (() => {
                    const ann = vesselState.annotations.find(a => a.id === ui.inspectingAnnotationId);
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

                {/* Interaction hint / scan hover readout */}
                {ui.hoverData && ui.hoverData.thickness !== null && !ui.scanTooltipFollow ? (
                    <div className="vm-hint vm-hint--scan">
                        <div className="vm-scan-tooltip">
                            <div className="vm-scan-tooltip-value">
                                <span className="vm-scan-tooltip-label">Thickness</span>
                                <span className="vm-scan-tooltip-number primary">{ui.hoverData.thickness.toFixed(2)}<span className="vm-scan-tooltip-unit">mm</span></span>
                            </div>
                            <div className="vm-scan-tooltip-divider" />
                            <div className="vm-scan-tooltip-value">
                                <span className="vm-scan-tooltip-label">Scan</span>
                                <span className="vm-scan-tooltip-number">{ui.hoverData.scanMm.toFixed(1)}<span className="vm-scan-tooltip-unit">mm</span></span>
                            </div>
                            <div className="vm-scan-tooltip-divider" />
                            <div className="vm-scan-tooltip-value">
                                <span className="vm-scan-tooltip-label">Index</span>
                                <span className="vm-scan-tooltip-number">{ui.hoverData.indexMm.toFixed(1)}<span className="vm-scan-tooltip-unit">mm</span></span>
                            </div>
                            <div className="vm-scan-tooltip-divider" />
                            <button
                                className="vm-scan-tooltip-toggle"
                                onClick={() => dispatch({ type: 'TOGGLE_SCAN_TOOLTIP_FOLLOW' })}
                                title="Switch to cursor-following tooltip"
                            >
                                <MousePointer size={13} />
                            </button>
                        </div>
                    </div>
                ) : (getHintText() || (ui.scanTooltipFollow && ui.hoverData && ui.hoverData.thickness !== null)) ? (
                    <div className="vm-hint">
                        {ui.scanTooltipFollow && ui.hoverData && ui.hoverData.thickness !== null && (
                            <button
                                className="vm-scan-tooltip-toggle"
                                onClick={() => dispatch({ type: 'TOGGLE_SCAN_TOOLTIP_FOLLOW' })}
                                title="Switch to fixed readout"
                                style={{ marginRight: 8 }}
                            >
                                <PanelBottomClose size={13} />
                            </button>
                        )}
                        {getHintText()}
                    </div>
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

            {/* Screenshot Mode Overlay */}
            {ui.showScreenshotMode &&
              viewportRef.current?.getRenderer() &&
              viewportRef.current?.getScene() &&
              viewportRef.current?.getCamera() &&
              viewportRef.current?.getSceneManager()?.getControls() && (
                <Suspense fallback={null}>
                    <ScreenshotMode
                        renderer={viewportRef.current.getRenderer()!}
                        scene={viewportRef.current.getScene()!}
                        camera={viewportRef.current.getCamera()!}
                        controls={viewportRef.current.getSceneManager()!.getControls()!}
                        vesselLength={vesselState.length}
                        onExit={() => dispatch({ type: 'SET_SHOW_SCREENSHOT_MODE', show: false })}
                    />
                </Suspense>
            )}

            {/* Inspection Image Viewer Modal */}
            {ui.viewingInspectionImageId >= 0 && (() => {
                const viewImg = vesselState.inspectionImages.find(i => i.id === ui.viewingInspectionImageId);
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

        </div>
    );
}
