// ---------------------------------------------------------------------------
// Consolidated state & reducer
//
// Pure reducer for the Vessel Modeler. Extracted verbatim from VesselModeler.tsx
// (T2-D / D1 decomposition) — behavior unchanged. Owns the six transient slices
// (selection/locks/drawMode/previews/ui) plus the document `vessel` slice and the
// snapshot undo/redo history. Timestamps come from the DISPATCHER (see historyFor),
// never Date.now() inside the reducer, keeping it StrictMode-safe.
// ---------------------------------------------------------------------------

import {
  DEFAULT_VESSEL_STATE,
  type VesselState,
  type AnnotationShapeConfig,
  type AnnotationShapeType,
  type CoverageRectConfig,
  type RulerConfig,
} from '../types';
import {
  createEmptyHistory,
  recordCheckpoint,
  undoStep,
  redoStep,
  undoTo,
  redoTo,
  breakGroup,
  type VesselHistoryState,
  type HistoryMeta,
} from './vessel-history';

export interface SelectionState {
  nozzleIndex: number;
  appendageIndex: number;
  saddleIndex: number;
  textureId: number;
  lugIndex: number;
  annotationId: number;
  rulerId: number;
  weldIndex: number;
  coverageRectId: number;
  inspectionImageId: number;
  scanCompositeId: string;
  domeScanId: string;
  pipelineId: string;
  pipeSegmentIdx: number;
}

export interface LocksState {
  nozzles: boolean;
  saddles: boolean;
  textures: boolean;
  lugs: boolean;
  welds: boolean;
  pipelines: boolean;
}

export interface DrawModeState {
  annotation: AnnotationShapeType | null;
  coverage: boolean;
  ruler: boolean;
}

export interface PreviewsState {
  annotation: AnnotationShapeConfig | null;
  coverageRect: CoverageRectConfig | null;
  ruler: RulerConfig | null;
}

export interface UIState {
  sidebarOpen: boolean;
  showDrawingImport: boolean;
  viewingInspectionImageId: number;
  viewMode: '3d' | 'flattened' | 'topo';
  labelsTidied: boolean;
  showStatsCoverage: boolean;
  showStatsWallLoss: boolean;
  showStatsScanCoverage: boolean;
  hoverData: { thickness: number | null; scanMm: number; indexMm: number } | null;
  scanTooltipFollow: boolean;
  /** Whether drag angle-snapping is enabled (nozzles + lifting lugs) */
  snapEnabled: boolean;
  /** Angle-snap increment in degrees */
  snapDeg: number;
  /** Whether the entity outliner panel is open (transient — never serialized). */
  outlinerOpen: boolean;
  /** ID of annotation being inspected (null = not in inspection mode) */
  inspectingAnnotationId: number | null;
  /** Camera state saved before entering inspection mode */
  savedCameraState: {
    position: [number, number, number];
    target: [number, number, number];
  } | null;
}

export interface VesselModelerState {
  vessel: VesselState;
  selection: SelectionState;
  locks: LocksState;
  drawMode: DrawModeState;
  previews: PreviewsState;
  ui: UIState;
  /** Snapshot undo/redo over the document (vessel) slice; never serialized. */
  history: VesselHistoryState;
}

export const DESELECTED: SelectionState = {
  nozzleIndex: -1,
  appendageIndex: -1,
  saddleIndex: -1,
  textureId: -1,
  lugIndex: -1,
  annotationId: -1,
  rulerId: -1,
  weldIndex: -1,
  coverageRectId: -1,
  inspectionImageId: -1,
  scanCompositeId: '',
  domeScanId: '',
  pipelineId: '',
  pipeSegmentIdx: -1,
};

export const INITIAL_STATE: VesselModelerState = {
  vessel: { ...DEFAULT_VESSEL_STATE },
  selection: { ...DESELECTED },
  locks: {
    nozzles: false,
    saddles: false,
    textures: false,
    lugs: false,
    welds: false,
    pipelines: false,
  },
  drawMode: { annotation: null, coverage: false, ruler: false },
  previews: { annotation: null, coverageRect: null, ruler: null },
  ui: {
    sidebarOpen: true,
    showDrawingImport: false,
    viewingInspectionImageId: -1,
    hoverData: null,
    scanTooltipFollow: false,
    snapEnabled: false,
    snapDeg: 5,
    outlinerOpen: false,
    inspectingAnnotationId: null,
    savedCameraState: null,
    viewMode: '3d',
    labelsTidied: false,
    showStatsCoverage: false,
    showStatsWallLoss: false,
    showStatsScanCoverage: false,
  },
  history: createEmptyHistory(),
};

/** Optional per-action history control shared by the vessel-mutating actions. */
export type HistoryControl = HistoryMeta & { skip?: boolean };

/**
 * Signature of the functional vessel-update dispatcher wrapper shared by the
 * entity-CRUD hooks. Domain wrappers pass a derived history key (see historyFor)
 * so continuous edits coalesce; opaque callers omit it and get a discrete undo entry.
 */
export type UpdateVessel = (
  updater: (prev: VesselState) => VesselState,
  history?: HistoryControl
) => void;

/**
 * Positional fields that mean a spatial move rather than a property edit. Any of
 * these among the changed keys makes the verb "Move"; otherwise "Edit".
 */
const MOVE_FIELDS = new Set(['pos', 'angle', 'mountPos', 'mountAngle', 'endPos']);

/**
 * Derive a coalescing history key AND a human label from a domain wrapper's
 * arguments so drag storms and per-keystroke sidebar edits collapse into a single
 * undo entry, and the dropdown/undo tooltip can name the change.
 *
 * Key shape (UNCHANGED — never alter, undo coalescing depends on it):
 * `<entity>:<id-or-index>:<sorted-changed-field-names>` (e.g. `nozzle:3:angle,pos`).
 * Label: verb from MOVE_FIELDS ("Move"/"Edit") + entity + `displayName ?? id`,
 * e.g. "Move nozzle 3" or "Edit weld Longitudinal seam". Date.now() is read here
 * on the DISPATCHER side — never in the reducer — keeping it pure/StrictMode-safe.
 */
export function historyFor(
  entity: string,
  id: string | number,
  updates: object,
  displayName?: string
): HistoryMeta {
  const keys = Object.keys(updates);
  const fields = keys.slice().sort().join(',');
  const verb = keys.some((k) => MOVE_FIELDS.has(k)) ? 'Move' : 'Edit';
  // User-facing word only (R3 terminology) — the coalesce key keeps `entity` raw.
  const entityWord = entity === 'appendage' ? 'Boot' : entity;
  const label = `${verb} ${entityWord} ${displayName ?? id}`;
  return { key: `${entity}:${id}:${fields}`, at: Date.now(), label };
}

export type VesselAction =
  | { type: 'SET_VESSEL'; vessel: VesselState; history?: HistoryControl }
  | {
      type: 'UPDATE_VESSEL_FN';
      updater: (prev: VesselState) => VesselState;
      history?: HistoryControl;
    }
  | { type: 'SELECT_NOZZLE'; index: number }
  | { type: 'SELECT_APPENDAGE'; index: number }
  | { type: 'SELECT_SADDLE'; index: number }
  | { type: 'SELECT_TEXTURE'; id: number }
  | { type: 'SELECT_LUG'; index: number }
  | { type: 'SELECT_ANNOTATION'; id: number }
  | { type: 'SELECT_RULER'; id: number }
  | { type: 'SELECT_WELD'; index: number }
  | { type: 'SELECT_COVERAGE_RECT'; id: number }
  | { type: 'SELECT_INSPECTION_IMAGE'; id: number }
  | { type: 'SELECT_SCAN_COMPOSITE'; id: string }
  | { type: 'SELECT_DOME_SCAN'; id: string }
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
  | { type: 'SET_VIEWING_INSPECTION_IMAGE'; id: number }
  | { type: 'SET_HOVER_DATA'; data: UIState['hoverData'] }
  | { type: 'TOGGLE_SCAN_TOOLTIP_FOLLOW' }
  | { type: 'TOGGLE_OUTLINER' }
  | { type: 'TOGGLE_SNAP' }
  | { type: 'SET_SNAP_DEG'; deg: number }
  | { type: 'CANCEL_ALL_DRAW_MODES' }
  | {
      type: 'UPDATE_THICKNESS_THRESHOLDS';
      thresholds: VesselState['thicknessThresholds'];
      history?: HistoryControl;
    }
  | {
      type: 'ENTER_INSPECTION_MODE';
      annotationId: number;
      cameraState: { position: [number, number, number]; target: [number, number, number] };
    }
  | { type: 'CYCLE_INSPECTION'; annotationId: number }
  | { type: 'EXIT_INSPECTION_MODE' }
  | { type: 'SET_VIEW_MODE'; mode: '3d' | 'flattened' | 'topo' }
  | { type: 'TOGGLE_LABELS_TIDIED'; history?: HistoryControl }
  | { type: 'TOGGLE_STATS_COVERAGE' }
  | { type: 'TOGGLE_STATS_WALL_LOSS' }
  | { type: 'TOGGLE_STATS_SCAN_COVERAGE' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'UNDO_TO'; index: number }
  | { type: 'REDO_TO'; index: number }
  | { type: 'HISTORY_BREAK' };

/**
 * Apply an undo/redo restore: swap in the restored vessel + history, then reset
 * the transient slices that could dangle against a differently-shaped document —
 * selection (stale indices/ids), draw modes and previews (in-progress gestures),
 * and the inspection/hover/image UI. Locks, sidebar, snap, view mode and stats
 * toggles are intentionally preserved (they are not part of the document).
 */
function withRestoredVessel(
  state: VesselModelerState,
  result: { history: VesselHistoryState; vessel: VesselState }
): VesselModelerState {
  return {
    ...state,
    vessel: result.vessel,
    history: result.history,
    selection: { ...DESELECTED },
    drawMode: { annotation: null, coverage: false, ruler: false },
    previews: { annotation: null, coverageRect: null, ruler: null },
    ui: {
      ...state.ui,
      labelsTidied: result.vessel.labelsTidied ?? false,
      inspectingAnnotationId: null,
      savedCameraState: null,
      viewingInspectionImageId: -1,
      hoverData: null,
    },
  };
}

export function vesselReducer(
  state: VesselModelerState,
  action: VesselAction
): VesselModelerState {
  switch (action.type) {
    case 'SET_VESSEL':
      // A load/import is a document boundary — undo never crosses it (v1).
      return {
        ...state,
        vessel: action.vessel,
        history: createEmptyHistory(),
        ui: { ...state.ui, labelsTidied: action.vessel.labelsTidied ?? false },
      };
    case 'UPDATE_VESSEL_FN':
      return {
        ...state,
        vessel: action.updater(state.vessel),
        history: action.history?.skip
          ? state.history
          : recordCheckpoint(state.history, state.vessel, action.history),
      };
    case 'SELECT_NOZZLE':
      return { ...state, selection: { ...DESELECTED, nozzleIndex: action.index } };
    case 'SELECT_APPENDAGE':
      return { ...state, selection: { ...DESELECTED, appendageIndex: action.index } };
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
    case 'SELECT_DOME_SCAN':
      return { ...state, selection: { ...state.selection, domeScanId: action.id } };
    case 'SELECT_PIPE_SEGMENT':
      return {
        ...state,
        selection: {
          ...DESELECTED,
          pipelineId: action.pipelineId,
          pipeSegmentIdx: action.segmentIndex,
        },
      };
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
    case 'SET_VIEWING_INSPECTION_IMAGE':
      return { ...state, ui: { ...state.ui, viewingInspectionImageId: action.id } };
    case 'SET_HOVER_DATA':
      return { ...state, ui: { ...state.ui, hoverData: action.data } };
    case 'TOGGLE_SCAN_TOOLTIP_FOLLOW':
      return { ...state, ui: { ...state.ui, scanTooltipFollow: !state.ui.scanTooltipFollow } };
    case 'TOGGLE_OUTLINER':
      // Transient UI only — never serialized, records no history entry.
      return { ...state, ui: { ...state.ui, outlinerOpen: !state.ui.outlinerOpen } };
    case 'TOGGLE_SNAP':
      return { ...state, ui: { ...state.ui, snapEnabled: !state.ui.snapEnabled } };
    case 'SET_SNAP_DEG':
      return { ...state, ui: { ...state.ui, snapDeg: action.deg } };
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
        history: action.history?.skip
          ? state.history
          : recordCheckpoint(state.history, state.vessel, action.history),
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
    case 'TOGGLE_LABELS_TIDIED': {
      const newTidied = !state.ui.labelsTidied;
      const newMode = newTidied ? ('table' as const) : ('flyout' as const);
      return {
        ...state,
        vessel: {
          ...state.vessel,
          annotations: state.vessel.annotations.map((a) => ({ ...a, labelMode: newMode })),
          labelsTidied: newTidied,
        },
        history: action.history?.skip
          ? state.history
          : recordCheckpoint(state.history, state.vessel, action.history),
        ui: { ...state.ui, labelsTidied: newTidied },
      };
    }
    case 'TOGGLE_STATS_COVERAGE':
      return { ...state, ui: { ...state.ui, showStatsCoverage: !state.ui.showStatsCoverage } };
    case 'TOGGLE_STATS_WALL_LOSS':
      return { ...state, ui: { ...state.ui, showStatsWallLoss: !state.ui.showStatsWallLoss } };
    case 'TOGGLE_STATS_SCAN_COVERAGE':
      return {
        ...state,
        ui: { ...state.ui, showStatsScanCoverage: !state.ui.showStatsScanCoverage },
      };
    case 'UNDO': {
      const result = undoStep(state.history, state.vessel);
      return result ? withRestoredVessel(state, result) : state;
    }
    case 'REDO': {
      const result = redoStep(state.history, state.vessel);
      return result ? withRestoredVessel(state, result) : state;
    }
    case 'UNDO_TO': {
      // Dropdown jump: fold N undo steps into one restore (transient-slice reset
      // is identical to UNDO — same withRestoredVessel).
      const result = undoTo(state.history, state.vessel, action.index);
      return result ? withRestoredVessel(state, result) : state;
    }
    case 'REDO_TO': {
      const result = redoTo(state.history, state.vessel, action.index);
      return result ? withRestoredVessel(state, result) : state;
    }
    case 'HISTORY_BREAK': {
      // Gesture boundary (Phase 2 wires this to onDragEnd). No-op if already broken.
      const history = breakGroup(state.history);
      return history === state.history ? state : { ...state, history };
    }
    default:
      return state;
  }
}
