import React, { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Lock, Unlock } from 'lucide-react';

interface FloatingRangePanelProps {
  currentMin: number | null;
  currentMax: number | null;
  dataMin?: number;
  dataMax?: number;
  onRangeChange: (min: number | null, max: number | null) => void;
  onClose: () => void;
}

const FloatingRangePanel: React.FC<FloatingRangePanelProps> = ({
  currentMin,
  currentMax,
  dataMin = 0,
  dataMax = 100,
  onRangeChange,
  onClose
}) => {
  const [min, setMin] = useState<string>(currentMin?.toString() || dataMin.toString());
  const [max, setMax] = useState<string>(currentMax?.toString() || dataMax.toString());
  const [locked, setLocked] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Handle dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, label')) return;
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

  const handleApply = useCallback(() => {
    const minVal = min === '' ? null : parseFloat(min);
    const maxVal = max === '' ? null : parseFloat(max);

    if (minVal !== null && maxVal !== null && minVal >= maxVal) {
      // Show error or swap values
      return;
    }

    onRangeChange(minVal, maxVal);
  }, [min, max, onRangeChange]);

  const handleReset = useCallback(() => {
    setMin(dataMin.toString());
    setMax(dataMax.toString());
    onRangeChange(null, null);
  }, [dataMin, dataMax, onRangeChange]);

  const handleMinChange = useCallback((value: string) => {
    setMin(value);
    if (locked && value !== '') {
      const range = parseFloat(max) - parseFloat(min);
      const newMax = parseFloat(value) + range;
      if (!isNaN(newMax)) {
        setMax(newMax.toString());
      }
    }
  }, [locked, min, max]);

  const handleMaxChange = useCallback((value: string) => {
    setMax(value);
    if (locked && value !== '') {
      const range = parseFloat(max) - parseFloat(min);
      const newMin = parseFloat(value) - range;
      if (!isNaN(newMin)) {
        setMin(newMin.toString());
      }
    }
  }, [locked, min, max]);

  // Apply on Enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApply();
    }
  }, [handleApply]);

  return (
    <div
      className={`
        absolute rounded-lg shadow-2xl border border-gray-700
        ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      `}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        minWidth: '280px',
        backgroundColor: '#1f2937',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <h3 className="text-sm font-medium text-white select-none">Range Settings</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Data Range Info */}
        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Data Min:</span>
            <span className="text-gray-300">{dataMin.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Data Max:</span>
            <span className="text-gray-300">{dataMax.toFixed(2)}</span>
          </div>
        </div>

        <div className="h-px bg-gray-700" />

        {/* Range Inputs */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-300 w-12">Min:</label>
            <input
              type="number"
              value={min}
              onChange={(e) => handleMinChange(e.target.value)}
              onKeyDown={handleKeyDown}
              step="0.1"
              className="flex-1 px-2 py-1 bg-gray-900 text-white text-xs rounded border border-gray-600 focus:border-blue-500 outline-none"
              placeholder={dataMin.toString()}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-300 w-12">Max:</label>
            <input
              type="number"
              value={max}
              onChange={(e) => handleMaxChange(e.target.value)}
              onKeyDown={handleKeyDown}
              step="0.1"
              className="flex-1 px-2 py-1 bg-gray-900 text-white text-xs rounded border border-gray-600 focus:border-blue-500 outline-none"
              placeholder={dataMax.toString()}
            />
            <button
              onClick={() => setLocked(!locked)}
              className={`p-1.5 rounded transition-colors ${
                locked
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
              title={locked ? 'Unlock range' : 'Lock range'}
            >
              {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Range Slider (Visual) */}
        <div className="relative h-6 bg-gray-900 rounded">
          <div
            className="absolute h-full bg-blue-600/30 rounded"
            style={{
              left: `${((parseFloat(min) - dataMin) / (dataMax - dataMin)) * 100}%`,
              right: `${100 - ((parseFloat(max) - dataMin) / (dataMax - dataMin)) * 100}%`
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleApply}
            className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
          >
            Apply Range
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Auto
          </button>
        </div>

        {/* Presets */}
        <div className="flex gap-1">
          <button
            onClick={() => {
              setMin(dataMin.toString());
              setMax(dataMax.toString());
            }}
            className="flex-1 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 rounded transition-colors"
          >
            Full
          </button>
          <button
            onClick={() => {
              const mid = (dataMin + dataMax) / 2;
              const quarter = (dataMax - dataMin) / 4;
              setMin((mid - quarter).toString());
              setMax((mid + quarter).toString());
            }}
            className="flex-1 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 rounded transition-colors"
          >
            50%
          </button>
          <button
            onClick={() => {
              const mid = (dataMin + dataMax) / 2;
              const tenth = (dataMax - dataMin) / 10;
              setMin((mid - tenth).toString());
              setMax((mid + tenth).toString());
            }}
            className="flex-1 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 rounded transition-colors"
          >
            20%
          </button>
        </div>
      </div>
    </div>
  );
};

export default FloatingRangePanel;