// ---------------------------------------------------------------------------
// Texture hydration — saved texture payloads → { configs, THREE objects }.
//
// Extracted verbatim from the modeler's load path (hooks/useVesselPersistence
// `applyModelConfig`), which is now its first caller. It is THE one place a
// saved `textures[]` payload becomes the pair the rest of the system needs:
//
//   - `configs`  → fed straight into `deserializeVesselState({ textures })`
//                  (the deserializer never reads `raw.textures` itself, because
//                  `aspectRatio` is only knowable once the image has decoded);
//   - `objects`  → the id→THREE.Texture map ThreeViewport / ReadOnlyViewport take
//                  as `textureObjects`.
//
// Both must be produced together, which is exactly why a second consumer (the
// projects-area read-only viewer, via `useLinkedVesselModel`) shares this rather
// than re-deriving the config shape. That consumer has no renderer of its own —
// ReadOnlyViewport owns one privately — so `renderer` is nullable here and
// `loadTextureFromData` falls back to a clamped anisotropy.
//
// Failures are per-texture and silent: an undecodable payload drops that overlay
// and keeps the model loadable, matching the load path's original behaviour.
// ---------------------------------------------------------------------------

import type * as THREE from 'three';
import type { TextureConfig } from '../types';
import { loadTextureFromData } from './texture-manager';

/** One entry of a saved config's `textures[]` array (all fields optional). */
export interface SavedTexturePayload {
  id: number;
  name?: string;
  imageData?: string;
  pos?: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  visible?: boolean;
}

export interface HydratedTextures {
  /** Texture configs in payload order, skipping any that failed to decode. */
  configs: TextureConfig[];
  /** Live THREE textures keyed by texture id, parallel to `configs`. */
  objects: Record<number, THREE.Texture>;
}

/** Empty result — shared so callers can early-return a stable shape. */
export function emptyHydratedTextures(): HydratedTextures {
  return { configs: [], objects: {} };
}

/**
 * Decode every saved texture payload into a config + THREE texture pair.
 *
 * @param saved    Raw `config.textures` array from a persisted model.
 * @param renderer Active renderer for max-anisotropy, or null when none exists.
 */
export async function hydrateSavedTextures(
  saved: readonly SavedTexturePayload[],
  renderer: THREE.WebGLRenderer | null
): Promise<HydratedTextures> {
  const result = emptyHydratedTextures();

  for (const texData of saved) {
    if (!texData.imageData) continue;
    try {
      const loaded = await loadTextureFromData(texData.imageData, renderer);
      result.objects[Number(texData.id)] = loaded.texture;
      result.configs.push({
        id: texData.id,
        name: texData.name || 'Untitled',
        imageData: texData.imageData,
        pos: texData.pos ?? 0,
        angle: texData.angle ?? 90,
        scaleX: texData.scaleX ?? 1.0,
        scaleY: texData.scaleY ?? 1.0,
        rotation: texData.rotation || 0,
        flipH: texData.flipH || false,
        flipV: texData.flipV || false,
        aspectRatio: loaded.aspectRatio,
        visible: texData.visible,
      });
    } catch {
      // Skip textures that fail to load.
    }
  }

  return result;
}
