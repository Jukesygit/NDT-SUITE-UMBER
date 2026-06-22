import { useMemo, useState, useCallback, type KeyboardEvent } from 'react';
import type { VesselState, CoverageTargets, CoverageTargetEntry } from '../types';
import { computeRegionTotalAreas, validAreaFromGrid } from '../engine/coverage-calculator';

/**
 * Valid scanned area for a composite in mm². Prefers the persisted
 * stats.validArea (cheap, already computed) but falls back to recomputing
 * from the data grid when it is missing or non-positive — without this,
 * dome scans whose stats never carried validArea contribute 0 to achieved
 * coverage even though they have data.
 */
function compositeValidArea(c: {
  stats: { validArea?: number };
  data: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
}): number {
  const persisted = c.stats.validArea;
  if (typeof persisted === 'number' && persisted > 0) return persisted;
  return validAreaFromGrid(c.data, c.xAxis, c.yAxis);
}

interface ScanCoverageStatsSectionProps {
  vesselState: VesselState;
  onUpdateTargets: (targets: CoverageTargets) => void;
}

const DEFAULT_ENTRY: CoverageTargetEntry = { rbaPct: 0, scopedPct: 0 };
const DEFAULT_TARGETS: CoverageTargets = {
  leftHead: { ...DEFAULT_ENTRY },
  cylinder: { ...DEFAULT_ENTRY },
  rightHead: { ...DEFAULT_ENTRY },
};

function formatArea(mm2: number): string {
  const m2 = mm2 / 1_000_000;
  return m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2);
}

function formatPct(pct: number): string {
  return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

type SectionKey = 'leftHead' | 'cylinder' | 'rightHead';
type TargetField = 'rbaPct' | 'scopedPct';

function InlineEdit({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const start = useCallback(() => {
    setDraft(value.toString());
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      onCommit(parsed);
    }
    setEditing(false);
  }, [draft, onCommit]);

  const handleKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  }, [commit]);

  if (editing) {
    return (
      <input
        className="vm-scancov-input"
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        autoFocus
      />
    );
  }

  return (
    <span className="vm-scancov-editable" onClick={start} title="Click to edit">
      {formatPct(value)}%
    </span>
  );
}

function StatCell({ pct, area, isAchieved }: { pct: string; area: string; isAchieved?: boolean }) {
  return (
    <div className={`vm-scancov-cell ${isAchieved ? 'vm-scancov-cell--achieved' : ''}`}>
      <span className="vm-scancov-cell-pct">{pct}</span>
      <span className="vm-scancov-cell-area">{area} m²</span>
    </div>
  );
}

export default function ScanCoverageStatsSection({
  vesselState,
  onUpdateTargets,
}: ScanCoverageStatsSectionProps) {
  const targets = vesselState.coverageTargets ?? DEFAULT_TARGETS;
  const isPipe = vesselState.vesselShape === 'pipe';
  const isVertical = vesselState.orientation === 'vertical';

  const regionAreas = useMemo(() => computeRegionTotalAreas(vesselState), [
    vesselState.id, vesselState.length, vesselState.headRatio,
  ]);

  const achievedMm2 = useMemo(() => {
    const result = { leftHead: 0, cylinder: 0, rightHead: 0 };
    for (const sc of vesselState.scanComposites) {
      result.cylinder += compositeValidArea(sc);
    }
    for (const ds of vesselState.domeScanComposites ?? []) {
      const area = compositeValidArea(ds);
      if (ds.head === 'left') result.leftHead += area;
      else result.rightHead += area;
    }
    return result;
  }, [vesselState.scanComposites, vesselState.domeScanComposites]);

  const handleUpdate = useCallback(
    (section: SectionKey, field: TargetField, value: number) => {
      const updated: CoverageTargets = {
        ...targets,
        [section]: { ...targets[section], [field]: value },
      };
      onUpdateTargets(updated);
    },
    [targets, onUpdateTargets],
  );

  const sections: { key: SectionKey; label: string; show: boolean }[] = [
    { key: 'leftHead', label: isVertical ? 'Top Dome' : 'Left Dome', show: !isPipe },
    { key: 'cylinder', label: 'Shell', show: true },
    { key: 'rightHead', label: isVertical ? 'Bottom Dome' : 'Right Dome', show: !isPipe },
  ];

  const visibleSections = sections.filter(s => s.show);

  const totalArea = visibleSections.reduce((sum, s) => sum + regionAreas[s.key], 0);
  const totalRba = visibleSections.reduce((sum, s) => sum + (targets[s.key]?.rbaPct ?? 0) / 100 * regionAreas[s.key], 0);
  const totalScoped = visibleSections.reduce((sum, s) => sum + (targets[s.key]?.scopedPct ?? 0) / 100 * regionAreas[s.key], 0);
  const totalAchieved = visibleSections.reduce((sum, s) => sum + achievedMm2[s.key], 0);

  return (
    <div className="vm-stats-section">
      <div className="vm-stats-section-title">Scan Coverage</div>
      <div className="vm-scancov-group-headers">
        <span className="vm-scancov-section-col" />
        <span className="vm-scancov-group-label">RBA</span>
        <span className="vm-scancov-group-label">Scoped</span>
        <span className="vm-scancov-group-label vm-scancov-group-label--achieved">Achieved</span>
      </div>

      {visibleSections.map(({ key, label }) => {
        const totalMm2 = regionAreas[key];
        const entry = targets[key] ?? DEFAULT_ENTRY;
        const rbaSqm = (entry.rbaPct / 100) * totalMm2;
        const scopedSqm = (entry.scopedPct / 100) * totalMm2;
        const achieved = achievedMm2[key];
        const achievedPct = totalMm2 > 0 ? (achieved / totalMm2) * 100 : 0;

        return (
          <div key={key} className="vm-scancov-row">
            <span className="vm-scancov-section-col">{label}</span>
            <div className="vm-scancov-cell">
              <InlineEdit value={entry.rbaPct} onCommit={v => handleUpdate(key, 'rbaPct', v)} />
              <span className="vm-scancov-cell-area">{formatArea(rbaSqm)} m²</span>
            </div>
            <div className="vm-scancov-cell">
              <InlineEdit value={entry.scopedPct} onCommit={v => handleUpdate(key, 'scopedPct', v)} />
              <span className="vm-scancov-cell-area">{formatArea(scopedSqm)} m²</span>
            </div>
            <StatCell
              pct={`${formatPct(achievedPct)}%`}
              area={formatArea(achieved)}
              isAchieved
            />
          </div>
        );
      })}

      <div className="vm-scancov-row vm-scancov-row--total">
        <span className="vm-scancov-section-col">Total</span>
        <StatCell
          pct={`${formatPct(totalArea > 0 ? (totalRba / totalArea) * 100 : 0)}%`}
          area={formatArea(totalRba)}
        />
        <StatCell
          pct={`${formatPct(totalArea > 0 ? (totalScoped / totalArea) * 100 : 0)}%`}
          area={formatArea(totalScoped)}
        />
        <StatCell
          pct={`${formatPct(totalArea > 0 ? (totalAchieved / totalArea) * 100 : 0)}%`}
          area={formatArea(totalAchieved)}
          isAchieved
        />
      </div>
    </div>
  );
}
