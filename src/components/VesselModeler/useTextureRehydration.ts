// =============================================================================
// useTextureRehydration — reconcile THREE.Texture objects with texture configs
// =============================================================================
// THREE.Texture GPU objects live outside the reducer in `textureObjectsRef`,
// keyed by texture id, and are disposed on delete. The load path rebuilds them
// up-front from `TextureConfig.imageData` via `loadTextureFromData`, but undo of
// a texture delete restores only the serializable config — the GPU texture is
// gone. This hook watches `textures` and rebuilds any config whose id is missing
// from the ref, exactly as the load path does, then bumps the texture-objects
// version so the viewport re-renders the overlay.
//
// See docs/plans/2026-07-29-vessel-modeler-undo-redo-design.md (§4 Textures).
// =============================================================================

import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import * as THREE from 'three';
import { loadTextureFromData } from './engine/texture-manager';
import type { TextureConfig } from './types';
import type { ThreeViewportHandle } from './ThreeViewport';

interface TextureRehydrationParams {
  /** Current vessel texture configs (document slice). */
  textures: TextureConfig[];
  /** Viewport handle used to obtain the WebGL renderer for texture upload. */
  viewportRef: RefObject<ThreeViewportHandle | null>;
  /** Imperative store of live THREE.Texture objects, keyed by texture id. */
  textureObjectsRef: MutableRefObject<Record<number, THREE.Texture>>;
  /** Bump the texture-objects version so the viewport picks up new textures. */
  bumpVersion: () => void;
}

/**
 * Rebuild missing THREE.Texture objects for restored texture configs.
 *
 * Guards:
 * - configs without `imageData` are ignored (nothing to rebuild from);
 * - an in-flight Set prevents a slow async build being started twice;
 * - if the component unmounted, the id vanished from state again, or another
 *   build already stored the texture before this build resolved, the freshly
 *   built texture is disposed instead of stored (no leak, no stale write).
 *
 * A rebuilt texture is stored under a fresh ref object (new identity) so the
 * viewport's Tier-1 effect detects the change and rebuilds the overlay — the
 * same signal the load path emits when it replaces the whole ref.
 */
export function useTextureRehydration({
  textures,
  viewportRef,
  textureObjectsRef,
  bumpVersion,
}: TextureRehydrationParams): void {
  const inFlightRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);
  // Latest configs, readable inside async resolutions (closure captures stale).
  const latestTexturesRef = useRef(textures);
  latestTexturesRef.current = textures;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const objects = textureObjectsRef.current;
    for (const config of textures) {
      const id = Number(config.id);
      if (!config.imageData) continue;
      if (objects[id]) continue;
      if (inFlightRef.current.has(id)) continue;

      const renderer = viewportRef.current?.getRenderer();
      // Renderer not ready yet (early mount): retry on the next textures change.
      if (!renderer) continue;

      inFlightRef.current.add(id);
      const imageData = config.imageData;
      loadTextureFromData(imageData, renderer)
        .then((result) => {
          inFlightRef.current.delete(id);
          const store = textureObjectsRef.current;
          const stillWanted = latestTexturesRef.current.some(
            (t) => Number(t.id) === id && !!t.imageData
          );
          // Unmounted, re-deleted, or already rebuilt elsewhere → discard.
          if (!mountedRef.current || !stillWanted || store[id]) {
            result.texture.dispose();
            return;
          }
          textureObjectsRef.current = { ...store, [id]: result.texture };
          bumpVersion();
        })
        .catch(() => {
          // Corrupt/undecodable imageData — drop the in-flight marker so a later
          // configs change can retry; matches the load path's silent skip.
          inFlightRef.current.delete(id);
        });
    }
  }, [textures, viewportRef, textureObjectsRef, bumpVersion]);
}
