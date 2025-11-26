import React from 'react';
import { X, BarChart2 } from 'lucide-react';
import { CscanData } from './types';

interface StatsPanelProps {
  data: CscanData | null;
  isExpanded: boolean;
  onToggle: () => void;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ data, onToggle }) => {
  // Calculate statistics
  const stats = React.useMemo(() => {
    if (!data) return null;

    if (data.stats) {
      return data.stats;
    }

    // Calculate stats from data if not provided
    const flatData = data.data.flat().filter((v): v is number => v !== null && !isNaN(v));
    const validPoints = flatData.length;

    if (validPoints === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        stdDev: 0,
        validPoints: 0,
        totalPoints: data.width * data.height,
        ndPercent: 100,
        validArea: 0
      };
    }

    const min = Math.min(...flatData);
    const max = Math.max(...flatData);
    const sum = flatData.reduce((a, b) => a + b, 0);
    const mean = sum / validPoints;
    const variance = flatData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validPoints;
    const stdDev = Math.sqrt(variance);

    return {
      min,
      max,
      mean,
      stdDev,
      validPoints,
      totalPoints: data.width * data.height,
      ndPercent: ((data.width * data.height - validPoints) / (data.width * data.height)) * 100,
      validArea: (validPoints / (data.width * data.height)) * 100
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
              {/* Main Stats Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded p-2" style={{ backgroundColor: '#111827' }}>
                  <div className="text-xs text-gray-400 mb-1">Minimum</div>
                  <div className="text-sm font-mono text-white">{formatValue(stats.min)} mm</div>
                </div>
                <div className="rounded p-2" style={{ backgroundColor: '#111827' }}>
                  <div className="text-xs text-gray-400 mb-1">Maximum</div>
                  <div className="text-sm font-mono text-white">{formatValue(stats.max)} mm</div>
                </div>
                <div className="rounded p-2" style={{ backgroundColor: '#111827' }}>
                  <div className="text-xs text-gray-400 mb-1">Mean</div>
                  <div className="text-sm font-mono text-white">{formatValue(stats.mean)} mm</div>
                </div>
                <div className="rounded p-2" style={{ backgroundColor: '#111827' }}>
                  <div className="text-xs text-gray-400 mb-1">Std Dev</div>
                  <div className="text-sm font-mono text-white">{formatValue(stats.stdDev)} mm</div>
                </div>
              </div>

              {/* Coverage Stats */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Valid Points</span>
                  <span className="font-mono text-white">{formatLargeNumber(stats.validPoints)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Points</span>
                  <span className="font-mono text-white">{formatLargeNumber(stats.totalPoints || data.width * data.height)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Coverage</span>
                  <span className="font-mono text-white">{formatValue(100 - stats.ndPercent, 1)}%</span>
                </div>
              </div>

              {/* Visual Range Bar */}
              <div className="space-y-1">
                <div className="text-xs text-gray-400">Value Range</div>
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

              {/* File Info */}
              <div className="pt-2 border-t border-gray-700 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Dimensions</span>
                  <span className="text-gray-300">{data.width} × {data.height}</span>
                </div>
              </div>
            </>
          )}
      </div>
    </div>
  );
};

export default StatsPanel;
