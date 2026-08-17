import { useMemo } from 'react';
import type { CoverageTargets, VesselState } from '../types';
import {
  listComparisonFeatures,
  readTargetEntry,
  writeTargetEntry,
  type FeatureTargetRef,
} from '../engine/coverage-comparison';

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

/**
 * Per-feature coverage targets — the ONE place targets are edited (design
 * 2026-08-17, "Surfaces §2"). The stats sections read the same entries and are
 * display-only.
 *
 * Feature instances and their target addresses come from the comparison engine,
 * so the editor and the Coverage-vs-Scope section can never disagree about which
 * features exist. `listComparisonFeatures` is deliberately the CHEAP call — no
 * area sweeps run just to draw the sidebar.
 *
 * Tracking rule: Scoped IS the target. Clearing Scoped removes the whole entry
 * (the feature goes back to untracked and drops out of every rollup); clearing
 * RBA just zeroes the risk-assessment figure while the feature stays tracked.
 */
export function CoverageTargetsEditor({ vesselState, onUpdateTargets }: CoverageTargetsEditorProps) {
  const features = useMemo(() => listComparisonFeatures(vesselState), [vesselState]);
  const targets = vesselState.coverageTargets;

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
        return (
          <div key={key} className={`vm-cov-targets-row ${entry ? '' : 'vm-cov-targets-row--untracked'}`}>
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
          </div>
        );
      })}

      <p className="vm-cov-targets-hint">
        Scoped % is the target achieved coverage is measured against. Clear it to leave a feature
        untracked.
      </p>
    </div>
  );
}
