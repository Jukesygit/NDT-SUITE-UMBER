// =============================================================================
// ScreenshotMode - Full-screen capture with annotation overlay and side panel
// =============================================================================
// Shows the LIVE 3D renderer with an annotation canvas overlay. The pan tool
// lets the user orbit/zoom the live scene (pointer-events pass through to the
// renderer). Drawing tools capture events on the annotation canvas overlay.
// Export creates a temporary renderer for high-res capture (no flicker).
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, Sun, Eye, Settings, ArrowLeft } from 'lucide-react';
import * as THREE from 'three';
import type {
  Annotation,
  AnnotationTool,
  LightingPresetKey,
  ViewPresetKey,
  StampType,
} from './types';
import { LIGHTING_PRESETS, VIEW_PRESETS, STAMP_PRESETS } from './types';
import AnnotationToolbar from './AnnotationToolbar';
import type { ToolbarTool } from './AnnotationToolbar';
import {
  applyLightingPreset,
  restoreLights,
  applyViewPreset,
  renderAnnotations,
  captureScreenshot,
  downloadScreenshot,
  hitTestHandles,
  getResizeFixedPoint,
  applyResize,
} from './engine/screenshot-renderer';
import type { ScreenshotOptions, HandlePosition } from './engine/screenshot-renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScreenshotModeProps {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: { target: THREE.Vector3; update: () => void; enabled: boolean };
  vesselLength: number;
  onExit: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCanvasPoint(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  // Scale from CSS coordinates to canvas pixel coordinates
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

/** Hit-test: find the annotation at a given point (topmost first). */
function findAnnotationAt(
  annotations: Annotation[],
  x: number,
  y: number
): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const ann = annotations[i];
    if (isPointInAnnotation(ann, x, y)) return ann;
  }
  return null;
}

function isPointInAnnotation(ann: Annotation, x: number, y: number): boolean {
  const margin = 8 + (ann.lineWidth || 2);

  switch (ann.type) {
    case 'stamp': {
      const p = ann.points[0];
      if (!p) return false;
      const w = ann.width ?? 80;
      const h = ann.height ?? 32;
      return x >= p.x - margin && x <= p.x + w + margin &&
             y >= p.y - margin && y <= p.y + h + margin;
    }
    case 'rect': {
      if (ann.points.length < 2) return false;
      const [s, e] = ann.points;
      const left = Math.min(s.x, e.x) - margin;
      const right = Math.max(s.x, e.x) + margin;
      const top = Math.min(s.y, e.y) - margin;
      const bottom = Math.max(s.y, e.y) + margin;
      return x >= left && x <= right && y >= top && y <= bottom;
    }
    case 'circle': {
      if (ann.points.length < 2) return false;
      const [p0, p1] = ann.points;
      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2;
      const rx = Math.abs(p1.x - p0.x) / 2 + margin;
      const ry = Math.abs(p1.y - p0.y) / 2 + margin;
      if (rx === 0 || ry === 0) return false;
      return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    }
    case 'text': {
      const p = ann.points[0];
      if (!p) return false;
      const fontSize = ann.fontSize ?? 16;
      const textLen = (ann.text?.length ?? 4) * fontSize * 0.6;
      return x >= p.x - margin && x <= p.x + textLen + margin &&
             y >= p.y - margin && y <= p.y + fontSize + margin;
    }
    case 'arrow':
    case 'line':
    case 'dimension': {
      if (ann.points.length < 2) return false;
      const [s, e] = ann.points;
      return distToSegment(x, y, s.x, s.y, e.x, e.y) < margin;
    }
    case 'freehand': {
      for (const p of ann.points) {
        if (Math.hypot(x - p.x, y - p.y) < margin) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Move an annotation so its primary point is at (x, y). */
function moveAnnotation(ann: Annotation, x: number, y: number): Annotation {
  const p0 = ann.points[0];
  if (!p0) return ann;
  const dx = x - p0.x;
  const dy = y - p0.y;
  return {
    ...ann,
    points: ann.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  };
}

const VIEW_KEYS = Object.keys(VIEW_PRESETS) as ViewPresetKey[];
const LIGHTING_KEYS = Object.keys(LIGHTING_PRESETS) as LightingPresetKey[];
const STAMP_KEYS = Object.keys(STAMP_PRESETS) as StampType[];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScreenshotMode({
  renderer,
  scene,
  camera,
  controls,
  vesselLength,
  onExit,
}: ScreenshotModeProps) {
  // Refs
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalParentRef = useRef<HTMLElement | null>(null);

  // Canvas size (matches renderer pixel dimensions)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentTool, setCurrentTool] = useState<ToolbarTool>(null);
  const [currentColor, setCurrentColor] = useState('#ff0000');
  const [lineWidth, setLineWidth] = useState(2);
  const [fontSize, setFontSize] = useState(16);
  const [stampSize, setStampSize] = useState(60);

  // Drawing state refs (avoid stale closures)
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const tempPointsRef = useRef<Array<{ x: number; y: number }>>([]);

  // Select/move state
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const isDraggingAnnotationRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Resize state
  const isResizingRef = useRef(false);
  const resizeHandlePosRef = useRef<HandlePosition | null>(null);
  const resizeFixedPointRef = useRef<{ x: number; y: number } | null>(null);

  // View / lighting
  const [lightingPreset, setLightingPreset] = useState<LightingPresetKey>('studio');
  const [viewPreset, setViewPreset] = useState<ViewPresetKey | 'custom'>('custom');
  const originalLightsRef = useRef<THREE.Light[]>([]);

  // Export settings
  const [multiplier, setMultiplier] = useState(2);
  const [background, setBackground] = useState('current');
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [jpegQuality, setJpegQuality] = useState(92);

  // Report fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Pending stamp type for stamp tool
  const [pendingStampType, setPendingStampType] = useState<StampType>('pass');

  // Dimension input modal state
  const [showDimensionModal, setShowDimensionModal] = useState(false);
  const [dimensionValue, setDimensionValue] = useState('');
  const [dimensionUnit, setDimensionUnit] = useState('mm');
  const pendingDimensionRef = useRef<Annotation | null>(null);
  const dimensionInputRef = useRef<HTMLInputElement>(null);

  // Defect stamp number modal state
  const [showDefectModal, setShowDefectModal] = useState(false);
  const [defectNumber, setDefectNumber] = useState('');
  const pendingDefectRef = useRef<{ point: { x: number; y: number }; scaledW: number; scaledH: number } | null>(null);
  const defectInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------
  // Tool change: clear selection when switching away from select
  // -------------------------------------------------------------------
  const handleToolChange = useCallback((tool: ToolbarTool) => {
    setCurrentTool(tool);
    if (tool !== 'select') {
      setSelectedAnnotationId(null);
    }
  }, []);

  // -------------------------------------------------------------------
  // Mount: reparent renderer.domElement into our canvas wrapper
  // -------------------------------------------------------------------

  useEffect(() => {
    const rendererEl = renderer.domElement;
    const wrapper = canvasWrapperRef.current;
    if (!rendererEl || !wrapper) return;

    // Save original parent so we can restore on unmount
    originalParentRef.current = rendererEl.parentElement;

    // Reparent the live renderer canvas into our wrapper
    wrapper.insertBefore(rendererEl, wrapper.firstChild);

    // Size annotation canvas to match renderer
    const size = renderer.getSize(new THREE.Vector2());
    setCanvasSize({ w: size.x, h: size.y });
    const annCanvas = annotationCanvasRef.current;
    if (annCanvas) {
      annCanvas.width = size.x;
      annCanvas.height = size.y;
    }

    return () => {
      // Restore renderer to original parent
      if (originalParentRef.current) {
        originalParentRef.current.appendChild(rendererEl);
      }
      // Restore lights if we changed them
      if (originalLightsRef.current.length > 0) {
        restoreLights(scene, originalLightsRef.current);
        originalLightsRef.current = [];
      }
    };
     
  }, []);

  // -------------------------------------------------------------------
  // Re-render annotations whenever they change
  // -------------------------------------------------------------------

  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderAnnotations(ctx, annotations, canvasSize.w, canvasSize.h, selectedAnnotationId);
  }, [annotations, canvasSize, selectedAnnotationId]);

  // -------------------------------------------------------------------
  // Keyboard: Delete key to remove selected annotation
  // -------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedAnnotationId) {
        handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
     
  }, [selectedAnnotationId]);

  // -------------------------------------------------------------------
  // Focus dimension modal input when it opens
  // -------------------------------------------------------------------

  useEffect(() => {
    if (showDimensionModal && dimensionInputRef.current) {
      dimensionInputRef.current.focus();
    }
  }, [showDimensionModal]);

  useEffect(() => {
    if (showDefectModal && defectInputRef.current) {
      defectInputRef.current.focus();
    }
  }, [showDefectModal]);

  // -------------------------------------------------------------------
  // View preset change
  // -------------------------------------------------------------------

  const handleViewChange = useCallback(
    (preset: ViewPresetKey) => {
      setViewPreset(preset);
      applyViewPreset(camera, controls, preset, vesselLength);
    },
    [camera, controls, vesselLength]
  );

  // -------------------------------------------------------------------
  // Lighting preset change
  // -------------------------------------------------------------------

  const handleLightingChange = useCallback(
    (preset: LightingPresetKey) => {
      setLightingPreset(preset);
      const oldLights = applyLightingPreset(scene, preset);
      if (originalLightsRef.current.length === 0) {
        originalLightsRef.current = oldLights;
      }
    },
    [scene]
  );

  // -------------------------------------------------------------------
  // Canvas mouse handlers
  // -------------------------------------------------------------------

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;
      const pt = getCanvasPoint(e, canvas);

      // --- Pan mode: do nothing on annotation canvas (events pass through) ---
      if (currentTool === null) return;

      // --- Select mode: check resize handles first, then hit test body ---
      if (currentTool === 'select') {
        // Check resize handles of currently selected annotation
        if (selectedAnnotationId) {
          const selAnn = annotations.find((a) => a.id === selectedAnnotationId);
          if (selAnn) {
            const handle = hitTestHandles(selAnn, pt.x, pt.y);
            if (handle) {
              isResizingRef.current = true;
              resizeHandlePosRef.current = handle.pos;
              resizeFixedPointRef.current = getResizeFixedPoint(selAnn, handle.pos);
              return;
            }
          }
        }

        // Hit test annotation bodies
        const hit = findAnnotationAt(annotations, pt.x, pt.y);
        if (hit) {
          setSelectedAnnotationId(hit.id);
          isDraggingAnnotationRef.current = true;
          dragOffsetRef.current = {
            x: pt.x - hit.points[0].x,
            y: pt.y - hit.points[0].y,
          };
        } else {
          setSelectedAnnotationId(null);
        }
        return;
      }

      // --- Stamp placement ---
      if (currentTool === 'stamp') {
        const preset = STAMP_PRESETS[pendingStampType];
        const scaledW = Math.round(stampSize * 1.33);
        const scaledH = stampSize;

        // Defect stamps prompt for a number (e.g. "12" → "D12")
        if (pendingStampType === 'defect') {
          pendingDefectRef.current = { point: pt, scaledW, scaledH };
          setDefectNumber('');
          setShowDefectModal(true);
          return;
        }

        const ann: Annotation = {
          id: generateId(),
          type: 'stamp',
          points: [pt],
          color: preset.color,
          lineWidth,
          text: preset.label,
          stampType: pendingStampType,
          icon: preset.icon,
          bgColor: preset.bgColor,
          width: scaledW,
          height: scaledH,
        };
        setAnnotations((prev) => [...prev, ann]);
        return;
      }

      // --- Text placement ---
      if (currentTool === 'text') {
        const text = window.prompt('Enter annotation text:');
        if (!text) return;
        const ann: Annotation = {
          id: generateId(),
          type: 'text',
          points: [pt],
          color: currentColor,
          lineWidth,
          text,
          fontSize,
        };
        setAnnotations((prev) => [...prev, ann]);
        return;
      }

      // --- Start drawing for shape tools ---
      isDrawingRef.current = true;
      startPointRef.current = pt;
      tempPointsRef.current = [pt];
    },
    [currentTool, currentColor, lineWidth, fontSize, pendingStampType, stampSize, annotations]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;
      const pt = getCanvasPoint(e, canvas);

      // --- Select mode: resize selected annotation ---
      if (currentTool === 'select' && isResizingRef.current && selectedAnnotationId) {
        const fixed = resizeFixedPointRef.current;
        const handlePos = resizeHandlePosRef.current;
        if (fixed && handlePos) {
          setAnnotations((prev) =>
            prev.map((ann) => {
              if (ann.id !== selectedAnnotationId) return ann;
              return applyResize(ann, handlePos, fixed, pt);
            })
          );
        }
        return;
      }

      // --- Select mode: drag selected annotation ---
      if (currentTool === 'select' && isDraggingAnnotationRef.current && selectedAnnotationId) {
        setAnnotations((prev) =>
          prev.map((ann) => {
            if (ann.id !== selectedAnnotationId) return ann;
            return moveAnnotation(
              ann,
              pt.x - dragOffsetRef.current.x,
              pt.y - dragOffsetRef.current.y
            );
          })
        );
        return;
      }

      // --- Drawing mode ---
      if (!isDrawingRef.current) return;
      if (!currentTool || currentTool === 'select' || !startPointRef.current) return;

      if (currentTool === 'freehand') {
        tempPointsRef.current.push(pt);
      }

      // Live preview: redraw existing annotations + temp annotation
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const tempAnn: Annotation = {
        id: '__temp__',
        type: currentTool as AnnotationTool,
        points:
          currentTool === 'freehand'
            ? [...tempPointsRef.current]
            : [startPointRef.current, pt],
        color: currentColor,
        lineWidth,
      };
      renderAnnotations(ctx, [...annotations, tempAnn], canvasSize.w, canvasSize.h, selectedAnnotationId);
    },
    [currentTool, currentColor, lineWidth, annotations, canvasSize, selectedAnnotationId]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // --- Select mode: end drag or resize ---
      if (currentTool === 'select') {
        isDraggingAnnotationRef.current = false;
        isResizingRef.current = false;
        resizeHandlePosRef.current = null;
        resizeFixedPointRef.current = null;
        return;
      }

      // --- Drawing mode ---
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const canvas = annotationCanvasRef.current;
      if (!canvas || !currentTool || !startPointRef.current) return;
      const pt = getCanvasPoint(e, canvas);

      const points =
        currentTool === 'freehand'
          ? [...tempPointsRef.current, pt]
          : [startPointRef.current, pt];

      // Reject tiny shapes (accidental clicks)
      if (currentTool !== 'freehand' && points.length >= 2) {
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        if (Math.hypot(dx, dy) < 3) {
          startPointRef.current = null;
          tempPointsRef.current = [];
          return;
        }
      }

      // --- Dimension tool: show modal for custom value input ---
      if (currentTool === 'dimension') {
        const ann: Annotation = {
          id: generateId(),
          type: 'dimension',
          points,
          color: currentColor,
          lineWidth,
        };
        pendingDimensionRef.current = ann;
        setDimensionValue('');
        setDimensionUnit('mm');
        setShowDimensionModal(true);
        startPointRef.current = null;
        tempPointsRef.current = [];
        return;
      }

      const ann: Annotation = {
        id: generateId(),
        type: currentTool as AnnotationTool,
        points,
        color: currentColor,
        lineWidth,
      };
      setAnnotations((prev) => [...prev, ann]);
      startPointRef.current = null;
      tempPointsRef.current = [];
    },
    [currentTool, currentColor, lineWidth]
  );

  // -------------------------------------------------------------------
  // Dimension modal handlers
  // -------------------------------------------------------------------

  const handleDimensionConfirm = useCallback(() => {
    const line = pendingDimensionRef.current;
    if (line && dimensionValue.trim()) {
      setAnnotations((prev) => [
        ...prev,
        { ...line, value: dimensionValue.trim(), unit: dimensionUnit },
      ]);
    }
    pendingDimensionRef.current = null;
    setShowDimensionModal(false);
  }, [dimensionValue, dimensionUnit]);

  const handleDimensionCancel = useCallback(() => {
    pendingDimensionRef.current = null;
    setShowDimensionModal(false);
  }, []);

  // -------------------------------------------------------------------
  // Defect stamp modal handlers
  // -------------------------------------------------------------------

  const handleDefectConfirm = useCallback(() => {
    const pending = pendingDefectRef.current;
    if (!pending) { setShowDefectModal(false); return; }

    const preset = STAMP_PRESETS.defect;
    const num = defectNumber.trim();
    const label = num ? `D${num}` : 'D';

    const ann: Annotation = {
      id: generateId(),
      type: 'stamp',
      points: [pending.point],
      color: preset.color,
      lineWidth,
      text: label,
      stampType: 'defect',
      icon: preset.icon,
      bgColor: preset.bgColor,
      width: pending.scaledW,
      height: pending.scaledH,
    };
    setAnnotations((prev) => [...prev, ann]);
    pendingDefectRef.current = null;
    setShowDefectModal(false);
  }, [defectNumber, lineWidth]);

  const handleDefectCancel = useCallback(() => {
    pendingDefectRef.current = null;
    setShowDefectModal(false);
  }, []);

  // -------------------------------------------------------------------
  // Toolbar callbacks
  // -------------------------------------------------------------------

  const handleUndo = useCallback(() => {
    setAnnotations((prev) => prev.slice(0, -1));
    setSelectedAnnotationId(null);
  }, []);

  const handleClearAll = useCallback(() => {
    setAnnotations([]);
    setSelectedAnnotationId(null);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedAnnotationId) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedAnnotationId));
    setSelectedAnnotationId(null);
  }, [selectedAnnotationId]);

  // -------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------

  const handleExport = useCallback(() => {
    const options: ScreenshotOptions = {
      multiplier,
      background,
      format,
      jpegQuality,
      title,
      description,
    };
    const dataUrl = captureScreenshot(renderer, scene, camera, annotations, options);
    if (!dataUrl) return;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    downloadScreenshot(dataUrl, `vessel-screenshot-${timestamp}.${ext}`);
  }, [renderer, scene, camera, annotations, multiplier, background, format, jpegQuality, title, description]);

  // -------------------------------------------------------------------
  // Cursor style based on tool
  // -------------------------------------------------------------------
  const getCursor = () => {
    if (currentTool === null) return 'default';
    if (currentTool === 'select') return 'default';
    if (currentTool === 'stamp') return 'copy';
    return 'crosshair';
  };

  // When pan tool is active, annotation canvas should not capture events
  const isPanMode = currentTool === null;

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="vm-screenshot-overlay">
      {/* Header: title only */}
      <div className="vm-screenshot-header">
        <h2 style={{ margin: 0, fontSize: '0.95rem', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: 8 }}>
          Screenshot Mode
        </h2>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>
          {isPanMode ? 'Drag to orbit, scroll to zoom' : `Tool: ${currentTool}`}
        </span>
      </div>

      {/* Main body: canvas + side panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Canvas area with floating toolbar */}
        <div className="vm-screenshot-canvas-area" style={{ flex: 1, position: 'relative' }}>
          {/* Floating annotation toolbar (left side, vertically centered) */}
          <AnnotationToolbar
            currentTool={currentTool}
            onSelectTool={handleToolChange}
            currentColor={currentColor}
            onColorChange={setCurrentColor}
            selectedAnnotationId={selectedAnnotationId}
            onDeleteSelected={handleDeleteSelected}
            onUndo={handleUndo}
            onClearAll={handleClearAll}
            canUndo={annotations.length > 0}
          />

          <div
            ref={canvasWrapperRef}
            className="vm-screenshot-canvas-wrapper"
            style={{ width: canvasSize.w, height: canvasSize.h }}
          >
            {/* renderer.domElement is inserted here on mount */}
            <canvas
              ref={annotationCanvasRef}
              className="vm-screenshot-annotation-canvas"
              style={{
                cursor: getCursor(),
                pointerEvents: isPanMode ? 'none' : 'auto',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            />
          </div>
        </div>

        {/* Side panel (matching original's settings panel) */}
        <div className="vm-screenshot-sidebar" style={{
          width: 260,
          flexShrink: 0,
          background: 'rgba(20, 25, 35, 0.95)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          {/* Export settings */}
          <div className="vm-screenshot-controls">
            <div className="vm-section-title" style={{ marginBottom: 8 }}>
              <Download size={14} /> Export Settings
            </div>

            {/* Resolution multiplier */}
            <div className="vm-control-group">
              <div className="vm-label">Resolution</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 4].map((m) => (
                  <button
                    key={m}
                    className={`vm-toolbar-btn vm-toolbar-btn-sm ${multiplier === m ? 'active' : ''}`}
                    onClick={() => setMultiplier(m)}
                  >
                    {m}x
                  </button>
                ))}
              </div>
            </div>

            {/* Background */}
            <div className="vm-control-group">
              <div className="vm-label">Background</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { value: 'current', label: 'Current' },
                  { value: '#ffffff', label: 'White' },
                  { value: '#000000', label: 'Black' },
                  { value: 'transparent', label: 'None' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`vm-toolbar-btn vm-toolbar-btn-sm ${background === opt.value ? 'active' : ''}`}
                    onClick={() => setBackground(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Format */}
            <div className="vm-control-group">
              <div className="vm-label">Format</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className={`vm-toolbar-btn vm-toolbar-btn-sm ${format === 'png' ? 'active' : ''}`}
                  onClick={() => setFormat('png')}
                >
                  PNG
                </button>
                <button
                  className={`vm-toolbar-btn vm-toolbar-btn-sm ${format === 'jpeg' ? 'active' : ''}`}
                  onClick={() => setFormat('jpeg')}
                >
                  JPEG
                </button>
              </div>
            </div>

            {/* JPEG quality slider */}
            {format === 'jpeg' && (
              <div className="vm-control-group">
                <div className="vm-label">
                  Quality
                  <span className="vm-val-display">{jpegQuality}%</span>
                </div>
                <input
                  type="range"
                  className="vm-slider"
                  min={10}
                  max={100}
                  value={jpegQuality}
                  onChange={(e) => setJpegQuality(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          {/* View presets */}
          <div className="vm-screenshot-controls">
            <div className="vm-section-title" style={{ marginBottom: 8 }}>
              <Eye size={14} /> View Presets
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {VIEW_KEYS.map((key) => (
                <button
                  key={key}
                  className={`vm-toolbar-btn vm-toolbar-btn-sm ${viewPreset === key ? 'active' : ''}`}
                  onClick={() => handleViewChange(key)}
                  title={VIEW_PRESETS[key].name}
                >
                  {VIEW_PRESETS[key].name}
                </button>
              ))}
            </div>
          </div>

          {/* Lighting presets */}
          <div className="vm-screenshot-controls">
            <div className="vm-section-title" style={{ marginBottom: 8 }}>
              <Sun size={14} /> Lighting
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {LIGHTING_KEYS.map((key) => (
                <button
                  key={key}
                  className={`vm-toolbar-btn vm-toolbar-btn-sm ${lightingPreset === key ? 'active' : ''}`}
                  onClick={() => handleLightingChange(key)}
                >
                  {LIGHTING_PRESETS[key].name}
                </button>
              ))}
            </div>
          </div>

          {/* Stamps */}
          <div className="vm-screenshot-controls">
            <div className="vm-section-title" style={{ marginBottom: 8 }}>Stamps</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {STAMP_KEYS.map((key) => {
                const preset = STAMP_PRESETS[key];
                return (
                  <button
                    key={key}
                    className={`vm-toolbar-btn vm-toolbar-btn-sm ${
                      currentTool === 'stamp' && pendingStampType === key ? 'active' : ''
                    }`}
                    onClick={() => {
                      setPendingStampType(key);
                      setCurrentTool('stamp');
                    }}
                    style={{ borderColor: preset.color }}
                    title={`Place ${preset.label} stamp`}
                  >
                    {preset.icon} {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Report helpers */}
          <div className="vm-screenshot-controls">
            <div className="vm-section-title" style={{ marginBottom: 8 }}>Report Helpers</div>
            <div className="vm-control-group">
              <div className="vm-label">Title</div>
              <input
                type="text"
                className="vm-input"
                placeholder="Screenshot title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="vm-control-group">
              <div className="vm-label">Description</div>
              <input
                type="text"
                className="vm-input"
                placeholder="Optional description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Annotation Style */}
          <div className="vm-screenshot-controls">
            <div className="vm-section-title" style={{ marginBottom: 8 }}>
              <Settings size={14} /> Annotation Style
            </div>
            <div className="vm-control-group">
              <div className="vm-label">
                Line Width
                <span className="vm-val-display">{lineWidth}px</span>
              </div>
              <input
                type="range"
                className="vm-slider"
                min={1}
                max={8}
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
              />
            </div>
            <div className="vm-control-group">
              <div className="vm-label">
                Font Size
                <span className="vm-val-display">{fontSize}px</span>
              </div>
              <input
                type="range"
                className="vm-slider"
                min={10}
                max={36}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
            </div>
            <div className="vm-control-group">
              <div className="vm-label">
                Stamp Size
                <span className="vm-val-display">{stampSize}px</span>
              </div>
              <input
                type="range"
                className="vm-slider"
                min={40}
                max={120}
                value={stampSize}
                onChange={(e) => setStampSize(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer with Back + Export buttons (prominent, matching original) */}
      <div className="vm-screenshot-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="vm-btn vm-btn-danger" onClick={onExit} style={{ width: 'auto', padding: '8px 20px', fontSize: '0.9rem' }}>
          <ArrowLeft size={16} /> Back to Modeler
        </button>
        <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)' }}>
          Output: {canvasSize.w * multiplier} x {canvasSize.h * multiplier}
        </span>
        <button className="vm-btn vm-btn-success" onClick={handleExport} style={{ width: 'auto', padding: '8px 20px', fontSize: '0.9rem' }}>
          <Download size={16} /> Export Screenshot
        </button>
      </div>

      {/* Dimension Input Modal */}
      {showDimensionModal && (
        <div className="vm-dimension-modal-backdrop" onClick={handleDimensionCancel}>
          <div className="vm-dimension-modal" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 15px 0', color: 'var(--color-primary-400, #60a5fa)' }}>Enter Dimension</h4>
            <div className="vm-control-group">
              <div className="vm-label">Value</div>
              <input
                ref={dimensionInputRef}
                type="text"
                className="vm-input"
                placeholder="e.g. 1500"
                value={dimensionValue}
                onChange={(e) => setDimensionValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDimensionConfirm();
                  if (e.key === 'Escape') handleDimensionCancel();
                }}
              />
            </div>
            <div className="vm-control-group">
              <div className="vm-label">Unit</div>
              <select
                className="vm-select"
                value={dimensionUnit}
                onChange={(e) => setDimensionUnit(e.target.value)}
              >
                <option value="mm">mm</option>
                <option value="in">inches</option>
                <option value="m">meters</option>
                <option value="ft">feet</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
              <button className="vm-btn" onClick={handleDimensionCancel} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="vm-btn vm-btn-primary" onClick={handleDimensionConfirm} style={{ flex: 1 }}>
                Add Dimension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Defect Stamp Number Modal */}
      {showDefectModal && (
        <div className="vm-dimension-modal-backdrop" onClick={handleDefectCancel}>
          <div className="vm-dimension-modal" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 15px 0', color: '#ff9900' }}>Defect Stamp Number</h4>
            <div className="vm-control-group">
              <div className="vm-label">Number</div>
              <input
                ref={defectInputRef}
                type="text"
                className="vm-input"
                placeholder="e.g. 12"
                value={defectNumber}
                onChange={(e) => setDefectNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDefectConfirm();
                  if (e.key === 'Escape') handleDefectCancel();
                }}
              />
              <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                Stamp will display as: <strong style={{ color: '#ff9900' }}>D{defectNumber || '?'}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
              <button className="vm-btn" onClick={handleDefectCancel} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="vm-btn vm-btn-primary" onClick={handleDefectConfirm} style={{ flex: 1 }}>
                Place Stamp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
