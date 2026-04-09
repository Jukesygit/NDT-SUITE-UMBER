// =============================================================================
// Report Image Capture — Programmatic 3D viewport image generation
// =============================================================================

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VesselState, AnnotationShapeConfig } from '../types';
import type { VesselOverviewImage, CompanionScanImageSet } from './report-generator';
import { createAnnotationHeatmapCanvas } from './annotation-heatmap';
import { SCALE } from './materials';
import { createAnnotationLabelSprite, createRulerLabelSprite } from './text-sprite';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaptureContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  vesselState: VesselState;
  /** The vessel group object for bounding box calculation (excludes ground, lights, etc.) */
  vesselGroup?: THREE.Group;
}

// ---------------------------------------------------------------------------
// Viewport → data URL helper
// ---------------------------------------------------------------------------

function renderToDataUrl(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): string {
  const renderTarget = new THREE.WebGLRenderTarget(width, height);
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
  renderer.setRenderTarget(null);
  renderTarget.dispose();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);

  // Flip vertically (WebGL reads bottom-up)
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = y * width * 4;
    for (let x = 0; x < width * 4; x++) {
      imageData.data[dstRow + x] = pixels[srcRow + x];
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Vessel overview captures
// ---------------------------------------------------------------------------

interface OverviewViewDef {
  label: string;
  direction: THREE.Vector3;
}

/** Build camera directions based on cardinal rotation setting. */
function getOverviewViews(cardinalRotationDeg: number): OverviewViewDef[] {
  const rot = THREE.MathUtils.degToRad(cardinalRotationDeg);
  // Cardinal base directions: N = (0,0,-1), E = (1,0,0), S = (0,0,1), W = (-1,0,0)
  // Apply cardinalRotation around Y axis
  const north = new THREE.Vector3(Math.sin(rot), 0, -Math.cos(rot));
  const east  = new THREE.Vector3(Math.cos(rot), 0, Math.sin(rot));
  const south = north.clone().negate();
  const west  = east.clone().negate();

  return [
    { label: 'Platform North', direction: north },
    { label: 'Platform East',  direction: east },
    { label: 'Platform South', direction: south },
    { label: 'Platform West',  direction: west },
    { label: 'Top View',       direction: new THREE.Vector3(0, 1, 0) },
    { label: 'Isometric View', direction: new THREE.Vector3(Math.sin(rot) + Math.cos(rot), 1, -Math.cos(rot) + Math.sin(rot)).normalize() },
  ];
}

/** Temporarily add baked label sprites to the scene for capture, returns cleanup function. */
async function addBakedLabels(scene: THREE.Scene, vesselState: VesselState): Promise<() => void> {
  const tempObjects: THREE.Object3D[] = [];

  for (const ann of vesselState.annotations) {
    if (!ann.showLabel || ann.visible === false) continue;
    const sprite = await createAnnotationLabelSprite(ann, vesselState);
    scene.add(sprite);
    tempObjects.push(sprite);
  }

  for (const ruler of vesselState.rulers) {
    if (!ruler.showLabel) continue;
    const sprite = createRulerLabelSprite(ruler, vesselState);
    scene.add(sprite);
    tempObjects.push(sprite);
  }

  return () => {
    for (const obj of tempObjects) {
      scene.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }
  };
}

/** Capture the vessel from multiple standard viewpoints. */
export async function captureVesselOverviews(ctx: CaptureContext): Promise<VesselOverviewImage[]> {
  const overviews: VesselOverviewImage[] = [];
  const { renderer, scene, camera, controls, vesselState } = ctx;

  // Store original camera state
  const origPos = camera.position.clone();
  const origTarget = controls.target.clone();
  const origAspect = camera.aspect;

  // Temporarily bake annotation/ruler labels as 3D sprites (CSS2D labels don't render offscreen)
  const removeBakedLabels = await addBakedLabels(scene, vesselState);

  // Compute bounding box from vessel geometry only (exclude labels, leaders, helpers)
  const bbox = new THREE.Box3();
  const target = ctx.vesselGroup ?? scene;
  target.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const ud = obj.userData?.type;
    if (ud === 'annotation-label' || ud === 'ruler-label' || ud === 'inspection-image-label') return;
    if (ud === 'annotation-fill') return;
    if (ud === 'export-label') return; // exclude baked labels from bbox
    if ((obj.material as THREE.MeshBasicMaterial)?.opacity === 0) return;
    const objBbox = new THREE.Box3().setFromObject(obj);
    if (!objBbox.isEmpty()) bbox.expandByObject(obj);
  });
  if (bbox.isEmpty()) bbox.setFromObject(target);
  const center = bbox.getCenter(new THREE.Vector3());
  const bsphere = bbox.getBoundingSphere(new THREE.Sphere());
  const radius = bsphere.radius;

  const views = getOverviewViews(vesselState.visuals.cardinalRotation ?? 0);

  for (const view of views) {
    const dir = view.direction.clone().normalize();

    // Compute fit distance using both vertical and horizontal FOV
    const aspect = 16 / 10;
    const vFov = camera.fov * (Math.PI / 180);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const fitDistance = radius / Math.sin(Math.min(vFov, hFov) / 2) * 0.7;

    camera.position.copy(center).add(dir.multiplyScalar(fitDistance));
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();

    overviews.push({
      label: view.label,
      dataUrl: renderToDataUrl(renderer, scene, camera, 1600, 1000),
    });
  }

  // Clean up baked labels
  removeBakedLabels();

  // Restore camera
  camera.position.copy(origPos);
  camera.aspect = origAspect;
  camera.updateProjectionMatrix();
  controls.target.copy(origTarget);
  controls.update();

  return overviews;
}

// ---------------------------------------------------------------------------
// Annotation context captures
// ---------------------------------------------------------------------------

/** Capture a view of the vessel focused on a specific annotation's position. */
export function captureAnnotationContext(
  ctx: CaptureContext,
  annotation: AnnotationShapeConfig,
): string {
  const { renderer, scene, camera, controls, vesselState } = ctx;

  const origPos = camera.position.clone();
  const origTarget = controls.target.clone();
  const origAspect = camera.aspect;

  const radius = (vesselState.id / 2) * SCALE;
  const angleRad = (annotation.angle * Math.PI) / 180;

  const targetX = (annotation.pos - vesselState.length / 2) * SCALE;
  const targetY = radius * Math.sin(angleRad);
  const targetZ = radius * Math.cos(angleRad);

  const target = new THREE.Vector3(targetX, targetY, targetZ);
  const distance = vesselState.id * SCALE * 2;
  const cameraDir = new THREE.Vector3(0, Math.sin(angleRad), Math.cos(angleRad)).normalize();

  camera.position.copy(target).add(cameraDir.multiplyScalar(distance));
  camera.aspect = 4 / 3;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();

  const dataUrl = renderToDataUrl(renderer, scene, camera, 800, 600);

  // Restore camera
  camera.position.copy(origPos);
  camera.aspect = origAspect;
  camera.updateProjectionMatrix();
  controls.target.copy(origTarget);
  controls.update();

  return dataUrl;
}

// ---------------------------------------------------------------------------
// Heatmap captures
// ---------------------------------------------------------------------------

/** Render annotation heatmap to data URL. */
export function captureAnnotationHeatmap(
  annotation: AnnotationShapeConfig,
  vesselState: VesselState,
): string | null {
  const canvas = createAnnotationHeatmapCanvas(annotation, vesselState, 'Jet');
  if (!canvas) return null;

  // Scale up for print quality
  const printCanvas = document.createElement('canvas');
  const scale = Math.max(1, Math.floor(512 / Math.max(canvas.width, canvas.height)));
  printCanvas.width = canvas.width * scale;
  printCanvas.height = canvas.height * scale;
  const pCtx = printCanvas.getContext('2d')!;
  pCtx.imageSmoothingEnabled = false;
  pCtx.drawImage(canvas, 0, 0, printCanvas.width, printCanvas.height);

  return printCanvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Companion app scan image fetching
// ---------------------------------------------------------------------------

/** Fetch A/B/C/D scan images from the companion app for an annotation's min-thickness point. */
export async function fetchCompanionScanImages(
  annotation: AnnotationShapeConfig,
  vesselState: VesselState,
  port: number,
): Promise<CompanionScanImageSet | null> {
  const composite = vesselState.scanComposites.find(sc => sc.orientationConfirmed);

  if (!composite?.sourceNdeFile || !annotation.thicknessStats) return null;

  const circumference = Math.PI * vesselState.id;
  const stats = annotation.thicknessStats;

  const indexDir = composite.indexDirection === 'forward' ? 1 : -1;

  // datumAngleDeg uses 0=TDC; annotation.angle uses 90=TDC — convert datum
  const datumConv = ((composite.datumAngleDeg + 90) % 360 + 360) % 360;

  // Directed angular distance from datum to annotation center
  let scanCenterDeg: number;
  if (composite.scanDirection === 'cw') {
    scanCenterDeg = ((datumConv - annotation.angle) % 360 + 360) % 360;
  } else {
    scanCenterDeg = ((annotation.angle - datumConv) % 360 + 360) % 360;
  }
  const scanCenterMm = (scanCenterDeg / 360) * circumference;

  // annotation.height = circumferential extent (scan), annotation.width = axial extent (index)
  const scanHalfMm = annotation.height / 2;
  const indexOffset = (annotation.pos - composite.indexStartMm) * indexDir;
  const indexCenterMm = composite.yAxis[0] + indexOffset;
  const indexHalfMm = annotation.width / 2;

  const scanStartMm = scanCenterMm - scanHalfMm;
  const scanEndMm = scanCenterMm + scanHalfMm;
  const indexStartMm = indexCenterMm - indexHalfMm;
  const indexEndMm = indexCenterMm + indexHalfMm;

  // Crosshair at min point — same directed-angle logic
  let minScanDeg: number;
  if (composite.scanDirection === 'cw') {
    minScanDeg = ((datumConv - stats.minPoint.angle) % 360 + 360) % 360;
  } else {
    minScanDeg = ((stats.minPoint.angle - datumConv) % 360 + 360) % 360;
  }
  const scanLineMm = (minScanDeg / 360) * circumference;
  const indexLineMm = composite.yAxis[0] + (stats.minPoint.pos - composite.indexStartMm) * indexDir;

  try {
    const res = await fetch(`http://localhost:${port}/render-region`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: composite.sourceNdeFile,
        scanStartMm: Math.min(scanStartMm, scanEndMm),
        scanEndMm: Math.max(scanStartMm, scanEndMm),
        indexStartMm: Math.min(indexStartMm, indexEndMm),
        indexEndMm: Math.max(indexStartMm, indexEndMm),
        scanLineMm,
        indexLineMm,
        views: ['bscan_axial', 'bscan_index', 'ascan_center'],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    return {
      bscan: data.bscanIndex ?? undefined,
      dscan: data.bscanAxial ?? undefined,
      ascan: data.ascanCenter ?? undefined,
    };
  } catch {
    return null;
  }
}
