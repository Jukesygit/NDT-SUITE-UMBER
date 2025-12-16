import React from 'react';
import { X, BarChart2 } from 'lucide-react';
import { CscanData, CscanStats } from './types';

interface StatsPanelProps {
  data: CscanData | null;
  isExpanded: boolean;
  onToggle: () => void;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ data, onToggle }) => {
  // Calculate statistics
  const stats = React.useMemo((): CscanStats | null => {
    if (!data) return null;

    if (data.stats) {
      return data.stats;
    }

    // Calculate stats from data if not provided (fallback)
    const flatData = data.data.flat().filter((v): v is number => v !== null && !isNaN(v));
    const validPoints = flatData.length;
    const totalPoints = data.width * data.height;
    const ndCount = totalPoints - validPoints;

    if (validPoints === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        stdDev: 0,
        validPoints: 0,
        totalPoints,
        totalArea: 0,
        validArea: 0,
        ndPercent: 100,
        ndCount,
        ndArea: 0
      };
    }

    // Sort for median
    const sorted = flatData.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    const min = Math.min(...flatData);
    const max = Math.max(...flatData);
    const sum = flatData.reduce((a, b) => a + b, 0);
    const mean = sum / validPoints;
    const variance = flatData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validPoints;
    const stdDev = Math.sqrt(variance);

    // Calculate area using coordinate spacing
    const xSpacing = data.xAxis && data.xAxis.length > 1
      ? Math.abs(data.xAxis[1] - data.xAxis[0])
      : 1.0;
    const ySpacing = data.yAxis && data.yAxis.length > 1
      ? Math.abs(data.yAxis[1] - data.yAxis[0])
      : 1.0;
    const pointArea = xSpacing * ySpacing; // mm²

    const totalArea = totalPoints * pointArea;
    const ndArea = ndCount * pointArea;
    const validArea = totalArea - ndArea;
    const ndPercent = (ndCount / totalPoints) * 100;

    return {
      min,
      max,
      mean,
      median,
      stdDev,
      validPoints,
      totalPoints,
      totalArea,
      validArea,
      ndPercent,
      ndCount,
      ndArea
    };
  }, [data]);

  const formatValue = (value: number, decimals: number = 2) => {
    if (isNaN(value)) return 'N/A';
    return value.toFixed(decimals);
  };

  const formatLargeNumber = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toString();
  };

  // Convert mm² to m²
  const mmSqToMSq = (mmSq: number) => mmSq / 1000000;

  return (
    <div>
      {/* Header with close button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white">Statistics</span>
        </div>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
          title="Close"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-3 space-y-3">
          {!data || !stats ? (
            <p className="text-xs text-gray-500 text-center py-4">
              Load a file to see statistics
            </p>
          ) : (
            <>
              {/* Thickness Stats - Top Row (5 cards) */}
              <div className="grid grid-cols-5 gap-1.5">
                <div className="rounded p-2 text-center" style={{ backgroundColor: '#111827' }}>
                  <div className="text-[10px] text-gray-400 mb-0.5">Min</div>
                  <div className="text-sm font-mono text-cyan-400">{formatValue(stats.min)} mm</div>
                </div>
                <div className="rounded p-2 text-center" style={{ backgroundColor: '#111827' }}>
                  <div className="text-[10px] text-gray-400 mb-0.5">Max</div>
                  <div className="text-sm font-mono text-cyan-400">{formatValue(stats.max)} mm</div>
                </div>
                <div className="rounded p-2 text-center" style={{ backgroundColor: '#111827' }}>
                  <div className="text-[10px] text-gray-400 mb-0.5">Mean</div>
                  <div className="text-sm font-mono text-cyan-400">{formatValue(stats.mean)} mm</div>
                </div>
                <div className="rounded p-2 text-center" style={{ backgroundColor: '#111827' }}>
                  <div className="text-[10px] text-gray-400 mb-0.5">Median</div>
                  <div className="text-sm font-mono text-cyan-400">{formatValue(stats.median)} mm</div>
                </div>
                <div className="rounded p-2 text-center" style={{ backgroundColor: '#111827' }}>
                  <div className="text-[10px] text-gray-400 mb-0.5">Std Dev</div>
                  <div className="text-sm font-mono text-cyan-400">{formatValue(stats.stdDev)} mm</div>
                </div>
              </div>

              {/* Area Stats - Bottom Row (4 cards) */}
              <div className="grid grid-cols-4 gap-1.5">
                <div className="rounded p-2 text-center" style={{ backgroundColor: '#111827' }}>
                  <div className="text-[10px] text-gray-400 mb-0.5">Total Area</div>
                  <div className="text-sm font-mono text-white">{formatValue(mmSqToMSq(stats.totalArea), 4)} m²</div>
                </div>
                <div className="rounded p-2 text-center" style={{ backgroundColor: '#111827' }}>
                  <div className="text-[10px] text-gray-400 mb-0.5">ND %</div>
                  <div className="text-sm font-mono text-white">{formatValue(stats.ndPercent, 1)} %</div>
                </div>
                <div className="rounded p-2 text-center" style={{ backgroundColor: '#111827' }}>
                  <div className="text-[10px] text-gray-400 mb-0.5">Valid Area</div>
                  <div className="text-sm font-mono text-white">{formatValue(mmSqToMSq(stats.validArea), 4)} m²</div>
                </div>
                <div className="rounded p-2 text-center" style={{ backgroundColor: '#111827' }}>
                  <div className="text-[10px] text-gray-400 mb-0.5">Valid Points</div>
                  <div className="text-sm font-mono text-white">{formatLargeNumber(stats.validPoints)}</div>
                </div>
              </div>

              {/* Visual Range Bar */}
              <div className="space-y-1">
                <div className="text-xs text-gray-400">Thickness Range</div>
                <div className="relative h-6 rounded overflow-hidden" style={{ backgroundColor: '#111827' }}>
                  <div
                    className="absolute h-full bg-gradient-to-r from-blue-600 to-green-500"
                    style={{ left: '5%', right: '5%', opacity: 0.7 }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-2">
                    <span className="text-xs text-white/80">{formatValue(stats.min, 1)}</span>
                    <span className="text-xs text-white font-bold">{formatValue(stats.mean, 1)}</span>
                    <span className="text-xs text-white/80">{formatValue(stats.max, 1)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
      </div>
    </div>
  );
};

export default StatsPanel;
