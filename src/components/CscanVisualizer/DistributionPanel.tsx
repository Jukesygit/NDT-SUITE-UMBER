import { useMemo, useState, useCallback } from 'react';
import { X, RotateCcw } from 'lucide-react';
import type { CscanData, DistributionConfig, DistributionResult, DisplaySettings } from './types';
import { autoBoundaries, computeDistribution } from './utils/distributionEngine';
import { getColorscale, interpolateColor } from '../../utils/colorscales';

interface DistributionPanelProps {
  data: CscanData | null;
  config: DistributionConfig;
  onConfigChange: (config: DistributionConfig) => void;
  displaySettings: DisplaySettings;
  /** Whether the basic StatsPanel is visible below */
  statsVisible: boolean;
  leftOffset?: number;
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

type PanelDistributionResult = DistributionResult & {
  excludedInvalidArea: number;
  excludedInvalidPoints: number;
};

function computeHonestThicknessDistribution(
  data: CscanData,
  config: DistributionConfig,
  displayRange: { min: number; max: number },
): PanelDistributionResult | null {
  const boundaries = (config.customBoundaries ?? autoBoundaries(displayRange.min, displayRange.max, config.binCount))
    .slice()
    .sort((a, b) => a - b);
  if (boundaries.length < 2) return null;

  const bins = Array.from({ length: boundaries.length - 1 }, (_, index) => ({
    min: boundaries[index],
    max: boundaries[index + 1],
    area: 0,
    areaPercent: 0,
    count: 0,
  }));

  const xSpacing = data.xAxis.length > 1 ? Math.abs(data.xAxis[1] - data.xAxis[0]) : 1.0;
  const ySpacing = data.yAxis.length > 1 ? Math.abs(data.yAxis[1] - data.yAxis[0]) : 1.0;
  const cellAreaM2 = (xSpacing * ySpacing) / 1e6;
  const rangeMin = boundaries[0];
  const rangeMax = boundaries[boundaries.length - 1];
  let measuredArea = 0;
  let measuredPoints = 0;
  let excludedInvalidArea = 0;
  let excludedInvalidPoints = 0;

  for (const row of data.data) {
    for (const value of row) {
      if (value === null || !Number.isFinite(value)) continue;

      measuredArea += cellAreaM2;
      measuredPoints += 1;

      if (value < rangeMin || value > rangeMax) {
        excludedInvalidArea += cellAreaM2;
        excludedInvalidPoints += 1;
        continue;
      }

      for (let index = 0; index < bins.length; index += 1) {
        const bin = bins[index];
        const inBin = index === bins.length - 1
          ? value >= bin.min && value <= bin.max
          : value >= bin.min && value < bin.max;
        if (inBin) {
          bin.area += cellAreaM2;
          bin.count += 1;
          break;
        }
      }
    }
  }

  if (measuredPoints === 0) return null;

  for (const bin of bins) {
    bin.areaPercent = measuredArea > 0 ? (bin.area / measuredArea) * 100 : 0;
  }

  return {
    bins,
    totalArea: measuredArea,
    totalPoints: measuredPoints,
    mode: 'thickness',
    unit: 'mm',
    excludedInvalidArea,
    excludedInvalidPoints,
  };
}

function sampleBinColor(
  bin: { min: number; max: number },
  dataMin: number,
  dataMax: number,
  colorScale: string,
  reverseScale: boolean,
  mode: 'thickness' | 'wallLoss',
  nominalThickness: number,
): string {
  const mid = (bin.min + bin.max) / 2;
  // In wall-loss mode, bins are in %, but the heatmap colors raw thickness.
  // Convert midpoint back: thickness = nominal × (1 - wallLoss/100)
  const thicknessMid = mode === 'wallLoss'
    ? nominalThickness * (1 - mid / 100)
    : mid;
  const range = dataMax - dataMin;
  const t = range > 0 ? (thicknessMid - dataMin) / range : 0.5;
  const scale = getColorscale(colorScale);
  const [r, g, b] = interpolateColor(Math.max(0, Math.min(1, t)), scale, reverseScale);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function BoundaryInput({
  value,
  unit,
  onChange,
}: {
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = useCallback(() => {
    setDraft(formatBound(value, unit));
    setEditing(true);
  }, [value, unit]);

  const commit = useCallback(() => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) onChange(parsed);
  }, [draft, onChange]);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        style={{
          width: unit === '%' ? 28 : 36,
          padding: '0 2px',
          backgroundColor: 'rgba(59, 130, 246, 0.25)',
          color: '#fff',
          fontSize: '0.7rem',
          border: '1px solid rgba(59, 130, 246, 0.6)',
          borderRadius: 2,
          outline: 'none',
          textAlign: 'center',
          fontFamily: 'inherit',
        }}
      />
    );
  }

  return (
    <span
      onClick={startEdit}
      style={{
        cursor: 'pointer',
        borderBottom: '1px dashed rgba(255,255,255,0.3)',
        padding: '0 1px',
      }}
      title="Click to edit"
    >
      {formatBound(value, unit)}
    </span>
  );
}

export default function DistributionPanel({
  data,
  config,
  onConfigChange,
  displaySettings,
  statsVisible,
  leftOffset = 16,
  onClose,
}: DistributionPanelProps) {
  const displayRange = useMemo(() => {
    const min = Math.max(0, displaySettings.range.min ?? data?.stats?.min ?? 0);
    const max = displaySettings.range.max ?? data?.stats?.max ?? 100;
    return { min, max };
  }, [displaySettings.range, data?.stats?.min, data?.stats?.max]);

  const result = useMemo<PanelDistributionResult | null>(() => {
    if (!data || !config.enabled) return null;
    if (config.mode === 'thickness') {
      return computeHonestThicknessDistribution(data, config, displayRange);
    }
    const wallLossResult = computeDistribution(data, config);
    if (!wallLossResult) return null;
    return {
      ...wallLossResult,
      excludedInvalidArea: 0,
      excludedInvalidPoints: 0,
    };
  }, [data, config, displayRange]);

  const isCustom = !!config.customBoundaries;
  // Display range used by the heatmap — needed to normalize bin midpoints to the color scale
  const handleBoundaryChange = useCallback((boundaryIndex: number, newValue: number) => {
    if (!result) return;

    const currentBoundaries = config.customBoundaries
      ?? result.bins.map(b => b.min).concat([result.bins[result.bins.length - 1].max]);

    const updated = [...currentBoundaries];
    updated[boundaryIndex] = newValue;
    updated.sort((a, b) => a - b);

    onConfigChange({ ...config, customBoundaries: updated });
  }, [config, onConfigChange, result]);

  const handleResetAuto = useCallback(() => {
    const { customBoundaries: _, ...rest } = config;
    onConfigChange(rest);
  }, [config, onConfigChange]);

  const handleAddBin = useCallback(() => {
    if (!result || result.bins.length === 0) return;

    const currentBoundaries = config.customBoundaries
      ?? result.bins.map(b => b.min).concat([result.bins[result.bins.length - 1].max]);

    // Find the widest bin and split it in half
    let widestIdx = 0;
    let widestSpan = 0;
    for (let i = 0; i < currentBoundaries.length - 1; i++) {
      const span = currentBoundaries[i + 1] - currentBoundaries[i];
      if (span > widestSpan) { widestSpan = span; widestIdx = i; }
    }
    const mid = (currentBoundaries[widestIdx] + currentBoundaries[widestIdx + 1]) / 2;
    const updated = [...currentBoundaries];
    updated.splice(widestIdx + 1, 0, mid);

    onConfigChange({ ...config, customBoundaries: updated });
  }, [config, onConfigChange, result]);

  const handleRemoveBin = useCallback((binIndex: number) => {
    if (!result || result.bins.length <= 1) return;

    const currentBoundaries = config.customBoundaries
      ?? result.bins.map(b => b.min).concat([result.bins[result.bins.length - 1].max]);

    if (currentBoundaries.length <= 2) return;

    // Remove the inner boundary between binIndex and binIndex+1
    // For first bin, remove boundary at index 1; for last bin, remove second-to-last
    const removeIdx = binIndex === 0 ? 1 : binIndex;
    if (removeIdx <= 0 || removeIdx >= currentBoundaries.length - 1) return;

    const updated = currentBoundaries.filter((_, i) => i !== removeIdx);
    onConfigChange({ ...config, customBoundaries: updated });
  }, [config, onConfigChange, result]);

  if (!result) return null;

  const bottom = statsVisible ? 240 : 12;
  const boundaries = config.customBoundaries
    ?? result.bins.map(b => b.min).concat([result.bins[result.bins.length - 1].max]);
  const includedArea = result.bins.reduce((sum, bin) => sum + bin.area, 0);
  const includedPoints = result.bins.reduce((sum, bin) => sum + bin.count, 0);
  const includedPercent = result.totalArea > 0 ? (includedArea / result.totalArea) * 100 : 0;

  return (
    <div
      className="absolute z-30 rounded-lg shadow-xl border border-gray-700"
      style={{
        left: leftOffset,
        backgroundColor: 'rgba(20, 25, 35, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        minWidth: '340px',
        bottom,
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '0.75rem',
        color: 'rgba(255, 255, 255, 0.85)',
        transition: 'bottom 0.3s ease, left 0.3s ease',
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
        <div className="flex items-center gap-1">
          {isCustom && (
            <button
              onClick={handleResetAuto}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Reset to auto bins"
            >
              <RotateCcw className="w-3 h-3" style={{ color: 'rgba(59, 130, 246, 0.7)' }} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Close"
          >
            <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="px-3 py-2">
        {/* Header row */}
        <div className="flex items-center gap-1.5 pb-1" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>
          <span style={{ flex: 1 }}>Range {isCustom ? '(custom)' : '(click to edit)'}</span>
          <span style={{ width: 72, textAlign: 'right' }}>Area</span>
          <span style={{ width: 44, textAlign: 'right' }}>%</span>
          <span style={{ width: 40, textAlign: 'right' }}>Pts</span>
          <span style={{ width: 16 }} />
        </div>

        {/* Bin rows */}
        {result.bins.map((bin, i) => (
          <div key={i} className="group flex items-center gap-1.5 py-0.5">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                flexShrink: 0,
                backgroundColor: sampleBinColor(
                  bin,
                  displayRange.min,
                  displayRange.max,
                  displaySettings.colorScale,
                  displaySettings.reverseScale,
                  config.mode,
                  config.nominalThickness,
                ),
              }}
            />
            <span style={{ flex: 1, color: 'rgba(255,255,255,0.7)' }}>
              <BoundaryInput
                value={boundaries[i]}
                unit={result.unit}
                onChange={(v) => handleBoundaryChange(i, v)}
              />
              {'–'}
              <BoundaryInput
                value={boundaries[i + 1]}
                unit={result.unit}
                onChange={(v) => handleBoundaryChange(i + 1, v)}
              />
              {result.unit}
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
            {result.bins.length > 1 && (
              <button
                onClick={() => handleRemoveBin(i)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-600/40 rounded"
                title="Remove this bin"
                style={{ width: 16 }}
              >
                <X className="w-2.5 h-2.5" style={{ color: 'rgba(255,100,100,0.7)' }} />
              </button>
            )}
            {result.bins.length <= 1 && <span style={{ width: 16 }} />}
          </div>
        ))}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '4px 0' }} />

        {/* Included row + Add bin button */}
        <div className="flex items-center gap-1.5 py-0.5">
          <span style={{ flex: 1, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>In bins</span>
          <span style={{ width: 72, textAlign: 'right', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
            {formatArea(includedArea)} m²
          </span>
          <span style={{ width: 44, textAlign: 'right', fontWeight: 700, color: 'rgba(0,204,102,0.9)' }}>
            {formatPct(includedPercent)}%
          </span>
          <span style={{ width: 40, textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>
            {includedPoints}
          </span>
          <span style={{ width: 16 }} />
        </div>

        {result.excludedInvalidPoints > 0 && (
          <div className="flex items-center gap-1.5 py-0.5">
            <span style={{ flex: 1, fontWeight: 700, color: 'rgba(255,255,255,0.58)' }}>Spurious data</span>
            <span style={{ width: 72, textAlign: 'right', color: 'rgba(255,255,255,0.55)' }}>
              {formatArea(result.excludedInvalidArea)} m²
            </span>
            <span style={{ width: 44, textAlign: 'right', color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
              {formatPct(result.totalArea > 0 ? (result.excludedInvalidArea / result.totalArea) * 100 : 0)}%
            </span>
            <span style={{ width: 40, textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>
              {result.excludedInvalidPoints}
            </span>
            <span style={{ width: 16 }} />
          </div>
        )}

        {/* Add bin button */}
        <button
          onClick={handleAddBin}
          className="w-full mt-1 py-1 text-center rounded transition-colors hover:bg-gray-700/60"
          style={{
            fontSize: '0.6rem',
            color: 'rgba(59, 130, 246, 0.7)',
            border: '1px dashed rgba(59, 130, 246, 0.3)',
          }}
        >
          + Add Bin
        </button>
      </div>
    </div>
  );
}
