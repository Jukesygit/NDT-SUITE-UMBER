// =============================================================================
// Vessel Modeler - Text Sprite Factory (glTF-exportable labels)
// =============================================================================
// Renders annotation and ruler label text onto a canvas, then creates a
// THREE.Sprite with a CanvasTexture. Unlike CSS2DObject labels, sprites are
// real 3D objects that export to glTF/GLB.
// =============================================================================

import * as THREE from 'three';
import type { AnnotationShapeConfig, NozzleConfig, RulerConfig, VesselState } from '../types';
import { getAnnotationLeaderEndPosition } from './annotation-labels';
import { computeRulerDistance, shellPoint } from './annotation-geometry';
import { SCALE } from './materials';
import { getSaddleBaseY } from './saddle-geometry';
import { computeNozzleTipY } from './pipeline-geometry';

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
const IMAGE_MAX_W = 400 * CANVAS_SCALE;
const IMAGE_MAX_H = 240 * CANVAS_SCALE;
const IMAGE_PADDING = 8 * CANVAS_SCALE;

/** Load a data URL into an HTMLImageElement. */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Render multi-line styled text onto a hi-res canvas and return as a plane Mesh.
 * The canvas is auto-sized to fit the text content.
 * If `image` is provided, it is drawn below the text.
 */
function createTextSprite(
  lines: TextLine[],
  background: string,
  borderColor: string,
  worldScale: number,
  image?: HTMLImageElement,
  pill?: boolean,
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

  // Compute image draw dimensions (fit within max bounds, preserving aspect ratio)
  let imgDrawW = 0;
  let imgDrawH = 0;
  let imgSectionH = 0;
  if (image) {
    const aspect = image.width / image.height;
    imgDrawW = Math.min(IMAGE_MAX_W, image.width * CANVAS_SCALE);
    imgDrawH = imgDrawW / aspect;
    if (imgDrawH > IMAGE_MAX_H) {
      imgDrawH = IMAGE_MAX_H;
      imgDrawW = imgDrawH * aspect;
    }
    maxWidth = Math.max(maxWidth, imgDrawW);
    imgSectionH = imgDrawH + IMAGE_PADDING;
  }

  const contentHeight = lines.length * LINE_HEIGHT;
  // Extra 10% margin to guard against measurement rounding
  canvas.width = Math.ceil((maxWidth + PADDING_X * 2 + BORDER_WIDTH * 2) * 1.1);
  canvas.height = Math.ceil(contentHeight + imgSectionH + PADDING_Y * 2 + BORDER_WIDTH * 2);

  // Border radius: pill mode uses full rounding, otherwise match the CSS (6px at 2x)
  const radius = pill ? canvas.height / 2 : 6 * CANVAS_SCALE;

  if (ctx) {
    // Clear to transparent so corners outside the rounded rect are invisible
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Rounded background
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
    ctx.fillStyle = background;
    ctx.fill();

    // Rounded border
    ctx.beginPath();
    ctx.roundRect(
      BORDER_WIDTH / 2,
      BORDER_WIDTH / 2,
      canvas.width - BORDER_WIDTH,
      canvas.height - BORDER_WIDTH,
      Math.max(0, radius - BORDER_WIDTH / 2),
    );
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = BORDER_WIDTH;
    ctx.stroke();

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

    // Draw image below text
    if (image) {
      const imgX = PADDING_X + BORDER_WIDTH;
      const imgY = PADDING_Y + BORDER_WIDTH + contentHeight + IMAGE_PADDING;
      ctx.drawImage(image, imgX, imgY, imgDrawW, imgDrawH);
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

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.01,  // discard fully transparent pixels outside rounded rect
  });

  // Build a single geometry with two faces (front + back) so text reads
  // correctly from both sides. Baking both faces into one BufferGeometry
  // avoids child-transform issues in the GLTFExporter.
  //
  // Front face (faces +Z): standard quad with normal UVs.
  // Back face  (faces -Z): same quad with reversed winding and UVs
  //   mirrored on X so the text isn't backwards.
  const hw = w / 2;
  const hh = h / 2;

  // 8 vertices: 4 for front, 4 for back (same positions, different normals/UVs)
  const positions = new Float32Array([
    // Front face (faces +Z)
    -hw, -hh, 0,   hw, -hh, 0,   hw, hh, 0,   -hw, hh, 0,
    // Back face  (faces -Z) — same positions
    -hw, -hh, 0,   hw, -hh, 0,   hw, hh, 0,   -hw, hh, 0,
  ]);

  const normals = new Float32Array([
    // Front face normals
    0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,
    // Back face normals
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
  ]);

  const uvs = new Float32Array([
    // Front face UVs (standard: left=0, right=1)
    0, 0,   1, 0,   1, 1,   0, 1,
    // Back face UVs (mirrored X: left=1, right=0 so text reads correctly)
    1, 0,   0, 0,   0, 1,   1, 1,
  ]);

  // Front: CCW winding (0-1-2, 0-2-3) — faces +Z
  // Back:  CW winding  (4-6-5, 4-7-6) — faces -Z
  const indices = [
    0, 1, 2,   0, 2, 3,   // front
    4, 6, 5,   4, 7, 6,   // back
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}

// ---------------------------------------------------------------------------
// Annotation Label Sprite
// ---------------------------------------------------------------------------

/**
 * Create a billboard sprite matching the annotation label content.
 * Text: name, scan/index position, area. Restriction labels include the
 * uploaded photo baked into the canvas texture.
 */
export async function createAnnotationLabelSprite(
  config: AnnotationShapeConfig,
  vesselState: VesselState,
): Promise<THREE.Mesh> {
  const origin = vesselState.coordinateOrigin ?? { indexMm: 0, scanMm: 0 };
  const scanMm = Math.round((config.angle / 360) * Math.PI * vesselState.id - origin.scanMm);
  const indexMm = Math.round(config.pos - origin.indexMm);
  const areaSqM = (config.width * config.height) / 1_000_000;

  const lines: TextLine[] = config.type === 'restriction'
    ? [
        {
          text: `\u26A0 ${config.name}`,
          font: `bold ${FONT_SIZE_NAME}px monospace`,
          color: '#facc15',
        },
        ...(config.restrictionNotes ? [{
          text: config.restrictionNotes,
          font: `${FONT_SIZE_DETAIL}px monospace`,
          color: 'rgba(250, 204, 21, 0.9)',
        }] : []),
        {
          text: `Scan: ${scanMm}mm  Index: ${indexMm}mm`,
          font: `${FONT_SIZE_DETAIL}px monospace`,
          color: 'rgba(255, 255, 255, 0.65)',
        },
      ]
    : [
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

  // Load restriction image if present
  let image: HTMLImageElement | undefined;
  if (config.type === 'restriction' && config.restrictionImage) {
    try {
      image = await loadImage(config.restrictionImage);
    } catch {
      // Image failed to load — proceed without it
    }
  }

  // Scale labels relative to vessel size so they're readable but not overwhelming
  const worldScale = vesselState.id * SCALE * 0.005;

  const mesh = createTextSprite(
    lines,
    'rgb(10, 14, 20)',
    'rgba(255, 255, 255, 0.15)',
    worldScale,
    image,
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
  mesh.geometry.computeBoundingBox();
  const bbox = mesh.geometry.boundingBox!;
  const h = bbox.max.y - bbox.min.y;
  point.addScaledVector(radial, h * 0.5 + worldScale * 4);

  mesh.position.copy(point);
  mesh.userData = { type: 'export-label', sourceType: 'ruler', sourceId: config.id };

  return mesh;
}

// ---------------------------------------------------------------------------
// Nozzle Label Sprite
// ---------------------------------------------------------------------------

/**
 * Create a label sprite for a nozzle, positioned at the flange end.
 * The nozzleGroup must have an up-to-date matrixWorld so we can transform
 * the local tip position into world space.
 */
export function createNozzleLabelSprite(
  config: NozzleConfig,
  nozzleGroup: THREE.Group,
  vesselState: VesselState,
): THREE.Mesh {
  const lines: TextLine[] = [
    {
      text: ` ${config.name} `,
      font: `bold ${FONT_SIZE_NAME}px monospace`,
      color: '#ffffff',
    },
  ];

  const worldScale = vesselState.id * SCALE * 0.003;

  const mesh = createTextSprite(
    lines,
    'rgb(10, 14, 20)',
    'rgba(100, 160, 255, 0.3)',
    worldScale,
    undefined,
    true, // pill shape
  );

  // Position at the flange end of the nozzle
  nozzleGroup.updateMatrixWorld(true);
  const shellRadius = vesselState.id / 2;
  const tipY = computeNozzleTipY(config, shellRadius);
  const tipWorld = new THREE.Vector3(0, tipY, 0).applyMatrix4(nozzleGroup.matrixWorld);

  // Offset slightly outward along the nozzle axis so label doesn't overlap flange
  const nozzleDir = new THREE.Vector3(0, 1, 0)
    .transformDirection(nozzleGroup.matrixWorld)
    .normalize();
  tipWorld.addScaledVector(nozzleDir, worldScale * 20);

  mesh.position.copy(tipWorld);
  mesh.userData = { type: 'export-label', sourceType: 'nozzle', name: config.name };

  return mesh;
}

// ---------------------------------------------------------------------------
// Nameplate Sprite (for GLB export)
// ---------------------------------------------------------------------------

/**
 * Create two nameplate meshes with label-value pairs (Location, Vessel, Date).
 * Positioned flat on the ground plane on opposite sides of the vessel so the
 * details are visible from both viewing angles. Text on each plate faces outward
 * (towards a viewer looking at the vessel centre).
 * Returns null if all fields are empty.
 */
export function createNameplateSprites(
  vesselState: VesselState,
): THREE.Group | null {
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

  // Larger scale for better readability
  const worldScale = vesselState.id * SCALE * 0.005;

  const vesselRadius = (vesselState.id / 2) * SCALE;
  const vesselLength = vesselState.length * SCALE;
  // Align with the bottom of the saddle supports (ground plane)
  const floorY = getSaddleBaseY(vesselState);

  const group = new THREE.Group();
  group.userData = { type: 'export-nameplate' };

  // Create two nameplates — one on each side of the vessel (front & back along Z)
  for (const side of [-1, 1] as const) {
    const mesh = createTextSprite(
      lines,
      'rgb(10, 14, 20)',
      'rgba(100, 160, 255, 0.3)',
      worldScale,
    );

    if (vesselState.orientation === 'horizontal') {
      // Horizontal vessel: nameplates along Z axis (front and back)
      mesh.position.set(
        vesselLength * 0.5,         // centred on vessel length
        floorY,                     // level with saddle base
        side * vesselRadius * 1.8,  // front (+Z) and back (-Z)
      );
    } else {
      // Vertical vessel: nameplates along Z axis
      mesh.position.set(
        side * vesselRadius * 1.8,  // left and right of vessel
        floorY,                     // level with saddle base
        vesselRadius * 1.8,         // in front
      );
    }

    // Lie flat on the ground plane
    mesh.rotation.x = -Math.PI / 2;
    // Orient text so it reads correctly for a viewer looking towards vessel centre.
    // The front plane of the group already faces +Z (towards the viewer on that side).
    // side +1 (front, +Z): text should face the outside viewer (looking towards -Z),
    //   so we don't rotate — the default front face points at the viewer.
    // side -1 (back, -Z): text should face the outside viewer (looking towards +Z),
    //   so rotate 180° to flip the text around.
    mesh.rotation.z = side === 1 ? 0 : Math.PI;

    mesh.userData = { type: 'export-nameplate', side: side === 1 ? 'front' : 'back' };
    group.add(mesh);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Cardinal Direction Sprites (N / S / E / W)
// ---------------------------------------------------------------------------

/**
 * Create baked N/S/E/W label meshes for glTF export.
 * Positions mirror scene-manager.ts `setCardinalDirectionsVisible`.
 */
export function createCardinalDirectionSprites(
  vesselState: VesselState,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'export-cardinalDirections' };

  // Position just outside the vessel radius so labels are visible without zooming out
  const vesselRadius = (vesselState.id / 2) * SCALE;
  const dist = vesselRadius * 1.6;
  const labels: { text: string; x: number; z: number; primary?: boolean }[] = [
    { text: 'N', x: 0, z: -dist, primary: true },
    { text: 'S', x: 0, z: dist },
    { text: 'E', x: dist, z: 0 },
    { text: 'W', x: -dist, z: 0 },
  ];

  const worldScale = vesselState.id * SCALE * 0.005;

  for (const { text, x, z, primary } of labels) {
    const lines: TextLine[] = [{
      text: ` ${text} `,
      font: `bold ${FONT_SIZE_NAME}px sans-serif`,
      color: primary ? '#ffffff' : 'rgba(255,255,255,0.7)',
    }];

    const mesh = createTextSprite(
      lines,
      primary ? 'rgba(10, 14, 20, 0.85)' : 'rgba(10, 14, 20, 0.6)',
      primary ? 'rgba(100, 160, 255, 0.4)' : 'rgba(100, 160, 255, 0.15)',
      worldScale,
    );

    mesh.position.set(x, 0.05, z);
    // Lie flat on the ground, text facing up
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData = { type: 'export-cardinal', label: text };
    group.add(mesh);
  }

  const rotation = vesselState.visuals.cardinalRotation ?? 0;
  group.rotation.y = THREE.MathUtils.degToRad(rotation);

  return group;
}
