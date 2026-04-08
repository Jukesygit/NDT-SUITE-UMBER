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

  // Position at ruler midpoint, offset radially so the label sits outside the
  // ruler marker instead of covering it (mirrors the CSS translate(-50%,-100%)
  // that the interactive CSS2D label uses).
  const midPos = (config.startPos + config.endPos) / 2;
  const midAngle = (config.startAngle + config.endAngle) / 2;
  const angleRad = (midAngle * Math.PI) / 180;
  const surfaceOffset = 5;
  const point = shellPoint(midPos, angleRad, vesselState, surfaceOffset);

  // Compute outward radial direction at this point
  const origin = shellPoint(midPos, angleRad, vesselState, 0);
  const radial = point.clone().sub(origin).normalize();

  // Shift outward by half the sprite height + a small gap so the inner edge
  // of the label starts just outside the ruler marker
  const h = (mesh.geometry as THREE.PlaneGeometry).parameters.height;
  point.addScaledVector(radial, h * 0.5 + worldScale * 4);

  mesh.position.copy(point);
  mesh.userData = { type: 'export-label', sourceType: 'ruler', sourceId: config.id };

  return mesh;
}

// ---------------------------------------------------------------------------
// Nameplate Sprite (for GLB export)
// ---------------------------------------------------------------------------

/**
 * Create a nameplate mesh with label-value pairs (Location, Vessel, Date).
 * Positioned flat on the ground plane to the front-right of the vessel.
 * Only rows with non-empty values are rendered. Returns null if all fields empty.
 */
export function createNameplateSprite(
  vesselState: VesselState,
): THREE.Mesh | null {
  const rows: { label: string; value: string }[] = [];
  if (vesselState.location) rows.push({ label: 'LOCATION', value: vesselState.location });
  if (vesselState.vesselName) rows.push({ label: 'VESSEL', value: vesselState.vesselName });
  if (vesselState.inspectionDate) rows.push({ label: 'DATE', value: vesselState.inspectionDate });

  if (rows.length === 0) return null;

  const maxLabelLen = Math.max(...rows.map(r => r.label.length));

  const lines: TextLine[] = rows.map(row => ({
    text: `  ${row.label.padEnd(maxLabelLen + 2)}${row.value}  `,
    font: `bold ${FONT_SIZE_NAME}px monospace`,
    color: '#ffffff',
  }));

  // Double-sized compared to annotation labels for readability
  const worldScale = vesselState.id * SCALE * 0.003;

  const mesh = createTextSprite(
    lines,
    'rgba(10, 14, 20, 0.92)',
    'rgba(100, 160, 255, 0.3)',
    worldScale,
  );

  // Position: flat on ground plane, to the front-right of the vessel
  const vesselRadius = (vesselState.id / 2) * SCALE;
  const vesselLength = vesselState.length * SCALE;

  if (vesselState.orientation === 'horizontal') {
    mesh.position.set(
      vesselLength * 0.6,     // right of vessel center
      -vesselRadius,           // ground level (bottom of vessel)
      vesselRadius * 1.8,     // in front of vessel
    );
  } else {
    mesh.position.set(
      vesselRadius * 1.8,     // right of vessel
      -vesselRadius,           // ground level (bottom of vessel)
      vesselRadius * 1.8,     // in front of vessel
    );
  }

  // Rotate to lie flat on the ground plane, text facing up and readable
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.PI;

  mesh.userData = { type: 'export-nameplate' };
  return mesh;
}
