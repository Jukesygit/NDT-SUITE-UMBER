import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { CscanData, DistributionConfig, DistributionResult } from './types';
import { computeDistribution } from './utils/distributionEngine';

interface DistributionPanelProps {
  data: CscanData | null;
  config: DistributionConfig;
  /** Whether the basic StatsPanel is visible below */
  statsVisible: boolean;
  onClose: () => void;
}

function formatArea(m2: number): string {
  return m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2);
}

function formatPct(pct: number): string {
  return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

function formatBound(val: number, unit: string): string {
  if (unit === '%') return val.toFixed(0);
  return val.toFixed(1);
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

export default function DistributionPanel({
  data,
  config,
  statsVisible,
  onClose,
}: DistributionPanelProps) {
  const result = useMemo<DistributionResult | null>(() => {
    if (!data || !config.enabled) return null;
    return computeDistribution(data, config);
  }, [data, config]);

  if (!result) return null;

  const bottom = statsVisible ? 240 : 12;

  return (
    <div
      className="absolute left-4 z-30 rounded-lg shadow-xl border border-gray-700"
      style={{
        backgroundColor: 'rgba(20, 25, 35, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        minWidth: '320px',
        bottom,
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '0.75rem',
        color: 'rgba(255, 255, 255, 0.85)',
        transition: 'bottom 0.3s ease',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.12)' }}
      >
        <div className="flex items-center gap-2">
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {result.mode === 'thickness' ? 'Thickness Distribution' : 'Wall Loss Distribution'}
          </span>
          {result.mode === 'wallLoss' && (
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>
              Nom. {config.nominalThickness}mm
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
          title="Close"
        >
          <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
        </button>
      </div>

      {/* Table */}
      <div className="px-3 py-2">
        {/* Header row */}
        <div className="flex items-center gap-1.5 pb-1" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>
          <span style={{ flex: 1 }}>Range</span>
          <span style={{ width: 72, textAlign: 'right' }}>Area</span>
          <span style={{ width: 44, textAlign: 'right' }}>%</span>
          <span style={{ width: 40, textAlign: 'right' }}>Pts</span>
        </div>

        {/* Bin rows */}
        {result.bins.map((bin, i) => (
          <div key={i} className="flex items-center gap-1.5 py-0.5">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                flexShrink: 0,
                backgroundColor: binColor(i, result.bins.length),
              }}
            />
            <span style={{ flex: 1, color: 'rgba(255,255,255,0.7)' }}>
              {formatBound(bin.min, result.unit)}–{formatBound(bin.max, result.unit)}{result.unit}
            </span>
            <span style={{ width: 72, textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>
              {formatArea(bin.area)} m²
            </span>
            <span style={{ width: 44, textAlign: 'right', color: 'rgba(0,204,102,0.9)', fontWeight: 600 }}>
              {formatPct(bin.areaPercent)}%
            </span>
            <span style={{ width: 40, textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>
              {bin.count}
            </span>
          </div>
        ))}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '4px 0' }} />

        {/* Total row */}
        <div className="flex items-center gap-1.5 py-0.5">
          <span style={{ flex: 1, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Total</span>
          <span style={{ width: 72, textAlign: 'right', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
            {formatArea(result.totalArea)} m²
          </span>
          <span style={{ width: 44, textAlign: 'right', fontWeight: 700, color: 'rgba(0,204,102,0.9)' }}>
            100%
          </span>
          <span style={{ width: 40, textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>
            {result.totalPoints}
          </span>
        </div>
      </div>
    </div>
  );
}
