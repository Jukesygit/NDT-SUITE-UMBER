// =============================================================================
// Screenshot Renderer - Capture, Annotate, and Export Viewport Images
// =============================================================================
// Handles screenshot capture from the Three.js viewport, rendering annotation
// overlays onto a 2D canvas, and exporting the final composited image.
//
// Key difference from earlier version: uses a **temporary WebGLRenderer** for
// export (matching the original standalone tool) so the live renderer and
// animation loop are never disturbed, and the 3D scene is always captured.
// Also includes logo compositing for branding.
// =============================================================================

import * as THREE from 'three';
import type {
  Annotation,
  LightingPresetKey,
  ViewPresetKey,
  LightConfig,
} from '../types';
import { LIGHTING_PRESETS, VIEW_PRESETS, STAMP_PRESETS } from '../types';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export interface ScreenshotOptions {
  multiplier: number;
  /** 'current' keeps the scene background; other values are CSS color strings */
  background: string;
  format: 'png' | 'jpeg';
  jpegQuality: number;
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Logo Preloader
// ---------------------------------------------------------------------------

let logoImage: HTMLImageElement | null = null;

(function preloadLogo() {
  const img = new Image();
  img.onload = () => {
    logoImage = img;
  };
  img.onerror = () => {
    logoImage = null;
  };
  // Vite serves public/ at the root; the logo file is at public/assets/matrix-logo.png
  img.src = new URL('/assets/matrix-logo.png', window.location.origin).href;
})();

// ---------------------------------------------------------------------------
// Lighting Presets
// ---------------------------------------------------------------------------

/**
 * Apply a lighting preset to a Three.js scene.
 * Returns the original lights so the caller can restore them later.
 */
export function applyLightingPreset(
  scene: THREE.Scene,
  preset: LightingPresetKey
): THREE.Light[] {
  // Collect and remove existing lights
  const originalLights: THREE.Light[] = [];
  const toRemove: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (
      obj instanceof THREE.AmbientLight ||
      obj instanceof THREE.DirectionalLight ||
      obj instanceof THREE.PointLight ||
      obj instanceof THREE.HemisphereLight
    ) {
      originalLights.push(obj as THREE.Light);
      toRemove.push(obj);
    }
  });
  for (const obj of toRemove) {
    obj.removeFromParent();
  }

  // Add preset lights
  const presetData = LIGHTING_PRESETS[preset];
  for (const cfg of presetData.lights) {
    const light = createLightFromConfig(cfg);
    if (light) scene.add(light);
  }

  return originalLights;
}

/** Restore original lights to scene (removing current lights first). */
export function restoreLights(
  scene: THREE.Scene,
  originalLights: THREE.Light[]
): void {
  // Remove current lights
  const toRemove: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (
      obj instanceof THREE.AmbientLight ||
      obj instanceof THREE.DirectionalLight ||
      obj instanceof THREE.PointLight ||
      obj instanceof THREE.HemisphereLight
    ) {
      toRemove.push(obj);
    }
  });
  for (const obj of toRemove) {
    obj.removeFromParent();
    if ('dispose' in obj && typeof (obj as unknown as { dispose: () => void }).dispose === 'function') {
      (obj as unknown as { dispose: () => void }).dispose();
    }
  }

  // Re-add originals
  for (const light of originalLights) {
    scene.add(light);
  }
}

function createLightFromConfig(cfg: LightConfig): THREE.Light | null {
  switch (cfg.type) {
    case 'ambient':
      return new THREE.AmbientLight(cfg.color, cfg.intensity);
    case 'directional': {
      const dl = new THREE.DirectionalLight(cfg.color, cfg.intensity);
      if (cfg.position) dl.position.set(...cfg.position);
      return dl;
    }
    case 'point': {
      const pl = new THREE.PointLight(cfg.color, cfg.intensity);
      if (cfg.position) pl.position.set(...cfg.position);
      return pl;
    }
    case 'hemisphere':
      return new THREE.HemisphereLight(
        cfg.color,
        cfg.groundColor ?? 0x444444,
        cfg.intensity
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// View Presets
// ---------------------------------------------------------------------------

/**
 * Apply a view preset to camera and controls.
 * Scales camera distance by `vesselLength * 1.5` so the camera sits at a
 * reasonable distance regardless of vessel size.
 */
export function applyViewPreset(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  preset: ViewPresetKey,
  vesselLength: number
): void {
  const presetData = VIEW_PRESETS[preset];
  const distance = vesselLength * 1.5;

  // Normalize preset direction and scale to distance
  const dir = new THREE.Vector3(...presetData.position).normalize();
  const newPos = controls.target
    .clone()
    .add(dir.multiplyScalar(distance));

  camera.position.copy(newPos);
  camera.lookAt(controls.target);
  controls.update();
}

// ---------------------------------------------------------------------------
// Annotation Rendering
// ---------------------------------------------------------------------------

/**
 * Render all annotations onto a 2D canvas context.
 * Clears the context first, then draws every annotation.
 * Optionally highlights the selected annotation with a dashed border.
 */
export function renderAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  width: number,
  height: number,
  selectedAnnotationId?: string | null
): void {
  ctx.clearRect(0, 0, width, height);

  for (const ann of annotations) {
    ctx.save();
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = ann.lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    drawAnnotation(ctx, ann);
    ctx.restore();

    // Draw selection highlight
    if (selectedAnnotationId && ann.id === selectedAnnotationId) {
      drawSelectionHighlight(ctx, ann);
    }
  }
}

// ---------------------------------------------------------------------------
// Resize Handles
// ---------------------------------------------------------------------------

export type HandlePosition = 'tl' | 'tr' | 'bl' | 'br' | 'start' | 'end';

export interface ResizeHandle {
  pos: HandlePosition;
  x: number;
  y: number;
}

const HANDLE_SIZE = 7;
const HANDLE_HIT_RADIUS = 8;

/** Get resize handle positions for an annotation. */
export function getResizeHandles(ann: Annotation): ResizeHandle[] {
  switch (ann.type) {
    case 'rect':
    case 'circle': {
      if (ann.points.length < 2) return [];
      const [p0, p1] = ann.points;
      return [
        { pos: 'tl', x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y) },
        { pos: 'tr', x: Math.max(p0.x, p1.x), y: Math.min(p0.y, p1.y) },
        { pos: 'bl', x: Math.min(p0.x, p1.x), y: Math.max(p0.y, p1.y) },
        { pos: 'br', x: Math.max(p0.x, p1.x), y: Math.max(p0.y, p1.y) },
      ];
    }
    case 'arrow':
    case 'line':
    case 'dimension': {
      if (ann.points.length < 2) return [];
      return [
        { pos: 'start', x: ann.points[0].x, y: ann.points[0].y },
        { pos: 'end', x: ann.points[1].x, y: ann.points[1].y },
      ];
    }
    case 'stamp': {
      if (ann.points.length < 1) return [];
      const p = ann.points[0];
      const w = ann.width ?? 80;
      const h = ann.height ?? 32;
      return [
        { pos: 'tl', x: p.x, y: p.y },
        { pos: 'tr', x: p.x + w, y: p.y },
        { pos: 'bl', x: p.x, y: p.y + h },
        { pos: 'br', x: p.x + w, y: p.y + h },
      ];
    }
    case 'text': {
      if (ann.points.length < 1) return [];
      const p = ann.points[0];
      const fontSize = ann.fontSize ?? 16;
      const textW = (ann.text?.length ?? 4) * fontSize * 0.6;
      return [
        { pos: 'br', x: p.x + textW, y: p.y + fontSize },
      ];
    }
    default:
      return [];
  }
}

/** Check if a point hits a resize handle. Returns the handle or null. */
export function hitTestHandles(
  ann: Annotation,
  x: number,
  y: number
): ResizeHandle | null {
  const handles = getResizeHandles(ann);
  for (const h of handles) {
    if (Math.hypot(x - h.x, y - h.y) < HANDLE_HIT_RADIUS) return h;
  }
  return null;
}

/** Get the fixed point (opposite corner) for a resize operation. */
export function getResizeFixedPoint(
  ann: Annotation,
  handlePos: HandlePosition
): { x: number; y: number } {
  switch (ann.type) {
    case 'rect':
    case 'circle': {
      if (ann.points.length < 2) return ann.points[0] || { x: 0, y: 0 };
      const [p0, p1] = ann.points;
      const tl = { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y) };
      const br = { x: Math.max(p0.x, p1.x), y: Math.max(p0.y, p1.y) };
      switch (handlePos) {
        case 'tl': return br;
        case 'tr': return { x: tl.x, y: br.y };
        case 'bl': return { x: br.x, y: tl.y };
        case 'br': return tl;
        default: return tl;
      }
    }
    case 'arrow':
    case 'line':
    case 'dimension':
      if (ann.points.length < 2) return ann.points[0] || { x: 0, y: 0 };
      return handlePos === 'start' ? ann.points[1] : ann.points[0];
    case 'stamp': {
      const p = ann.points[0] || { x: 0, y: 0 };
      const w = ann.width ?? 80;
      const h = ann.height ?? 32;
      switch (handlePos) {
        case 'tl': return { x: p.x + w, y: p.y + h };
        case 'tr': return { x: p.x, y: p.y + h };
        case 'bl': return { x: p.x + w, y: p.y };
        case 'br': return { x: p.x, y: p.y };
        default: return p;
      }
    }
    case 'text':
      return ann.points[0] || { x: 0, y: 0 };
    default:
      return ann.points[0] || { x: 0, y: 0 };
  }
}

/** Apply a resize operation to an annotation. */
export function applyResize(
  ann: Annotation,
  handlePos: HandlePosition,
  fixed: { x: number; y: number },
  mouse: { x: number; y: number }
): Annotation {
  switch (ann.type) {
    case 'rect':
    case 'circle':
      return { ...ann, points: [fixed, mouse] };
    case 'arrow':
    case 'line':
    case 'dimension':
      if (handlePos === 'start') {
        return { ...ann, points: [mouse, ann.points[1]] };
      }
      return { ...ann, points: [ann.points[0], mouse] };
    case 'stamp': {
      const newX = Math.min(fixed.x, mouse.x);
      const newY = Math.min(fixed.y, mouse.y);
      const newW = Math.abs(mouse.x - fixed.x);
      const newH = Math.abs(mouse.y - fixed.y);
      return {
        ...ann,
        points: [{ x: newX, y: newY }],
        width: Math.max(20, newW),
        height: Math.max(15, newH),
      };
    }
    case 'text': {
      const origin = ann.points[0];
      const newSize = Math.max(8, Math.round(mouse.y - origin.y));
      return { ...ann, fontSize: newSize };
    }
    default:
      return ann;
  }
}

// ---------------------------------------------------------------------------
// Selection Highlight & Resize Handles Drawing
// ---------------------------------------------------------------------------

/** Draw a selection highlight (dashed border + resize handles) around the annotation. */
function drawSelectionHighlight(
  ctx: CanvasRenderingContext2D,
  ann: Annotation
): void {
  ctx.save();
  ctx.strokeStyle = '#4db8ff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);

  const pad = 6;
  const bounds = getAnnotationBounds(ann);
  if (bounds) {
    ctx.strokeRect(
      bounds.x - pad,
      bounds.y - pad,
      bounds.w + pad * 2,
      bounds.h + pad * 2
    );
  }

  // Draw resize handles
  ctx.setLineDash([]);
  const handles = getResizeHandles(ann);
  const hs = HANDLE_SIZE;
  for (const h of handles) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
    ctx.strokeStyle = '#4db8ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
  }

  ctx.restore();
}

/** Get bounding box of an annotation for selection highlight. */
function getAnnotationBounds(
  ann: Annotation
): { x: number; y: number; w: number; h: number } | null {
  if (ann.points.length === 0) return null;

  if (ann.type === 'stamp') {
    const p = ann.points[0];
    return { x: p.x, y: p.y, w: ann.width ?? 80, h: ann.height ?? 32 };
  }

  if (ann.type === 'text') {
    const p = ann.points[0];
    const fontSize = ann.fontSize ?? 16;
    const w = (ann.text?.length ?? 4) * fontSize * 0.6;
    return { x: p.x, y: p.y, w, h: fontSize };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ann.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Draw a single annotation shape onto the canvas. */
function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation
): void {
  switch (annotation.type) {
    case 'arrow':
      drawArrow(ctx, annotation);
      break;
    case 'line':
      drawLine(ctx, annotation);
      break;
    case 'rect':
      drawRect(ctx, annotation);
      break;
    case 'circle':
      drawCircle(ctx, annotation);
      break;
    case 'text':
      drawText(ctx, annotation);
      break;
    case 'dimension':
      drawDimension(ctx, annotation);
      break;
    case 'stamp':
      drawStamp(ctx, annotation);
      break;
    case 'freehand':
      drawFreehand(ctx, annotation);
      break;
  }
}

// --- Individual draw helpers ------------------------------------------------

function drawArrow(ctx: CanvasRenderingContext2D, ann: Annotation): void {
  if (ann.points.length < 2) return;
  const [start, end] = ann.points;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const headLen = 12;

  // Shaft
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLen * Math.cos(angle - Math.PI / 6),
    end.y - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    end.x - headLen * Math.cos(angle + Math.PI / 6),
    end.y - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function drawLine(ctx: CanvasRenderingContext2D, ann: Annotation): void {
  if (ann.points.length < 2) return;
  const [start, end] = ann.points;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function drawRect(ctx: CanvasRenderingContext2D, ann: Annotation): void {
  if (ann.points.length < 2) return;
  const [start, end] = ann.points;
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  ctx.strokeRect(x, y, w, h);
}

function drawCircle(ctx: CanvasRenderingContext2D, ann: Annotation): void {
  if (ann.points.length < 2) return;
  const [p0, p1] = ann.points;
  const cx = (p0.x + p1.x) / 2;
  const cy = (p0.y + p1.y) / 2;
  const rx = Math.abs(p1.x - p0.x) / 2;
  const ry = Math.abs(p1.y - p0.y) / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, ann: Annotation): void {
  if (!ann.text || ann.points.length < 1) return;
  const pos = ann.points[0];
  const fontSize = ann.fontSize ?? 16;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(ann.text, pos.x, pos.y);
}

function drawDimension(ctx: CanvasRenderingContext2D, ann: Annotation): void {
  if (ann.points.length < 2) return;
  const [start, end] = ann.points;
  const capLen = 8;

  // Main line
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Perpendicular end caps
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const nx = -dy / len;
  const ny = dx / len;

  // Start cap
  ctx.beginPath();
  ctx.moveTo(start.x + nx * capLen, start.y + ny * capLen);
  ctx.lineTo(start.x - nx * capLen, start.y - ny * capLen);
  ctx.stroke();

  // End cap
  ctx.beginPath();
  ctx.moveTo(end.x + nx * capLen, end.y + ny * capLen);
  ctx.lineTo(end.x - nx * capLen, end.y - ny * capLen);
  ctx.stroke();

  // Centered label: use custom value/unit if provided, otherwise pixel distance
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const label = ann.value
    ? `${ann.value} ${ann.unit || 'mm'}`
    : `${Math.round(len)}px`;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, midX + nx * 14, midY + ny * 14);
}

function drawStamp(ctx: CanvasRenderingContext2D, ann: Annotation): void {
  if (ann.points.length < 1) return;
  const pos = ann.points[0];
  const stampType = ann.stampType;
  const preset = stampType ? STAMP_PRESETS[stampType] : null;
  const label = ann.text ?? preset?.label ?? '';
  const icon = ann.icon ?? preset?.icon ?? '';
  const bgColor = ann.bgColor ?? preset?.bgColor ?? 'rgba(128,128,128,0.2)';
  const fgColor = preset?.color ?? ann.color;

  const w = ann.width ?? 80;
  const h = ann.height ?? 32;
  const x = pos.x;
  const y = pos.y;
  const r = 6;

  // Background rounded rect
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();

  // Border
  ctx.strokeStyle = fgColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Icon + label
  ctx.fillStyle = fgColor;
  ctx.font = 'bold 14px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const text = icon ? `${icon} ${label}` : label;
  ctx.fillText(text, x + w / 2, y + h / 2);
}

function drawFreehand(ctx: CanvasRenderingContext2D, ann: Annotation): void {
  if (ann.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(ann.points[0].x, ann.points[0].y);
  for (let i = 1; i < ann.points.length; i++) {
    ctx.lineTo(ann.points[i].x, ann.points[i].y);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Screenshot Capture (using temporary renderer - matches original)
// ---------------------------------------------------------------------------

/**
 * Capture a screenshot by creating a **temporary WebGLRenderer** (matching
 * the original standalone tool's approach). This avoids disturbing the live
 * renderer/animation loop and ensures the 3D scene is always captured.
 *
 * 1. Creates a fresh temp renderer at target resolution.
 * 2. Clones the camera with the correct aspect ratio.
 * 3. Optionally overrides scene background.
 * 4. Renders the scene into the temp renderer.
 * 5. Composites onto an offscreen canvas: background → 3D scene → annotations → report helpers → logo.
 * 6. Disposes the temp renderer.
 * 7. Returns a data URL.
 */
export function captureScreenshot(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  annotations: Annotation[],
  options: ScreenshotOptions
): string {
  const { multiplier, background, format, jpegQuality, title, description } =
    options;

  // Compute base dimensions from the live renderer
  const originalSize = renderer.getSize(new THREE.Vector2());
  const baseWidth = originalSize.x;
  const baseHeight = originalSize.y;
  const finalWidth = Math.round(baseWidth * multiplier);
  const finalHeight = Math.round(baseHeight * multiplier);

  // Store and override scene background
  const originalBackground = scene.background;
  if (background && background !== 'current') {
    if (background === 'transparent') {
      scene.background = null;
    } else {
      scene.background = new THREE.Color(background);
    }
  }

  // Create temporary renderer (fresh WebGL context — never disturbs live renderer)
  const tempRenderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: background === 'transparent',
  });
  tempRenderer.setSize(finalWidth, finalHeight);

  // Clone camera with correct aspect ratio
  const tempCamera = camera.clone();
  tempCamera.aspect = finalWidth / finalHeight;
  tempCamera.updateProjectionMatrix();

  // Render scene into temp renderer
  tempRenderer.render(scene, tempCamera);

  // Create offscreen compositing canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = finalWidth;
  offscreen.height = finalHeight;
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    scene.background = originalBackground;
    tempRenderer.dispose();
    return '';
  }

  // Fill background if not transparent
  if (background && background !== 'current' && background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, finalWidth, finalHeight);
  } else if (!background || background === 'current') {
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, finalWidth, finalHeight);
  }

  // Copy rendered 3D scene pixels
  ctx.drawImage(tempRenderer.domElement, 0, 0);

  // Scale factor for annotation compositing
  const scaleX = finalWidth / baseWidth;
  const scaleY = finalHeight / baseHeight;

  // Draw annotations overlay (scaled to match resolution)
  ctx.save();
  ctx.scale(scaleX, scaleY);
  // Render annotations without selection highlight for export
  for (const ann of annotations) {
    ctx.save();
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = ann.lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    drawAnnotation(ctx, ann);
    ctx.restore();
  }
  ctx.restore();

  // Draw report helpers (title, description, logo)
  drawReportHelpers(ctx, title, description, finalWidth, finalHeight, scaleX);

  // Restore original scene background
  scene.background = originalBackground;

  // Dispose temporary renderer (free WebGL context)
  tempRenderer.dispose();

  // Generate data URL
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = format === 'jpeg' ? jpegQuality / 100 : undefined;
  return offscreen.toDataURL(mimeType, quality);
}

// ---------------------------------------------------------------------------
// Report Helpers (title, description, logo) — matches original
// ---------------------------------------------------------------------------

function drawReportHelpers(
  ctx: CanvasRenderingContext2D,
  title: string,
  description: string,
  width: number,
  height: number,
  scale: number
): void {
  const s = scale;

  // Title: centered with semi-transparent background box
  if (title) {
    const fontSize = Math.round(36 * s);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    const titleMetrics = ctx.measureText(title);
    const boxHeight = Math.round(60 * s);
    const boxPadding = Math.round(30 * s);
    const topOffset = Math.round(22 * s);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(
      width / 2 - titleMetrics.width / 2 - boxPadding,
      topOffset,
      titleMetrics.width + boxPadding * 2,
      boxHeight
    );
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, width / 2, topOffset + boxHeight * 0.7);
  }

  // Description: centered with slightly lighter background box below title
  if (description) {
    const fontSize = Math.round(24 * s);
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    const descMetrics = ctx.measureText(description);
    const boxHeight = Math.round(45 * s);
    const boxPadding = Math.round(22 * s);
    const topOffset = Math.round(90 * s);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(
      width / 2 - descMetrics.width / 2 - boxPadding,
      topOffset,
      descMetrics.width + boxPadding * 2,
      boxHeight
    );
    ctx.fillStyle = '#dddddd';
    ctx.fillText(description, width / 2, topOffset + boxHeight * 0.67);
  }

  // Logo: bottom-right corner (matching original)
  if (logoImage) {
    const maxLogoHeight = Math.round(90 * s);
    const logoScale = maxLogoHeight / logoImage.naturalHeight;
    const logoWidth = logoImage.naturalWidth * logoScale;
    const logoHeight = maxLogoHeight;
    const padding = Math.round(22 * s);
    const logoX = width - logoWidth - padding;
    const logoY = height - logoHeight - padding;
    ctx.drawImage(logoImage, logoX, logoY, logoWidth, logoHeight);
  }
}

// ---------------------------------------------------------------------------
// Download Helper
// ---------------------------------------------------------------------------

/** Trigger a browser download of a data URL as a file. */
export function downloadScreenshot(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
