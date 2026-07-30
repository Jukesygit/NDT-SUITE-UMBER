import { useState } from 'react';
import type { VesselState } from '../types';
import { useWallLossWorker } from '../../../hooks/useWallLossWorker';

interface WallLossStatsSectionProps {
  vesselState: VesselState;
}

function formatArea(m2: number): string {
  return m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2);
}

function formatPct(pct: number): string {
  return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

const BIN_COLORS = [
  'rgba(0, 204, 102, 0.9)',
  'rgba(144, 238, 144, 0.9)',
  'rgba(255, 204, 0, 0.9)',
  'rgba(255, 140, 0, 0.9)',
  'rgba(255, 60, 60, 0.9)',
];

function binColor(index: number, total: number): string {
  if (total <= BIN_COLORS.length) return BIN_COLORS[index] ?? BIN_COLORS[BIN_COLORS.length - 1];
  const t = total > 1 ? index / (total - 1) : 0;
  const mapped = Math.round(t * (BIN_COLORS.length - 1));
  return BIN_COLORS[mapped];
}

function binRangeLabel(bin: { minPct: number; maxPct: number; minMm?: number; maxMm?: number; label?: string }, mode: string): string {
  if (bin.label) return bin.label;
  if (mode === 'custom' && bin.minMm != null && bin.maxMm != null) {
    return `${bin.minMm.toFixed(1)}–${bin.maxMm.toFixed(1)}`;
  }
  return `${bin.minPct.toFixed(0)}–${bin.maxPct.toFixed(0)}%`;
}

/** Selector key for the main shell body (bodyId is undefined on that body). */
const MAIN_KEY = 'main';
/** Selector key for the merged, all-bodies view (the default). */
const COMBINED_KEY = 'combined';

export default function WallLossStatsSection({ vesselState }: WallLossStatsSectionProps) {
  const config = vesselState.wallLossGroups;
  const result = useWallLossWorker(vesselState, config);
  const binNames = config?.binNames;
  const mode = config?.binMode ?? 'equal';

  // Combined is the default view (design §16). Selector keys: 'combined', 'main',
  // or an appendage id.
  const [selectedBody, setSelectedBody] = useState<string>(COMBINED_KEY);

  if (!result || result.combined.totalDataPoints === 0) return null;

  const { combined, bodies } = result;
  const appendageBodies = bodies.filter((b) => b.bodyId);
  // Only offer the selector once there is more than the main shell to choose from.
  const showSelector = appendageBodies.length > 0;

  // Resolve the active selection back to combined if a picked appendage vanished.
  const keyFor = (bodyId?: string) => bodyId ?? MAIN_KEY;
  const selectionValid =
    selectedBody === COMBINED_KEY || bodies.some((b) => keyFor(b.bodyId) === selectedBody);
  const effective = selectionValid ? selectedBody : COMBINED_KEY;

  const active =
    effective === COMBINED_KEY
      ? combined
      : bodies.find((b) => keyFor(b.bodyId) === effective) ?? combined;

  const bins = active.bins;
  const totalScannedArea = active.totalScannedArea;
  const totalDataPoints = active.totalDataPoints;
  const spuriousCount = active.spuriousCount ?? 0;
  const spuriousArea = active.spuriousArea ?? 0;
  const spuriousAreaPercent = active.spuriousAreaPercent ?? 0;
  const hasSpurious = spuriousCount > 0;

  return (
    <div className="vm-stats-section">
      <div className="vm-wallloss-title">
        Wall Loss Distribution
        <span className="vm-wallloss-nominal">
          Nom. {combined.nominalThickness}mm
        </span>
      </div>
      {showSelector && (
        <div className="vm-wallloss-row" style={{ paddingBottom: 6 }}>
          <select
            className="vm-select"
            style={{ fontSize: '0.7rem', padding: '3px 6px' }}
            value={effective}
            onChange={(e) => setSelectedBody(e.target.value)}
          >
            <option value={COMBINED_KEY}>Combined</option>
            <option value={MAIN_KEY}>Main shell</option>
            {appendageBodies.map((b) => (
              <option key={b.bodyId} value={b.bodyId}>
                {b.name || b.bodyId}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="vm-wallloss-row vm-wallloss-header">
        <span className="vm-wallloss-name">Name</span>
        <span className="vm-wallloss-range">Range</span>
        <span className="vm-wallloss-area">Area</span>
        <span className="vm-wallloss-pct">%</span>
        <span className="vm-wallloss-count">Pts</span>
      </div>
      {bins.map((bin, i) => (
        <div key={i} className="vm-wallloss-row">
          <span
            className="vm-wallloss-swatch"
            style={{ backgroundColor: binColor(i, bins.length) }}
          />
          <span className="vm-wallloss-name" title={binNames?.[i] || bin.label || ''}>
            {binNames?.[i] || bin.label || `Bin ${i + 1}`}
          </span>
          <span className="vm-wallloss-range">
            {binRangeLabel(bin, mode)}
          </span>
          <span className="vm-wallloss-area">{formatArea(bin.area)} m&sup2;</span>
          <span className="vm-wallloss-pct">{formatPct(bin.areaPercent)}%</span>
          <span className="vm-wallloss-count">{bin.count}</span>
        </div>
      ))}
      {hasSpurious && (
        <>
          <div className="vm-wallloss-divider" />
          <div className="vm-wallloss-row" style={{ opacity: 0.7 }}>
            <span
              className="vm-wallloss-swatch"
              style={{ backgroundColor: 'rgba(128, 128, 128, 0.6)' }}
            />
            <span className="vm-wallloss-name" title="Data points outside all bin ranges">
              Spurious
            </span>
            <span className="vm-wallloss-range">Outside</span>
            <span className="vm-wallloss-area">{formatArea(spuriousArea)} m&sup2;</span>
            <span className="vm-wallloss-pct">{formatPct(spuriousAreaPercent)}%</span>
            <span className="vm-wallloss-count">{spuriousCount}</span>
          </div>
        </>
      )}
      <div className="vm-wallloss-divider" />
      <div className="vm-wallloss-row vm-wallloss-total">
        <span className="vm-wallloss-name" />
        <span className="vm-wallloss-range">Total</span>
        <span className="vm-wallloss-area">{formatArea(totalScannedArea)} m&sup2;</span>
        <span className="vm-wallloss-pct">100%</span>
        <span className="vm-wallloss-count">{totalDataPoints}</span>
      </div>
    </div>
  );
}
