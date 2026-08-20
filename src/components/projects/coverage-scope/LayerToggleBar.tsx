/**
 * LayerToggleBar — one chip per layer category present on the model.
 *
 * Category-level, not per-body: the Coverage section shows a whole vessel, so a
 * chip toggles its category on EVERY body at once through `categoryLayerPatch`
 * and reads lit while any body still shows it (`isCategoryVisibleAnywhere`) —
 * the same master-eye semantics the modeler's outliner uses. Categories with no
 * content are absent (`presentLayerCategories`), so a bare vessel shows a bare
 * bar rather than twelve dead chips.
 *
 * Visibility is visual only: nothing here touches the comparison numbers.
 */

import type { VesselState } from '../../VesselModeler/types';
import {
  categoryLayerPatch,
  isCategoryVisibleAnywhere,
  type LayerVisibility,
} from '../../VesselModeler/engine/layer-visibility';
import { layerBodyKeys, presentLayerCategories } from '../../VesselModeler/engine/layer-presence';

interface LayerToggleBarProps {
  vesselState: VesselState;
  layers: LayerVisibility;
  onChange: (next: LayerVisibility) => void;
}

export function LayerToggleBar({ vesselState, layers, onChange }: LayerToggleBarProps) {
  const bodyKeys = layerBodyKeys(vesselState);
  const categories = presentLayerCategories(vesselState);

  if (categories.length === 0) return null;

  return (
    <div className="pj-cvg-layers" role="group" aria-label="Layers">
      {categories.map(({ key, label, count }) => {
        const on = isCategoryVisibleAnywhere(layers, bodyKeys, key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            className={`pj-cvg-layer-chip${on ? ' on' : ''}`}
            onClick={() => onChange({ ...layers, ...categoryLayerPatch(bodyKeys, key, !on) })}
            title={`${on ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          >
            {label}
            <span className="pj-cvg-layer-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
