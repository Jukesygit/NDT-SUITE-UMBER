import { useMemo, useState, useCallback, type KeyboardEvent } from 'react';
import type { VesselState, CoverageTargets, CoverageTargetEntry } from '../types';
import {
  computeRegionTotalAreas,
  computeRegionAchievedAreas,
  computeAppendageCoverageTotals,
} from '../engine/coverage-calculator';
import { cardinalForHead } from '../engine/cardinal-directions';
import { useSettledValue } from '../../../hooks/useSettledValue';

// Area sweeps are heavy; settle the state they read so a nozzle drag / slider
// scrub recomputes once on release, not per frame (R1 perf). Target-percentage
// editing stays on live state so typed values apply immediately.
const STATS_SETTLE_MS = 250;

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

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') setEditing(false);
    },
    [commit]
  );

  if (editing) {
    return (
      <input
        className="vm-scancov-input"
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
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

/** A single editable RBA / Scoped / Achieved row (shared by shell + appendage rows). */
function TargetRow({
  label,
  totalMm2,
  achievedMm2,
  entry,
  onUpdate,
}: {
  label: string;
  totalMm2: number;
  achievedMm2: number;
  entry: CoverageTargetEntry;
  onUpdate: (field: TargetField, value: number) => void;
}) {
  const rbaSqm = (entry.rbaPct / 100) * totalMm2;
  const scopedSqm = (entry.scopedPct / 100) * totalMm2;
  const achievedPct = totalMm2 > 0 ? (achievedMm2 / totalMm2) * 100 : 0;

  return (
    <div className="vm-scancov-row">
      <span className="vm-scancov-section-col">{label}</span>
      <div className="vm-scancov-cell">
        <InlineEdit value={entry.rbaPct} onCommit={(v) => onUpdate('rbaPct', v)} />
        <span className="vm-scancov-cell-area">{formatArea(rbaSqm)} m²</span>
      </div>
      <div className="vm-scancov-cell">
        <InlineEdit value={entry.scopedPct} onCommit={(v) => onUpdate('scopedPct', v)} />
        <span className="vm-scancov-cell-area">{formatArea(scopedSqm)} m²</span>
      </div>
      <StatCell pct={`${formatPct(achievedPct)}%`} area={formatArea(achievedMm2)} isAchieved />
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

  // Settled snapshot for the heavy area sweeps only (R1 perf); targets / shape /
  // orientation above stay on live state so editing stays responsive.
  const s = useSettledValue(vesselState, STATS_SETTLE_MS);

  // Cutout-adjusted region areas — recompute when appendages / nozzles change
  // (footprint subtraction depends on both). Settled so a nozzle drag recomputes
  // once on release, not per frame.
  const regionAreas = useMemo(() => computeRegionTotalAreas(s), [s]);

  // Per-appendage coverable + achieved areas (design §9). Recompute when the
  // appendage set, any scan, or the nozzles (boot bores subtract from the boot
  // lateral total, R1) change so rows appear/update on release.
  const appendageTotals = useMemo(() => computeAppendageCoverageTotals(s), [s]);

  // Achieved area per main-shell region. The attribution (appendage scans and
  // 'end' dome scans stay out of the main buckets) lives in the engine so the
  // Coverage tab, card strip and reports read the same numbers.
  const achievedMm2 = useMemo(() => computeRegionAchievedAreas(s), [s]);

  const handleUpdate = useCallback(
    (section: SectionKey, field: TargetField, value: number) => {
      const updated: CoverageTargets = {
        ...targets,
        [section]: { ...targets[section], [field]: value },
      };
      onUpdateTargets(updated);
    },
    [targets, onUpdateTargets]
  );

  const handleUpdateAppendage = useCallback(
    (appId: string, field: TargetField, value: number) => {
      const prevAppendages = targets.appendages ?? {};
      const prev = prevAppendages[appId];
      const shell = prev?.shell ?? DEFAULT_ENTRY;
      const updated: CoverageTargets = {
        ...targets,
        appendages: {
          ...prevAppendages,
          // Shell targets only here; the dome entry (dished boots) is edited in
          // the coverage panel — preserve it untouched.
          [appId]: { ...prev, shell: { ...shell, [field]: value } },
        },
      };
      onUpdateTargets(updated);
    },
    [targets, onUpdateTargets]
  );

  // Horizontal heads face world ±X; name them by the scene's North Heading.
  const cardinalRotation = vesselState.visuals?.cardinalRotation ?? 0;
  const sections: { key: SectionKey; label: string; show: boolean }[] = [
    {
      key: 'leftHead',
      label: isVertical ? 'Top Dome' : `${cardinalForHead('left', cardinalRotation)} Dome`,
      show: !isPipe,
    },
    { key: 'cylinder', label: 'Shell', show: true },
    {
      key: 'rightHead',
      label: isVertical ? 'Bottom Dome' : `${cardinalForHead('right', cardinalRotation)} Dome`,
      show: !isPipe,
    },
  ];

  const visibleSections = sections.filter((s) => s.show);

  // Totals span the main shell sections AND every appendage body.
  // Shell entry of an appendage's targets (dome rows land in a later phase).
  const appendageTargetFor = (id: string): CoverageTargetEntry =>
    targets.appendages?.[id]?.shell ?? DEFAULT_ENTRY;

  const totalArea =
    visibleSections.reduce((sum, s) => sum + regionAreas[s.key], 0) +
    appendageTotals.reduce((sum, a) => sum + a.totalMm2, 0);
  const totalRba =
    visibleSections.reduce(
      (sum, s) => sum + ((targets[s.key]?.rbaPct ?? 0) / 100) * regionAreas[s.key],
      0
    ) +
    appendageTotals.reduce((sum, a) => sum + (appendageTargetFor(a.appendageId).rbaPct / 100) * a.totalMm2, 0);
  const totalScoped =
    visibleSections.reduce(
      (sum, s) => sum + ((targets[s.key]?.scopedPct ?? 0) / 100) * regionAreas[s.key],
      0
    ) +
    appendageTotals.reduce(
      (sum, a) => sum + (appendageTargetFor(a.appendageId).scopedPct / 100) * a.totalMm2,
      0
    );
  const totalAchieved =
    visibleSections.reduce((sum, s) => sum + achievedMm2[s.key], 0) +
    appendageTotals.reduce((sum, a) => sum + a.achievedMm2, 0);

  return (
    <div className="vm-stats-section">
      <div className="vm-stats-section-title">Scan Coverage</div>
      <div className="vm-scancov-group-headers">
        <span className="vm-scancov-section-col" />
        <span className="vm-scancov-group-label">RBA</span>
        <span className="vm-scancov-group-label">Scoped</span>
        <span className="vm-scancov-group-label vm-scancov-group-label--achieved">Achieved</span>
      </div>

      {visibleSections.map(({ key, label }) => (
        <TargetRow
          key={key}
          label={label}
          totalMm2={regionAreas[key]}
          achievedMm2={achievedMm2[key]}
          entry={targets[key] ?? DEFAULT_ENTRY}
          onUpdate={(field, value) => handleUpdate(key, field, value)}
        />
      ))}

      {appendageTotals.map((a) => (
        <TargetRow
          key={a.appendageId}
          label={a.name}
          totalMm2={a.totalMm2}
          achievedMm2={a.achievedMm2}
          entry={appendageTargetFor(a.appendageId)}
          onUpdate={(field, value) => handleUpdateAppendage(a.appendageId, field, value)}
        />
      ))}

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
