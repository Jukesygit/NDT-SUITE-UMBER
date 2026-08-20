// ---------------------------------------------------------------------------
// Publish-time vessel screenshot — the WebGL half.
//
// Renders one offscreen frame per published vessel so the client's landing page
// shows the vessel instead of three letters. It is deliberately assembled from
// the SAME pieces the client's own viewport uses — `SceneManager` for the light
// rig and background gradient, `buildReadOnlyScene` for the geometry,
// `canonicalPose('iso', …)` for the framing — rather than from a second set of
// lighting constants that would drift out of agreement with the viewer one
// commit at a time.
//
// WHAT IS RENDERED is not this module's decision: see `vessel-screenshot-state`,
// which owns the rule that a card image is rendered from the SANITISED model.
// Never hand `buildReadOnlyScene` a caller's raw `VesselState` from here.
//
// BEST EFFORT, ALWAYS. Every failure path returns null — no WebGL context, a
// blocked canvas readback, a throw halfway through a build. A client share must
// never fail because a thumbnail did.
//
// CHUNKING: three.js-bearing. Reached ONLY through a dynamic import from the
// publish flow, exactly like `bundle-builder`. A projects page that never
// publishes must never load the 3D engine, so do not import this statically
// from anything under `components/projects` or `pages/`.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { canonicalPose } from '../VesselModeler/engine/canonical-views';
import {
  buildReadOnlyPipelines,
  buildReadOnlyScene,
  createReadOnlyMaterials,
  type ReadOnlyMaterials,
} from '../VesselModeler/engine/readonly-scene';
import { applyLayerVisibility, applyReadOnlyVisuals } from '../VesselModeler/engine/readonly-sync';
import { SceneManager } from '../VesselModeler/engine/scene-manager';
import type { LayerKey } from '../VesselModeler/outliner-tree';
import type { VesselState } from '../VesselModeler/types';
import { SCREENSHOT_LAYERS, screenshotSourceState } from './vessel-screenshot-state';

export { SCREENSHOT_LAYERS, screenshotSourceState } from './vessel-screenshot-state';

/** Card image size. Fixed, not the publisher's window: a published bundle must
 *  weigh the same whatever screen it was published from. Square because the
 *  landing card's figure is a 64px square with object-fit: cover — a landscape
 *  capture would centre-crop the vessel's ends away. */
const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;

/**
 * Overlay photo textures are NOT decoded for a card image. Doing so would mean
 * a second base64 decode of every inspection photo per vessel at publish time
 * for a 64px tile; a card without its photo overlays is the accepted trade
 * (design amendment, 2026-08-20). Everything else — including the scan and dome
 * heatmaps, which the geometry builder bakes from composite data onto a canvas —
 * renders without any texture object at all.
 */
const NO_TEXTURES: Record<number, THREE.Texture> = {};

export interface VesselScreenshotOptions {
  /** Rendered pixels. Defaults to 512×512 (see DEFAULT_WIDTH). */
  width?: number;
  height?: number;
  /** Grid decimation cap, forwarded to the sanitiser (defaults to the bundle's). */
  maxDimension?: number;
}

export interface VesselScreenshotSession {
  /** One vessel's card image, or null when it could not be captured. */
  capture(
    vesselState: VesselState,
    published: ReadonlySet<LayerKey>,
    opts?: { maxDimension?: number }
  ): Promise<Blob | null>;
  /** Releases the WebGL context and removes the offscreen container. */
  dispose(): void;
}

/**
 * Read the frame back as PNG bytes.
 *
 * Safe to await rather than read synchronously: `SceneManager` builds its
 * renderer with `preserveDrawingBuffer: true` (scene-manager.ts — "Required for
 * screenshot export"), so the buffer still holds the rendered frame after the
 * task that drew it. Without that flag this would have to be a synchronous
 * `toDataURL` in the same task as `render()`, or it could read a cleared buffer.
 */
function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/**
 * Frame the built vessel the way the client's viewport frames it on mount
 * (`ReadOnlyViewport`, opening-pose block): an isometric fit of the bounding
 * sphere of what was actually built. Bounds come from the vessel group alone —
 * the scene also carries a 50-unit ground plane that would swamp them.
 */
function frameVessel(manager: SceneManager, state: VesselState): void {
  const group = manager.getVesselGroup();
  const bounds = group ? new THREE.Box3().setFromObject(group) : null;
  if (!bounds || bounds.isEmpty()) {
    manager.resetCamera();
    return;
  }
  const pose = canonicalPose('iso', state, {
    center: bounds.getCenter(new THREE.Vector3()),
    radius: bounds.getBoundingSphere(new THREE.Sphere()).radius,
  });
  manager.getCamera().position.copy(pose.position);
  manager.getControls().target.copy(pose.target);
  manager.getControls().update();
}

/**
 * Open one offscreen renderer and keep it for a whole publish.
 *
 * Reuse is the point: a browser hands out roughly a dozen WebGL contexts before
 * it starts evicting them, so a ten-vessel publish that opened one context per
 * vessel would be losing contexts mid-run. Captures are therefore SEQUENTIAL and
 * share a single renderer, container and light rig; only the vessel group and
 * its materials are rebuilt per vessel.
 *
 * Returns null when no context can be created (headless, blocklisted GPU, no
 * DOM) — the caller then publishes without card images.
 */
export function createScreenshotSession(
  opts: VesselScreenshotOptions = {}
): VesselScreenshotSession | null {
  if (typeof document === 'undefined' || !document.body) return null;

  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;

  // Offscreen but LAID OUT. SceneManager sizes its camera and renderer from the
  // container's clientWidth/clientHeight, which `display:none` reports as 0, so
  // the container is parked off-viewport instead of hidden. Inline styles rather
  // than a class on purpose: this element is never seen and belongs to no design
  // system — it exists for one frame of readback.
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
  document.body.appendChild(container);

  let manager: SceneManager;
  try {
    manager = new SceneManager(container);
    // One device pixel per rendered pixel. The publisher's 3× laptop must not
    // triple the bytes every client on a phone downloads.
    manager.getRenderer().setPixelRatio(1);
    manager.init();
  } catch {
    container.remove();
    return null;
  }

  let materials: ReadOnlyMaterials | null = null;

  /** Tear the previous vessel back out, GPU resources and all. */
  const clearVessel = (): void => {
    const group = manager.getVesselGroup();
    if (group) {
      // Pipelines are a child of the vessel group; setting them null disposes
      // them before the parent walk would have orphaned them.
      manager.setPipelineGroup(null);
      manager.disposeObject(group);
      manager.getScene().remove(group);
      manager.setVesselGroup(null);
    }
    if (materials) {
      Object.values(materials).forEach((material) => material.dispose());
      materials = null;
    }
  };

  const capture = async (
    vesselState: VesselState,
    published: ReadonlySet<LayerKey>,
    captureOpts: { maxDimension?: number } = {}
  ): Promise<Blob | null> => {
    try {
      clearVessel();

      // The sanitised model, never the caller's. See `vessel-screenshot-state`.
      const shipped = screenshotSourceState(vesselState, published, captureOpts.maxDimension);

      materials = createReadOnlyMaterials(shipped.visuals.material);
      const built = buildReadOnlyScene(shipped, materials, NO_TEXTURES, SCREENSHOT_LAYERS);
      manager.getScene().add(built.result.vesselGroup);
      manager.setVesselGroup(built.result.vesselGroup);

      // Pipelines resolve nozzle world matrices, so they build after parenting
      // — same ordering ReadOnlyViewport's rebuild uses.
      const pipelineRoot = buildReadOnlyPipelines(shipped, built.result, materials);
      manager.setPipelineGroup(pipelineRoot);
      applyLayerVisibility(shipped, { ...built, pipelineRoot }, SCREENSHOT_LAYERS);

      // An environment map is a GPU render target SceneManager replaces without
      // freeing the previous one; clearing it between vessels stops a long
      // publish stacking one PMREM target per card.
      manager.setEnvironmentMap(false);
      applyReadOnlyVisuals(shipped.visuals, materials, manager);

      frameVessel(manager, shipped);

      const renderer = manager.getRenderer();
      renderer.render(manager.getScene(), manager.getCamera());
      return await canvasToPng(renderer.domElement);
    } catch {
      // Best effort by contract — the caller publishes without this card.
      return null;
    }
  };

  const dispose = (): void => {
    clearVessel();
    const renderer = manager.getRenderer();
    manager.dispose();
    // `dispose()` frees three's own objects; forcing the context loss is what
    // actually hands the WebGL context back to the browser.
    renderer.forceContextLoss();
    container.remove();
  };

  return { capture, dispose };
}

/**
 * One-shot capture. Convenience over {@link createScreenshotSession} for a
 * single vessel; a multi-vessel publish should open one session instead, so the
 * WebGL context is created once.
 */
export async function captureVesselScreenshot(
  vesselState: VesselState,
  published: ReadonlySet<LayerKey>,
  opts: VesselScreenshotOptions = {}
): Promise<Blob | null> {
  const session = createScreenshotSession(opts);
  if (!session) return null;
  try {
    return await session.capture(vesselState, published, { maxDimension: opts.maxDimension });
  } finally {
    session.dispose();
  }
}
