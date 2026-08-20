/**
 * ShareVesselViewer — one published vessel: the 3D view and its coverage table.
 *
 * The layer toggles here are limited to the PUBLISHED categories, and that is
 * cosmetic rather than protective: anything unpublished was removed from the
 * model at publish time, so there is nothing behind an absent toggle. Offering
 * only the published ones simply avoids a row of switches that do nothing.
 *
 * Hover reports thickness from the decimated grid the bundle carries — the same
 * index maths the modeler uses (`thicknessAtUv`), so a client and an inspector
 * pointing at the same spot read the same millimetre.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { ArrowLeft } from 'lucide-react';
import ReadOnlyViewport, { type ReadOnlyHoverInfo } from '../VesselModeler/ReadOnlyViewport';
import type { VesselState } from '../VesselModeler/types';
import { poseFromBookmark, type CameraPose } from '../VesselModeler/engine/canonical-views';
import {
  categoryLayerPatch,
  isCategoryVisibleAnywhere,
  type LayerVisibility,
} from '../VesselModeler/engine/layer-visibility';
import { layerBodyKeys, presentLayerCategories } from '../VesselModeler/engine/layer-presence';
import type { LayerKey } from '../VesselModeler/outliner-tree';
import { ShareStatsTable } from './ShareStatsTable';
import { SHARE_VIEWER_INITIAL_LAYERS, type ShareManifestVessel } from './bundle-types';

interface ShareVesselViewerProps {
  vessel: ShareManifestVessel;
  vesselState: VesselState;
  /** Decoded overlay textures, keyed by texture id (empty when none shipped). */
  textureObjects: Record<number, THREE.Texture>;
  /** Categories the publisher included; the toggle set is limited to these. */
  publishedLayers: LayerKey[];
  onBack: () => void;
}

export function ShareVesselViewer({
  vessel,
  vesselState,
  textureObjects,
  publishedLayers,
  onBack,
}: ShareVesselViewerProps) {
  // Seeded from the shared constant, not a local `{}`: the publish-time card
  // screenshot renders with the SAME value, so the tile a client clicks and the
  // view it opens show the same thing. See `bundle-types`.
  const [layers, setLayers] = useState<LayerVisibility>(SHARE_VIEWER_INITIAL_LAYERS);
  const [pose, setPose] = useState<CameraPose | undefined>(undefined);
  const [readout, setReadout] = useState<string | null>(null);

  const bodyKeys = useMemo(() => layerBodyKeys(vesselState), [vesselState]);
  const published = useMemo(() => new Set(publishedLayers), [publishedLayers]);
  const categories = useMemo(
    () => presentLayerCategories(vesselState).filter((c) => published.has(c.key)),
    [vesselState, published]
  );

  // The probe fires every animation frame while the cursor rests on a surface;
  // the readout string is diffed through a ref so only a CHANGE re-renders.
  const readoutRef = useRef<string | null>(null);
  const handleHover = useCallback((hit: ReadOnlyHoverInfo | null) => {
    let next: string | null = null;
    if (hit) {
      const thickness =
        typeof hit.thicknessMm === 'number' ? `${hit.thicknessMm.toFixed(2)} mm` : null;
      next = [hit.label, thickness].filter(Boolean).join(' · ') || null;
    }
    if (next === readoutRef.current) return;
    readoutRef.current = next;
    setReadout(next);
  }, []);

  return (
    <div className="cs-vessel">
      <div className="cs-vessel-bar">
        <button type="button" className="cs-back" onClick={onBack}>
          <ArrowLeft size={14} />
          All vessels
        </button>
        <span className="cs-vessel-title">
          {vessel.tag ? `${vessel.tag} — ` : ''}
          {vessel.name}
        </span>
      </div>

      <div className="cs-viewer">
        <ReadOnlyViewport
          vesselState={vesselState}
          textureObjects={textureObjects}
          layers={layers}
          initialPose={pose}
          onHover={handleHover}
        />

        {categories.length > 0 && (
          <div className="cs-layer-bar" role="group" aria-label="Layers">
            {categories.map(({ key, label }) => {
              const on = isCategoryVisibleAnywhere(layers, bodyKeys, key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  className={`cs-layer-chip${on ? ' on' : ''}`}
                  onClick={() =>
                    setLayers((prev) => ({
                      ...prev,
                      ...categoryLayerPatch(bodyKeys, key, !on),
                    }))
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {vessel.bookmarks.length > 0 && (
          <div className="cs-bookmark-bar" role="group" aria-label="Saved views">
            {vessel.bookmarks.map((bookmark) => (
              <button
                key={bookmark.id}
                type="button"
                className="cs-layer-chip"
                onClick={() => setPose(poseFromBookmark(bookmark))}
              >
                {bookmark.name}
              </button>
            ))}
          </div>
        )}

        {readout && <div className="cs-readout">{readout}</div>}
      </div>

      <ShareStatsTable rows={vessel.stats} rollup={vessel.rollup} />
    </div>
  );
}
