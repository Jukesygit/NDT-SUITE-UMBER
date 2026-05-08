import { useMemo, useDeferredValue } from 'react';
import type { VesselState } from './types';
import { computeWallLossDistribution } from './engine/wall-loss-distribution';

interface WallLossPanelProps {
  vesselState: VesselState;
  sidebarOpen: boolean;
  coverageVisible: boolean;
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

export default function WallLossPanel({ vesselState, sidebarOpen, coverageVisible }: WallLossPanelProps) {
  const config = vesselState.wallLossGroups;
  const hasScans = vesselState.scanComposites.some(c => c.orientationConfirmed);

  const deferredConfig = useDeferredValue(config);

  const compositeKey = useMemo(() =>
    JSON.stringify(vesselState.scanComposites.map(c => ({
      id: c.id,
      orientationConfirmed: c.orientationConfirmed,
      indexStartMm: c.indexStartMm,
      datumAngleDeg: c.datumAngleDeg,
      scanDirection: c.scanDirection,
      indexDirection: c.indexDirection,
      rows: c.data.length,
      cols: c.data[0]?.length ?? 0,
    }))),
    [vesselState.scanComposites],
  );

  const result = useMemo(() => {
    if (!deferredConfig?.enabled || !hasScans) return null;
    return computeWallLossDistribution(vesselState, deferredConfig);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deferredConfig?.enabled, deferredConfig?.nominalThickness, deferredConfig?.binCount,
    compositeKey, vesselState.id, vesselState.length, vesselState.headRatio, hasScans,
  ]);

  if (!result || result.totalDataPoints === 0) return null;

  const bottom = coverageVisible ? 200 : 48;

  return (
    <div
      className="vm-wallloss-panel"
      style={{ left: sidebarOpen ? 350 : 16, bottom }}
    >
      <div className="vm-wallloss-title">
        Wall Loss Distribution
        <span className="vm-wallloss-nominal">
          Nom. {result.nominalThickness}mm
        </span>
      </div>
      <div className="vm-wallloss-row vm-wallloss-header">
        <span className="vm-wallloss-range">Range</span>
        <span className="vm-wallloss-area">Area</span>
        <span className="vm-wallloss-pct">%</span>
        <span className="vm-wallloss-count">Pts</span>
      </div>
      {result.bins.map((bin, i) => (
        <div key={i} className="vm-wallloss-row">
          <span
            className="vm-wallloss-swatch"
            style={{ backgroundColor: binColor(i, result.bins.length) }}
          />
          <span className="vm-wallloss-range">
            {bin.minPct.toFixed(0)}–{bin.maxPct.toFixed(0)}%
          </span>
          <span className="vm-wallloss-area">{formatArea(bin.area)} m&sup2;</span>
          <span className="vm-wallloss-pct">{formatPct(bin.areaPercent)}%</span>
          <span className="vm-wallloss-count">{bin.count}</span>
        </div>
      ))}
      <div className="vm-wallloss-divider" />
      <div className="vm-wallloss-row vm-wallloss-total">
        <span className="vm-wallloss-range">Total</span>
        <span className="vm-wallloss-area">{formatArea(result.totalScannedArea)} m&sup2;</span>
        <span className="vm-wallloss-pct">100%</span>
        <span className="vm-wallloss-count">{result.totalDataPoints}</span>
      </div>
    </div>
  );
}
