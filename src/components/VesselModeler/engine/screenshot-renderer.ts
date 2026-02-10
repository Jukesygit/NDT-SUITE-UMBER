// =============================================================================
// Screenshot Renderer - Capture, Annotate, and Export Viewport Images
// =============================================================================
// Handles screenshot capture from the Three.js viewport, rendering annotation
// overlays onto a 2D canvas, and exporting the final composited image.
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
 */
export function renderAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  width: number,
  height: number
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
  }
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
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
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

  // Centered distance label
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const label = `${Math.round(len)}px`;
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
// Screenshot Capture
// ---------------------------------------------------------------------------

/**
 * Capture a screenshot from the Three.js renderer with annotations composited.
 *
 * 1. Creates an offscreen canvas at `width * multiplier` resolution.
 * 2. Sets background color if not 'current'.
 * 3. Renders the scene to an offscreen renderer.
 * 4. Draws annotation overlay on top.
 * 5. Adds title/description text if provided.
 * 6. Returns a data URL (png or jpeg).
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

  // Store original state
  const originalSize = renderer.getSize(new THREE.Vector2());
  const originalPixelRatio = renderer.getPixelRatio();
  const originalBackground = scene.background;

  // Compute target resolution
  const targetWidth = Math.round(originalSize.x * multiplier);
  const targetHeight = Math.round(originalSize.y * multiplier);

  // Apply background override
  if (background && background !== 'current') {
    if (background === 'transparent') {
      scene.background = null;
    } else {
      scene.background = new THREE.Color(background);
    }
  }

  // Temporarily resize renderer
  renderer.setPixelRatio(1);
  renderer.setSize(targetWidth, targetHeight, false);
  camera.aspect = targetWidth / targetHeight;
  camera.updateProjectionMatrix();

  // Render one frame
  renderer.render(scene, camera);

  // Create offscreen compositing canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = targetWidth;
  offscreen.height = targetHeight;
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    // Restore and bail
    restoreRenderer(renderer, camera, originalSize, originalPixelRatio, originalBackground, scene);
    return '';
  }

  // If background is specified and not 'current', fill first
  if (background && background !== 'current' && background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  // Copy rendered scene pixels
  ctx.drawImage(renderer.domElement, 0, 0, targetWidth, targetHeight);

  // Draw annotations overlay (scaled up by multiplier)
  ctx.save();
  ctx.scale(multiplier, multiplier);
  renderAnnotations(ctx, annotations, originalSize.x, originalSize.y);
  ctx.restore();

  // Add title at top-left with shadow
  if (title) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${24 * multiplier}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, 16 * multiplier, 16 * multiplier);
    ctx.restore();
  }

  // Add description below title
  if (description) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = `${16 * multiplier}px sans-serif`;
    ctx.textBaseline = 'top';
    const yOffset = title ? 44 * multiplier : 16 * multiplier;
    ctx.fillText(description, 16 * multiplier, yOffset);
    ctx.restore();
  }

  // Generate data URL
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = format === 'jpeg' ? jpegQuality / 100 : undefined;
  const dataUrl = offscreen.toDataURL(mimeType, quality);

  // Restore original renderer state
  restoreRenderer(renderer, camera, originalSize, originalPixelRatio, originalBackground, scene);

  // Re-render at original size so the live viewport is not left blank
  renderer.render(scene, camera);

  return dataUrl;
}

function restoreRenderer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  originalSize: THREE.Vector2,
  originalPixelRatio: number,
  originalBackground: THREE.Color | THREE.Texture | THREE.CubeTexture | null,
  scene: THREE.Scene
): void {
  renderer.setPixelRatio(originalPixelRatio);
  renderer.setSize(originalSize.x, originalSize.y, false);
  camera.aspect = originalSize.x / originalSize.y;
  camera.updateProjectionMatrix();
  scene.background = originalBackground;
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
