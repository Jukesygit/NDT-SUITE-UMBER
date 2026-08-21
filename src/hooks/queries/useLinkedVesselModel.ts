/**
 * useLinkedVesselModel — a project vessel's linked 3D model, ready to render.
 *
 * Resolves the `vessel_models` row whose `project_vessel_id` is this vessel
 * (`getVesselModelByProjectVessel`), deserializes its `config` through the ONE
 * deserializer (`engine/vessel-serialization.ts`) and — only when a caller asks
 * for them — rebuilds the THREE textures through the shared hydration path
 * (`engine/texture-hydration.ts`, the modeler load path's own helper).
 *
 * Cloud saves strip composite thickness grids (they live in `scan_composites`),
 * so the model queryFn also re-fetches them through `services/scan-grid-hydration`
 * — the shared mirror of the modeler's own post-load rehydration. The grids ride
 * inside `vesselState`; the cache shape is unchanged.
 *
 * Two cache entries, deliberately:
 *   ['linkedVesselModel', vesselId]              → record + VesselState
 *   ['linkedVesselModel', vesselId, 'textures']  → texture configs + GPU objects
 * The heavy half is opt-in, so the project page's vessel-card strips (numbers
 * only) share the first entry with the Coverage tab and never decode an image.
 *
 * CHUNKING: every VesselModeler import here is dynamic. The deserializer's
 * transitive graph reaches three.js, so a static import would pull the 3D engine
 * into the projects chunk; behind `await import(...)` it is a separate chunk
 * fetched only once a vessel actually has a model.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type * as THREE from 'three';
import { getVesselModelByProjectVessel } from '../../services/vessel-model-service';
import type { VesselModelRecord } from '../../services/vessel-model-service';
import { describeHydrationFailures, hydrateScanGrids } from '../../services/scan-grid-hydration';
import type { VesselState, TextureConfig } from '../../components/VesselModeler/types';

const STALE_TIME_MS = 5 * 60 * 1000;

/** Stable empty map so `textureObjects` never churns identity while loading. */
const NO_TEXTURES: Record<number, THREE.Texture> = {};

interface LinkedModelPayload {
  record: VesselModelRecord | null;
  /** null when no model is linked, or when the config is not a vessel payload. */
  vesselState: VesselState | null;
}

interface LinkedTexturePayload {
  configs: TextureConfig[];
  objects: Record<number, THREE.Texture>;
}

export interface UseLinkedVesselModelResult {
  /** The linked `vessel_models` row, or null when the vessel has no model. */
  record: VesselModelRecord | null;
  /** Deserialized state, textures folded in when `withTextures` was requested. */
  vesselState: VesselState | null;
  /** id → THREE.Texture, ready for ReadOnlyViewport's `textureObjects` prop. */
  textureObjects: Record<number, THREE.Texture>;
  /** True while the record/state is still resolving (textures load after). */
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

export interface UseLinkedVesselModelOptions {
  /**
   * Decode texture overlays into THREE objects. Off by default: coverage stats
   * are texture-blind, so number-only surfaces skip the image decode entirely.
   */
  withTextures?: boolean;
}

async function fetchLinkedModel(projectVesselId: string): Promise<LinkedModelPayload> {
  const record = await getVesselModelByProjectVessel(projectVesselId);
  const config = record?.config as Record<string, unknown> | undefined;
  // A row can exist with a config that is not a vessel payload (older/partial
  // writes); the modeler applies the same `vessel` + `version` guard.
  if (!record || !config?.vessel || !config?.version) {
    return { record: record ?? null, vesselState: null };
  }

  const { deserializeVesselState } = await import(
    '../../components/VesselModeler/engine/vessel-serialization'
  );
  // Textures are the caller's separate, opt-in concern — the deserializer never
  // reads `raw.textures` because aspectRatio is only known once decoded.
  const deserialized = deserializeVesselState(config, { path: 'cloud', textures: [] });

  // A cloud save strips composite grids (they live in `scan_composites`), so a
  // model loaded here renders with no heatmap and no hover thickness until the
  // grids come back — the same re-fetch the modeler does after its own load.
  // Unlike the publish path this is READ-ONLY: a grid we cannot reach costs a
  // heatmap, not a client's report, so the panel degrades instead of failing.
  const { state, failures } = await hydrateScanGrids(deserialized);
  if (failures.length > 0) {
    console.warn(
      `useLinkedVesselModel: scan grids unavailable for ${describeHydrationFailures(failures)} — ` +
        'those overlays will not render.',
      failures.map((failure) => failure.cloudId)
    );
  }

  return { record, vesselState: state };
}

async function fetchLinkedTextures(config: Record<string, unknown>): Promise<LinkedTexturePayload> {
  const { hydrateSavedTextures } = await import(
    '../../components/VesselModeler/engine/texture-hydration'
  );
  const saved = Array.isArray(config.textures) ? config.textures : [];
  // No renderer: ReadOnlyViewport owns its own privately, and three clamps the
  // fallback anisotropy at upload.
  const { configs, objects } = await hydrateSavedTextures(saved, null);
  return { configs, objects };
}

/**
 * @param projectVesselId `project_vessels.id`; undefined/null disables the query.
 */
export function useLinkedVesselModel(
  projectVesselId: string | null | undefined,
  options: UseLinkedVesselModelOptions = {}
): UseLinkedVesselModelResult {
  const { withTextures = false } = options;

  const modelQuery = useQuery({
    queryKey: ['linkedVesselModel', projectVesselId],
    queryFn: () => fetchLinkedModel(projectVesselId!),
    enabled: !!projectVesselId,
    staleTime: STALE_TIME_MS,
  });

  const record = modelQuery.data?.record ?? null;
  const baseState = modelQuery.data?.vesselState ?? null;

  const textureQuery = useQuery({
    queryKey: ['linkedVesselModel', projectVesselId, 'textures', record?.id, record?.updated_at],
    queryFn: () => fetchLinkedTextures(record!.config),
    enabled: withTextures && !!record && !!baseState,
    staleTime: STALE_TIME_MS,
  });

  const textureConfigs = textureQuery.data?.configs;

  // Fold the decoded overlays back onto the shared, texture-less state. Cheap
  // shallow copy, memoized so ReadOnlyViewport's settled hash sees one identity.
  const vesselState = useMemo<VesselState | null>(() => {
    if (!baseState) return null;
    if (!textureConfigs || textureConfigs.length === 0) return baseState;
    return { ...baseState, textures: textureConfigs };
  }, [baseState, textureConfigs]);

  return {
    record,
    vesselState,
    textureObjects: textureQuery.data?.objects ?? NO_TEXTURES,
    isLoading: modelQuery.isLoading,
    isError: modelQuery.isError,
    error: modelQuery.error,
  };
}
