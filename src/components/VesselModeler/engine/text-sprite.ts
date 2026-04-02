// =============================================================================
// Vessel Modeler - Text Sprite Factory (glTF-exportable labels)
// =============================================================================
// Renders annotation and ruler label text onto a canvas, then creates a
// THREE.Sprite with a CanvasTexture. Unlike CSS2DObject labels, sprites are
// real 3D objects that export to glTF/GLB.
// =============================================================================

import * as THREE from 'three';
import type { AnnotationShapeConfig, RulerConfig, VesselState } from '../types';
import { getAnnotationLeaderEndPosition } from './annotation-labels';
import { computeRulerDistance, shellPoint } from './annotation-geometry';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// Canvas Text Rendering
// ---------------------------------------------------------------------------

interface TextLine {
  text: string;
  font: string;
  color: string;
}

const CANVAS_SCALE = 2;          // render at 2x for crisp text
const PADDING_X = 16 * CANVAS_SCALE;
const PADDING_Y = 12 * CANVAS_SCALE;
const LINE_HEIGHT = 36 * CANVAS_SCALE;
const FONT_SIZE_NAME = 28 * CANVAS_SCALE;
const FONT_SIZE_DETAIL = 24 * CANVAS_SCALE;
const BORDER_WIDTH = 2 * CANVAS_SCALE;

/**
 * Render multi-line styled text onto a hi-res canvas and return as a plane Mesh.
 * The canvas is auto-sized to fit the text content.
 */
function createTextSprite(
  lines: TextLine[],
  background: string,
  borderColor: string,
  worldScale: number,
): THREE.Mesh {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Measure text on a temporary canvas to determine dimensions.
  // Setting canvas.width later resets ctx state, so we measure first,
  // then re-apply fonts when drawing.
  let maxWidth = 0;
  if (ctx) {
    for (const line of lines) {
      ctx.font = line.font;
      const metrics = ctx.measureText(line.text);
      maxWidth = Math.max(maxWidth, metrics.width);
    }
  } else {
    for (const line of lines) {
      maxWidth = Math.max(maxWidth, line.text.length * 14 * CANVAS_SCALE);
    }
  }

  const contentHeight = lines.length * LINE_HEIGHT;
  // Extra 10% margin to guard against measurement rounding
  canvas.width = Math.ceil((maxWidth + PADDING_X * 2 + BORDER_WIDTH * 2) * 1.1);
  canvas.height = Math.ceil(contentHeight + PADDING_Y * 2 + BORDER_WIDTH * 2);

  if (ctx) {
    // Background
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = BORDER_WIDTH;
    ctx.strokeRect(
      BORDER_WIDTH / 2,
      BORDER_WIDTH / 2,
      canvas.width - BORDER_WIDTH,
      canvas.height - BORDER_WIDTH,
    );

    // Text lines (re-apply font after canvas resize reset the context)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      ctx.font = line.font;
      ctx.fillStyle = line.color;
      ctx.textBaseline = 'top';
      ctx.fillText(
        line.text,
        PADDING_X + BORDER_WIDTH,
        PADDING_Y + BORDER_WIDTH + i * LINE_HEIGHT,
      );
    }
  }

  // Create texture + mesh plane (GLTFExporter does not support THREE.Sprite)
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  // World size accounts for canvas scale so the label stays the same physical size
  const w = (canvas.width / CANVAS_SCALE) * worldScale;
  const h = (canvas.height / CANVAS_SCALE) * worldScale;
  const geometry = new THREE.PlaneGeometry(w, h);

  // Flip UVs horizontally so text reads correctly when the plane faces the camera.
  // PlaneGeometry default UVs assume viewing from +Z; in the exported GLB the
  // labels are typically viewed from -Z, which mirrors the text.
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, 1 - uv.getX(i));
  }

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}

// ---------------------------------------------------------------------------
// Annotation Label Sprite
// ---------------------------------------------------------------------------

/**
 * Create a billboard sprite matching the annotation label content.
 * Text: name, scan/index position, area.
 */
export function createAnnotationLabelSprite(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
): THREE.Mesh {
  const scanMm = Math.round((config.angle / 360) * Math.PI * vesselState.id);
  const indexMm = Math.round(config.pos);
  const areaSqM = config.type === 'circle'
    ? (Math.PI * (config.width / 2) ** 2) / 1_000_000
    : (config.width * config.height) / 1_000_000;

  const lines: TextLine[] = [
    {
      text: config.name,
      font: `bold ${FONT_SIZE_NAME}px monospace`,
      color: '#ffffff',
    },
    {
      text: `Scan: ${scanMm}mm  Index: ${indexMm}mm`,
      font: `${FONT_SIZE_DETAIL}px monospace`,
      color: 'rgba(255, 255, 255, 0.65)',
    },
    {
      text: `${areaSqM.toFixed(2)} m\u00b2`,
      font: `${FONT_SIZE_DETAIL}px monospace`,
      color: 'rgba(77, 184, 255, 0.9)',
    },
  ];

  // Scale labels relative to vessel size so they're readable but not overwhelming
  const worldScale = vesselState.id * SCALE * 0.001;

  const mesh = createTextSprite(
    lines,
    'rgba(10, 14, 20, 0.88)',
    'rgba(255, 255, 255, 0.15)',
    worldScale,
  );

  const position = getAnnotationLeaderEndPosition(config, vesselState);
  mesh.position.copy(position);
  mesh.userData = { type: 'export-label', sourceType: 'annotation', sourceId: config.id };

  return mesh;
}

// ---------------------------------------------------------------------------
// Ruler Label Sprite
// ---------------------------------------------------------------------------

/**
 * Create a billboard sprite matching the ruler distance label.
 * Positioned at the ruler midpoint.
 */
export function createRulerLabelSprite(
  config: RulerConfig,
  vesselState: VesselState,
): THREE.Mesh {
  const distMm = computeRulerDistance(config, vesselState);

  const lines: TextLine[] = [
    {
      text: `${Math.round(distMm)} mm`,
      font: `bold ${FONT_SIZE_NAME}px monospace`,
      color: '#000000',
    },
  ];

  const worldScale = vesselState.id * SCALE * 0.001;

  const mesh = createTextSprite(
    lines,
    'rgba(255, 170, 0, 0.9)',
    'rgba(200, 130, 0, 1)',
    worldScale,
  );

  // Position at ruler midpoint (same logic as annotation-labels.ts:createRulerLabel)
  const midPos = (config.startPos + config.endPos) / 2;
  const midAngle = (config.startAngle + config.endAngle) / 2;
  const surfaceOffset = 5;
  const point = shellPoint(midPos, (midAngle * Math.PI) / 180, vesselState, surfaceOffset);
  mesh.position.copy(point);
  mesh.userData = { type: 'export-label', sourceType: 'ruler', sourceId: config.id };

  return mesh;
}
