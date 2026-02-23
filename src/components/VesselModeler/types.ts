// =============================================================================
// Vessel Modeler - Type Definitions
// =============================================================================
// TypeScript interfaces and constants for the 3D vessel modeler integration.
// Derived from the standalone HTML tool's state shapes.
// =============================================================================

// ---------------------------------------------------------------------------
// Type Aliases
// ---------------------------------------------------------------------------

export type Orientation = 'horizontal' | 'vertical';

export type MaterialKey = 'blue' | 'cs' | 'ss' | 'red';

export type DragType = 'nozzle' | 'liftingLug' | 'saddle' | 'texture';

export type AnnotationTool =
  | 'arrow'
  | 'line'
  | 'rect'
  | 'circle'
  | 'text'
  | 'dimension'
  | 'stamp'
  | 'freehand';

export type RegionTool = 'side' | 'end' | 'table';

export type LightingPresetKey = 'studio' | 'flat' | 'highContrast' | 'dramatic';

export type ViewPresetKey =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'isometric';

export type StampType = 'pass' | 'fail' | 'defect' | 'inspector' | 'date';

// ---------------------------------------------------------------------------
// Core Vessel Interfaces
// ---------------------------------------------------------------------------

export type NozzleOrientationMode = 'radial' | 'horizontal' | 'vertical-up' | 'vertical-down';

export interface NozzleConfig {
  name: string;
  /** Distance from left tangent line in mm */
  pos: number;
  /** Projection from centerline in mm */
  proj: number;
  /** Degrees: 90 = Top, 270 = Bottom, 0 = Right, 180 = Left */
  angle: number;
  /** Inside diameter in mm */
  size: number;
  /** Pipe orientation mode: radial (default), horizontal, vertical-up, vertical-down */
  orientationMode?: NozzleOrientationMode;
  /** Optional flange outside diameter override in mm */
  flangeOD?: number;
  /** Optional flange thickness override in mm */
  flangeThk?: number;
  /** Optional pipe outside diameter override in mm */
  pipeOD?: number;
}

export type LiftingLugStyle = 'padEye' | 'trunnion';

export interface LiftingLugConfig {
  name: string;
  /** Distance from left tangent line in mm */
  pos: number;
  /** Degrees: 90 = Top, 270 = Bottom, 0 = Right, 180 = Left */
  angle: number;
  /** Lug style */
  style: LiftingLugStyle;
  /** Safe Working Load key (e.g. '1t', '5t') */
  swl: string;
  /** Optional plate width override in mm (pad eye) */
  width?: number;
  /** Optional plate height override in mm (pad eye) */
  height?: number;
  /** Optional plate thickness override in mm */
  thickness?: number;
  /** Optional hole diameter override in mm */
  holeDiameter?: number;
}

export interface LiftingLugSize {
  /** Display label */
  label: string;
  /** Safe Working Load in tonnes */
  swlTonnes: number;
  /** Plate width in mm (pad eye) or pipe OD (trunnion) */
  width: number;
  /** Plate height in mm (pad eye) or stub length (trunnion) */
  height: number;
  /** Plate / pipe thickness in mm */
  thickness: number;
  /** Hole diameter in mm */
  holeDiameter: number;
  /** Base plate diameter in mm */
  baseDiameter: number;
}

export interface SaddleConfig {
  /** Distance from left tangent line in mm */
  pos: number;
  /** Hex color string */
  color: string;
}

export interface TextureConfig {
  id: number;
  name: string;
  imageData: string;
  /** Distance from left tangent line in mm */
  pos: number;
  /** Angle in degrees around circumference */
  angle: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  aspectRatio: number;
}

export interface VisualSettings {
  material: MaterialKey;
  shellOpacity: number;
  nozzleOpacity: number;
}

export interface VesselState {
  /** Inner diameter in mm */
  id: number;
  /** Tan-tan length in mm */
  length: number;
  /** Head ratio (e.g., 2.0 for 2:1 Ellipsoidal) */
  headRatio: number;
  orientation: Orientation;
  nozzles: NozzleConfig[];
  liftingLugs: LiftingLugConfig[];
  saddles: SaddleConfig[];
  textures: TextureConfig[];
  hasModel: boolean;
  visuals: VisualSettings;
}

// ---------------------------------------------------------------------------
// Drag State
// ---------------------------------------------------------------------------

export interface DragState {
  isDragging: boolean;
  dragType: DragType | null;
  selectedNozzleIdx: number;
  selectedSaddleIdx: number;
  selectedTextureIdx: number;
  selectedLugIdx: number;
  /** THREE.Raycaster instance - typed as `any` to avoid hard Three.js dependency in types */
  raycaster: any;
  /** THREE.Vector2 instance - typed as `any` to avoid hard Three.js dependency in types */
  mouse: any;
  isDown: boolean;
  nozzlesLocked: boolean;
  saddlesLocked: boolean;
  texturesLocked: boolean;
  lugsLocked: boolean;
}

// ---------------------------------------------------------------------------
// Screenshot / Annotation State
// ---------------------------------------------------------------------------

export interface Annotation {
  id: string;
  type: AnnotationTool;
  /** Array of {x, y} points describing the shape */
  points: Array<{ x: number; y: number }>;
  color: string;
  lineWidth: number;
  text?: string;
  fontSize?: number;
  /** Bounding width for stamps / text */
  width?: number;
  /** Bounding height for stamps / text */
  height?: number;
  /** Stamp type identifier */
  stampType?: StampType;
  /** Stamp icon character */
  icon?: string;
  /** Stamp background color */
  bgColor?: string;
  /** Custom dimension value (e.g., "1500") */
  value?: string;
  /** Dimension unit (mm, in, m, ft) */
  unit?: string;
}

export interface ScreenshotResolution {
  multiplier: number;
  customWidth: number | null;
  customHeight: number | null;
}

export interface ScreenshotState {
  isActive: boolean;
  resolution: ScreenshotResolution;
  /** 'current' keeps the scene background; other values are CSS color strings */
  background: string;
  format: 'png' | 'jpeg';
  jpegQuality: number;
  lightingPreset: LightingPresetKey;
  /** Stored light configs before screenshot mode override */
  originalLights: LightConfig[];
  currentView: ViewPresetKey | 'custom';
  title: string;
  description: string;
  annotations: Annotation[];
  currentTool: AnnotationTool | null;
  currentColor: string;
  lineWidth: number;
  fontSize: number;
  isDrawing: boolean;
  startPoint: { x: number; y: number } | null;
  tempAnnotation: Annotation | null;
  annotationCanvas: HTMLCanvasElement | null;
  annotationCtx: CanvasRenderingContext2D | null;
  pendingTextPosition: { x: number; y: number } | null;
  tempDimensionLine: Annotation | null;
  pendingStamp: StampPreset | null;
  pendingStampType: StampType | null;
  pendingStampNeedsText: boolean;
  defectCounter: number;
  inspectorInitials: string;
  customStampIcon: string;
  stampSize: number;
  selectedAnnotationId: string | null;
  isDraggingAnnotation: boolean;
  isResizingAnnotation: boolean;
  dragOffset: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Region State (Side / End / Table region capture)
// ---------------------------------------------------------------------------

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionState {
  originalImage: string | null;
  currentTool: RegionTool;
  regions: Record<RegionTool, Region | null>;
  isDrawing: boolean;
  isPanning: boolean;
  startX: number;
  startY: number;
  zoom: number;
  panX: number;
  panY: number;
  lastPanX: number;
  lastPanY: number;
}

// ---------------------------------------------------------------------------
// Material Presets
// ---------------------------------------------------------------------------

export interface MaterialPreset {
  color: number;
  shininess: number;
  name: string;
  emissive: number;
}

export const MATERIAL_PRESETS: Record<MaterialKey, MaterialPreset> = {
  blue: { color: 0x4db8ff, shininess: 60, name: 'Default Blue', emissive: 0x001133 },
  cs:   { color: 0x555555, shininess: 30, name: 'Carbon Steel', emissive: 0x111111 },
  ss:   { color: 0xeef1f5, shininess: 90, name: 'Stainless Steel', emissive: 0x222222 },
  red:  { color: 0x803333, shininess: 20, name: 'Red Oxide', emissive: 0x220000 },
};

// ---------------------------------------------------------------------------
// Lighting Presets
// ---------------------------------------------------------------------------

export interface LightConfig {
  type: 'ambient' | 'directional' | 'point' | 'hemisphere';
  intensity: number;
  color: number;
  /** Position for directional / point lights */
  position?: [number, number, number];
  /** Ground color for hemisphere lights */
  groundColor?: number;
}

export interface LightingPreset {
  name: string;
  lights: LightConfig[];
}

export const LIGHTING_PRESETS: Record<LightingPresetKey, LightingPreset> = {
  studio: {
    name: 'Studio',
    lights: [
      { type: 'ambient', intensity: 0.6, color: 0xffffff },
      { type: 'directional', intensity: 0.8, color: 0xffffff, position: [5, 10, 7] },
      { type: 'directional', intensity: 0.4, color: 0xffffff, position: [-5, 5, -5] },
    ],
  },
  flat: {
    name: 'Flat',
    lights: [
      { type: 'ambient', intensity: 1.0, color: 0xffffff },
      { type: 'directional', intensity: 0.3, color: 0xffffff, position: [0, 10, 0] },
    ],
  },
  highContrast: {
    name: 'High Contrast',
    lights: [
      { type: 'ambient', intensity: 0.3, color: 0xffffff },
      { type: 'directional', intensity: 1.2, color: 0xffffff, position: [5, 10, 7] },
      { type: 'directional', intensity: 0.2, color: 0x4444ff, position: [-5, 3, -5] },
    ],
  },
  dramatic: {
    name: 'Dramatic',
    lights: [
      { type: 'ambient', intensity: 0.15, color: 0xffffff },
      { type: 'directional', intensity: 1.5, color: 0xffeedd, position: [3, 8, 5] },
      { type: 'point', intensity: 0.6, color: 0x4488ff, position: [-4, 2, -3] },
    ],
  },
};

// ---------------------------------------------------------------------------
// View Presets
// ---------------------------------------------------------------------------

export interface ViewPreset {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const VIEW_PRESETS: Record<ViewPresetKey, ViewPreset> = {
  front:     { name: 'Front',     position: [0, 0, 1],  target: [0, 0, 0] },
  back:      { name: 'Back',      position: [0, 0, -1], target: [0, 0, 0] },
  left:      { name: 'Left',      position: [-1, 0, 0], target: [0, 0, 0] },
  right:     { name: 'Right',     position: [1, 0, 0],  target: [0, 0, 0] },
  top:       { name: 'Top',       position: [0, 1, 0],  target: [0, 0, 0] },
  bottom:    { name: 'Bottom',    position: [0, -1, 0], target: [0, 0, 0] },
  isometric: { name: 'Isometric', position: [1, 1, 1],  target: [0, 0, 0] },
};

// ---------------------------------------------------------------------------
// Stamp Presets
// ---------------------------------------------------------------------------

export interface StampPreset {
  label: string;
  color: string;
  icon: string;
  bgColor: string;
}

export const STAMP_PRESETS: Record<StampType, StampPreset> = {
  pass:      { label: 'PASS', color: '#00cc66', icon: '\u2713', bgColor: 'rgba(0, 204, 102, 0.2)' },
  fail:      { label: 'FAIL', color: '#ff4d4d', icon: '\u2717', bgColor: 'rgba(255, 77, 77, 0.2)' },
  defect:    { label: 'D',    color: '#ff9900', icon: '\u26A0', bgColor: 'rgba(255, 153, 0, 0.2)' },
  inspector: { label: 'INSP', color: '#4db8ff', icon: '\uD83D\uDC64', bgColor: 'rgba(77, 184, 255, 0.2)' },
  date:      { label: 'DATE', color: '#888888', icon: '\uD83D\uDCC5', bgColor: 'rgba(136, 136, 136, 0.2)' },
};

// ---------------------------------------------------------------------------
// Pipe Sizes Lookup Table (NPS data)
// ---------------------------------------------------------------------------

export interface PipeSize {
  /** Nominal pipe size label */
  nps: string;
  /** Pipe outside diameter in mm */
  od: number;
  /** Nozzle bore / inside diameter in mm */
  id: number;
  /** Default flange outside diameter in mm */
  flangeOD: number;
  /** Default flange thickness in mm */
  flangeThk: number;
}

export const PIPE_SIZES: PipeSize[] = [
  { nps: '2"',    od: 60.3,   id: 52.5,   flangeOD: 152,  flangeThk: 22 },
  { nps: '3"',    od: 88.9,   id: 77.9,   flangeOD: 190,  flangeThk: 24 },
  { nps: '4"',    od: 114.3,  id: 102.3,  flangeOD: 229,  flangeThk: 24 },
  { nps: '6"',    od: 168.3,  id: 154.1,  flangeOD: 279,  flangeThk: 25 },
  { nps: '8"',    od: 219.1,  id: 202.7,  flangeOD: 343,  flangeThk: 29 },
  { nps: '10"',   od: 273.1,  id: 254.5,  flangeOD: 406,  flangeThk: 30 },
  { nps: '12"',   od: 323.9,  id: 303.2,  flangeOD: 483,  flangeThk: 32 },
  { nps: '14"',   od: 355.6,  id: 333.4,  flangeOD: 533,  flangeThk: 35 },
  { nps: '16"',   od: 406.4,  id: 381.0,  flangeOD: 597,  flangeThk: 37 },
  { nps: '18"',   od: 457.2,  id: 428.7,  flangeOD: 635,  flangeThk: 40 },
  { nps: '20"',   od: 508.0,  id: 477.8,  flangeOD: 699,  flangeThk: 43 },
  { nps: '24"',   od: 609.6,  id: 574.6,  flangeOD: 813,  flangeThk: 48 },
  { nps: '30"',   od: 762.0,  id: 723.9,  flangeOD: 978,  flangeThk: 54 },
  { nps: '36"',   od: 914.4,  id: 876.3,  flangeOD: 1143, flangeThk: 60 },
];

export const LIFTING_LUG_SIZES: LiftingLugSize[] = [
  { label: '1t',  swlTonnes: 1,  width: 80,  height: 100, thickness: 12, holeDiameter: 25, baseDiameter: 120 },
  { label: '2t',  swlTonnes: 2,  width: 100, height: 120, thickness: 16, holeDiameter: 30, baseDiameter: 150 },
  { label: '5t',  swlTonnes: 5,  width: 120, height: 150, thickness: 20, holeDiameter: 35, baseDiameter: 180 },
  { label: '10t', swlTonnes: 10, width: 150, height: 180, thickness: 25, holeDiameter: 42, baseDiameter: 220 },
  { label: '20t', swlTonnes: 20, width: 180, height: 220, thickness: 32, holeDiameter: 50, baseDiameter: 260 },
  { label: '50t', swlTonnes: 50, width: 220, height: 280, thickness: 40, holeDiameter: 65, baseDiameter: 320 },
];

export function findLiftingLugSize(swl: string): LiftingLugSize {
  return LIFTING_LUG_SIZES.find(s => s.label === swl) || LIFTING_LUG_SIZES[0];
}

/**
 * Find the closest pipe size to a given bore ID (in mm).
 * Returns the PipeSize entry with the smallest absolute difference in `id`.
 */
export function findClosestPipeSize(boreId: number): PipeSize {
  let closest = PIPE_SIZES[0];
  let minDiff = Math.abs(boreId - closest.id);

  for (let i = 1; i < PIPE_SIZES.length; i++) {
    const diff = Math.abs(boreId - PIPE_SIZES[i].id);
    if (diff < minDiff) {
      minDiff = diff;
      closest = PIPE_SIZES[i];
    }
  }

  return closest;
}

// ---------------------------------------------------------------------------
// Default State
// ---------------------------------------------------------------------------

export const DEFAULT_VESSEL_STATE: VesselState = {
  id: 3000,
  length: 8000,
  headRatio: 2.0,
  orientation: 'horizontal',
  nozzles: [],
  liftingLugs: [],
  saddles: [
    { pos: 1500, color: '#2244ff' },
    { pos: 6500, color: '#2244ff' },
  ],
  textures: [],
  hasModel: true,
  visuals: {
    material: 'cs',
    shellOpacity: 1.0,
    nozzleOpacity: 1.0,
  },
};

// ---------------------------------------------------------------------------
// Callbacks Interface
// ---------------------------------------------------------------------------

export interface VesselCallbacks {
  onNozzleMoved?: (index: number, newPos: number, newAngle: number) => void;
  onSaddleMoved?: (index: number, newPos: number) => void;
  onTextureMoved?: (id: number, newPos: number, newAngle: number) => void;
  onNozzleSelected?: (index: number) => void;
  onSaddleSelected?: (index: number) => void;
  onTextureSelected?: (id: number) => void;
  onLugSelected?: (index: number) => void;
  onLugMoved?: (index: number, newPos: number, newAngle: number) => void;
  onDeselect?: () => void;
  onDragEnd?: () => void;
}
