// =============================================================================
// ScreenshotMode - Full-screen capture with annotation overlay and side panel
// =============================================================================
// Captures the 3D viewport as a static image, provides annotation drawing
// tools on a canvas overlay, and a side panel for view/lighting presets,
// export settings, report fields, and stamp placement.
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, X, Download, Sun, Eye } from 'lucide-react';
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
import {
  applyLightingPreset,
  restoreLights,
  applyViewPreset,
  renderAnnotations,
  captureScreenshot,
  downloadScreenshot,
} from './engine/screenshot-renderer';
import type { ScreenshotOptions } from './engine/screenshot-renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScreenshotModeProps {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: { target: THREE.Vector3; update: () => void };
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
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
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
  // Canvas refs
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);

  // Canvas size (matches viewport dimensions)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentTool, setCurrentTool] = useState<AnnotationTool | null>(null);
  const [currentColor, setCurrentColor] = useState('#ff4444');
  const [lineWidth, setLineWidth] = useState(2);
  const [fontSize, setFontSize] = useState(16);

  // Drawing state refs (avoid stale closures)
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const tempPointsRef = useRef<Array<{ x: number; y: number }>>([]);

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

  // -------------------------------------------------------------------
  // Capture viewport as static image onto the image canvas
  // -------------------------------------------------------------------

  const captureToCanvas = useCallback(() => {
    const size = renderer.getSize(new THREE.Vector2());
    setCanvasSize({ w: size.x, h: size.y });

    // Render a frame and copy to image canvas
    renderer.render(scene, camera);
    const imgCanvas = imageCanvasRef.current;
    if (!imgCanvas) return;
    imgCanvas.width = size.x;
    imgCanvas.height = size.y;
    const ctx = imgCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(renderer.domElement, 0, 0, size.x, size.y);
    }

    // Resize annotation canvas to match
    const annCanvas = annotationCanvasRef.current;
    if (annCanvas) {
      annCanvas.width = size.x;
      annCanvas.height = size.y;
    }
  }, [renderer, scene, camera]);

  // Initial capture on mount
  useEffect(() => {
    captureToCanvas();
    return () => {
      // Restore lights if we changed them
      if (originalLightsRef.current.length > 0) {
        restoreLights(scene, originalLightsRef.current);
        originalLightsRef.current = [];
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------
  // Re-render annotations whenever they change
  // -------------------------------------------------------------------

  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderAnnotations(ctx, annotations, canvasSize.w, canvasSize.h);
  }, [annotations, canvasSize]);

  // -------------------------------------------------------------------
  // View preset change
  // -------------------------------------------------------------------

  const handleViewChange = useCallback(
    (preset: ViewPresetKey) => {
      setViewPreset(preset);
      applyViewPreset(camera, controls, preset, vesselLength);
      captureToCanvas();
    },
    [camera, controls, vesselLength, captureToCanvas]
  );

  // -------------------------------------------------------------------
  // Lighting preset change
  // -------------------------------------------------------------------

  const handleLightingChange = useCallback(
    (preset: LightingPresetKey) => {
      setLightingPreset(preset);
      const oldLights = applyLightingPreset(scene, preset);
      // Store originals only on first change
      if (originalLightsRef.current.length === 0) {
        originalLightsRef.current = oldLights;
      }
      captureToCanvas();
    },
    [scene, captureToCanvas]
  );

  // -------------------------------------------------------------------
  // Canvas mouse handlers
  // -------------------------------------------------------------------

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = annotationCanvasRef.current;
      if (!canvas || !currentTool) return;
      const pt = getCanvasPoint(e, canvas);

      // Stamp placement
      if (currentTool === 'stamp') {
        const preset = STAMP_PRESETS[pendingStampType];
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
          width: 80,
          height: 32,
        };
        setAnnotations((prev) => [...prev, ann]);
        return;
      }

      // Text placement
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

      // Start drawing for shape tools
      isDrawingRef.current = true;
      startPointRef.current = pt;
      tempPointsRef.current = [pt];
    },
    [currentTool, currentColor, lineWidth, fontSize, pendingStampType]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      const canvas = annotationCanvasRef.current;
      if (!canvas || !currentTool || !startPointRef.current) return;
      const pt = getCanvasPoint(e, canvas);

      if (currentTool === 'freehand') {
        tempPointsRef.current.push(pt);
      }

      // Live preview: redraw existing annotations + temp annotation
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const tempAnn: Annotation = {
        id: '__temp__',
        type: currentTool,
        points:
          currentTool === 'freehand'
            ? [...tempPointsRef.current]
            : [startPointRef.current, pt],
        color: currentColor,
        lineWidth,
      };
      renderAnnotations(ctx, [...annotations, tempAnn], canvasSize.w, canvasSize.h);
    },
    [currentTool, currentColor, lineWidth, annotations, canvasSize]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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

      const ann: Annotation = {
        id: generateId(),
        type: currentTool,
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
  // Toolbar callbacks
  // -------------------------------------------------------------------

  const handleUndo = useCallback(() => {
    setAnnotations((prev) => prev.slice(0, -1));
  }, []);

  const handleClearAll = useCallback(() => {
    setAnnotations([]);
  }, []);

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

    // Re-capture canvas since captureScreenshot temporarily resized the renderer
    captureToCanvas();
  }, [renderer, scene, camera, annotations, multiplier, background, format, jpegQuality, title, description, captureToCanvas]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="vm-screenshot-overlay">
      {/* Header: AnnotationToolbar + action buttons */}
      <div className="vm-screenshot-header">
        <AnnotationToolbar
          currentTool={currentTool}
          onSelectTool={setCurrentTool}
          currentColor={currentColor}
          onColorChange={setCurrentColor}
          lineWidth={lineWidth}
          onLineWidthChange={setLineWidth}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          onUndo={handleUndo}
          onClearAll={handleClearAll}
          canUndo={annotations.length > 0}
        />
        <button
          className="vm-toolbar-btn vm-toolbar-btn-accent"
          onClick={handleExport}
          title="Export screenshot"
        >
          <Camera size={16} />
        </button>
        <button className="vm-screenshot-close" onClick={onExit} title="Exit Screenshot Mode">
          <X size={20} />
        </button>
      </div>

      {/* Main body: canvas + side panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Canvas area */}
        <div className="vm-screenshot-canvas-area" style={{ flex: 1 }}>
          <div
            className="vm-screenshot-canvas-wrapper"
            style={{ width: canvasSize.w, height: canvasSize.h }}
          >
            <canvas ref={imageCanvasRef} className="vm-screenshot-viewport-canvas" />
            <canvas
              ref={annotationCanvasRef}
              className="vm-screenshot-annotation-canvas"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            />
          </div>
        </div>

        {/* Side panel */}
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

          {/* Export settings */}
          <div className="vm-screenshot-controls">
            <div className="vm-section-title" style={{ marginBottom: 8 }}>Export Settings</div>

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
                  JPEG Quality
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

          {/* Report fields */}
          <div className="vm-screenshot-controls">
            <div className="vm-section-title" style={{ marginBottom: 8 }}>Report</div>
            <div className="vm-control-group">
              <div className="vm-label">Title</div>
              <input
                type="text"
                className="vm-input"
                placeholder="Screenshot title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="vm-control-group">
              <div className="vm-label">Description</div>
              <textarea
                className="vm-input"
                placeholder="Description or notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ resize: 'vertical' }}
              />
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

          {/* Export button at bottom */}
          <button
            className="vm-btn vm-btn-success"
            onClick={handleExport}
            style={{ marginTop: 'auto' }}
          >
            <Download size={16} /> Export Screenshot
          </button>
        </div>
      </div>
    </div>
  );
}
