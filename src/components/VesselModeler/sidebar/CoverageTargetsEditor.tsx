import { useMemo } from 'react';
import type { CoverageTargets, VesselState } from '../types';
import {
  computeComparisonRows,
  formatCoveragePct,
  listComparisonFeatures,
  readTargetEntry,
  writeTargetEntry,
  type FeatureTargetRef,
} from '../engine/coverage-comparison';
import { useSettledValue } from '../../../hooks/useSettledValue';

export interface CoverageTargetsEditorProps {
  vesselState: VesselState;
  /** Undoable vessel write; the feature key + field drive per-feature coalescing. */
  onUpdateTargets: (
    targets: CoverageTargets | undefined,
    featureKey?: string,
    field?: string
  ) => void;
}

type TargetField = 'rbaPct' | 'scopedPct';

// The resolution sweep behind the read-only Scoped cells is heavy (it runs the
// rect raster), so it reads a SETTLED snapshot and is memoized on that snapshot
// alone — never on live state, and never per keystroke (standing PERF RULE).
const RESOLVE_SETTLE_MS = 250;

const AUTO_TITLE = 'Derived from drawn coverage rects';

/**
 * Per-feature coverage targets — the ONE place targets are edited (design
 * 2026-08-17, "Surfaces §2"). The stats section reads the same entries and is
 * display-only.
 *
 * Feature instances and their target addresses come from the comparison engine,
 * so the editor and the stats section can never disagree about which features
 * exist. The ROW LIST stays on the cheap `listComparisonFeatures` call against
 * live state, so adding a boot shows its rows immediately.
 *
 * Rect-derived scope (design 2026-08-21): whenever drawn rects cover a feature,
 * its Scoped % IS that rect coverage — the engine's `targetPctOf` decides, this
 * editor only asks. Those rows render Scoped read-only with an `auto` marker;
 * RBA stays editable. Any stored manual `scopedPct` is left untouched in state
 * (inert while rects cover the feature, restored the moment they are removed).
 *
 * Tracking rule on the manual leg, unchanged: Scoped IS the target. Clearing
 * Scoped removes the whole entry (the feature goes back to untracked and drops
 * out of every rollup); clearing RBA just zeroes the risk-assessment figure
 * while the feature stays tracked.
 */
export function CoverageTargetsEditor({
  vesselState,
  onUpdateTargets,
}: CoverageTargetsEditorProps) {
  const features = useMemo(() => listComparisonFeatures(vesselState), [vesselState]);
  const targets = vesselState.coverageTargets;

  // Settled snapshot — the ONLY input to the sweep memo below.
  const settled = useSettledValue(vesselState, RESOLVE_SETTLE_MS);

  // Which features the engine currently resolves from rects. A feature missing
  // from this map (a boot added within the settle window) simply edits as manual
  // until the snapshot catches up — exactly the pre-2026-08-21 behaviour.
  const rectDerived = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of computeComparisonRows(settled)) {
      if (row.targetSource === 'rects' && row.targetPct !== undefined) {
        map.set(row.key, row.targetPct);
      }
    }
    return map;
  }, [settled]);

  const commit = (featureKey: string, ref: FeatureTargetRef, field: TargetField, raw: string) => {
    const entry = readTargetEntry(targets, ref);
    const cleared = raw.trim() === '';

    // Clearing the target untracks the feature outright; RBA alone is meaningless.
    if (cleared && field === 'scopedPct') {
      onUpdateTargets(writeTargetEntry(targets, ref, undefined), featureKey, field);
      return;
    }

    const parsed = cleared ? 0 : Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return;

    const next = {
      rbaPct: entry?.rbaPct ?? 0,
      scopedPct: entry?.scopedPct ?? 0,
      [field]: parsed,
    };
    onUpdateTargets(writeTargetEntry(targets, ref, next), featureKey, field);
  };

  return (
    <div className="vm-cov-targets">
      <div className="vm-cov-targets-head">
        <span className="vm-cov-targets-feature">Feature</span>
        <span className="vm-cov-targets-col">RBA %</span>
        <span className="vm-cov-targets-col">Scoped %</span>
      </div>

      {features.map(({ key, label, ref }) => {
        const entry = readTargetEntry(targets, ref);
        const autoPct = rectDerived.get(key);
        const tracked = entry !== undefined || autoPct !== undefined;
        return (
          <div
            key={key}
            className={`vm-cov-targets-row ${tracked ? '' : 'vm-cov-targets-row--untracked'}`}
          >
            <span className="vm-cov-targets-feature" title={label}>
              {label}
            </span>
            <input
              className="vm-input vm-cov-targets-input"
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="—"
              value={entry?.rbaPct ?? ''}
              onChange={(e) => commit(key, ref, 'rbaPct', e.target.value)}
            />
            <span className="vm-cov-targets-scoped">
              {autoPct === undefined ? (
                <input
                  className="vm-input vm-cov-targets-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="—"
                  value={entry?.scopedPct ?? ''}
                  onChange={(e) => commit(key, ref, 'scopedPct', e.target.value)}
                />
              ) : (
                <>
                  <input
                    className="vm-input vm-cov-targets-input"
                    type="text"
                    readOnly
                    disabled
                    title={AUTO_TITLE}
                    value={formatCoveragePct(autoPct)}
                  />
                  <span className="vm-cov-targets-auto" title={AUTO_TITLE}>
                    auto
                  </span>
                </>
              )}
            </span>
          </div>
        );
      })}

      <p className="vm-cov-targets-hint">
        Drawn coverage rects define Scoped % — those rows read <em>auto</em> and cannot be typed
        over. The field is the fallback for features with no rects; clear it to leave one untracked.
      </p>
    </div>
  );
}
