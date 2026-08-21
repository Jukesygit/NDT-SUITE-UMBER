/**
 * CoverageScopePanel — the projects-side "Coverage tab" body: a read-only 3D
 * view of the vessel's linked model beside the per-feature targets-vs-achieved
 * table (docs/plans/2026-08-17-coverage-comparison-design.md, Surfaces §1).
 *
 * CHUNKING (hard requirement): this module is only ever reached through the
 * `lazy()` in `VesselCoverageScopeSection`, because it statically imports
 * `ReadOnlyViewport` and therefore three.js. Never import it eagerly from a
 * projects-area module, or the 3D engine lands in the projects chunk for every
 * visitor of every project page.
 *
 * One source, three surfaces: the rows and rollup come from
 * `computeComparisonRows` / `computeComparisonRollup`, the same calls the
 * modeler's stats section and the printed report make. Nothing is re-derived
 * here, and nothing is filtered by layer visibility — layers are visual only.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cuboid, Maximize2 } from 'lucide-react';
import ReadOnlyViewport, { type ReadOnlyHoverInfo } from '../../VesselModeler/ReadOnlyViewport';
import {
  computeComparisonRollup,
  computeComparisonRows,
  formatCoveragePct,
  type FeatureComparisonRow,
} from '../../VesselModeler/engine/coverage-comparison';
import {
  featureFramePose,
  wholeVesselPose,
} from '../../VesselModeler/engine/coverage-feature-framing';
import type { CameraPose } from '../../VesselModeler/engine/canonical-views';
import type { LayerVisibility } from '../../VesselModeler/engine/layer-visibility';
import { useLinkedVesselModel } from '../../../hooks/queries/useLinkedVesselModel';
import { SectionSpinner } from '../../ui/LoadingSpinner';
import { planScopeUrl } from '../plan-scope';
import { FeatureComparisonTable } from './FeatureComparisonTable';
import { LayerToggleBar } from './LayerToggleBar';

/** Sparse overlay: an absent key means visible, so "everything on" is `{}`. */
const ALL_LAYERS_VISIBLE: LayerVisibility = {};

interface CoverageScopePanelProps {
  projectId: string;
  projectVesselId: string;
}

export default function CoverageScopePanel({
  projectId,
  projectVesselId,
}: CoverageScopePanelProps) {
  const navigate = useNavigate();
  const { record, vesselState, textureObjects, isLoading, isError } = useLinkedVesselModel(
    projectVesselId,
    { withTextures: true }
  );

  const [layers, setLayers] = useState<LayerVisibility>(ALL_LAYERS_VISIBLE);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [pose, setPose] = useState<CameraPose | undefined>(undefined);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);

  // The probe fires EVERY animation frame while the cursor sits on an entity, so
  // the label is diffed against a ref before it is allowed to touch React state —
  // a per-frame setState here would re-render the table (and the viewport's
  // props) at 60 Hz, which is the orbit-stutter scar in a different costume.
  const hoverLabelRef = useRef<string | null>(null);
  const handleHover = useCallback((hit: ReadOnlyHoverInfo | null) => {
    const label = hit?.label ?? null;
    if (label === hoverLabelRef.current) return;
    hoverLabelRef.current = label;
    setHoverLabel(label);
  }, []);

  const rows = useMemo(
    () => (vesselState ? computeComparisonRows(vesselState) : []),
    [vesselState]
  );
  const rollup = useMemo(() => computeComparisonRollup(rows), [rows]);

  const handleSelect = useCallback(
    (row: FeatureComparisonRow) => {
      if (!vesselState) return;
      setSelectedKey(row.key);
      // A fresh pose object every time: ReadOnlyViewport animates on identity
      // change, so re-clicking the same row re-frames it rather than sitting still.
      const next = featureFramePose(vesselState, row.ref);
      if (next) setPose(next);
    },
    [vesselState]
  );

  const handleToggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleResetView = useCallback(() => {
    if (!vesselState) return;
    setSelectedKey(null);
    setPose(wholeVesselPose(vesselState));
  }, [vesselState]);

  if (isLoading) {
    return (
      <div className="pj-cvg-state">
        <SectionSpinner message="Loading linked model…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pj-cvg-state">
        <div className="pj-empty-text">Could not load this vessel&apos;s 3D model.</div>
      </div>
    );
  }

  // No model linked at all — the one place that points at "Plan scope".
  if (!vesselState) {
    return (
      <div className="pj-cvg-state">
        <div className="pj-empty-title">No 3D model linked</div>
        <div className="pj-empty-text">
          Coverage is measured against a model&apos;s surfaces. Plan the scope to create one.
        </div>
        <button
          type="button"
          className="pj-quick-action-btn primary"
          onClick={() => navigate(planScopeUrl(projectId, projectVesselId, record?.id))}
        >
          <Cuboid size={13} />
          Plan scope
        </button>
      </div>
    );
  }

  return (
    <div className="pj-cvg-panel">
      <div className="pj-cvg-rollup">
        {rollup.tracked === 0 ? (
          <>
            <span className="pj-cvg-rollup-main">No targets set</span>
            <span className="pj-cvg-rollup-note">
              Every feature is untracked. Set target percentages in the modeler&apos;s Coverage
              panel to measure achieved coverage against a plan.
            </span>
          </>
        ) : (
          <>
            <span className="pj-cvg-rollup-main">
              {formatCoveragePct(rollup.achievedPct)}% achieved of{' '}
              {formatCoveragePct(rollup.targetPct)}% targeted
            </span>
            <span className="pj-cvg-rollup-note">
              {rollup.short} of {rollup.tracked} targeted{' '}
              {rollup.tracked === 1 ? 'feature' : 'features'} short
              {rollup.total > rollup.tracked && ` · ${rollup.total - rollup.tracked} untracked`}
            </span>
          </>
        )}
        <div className="pj-cvg-rollup-actions">
          <button
            type="button"
            className="pj-quick-action-btn secondary"
            onClick={() => navigate(planScopeUrl(projectId, projectVesselId, record?.id))}
          >
            <Cuboid size={13} />
            Plan scope
          </button>
        </div>
      </div>

      <div className="pj-cvg-body">
        <div className="pj-cvg-viewer-col">
          <LayerToggleBar vesselState={vesselState} layers={layers} onChange={setLayers} />
          <div className="pj-cvg-viewer">
            <ReadOnlyViewport
              vesselState={vesselState}
              textureObjects={textureObjects}
              layers={layers}
              initialPose={pose}
              onHover={handleHover}
            />
            <button
              type="button"
              className="pj-cvg-reset"
              onClick={handleResetView}
              title="Frame the whole vessel"
            >
              <Maximize2 size={12} />
            </button>
            {hoverLabel && <div className="pj-cvg-hover">{hoverLabel}</div>}
          </div>
        </div>

        <div className="pj-cvg-table-col">
          <FeatureComparisonTable
            vesselState={vesselState}
            rows={rows}
            selectedKey={selectedKey}
            expandedKeys={expandedKeys}
            onSelect={handleSelect}
            onToggleExpand={handleToggleExpand}
          />
        </div>
      </div>
    </div>
  );
}
