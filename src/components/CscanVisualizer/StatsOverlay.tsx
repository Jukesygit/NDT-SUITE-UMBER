import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronUp, ChevronDown, BarChart2 } from 'lucide-react';
import { CscanData } from './types';

interface StatsOverlayProps {
  data: CscanData;
  onClose: () => void;
}

const StatsOverlay: React.FC<StatsOverlayProps> = ({ data, onClose }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 320, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Calculate statistics
  const stats = React.useMemo(() => {
    if (!data.stats) {
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
    }
    return data.stats;
  }, [data]);

  // Handle dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

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
    <div
      className={`
        absolute rounded-lg shadow-2xl border border-gray-700
        ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
        transition-all duration-200
      `}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '280px',
        maxHeight: collapsed ? '40px' : '400px',
        backgroundColor: '#1f2937',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-white select-none">Statistics</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            {collapsed ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Main Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-900/50 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Minimum</div>
              <div className="text-sm font-mono text-white">{formatValue(stats.min)} mm</div>
            </div>
            <div className="bg-gray-900/50 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Maximum</div>
              <div className="text-sm font-mono text-white">{formatValue(stats.max)} mm</div>
            </div>
            <div className="bg-gray-900/50 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Mean</div>
              <div className="text-sm font-mono text-white">{formatValue(stats.mean)} mm</div>
            </div>
            <div className="bg-gray-900/50 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Median</div>
              <div className="text-sm font-mono text-white">{formatValue((stats as any).median ?? stats.mean)} mm</div>
            </div>
            <div className="bg-gray-900/50 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">Std Dev</div>
              <div className="text-sm font-mono text-white">{formatValue(stats.stdDev)} mm</div>
            </div>
            <div className="bg-blue-900/30 border border-blue-500/40 rounded p-2">
              <div className="text-xs text-blue-300 mb-1">Valid Area</div>
              <div className="text-sm font-mono text-blue-200">{formatValue((stats.validArea || 0) / 1000000, 4)} m²</div>
            </div>
          </div>

          {/* Separator */}
          <div className="h-px bg-gray-700" />

          {/* Coverage Stats */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">Valid Points</span>
              <span className="text-xs font-mono text-white">
                {formatLargeNumber(stats.validPoints)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">Total Points</span>
              <span className="text-xs font-mono text-white">
                {formatLargeNumber(stats.totalPoints || data.width * data.height)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">ND %</span>
              <span className="text-xs font-mono text-white">
                {formatValue(stats.ndPercent, 1)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">Valid Area</span>
              <span className="text-xs font-mono text-white">
                {formatValue(stats.validArea, 1)}%
              </span>
            </div>
          </div>

          {/* Visual Range Bar */}
          <div className="space-y-1">
            <div className="text-xs text-gray-400">Value Distribution</div>
            <div className="relative h-8 bg-gray-900 rounded overflow-hidden">
              <div
                className="absolute h-full bg-gradient-to-r from-blue-600 to-green-600"
                style={{
                  left: '10%',
                  width: '80%',
                  opacity: 0.6
                }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-2">
                <span className="text-xs text-white/70">{formatValue(stats.min, 1)}</span>
                <span className="text-xs text-white font-bold">{formatValue(stats.mean, 1)}</span>
                <span className="text-xs text-white/70">{formatValue(stats.max, 1)}</span>
              </div>
            </div>
          </div>

          {/* File Info */}
          <div className="pt-2 border-t border-gray-700">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">File</span>
              <span className="text-xs text-gray-300 truncate ml-2 max-w-[150px]">
                {data.filename}
              </span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-gray-400">Dimensions</span>
              <span className="text-xs text-gray-300">
                {data.width} × {data.height}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsOverlay;