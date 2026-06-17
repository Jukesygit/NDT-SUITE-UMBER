import type { VesselState } from './types';
import { useWallLossWorker } from '../../hooks/useWallLossWorker';

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

function binRangeLabel(bin: { minPct: number; maxPct: number; minMm?: number; maxMm?: number; label?: string }, mode: string): string {
  if (bin.label) return bin.label;
  if (mode === 'custom' && bin.minMm != null && bin.maxMm != null) {
    return `${bin.minMm.toFixed(1)}–${bin.maxMm.toFixed(1)}`;
  }
  return `${bin.minPct.toFixed(0)}–${bin.maxPct.toFixed(0)}%`;
}

export default function WallLossPanel({ vesselState, sidebarOpen, coverageVisible }: WallLossPanelProps) {
  const config = vesselState.wallLossGroups;
  const result = useWallLossWorker(vesselState, config);
  const binNames = config?.binNames;
  const mode = config?.binMode ?? 'equal';

  if (!result || result.totalDataPoints === 0) return null;

  const bottom = coverageVisible ? 200 : 48;
  const hasSpurious = (result.spuriousCount ?? 0) > 0;

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
        <span className="vm-wallloss-name">Name</span>
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
            <span className="vm-wallloss-area">{formatArea(result.spuriousArea ?? 0)} m&sup2;</span>
            <span className="vm-wallloss-pct">{formatPct(result.spuriousAreaPercent ?? 0)}%</span>
            <span className="vm-wallloss-count">{result.spuriousCount ?? 0}</span>
          </div>
        </>
      )}
      <div className="vm-wallloss-divider" />
      <div className="vm-wallloss-row vm-wallloss-total">
        <span className="vm-wallloss-name" />
        <span className="vm-wallloss-range">Total</span>
        <span className="vm-wallloss-area">{formatArea(result.totalScannedArea)} m&sup2;</span>
        <span className="vm-wallloss-pct">100%</span>
        <span className="vm-wallloss-count">{result.totalDataPoints}</span>
      </div>
      {(vesselState.domeScanComposites ?? []).length > 0 && (
        <div style={{ fontSize: '0.7rem', opacity: 0.7, padding: '4px 8px', fontStyle: 'italic' }}>
          Note: Dome scan data is not included in wall loss distribution (shell scans only).
        </div>
      )}
    </div>
  );
}
