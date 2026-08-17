import { useMemo } from 'react';
import type { VesselState, CoverageTargets, CoverageTargetEntry } from '../types';
import {
  computeRegionTotalAreas,
  computeRegionAchievedAreas,
  computeAppendageCoverageTotals,
} from '../engine/coverage-calculator';
import { cardinalForHead } from '../engine/cardinal-directions';
import { useSettledValue } from '../../../hooks/useSettledValue';

// Area sweeps are heavy; settle the state they read so a nozzle drag / slider
// scrub recomputes once on release, not per frame (R1 perf).
const STATS_SETTLE_MS = 250;

// DISPLAY-ONLY. Targets are edited in ONE place — the Coverage sidebar panel's
// CoverageTargetsEditor (design 2026-08-17, "Surfaces §2") — so there is no
// second edit surface to keep in sync. This section reads the same entries and
// renders them alongside the achieved figures.
interface ScanCoverageStatsSectionProps {
  vesselState: VesselState;
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

function StatCell({ pct, area, isAchieved }: { pct: string; area: string; isAchieved?: boolean }) {
  return (
    <div className={`vm-scancov-cell ${isAchieved ? 'vm-scancov-cell--achieved' : ''}`}>
      <span className="vm-scancov-cell-pct">{pct}</span>
      <span className="vm-scancov-cell-area">{area} m²</span>
    </div>
  );
}

/** A single RBA / Scoped / Achieved row (shared by shell + appendage rows). */
function TargetRow({
  label,
  totalMm2,
  achievedMm2,
  entry,
}: {
  label: string;
  totalMm2: number;
  achievedMm2: number;
  entry: CoverageTargetEntry;
}) {
  const rbaSqm = (entry.rbaPct / 100) * totalMm2;
  const scopedSqm = (entry.scopedPct / 100) * totalMm2;
  const achievedPct = totalMm2 > 0 ? (achievedMm2 / totalMm2) * 100 : 0;

  return (
    <div className="vm-scancov-row">
      <span className="vm-scancov-section-col">{label}</span>
      <StatCell pct={`${formatPct(entry.rbaPct)}%`} area={formatArea(rbaSqm)} />
      <StatCell pct={`${formatPct(entry.scopedPct)}%`} area={formatArea(scopedSqm)} />
      <StatCell pct={`${formatPct(achievedPct)}%`} area={formatArea(achievedMm2)} isAchieved />
    </div>
  );
}

export default function ScanCoverageStatsSection({ vesselState }: ScanCoverageStatsSectionProps) {
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
        />
      ))}

      {appendageTotals.map((a) => (
        <TargetRow
          key={a.appendageId}
          label={a.name}
          totalMm2={a.totalMm2}
          achievedMm2={a.achievedMm2}
          entry={appendageTargetFor(a.appendageId)}
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
